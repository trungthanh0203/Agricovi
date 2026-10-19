import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

const ORG = '10000000-0000-4000-8000-00000000000a';
const AREA = '20000000-0000-4000-8000-00000000000a';
const CYC = '30000000-0000-4000-8000-000000000001';
const cropId = `(select id from crop_types where code='melon')`;

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const fin = await addUser(db, 2);     // kho & tài chính
  const worker1 = await addUser(db, 3); // nhân viên có app
  const leader = await addUser(db, 4);  // tổ trưởng (lao động có app)
  const outsider = await addUser(db, 5);
  await db.query(`insert into organizations (id,type,name,created_by) values ($1,'household','Hộ A',$2)`, [ORG, owner]);
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['inventory_finance']::member_role[]),($1,$3,array['worker']::member_role[]),($1,$4,array['worker']::member_role[])`, [ORG, fin, worker1, leader]);
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'Nhà màng 1')`, [AREA, ORG]);
  await db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status) values ($1,$2,$3,${cropId},'active')`, [CYC, ORG, AREA]);
  return { db, owner, fin, worker1, leader, outsider };
}

// ---------------------------------------------------------------- Kho
test('kho: giao dịch chỉ thêm, không sửa/xóa; điều chỉnh phải có lý do; tồn âm được báo', async () => {
  const { db, fin } = await setup();
  const loc = '50000000-0000-4000-8000-000000000001';
  const mat = '60000000-0000-4000-8000-000000000001';
  await db.query(`insert into inventory_locations (id,organization_id,name) values ($1,$2,'Kho chính')`, [loc, ORG]);
  await db.query(`insert into materials (id,organization_id,name,base_unit_id) values ($1,$2,'Phân NPK',(select id from units_of_measure where code='kg'))`, [mat, ORG]);

  const t = (id, type, qty, extra = '') =>
    asUser(db, fin, `insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,txn_date ${extra ? ',' + extra.split('=')[0] : ''})
                     values ($1,$2,$3,$4,$5,$6,current_date ${extra ? ',' + extra.split('=')[1] : ''})`, [id, ORG, loc, mat, type, qty]);

  await t('70000000-0000-4000-8000-000000000001', 'receipt', 10);
  await t('70000000-0000-4000-8000-000000000002', 'issue', -15); // xuất quá tồn: KHÔNG chặn, chỉ cảnh báo

  const bal = (await asUser(db, fin, `select balance::numeric b, is_negative from inventory_balances`)).rows[0];
  assert.equal(Number(bal.b), -5);
  assert.equal(bal.is_negative, true);

  // dấu sai
  assert.match(await expectError(t('70000000-0000-4000-8000-000000000003', 'receipt', -1)), /check/);
  // điều chỉnh thiếu lý do
  assert.match(await expectError(t('70000000-0000-4000-8000-000000000004', 'adjustment', 2)), /check/);
  // điều chỉnh có lý do
  await asUser(db, fin, `insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,txn_date,reason)
     values ('70000000-0000-4000-8000-000000000005',$1,$2,$3,'adjustment',5,current_date,'Kiểm kê')`, [ORG, loc, mat]);

  // không sửa/xóa
  assert.match(await expectError(db.query(`update inventory_transactions set quantity_delta = 999`)), /INVENTORY_IMMUTABLE/);
  assert.match(await expectError(db.query(`delete from inventory_transactions`)), /INVENTORY_IMMUTABLE/);
  // gửi lặp cùng id không nhân đôi
  await asUser(db, fin, `insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,txn_date)
     values ('70000000-0000-4000-8000-000000000001',$1,$2,$3,'receipt',10,current_date) on conflict (id) do nothing`, [ORG, loc, mat]);
  assert.equal((await db.query(`select count(*)::int n from inventory_transactions`)).rows[0].n, 3);
});

test('nhân viên sản xuất ghi được xuất dùng nhưng không đọc chi phí/giá vốn', async () => {
  const { db, worker1, fin } = await setup();
  const loc = '50000000-0000-4000-8000-000000000001';
  const mat = '60000000-0000-4000-8000-000000000001';
  await db.query(`insert into inventory_locations (id,organization_id,name) values ($1,$2,'Kho')`, [loc, ORG]);
  await db.query(`insert into materials (id,organization_id,name,base_unit_id) values ($1,$2,'Thuốc',(select id from units_of_measure where code='ml'))`, [mat, ORG]);
  await asUser(db, worker1, `insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,txn_date)
     values ('70000000-0000-4000-8000-000000000010',$1,$2,$3,'issue',-2,current_date)`, [ORG, loc, mat]);
  assert.match(await expectError(asUser(db, worker1, `insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,txn_date)
     values ('70000000-0000-4000-8000-000000000011',$1,$2,$3,'receipt',5,current_date)`, [ORG, loc, mat])), /row-level security/);
  assert.equal((await asUser(db, worker1, `select count(*)::int n from inventory_transactions`)).rows[0].n, 0);
  assert.equal((await asUser(db, fin, `select count(*)::int n from inventory_transactions`)).rows[0].n, 1);
  // chi phí ước tính phải ghi giả định
  assert.match(await expectError(db.query(`insert into expense_records (id,organization_id,category,kind,amount,expense_date)
     values ('80000000-0000-4000-8000-000000000001',$1,'other','estimated',1000,current_date)`, [ORG])), /check/);
});

// ---------------------------------------------------------------- Chấm công / tiền công
async function workforce() {
  const s = await setup();
  const { db, owner, worker1, leader } = s;
  const wA = 'a0000000-0000-4000-8000-000000000001'; // có smartphone
  const wB = 'a0000000-0000-4000-8000-000000000002'; // tổ trưởng
  const wC = 'a0000000-0000-4000-8000-000000000003'; // không có smartphone
  await db.query(`insert into worker_profiles (id,organization_id,user_id,full_name) values ($1,$4,$5,'Lan'),($2,$4,$6,'Hải'),($3,$4,null,'Tư')`,
    [wA, wB, wC, ORG, worker1, leader]);
  const team = 'b0000000-0000-4000-8000-000000000001';
  await db.query(`insert into worker_teams (id,organization_id,name,leader_worker_id) values ($1,$2,'Tổ 1',$3)`, [team, ORG, wB]);
  await db.query(`insert into worker_team_memberships (team_id,worker_id) values ($1,$2),($1,$3),($1,$4)`, [team, wA, wB, wC]);
  return { ...s, wA, wB, wC, team };
}

test('chấm công: tự chấm, ca mở thứ hai bị chặn, ghi lặp không trùng', async () => {
  const { db, worker1, wA } = await workforce();
  const id1 = 'c0000000-0000-4000-8000-000000000001';
  const ins = `insert into attendance_records (id,organization_id,worker_id,work_date,started_at,source,start_lat,start_lng,start_accuracy_m)
               values ($1,$2,$3,current_date,now(),'self',10.1,106.2,12) on conflict (id) do nothing`;
  await asUser(db, worker1, ins, [id1, ORG, wA]);
  await asUser(db, worker1, ins, [id1, ORG, wA]); // đồng bộ lặp
  assert.equal((await db.query(`select count(*)::int n from attendance_records`)).rows[0].n, 1);
  // ca thứ hai khi ca trước chưa kết thúc
  assert.match(await expectError(asUser(db, worker1, ins, ['c0000000-0000-4000-8000-000000000002', ORG, wA])), /one_open_shift|duplicate/);
  // kết thúc ca -> tính số phút khai báo
  await asUser(db, worker1, `update attendance_records set ended_at = started_at + interval '8 hours', break_minutes = 60 where id=$1`, [id1]);
  assert.equal((await db.query(`select declared_minutes from attendance_records where id=$1`, [id1])).rows[0].declared_minutes, 420);
});

test('chấm công: không chấm hộ người khác khi không phải tổ trưởng; tổ trưởng chấm hộ người không có smartphone', async () => {
  const { db, worker1, leader, wA, wC } = await workforce();
  // nhân viên thường không chấm cho người khác
  assert.match(await expectError(asUser(db, worker1, `insert into attendance_records (id,organization_id,worker_id,work_date,started_at,source)
     values ('c0000000-0000-4000-8000-000000000010',$1,$2,current_date,now(),'self')`, [ORG, wC])), /row-level security/);
  // giả mạo nguồn team_leader cũng không được
  assert.match(await expectError(asUser(db, worker1, `insert into attendance_records (id,organization_id,worker_id,work_date,started_at,source)
     values ('c0000000-0000-4000-8000-000000000011',$1,$2,current_date,now(),'team_leader')`, [ORG, wC])), /row-level security/);
  // tổ trưởng chấm cho wC, nhập muộn -> chờ xác nhận, không bị loại
  await asUser(db, leader, `insert into attendance_records (id,organization_id,worker_id,work_date,started_at,ended_at,source,entered_late)
     values ('c0000000-0000-4000-8000-000000000012',$1,$2,current_date - 1,now() - interval '1 day',now() - interval '1 day' + interval '6 hours','team_leader',true)`, [ORG, wC]);
  const r = (await db.query(`select status, recorded_by from attendance_records where id='c0000000-0000-4000-8000-000000000012'`)).rows[0];
  assert.equal(r.status, 'needs_confirmation');
  assert.equal(r.recorded_by, leader);
  // người lao động chỉ thấy bản ghi của mình
  assert.equal((await asUser(db, worker1, `select count(*)::int n from attendance_records`)).rows[0].n, 0);
  assert.ok(wA);
});

test('ngoại lệ GPS: tạo bản ghi ngoại lệ vẫn được, chuyển chờ xác nhận', async () => {
  const { db, worker1, wA } = await workforce();
  await asUser(db, worker1, `insert into attendance_records (id,organization_id,worker_id,work_date,started_at,source,exception_reason)
     values ('c0000000-0000-4000-8000-000000000020',$1,$2,current_date,now(),'self','Không có GPS')`, [ORG, wA]);
  assert.equal((await db.query(`select status from attendance_records where id='c0000000-0000-4000-8000-000000000020'`)).rows[0].status, 'needs_confirmation');
});

async function payrollSetup(w) {
  const { db, owner, wA } = w;
  await db.query(`insert into work_rates (id,organization_id,rate_type,amount,valid_from) values ('d0000000-0000-4000-8000-000000000001',$1,'hour',25000,current_date - 30)`, [ORG]);
  await db.query(`insert into attendance_records (id,organization_id,worker_id,work_date,started_at,ended_at,source,status,approved_minutes)
     values ('c0000000-0000-4000-8000-000000000030',$1,$2,current_date - 2,now() - interval '2 days',now() - interval '2 days' + interval '8 hours','admin','confirmed',480)`, [ORG, wA]);
  const period = 'e0000000-0000-4000-8000-000000000001';
  await db.query(`insert into payroll_periods (id,organization_id,start_date,end_date,status) values ($1,$2,current_date - 10,current_date,'draft')`, [period, ORG]);
  const stmt = 'e1000000-0000-4000-8000-000000000001';
  await db.query(`insert into worker_pay_statements (id,period_id,organization_id,worker_id,total_estimated) values ($1,$2,$3,$4,200000)`, [stmt, period, ORG, wA]);
  await db.query(`insert into pay_statement_lines (statement_id,organization_id,line_type,attendance_id,quantity,unit,rate_id,rate_amount,amount,explanation)
     values ($1,$2,'hours','c0000000-0000-4000-8000-000000000030',8,'hour','d0000000-0000-4000-8000-000000000001',25000,200000,'8 giờ × 25.000')`, [stmt, ORG]);
  return { period, stmt };
}

test('tiền công: một lượt công chỉ tính một lần; người lao động xem bảng của mình, không xem của người khác', async () => {
  const w = await workforce();
  const { db, worker1, leader } = w;
  const { stmt } = await payrollSetup(w);
  // trùng dòng cho cùng lượt công
  assert.match(await expectError(db.query(`insert into pay_statement_lines (statement_id,organization_id,line_type,attendance_id,quantity,unit,rate_id,rate_amount,amount,explanation)
     values ($1,$2,'hours','c0000000-0000-4000-8000-000000000030',8,'hour','d0000000-0000-4000-8000-000000000001',25000,200000,'trùng')`, [stmt, ORG])), /one_line_per_attendance|duplicate/);
  assert.equal((await asUser(db, worker1, `select count(*)::int n from worker_pay_statements`)).rows[0].n, 1);
  assert.equal((await asUser(db, worker1, `select count(*)::int n from pay_statement_lines`)).rows[0].n, 1);
  // tổ trưởng (không phải quản lý) không xem tiền công của người khác
  assert.equal((await asUser(db, leader, `select count(*)::int n from worker_pay_statements`)).rows[0].n, 0);
  assert.equal((await asUser(db, leader, `select count(*)::int n from work_rates`)).rows[0].n, 0);
});

test('khóa kỳ: sau khi khóa không sửa công/dòng lương/khoản cộng trừ; mở khóa có audit', async () => {
  const w = await workforce();
  const { db, owner, wA } = w;
  const { period, stmt } = await payrollSetup(w);
  await asUser(db, owner, `update payroll_periods set status='locked' where id=$1`, [period]);
  const p = (await db.query(`select locked_at, approved_by from payroll_periods where id=$1`, [period])).rows[0];
  assert.ok(p.locked_at);
  assert.equal(p.approved_by, owner);

  assert.match(await expectError(asUser(db, owner, `update attendance_records set approved_minutes = 600 where id='c0000000-0000-4000-8000-000000000030'`)), /PERIOD_LOCKED/);
  assert.match(await expectError(asUser(db, owner, `update pay_statement_lines set amount = 1 where statement_id=$1`, [stmt])), /PERIOD_LOCKED/);
  assert.match(await expectError(asUser(db, owner, `insert into pay_adjustments (organization_id,worker_id,period_id,kind,amount,reason) values ($1,$2,$3,'bonus',1000,'x')`, [ORG, wA, period])), /PERIOD_LOCKED/);

  // mở khóa rồi sửa được; mọi thay đổi trạng thái kỳ nằm trong audit
  await asUser(db, owner, `update payroll_periods set status='pending_approval' where id=$1`, [period]);
  await asUser(db, owner, `update attendance_records set approved_minutes = 450 where id='c0000000-0000-4000-8000-000000000030'`);
  const audit = (await db.query(`select count(*)::int n from audit_events where entity='payroll_periods' and action='UPDATE'`)).rows[0].n;
  assert.equal(audit, 2);
});

test('đơn giá hiệu lực theo thời gian: kỳ cũ giữ bản chụp đơn giá', async () => {
  const w = await workforce();
  const { db, owner } = w;
  await payrollSetup(w);
  await asUser(db, owner, `update work_rates set amount = 30000 where id='d0000000-0000-4000-8000-000000000001'`);
  const line = (await db.query(`select rate_amount, amount from pay_statement_lines`)).rows[0];
  assert.equal(Number(line.rate_amount), 25000); // dòng của kỳ không đổi
  assert.equal(Number(line.amount), 200000);
});
