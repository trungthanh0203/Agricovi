// Kiểm thử MA TRẬN QUYỀN đã chốt (docs/ROLES.md). Mỗi vai trò chỉ làm được đúng phần của mình.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError, uid } from './harness.mjs';

const R = (...r) => `array[${r.map((x) => `'${x}'`).join(',')}]::member_role[]`;
const AREA = '20000000-0000-4000-8000-0000000000a1';
const CYC = '30000000-0000-4000-8000-0000000000a1';

async function setup() {
  const db = await createDb();
  const u = {};
  u.owner = await addUser(db, 1);
  u.mgr = await addUser(db, 2);
  u.worker = await addUser(db, 3);
  u.fin = await addUser(db, 4);          // kho & chi phí
  u.workerFin = await addUser(db, 5);    // nhân viên kiêm kho & chi phí
  u.leader = await addUser(db, 6);       // tổ trưởng (nhân viên)
  const org = (await asUser(db, u.owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  const add = (user, ...roles) => db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,${R(...roles)})`, [org, user]);
  await add(u.mgr, 'manager');
  await add(u.worker, 'worker');
  await add(u.fin, 'inventory_finance');
  await add(u.workerFin, 'worker', 'inventory_finance');
  await add(u.leader, 'worker');
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'N1')`, [AREA, org]);
  await db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status) values ($1,$2,$3,(select id from crop_types limit 1),'active')`, [CYC, org, AREA]);
  return { db, org, u };
}

const expense = (db, user, org, id) =>
  asUser(db, user, `insert into expense_records (id,organization_id,category,kind,amount,expense_date) values ($1,$2,'other','cash_paid',1000,current_date)`, [id, org]);

test('chi phí/doanh thu: ghi là việc của chủ và Kho & chi phí; quản lý và nhân viên thường không ghi được; kiêm vai trò thì được', async () => {
  const { db, org, u } = await setup();
  await expense(db, u.fin, org, 'e0000000-0000-4000-8000-000000000001');
  await expense(db, u.owner, org, 'e0000000-0000-4000-8000-000000000002');
  await expense(db, u.workerFin, org, 'e0000000-0000-4000-8000-000000000003'); // nhân viên kiêm kho & chi phí
  assert.match(await expectError(expense(db, u.mgr, org, 'e0000000-0000-4000-8000-000000000004')), /row-level security/);
  assert.match(await expectError(expense(db, u.worker, org, 'e0000000-0000-4000-8000-000000000005')), /row-level security/);
  // D83: quản lý mặc định KHÔNG xem chi phí; nhân viên thường cũng không
  assert.equal((await asUser(db, u.mgr, `select count(*)::int n from expense_records`)).rows[0].n, 0);
  assert.equal((await asUser(db, u.worker, `select count(*)::int n from expense_records`)).rows[0].n, 0);
});

test('kho: quản lý và nhân viên ghi được "xuất dùng", không ghi được nhập; Kho & chi phí ghi mọi loại', async () => {
  const { db, org, u } = await setup();
  await db.query(`insert into inventory_locations (id,organization_id,name) values ('50000000-0000-4000-8000-000000000001',$1,'Kho')`, [org]);
  await db.query(`insert into materials (id,organization_id,name,base_unit_id) values ('60000000-0000-4000-8000-000000000001',$1,'Phân',(select id from units_of_measure where code='kg'))`, [org]);
  const txn = (user, id, type, qty) => asUser(db, user, `insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,txn_date)
     values ($1,$2,'50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',$3,$4,current_date)`, [id, org, type, qty]);
  await txn(u.fin, '70000000-0000-4000-8000-000000000001', 'receipt', 10);
  await txn(u.mgr, '70000000-0000-4000-8000-000000000002', 'issue', -1);
  await txn(u.worker, '70000000-0000-4000-8000-000000000003', 'issue', -1);
  assert.match(await expectError(txn(u.mgr, '70000000-0000-4000-8000-000000000004', 'receipt', 5)), /row-level security/);
  assert.match(await expectError(txn(u.worker, '70000000-0000-4000-8000-000000000005', 'receipt', 5)), /row-level security/);
  // danh mục vật tư: chỉ Kho & chi phí (và chủ)
  assert.match(await expectError(asUser(db, u.mgr, `insert into materials (organization_id,name,base_unit_id) values ($1,'X',(select id from units_of_measure where code='kg'))`, [org])), /row-level security/);
  await asUser(db, u.workerFin, `insert into materials (organization_id,name,base_unit_id) values ($1,'Y',(select id from units_of_measure where code='kg'))`, [org]);
});

test('đơn giá lương: chỉ chủ đặt; quản lý và Kho & chi phí chỉ xem', async () => {
  const { db, org, u } = await setup();
  const rate = (user) => asUser(db, user, `insert into work_rates (organization_id,rate_type,amount,valid_from) values ($1,'hour',25000,current_date)`, [org]);
  await rate(u.owner);
  assert.match(await expectError(rate(u.mgr)), /row-level security/);
  assert.match(await expectError(rate(u.fin)), /row-level security/);
  // D83: giá công thuộc quyền Tiền công (mặc định chỉ chủ)
  assert.equal((await asUser(db, u.mgr, `select count(*)::int n from work_rates`)).rows[0].n, 0);
  assert.equal((await asUser(db, u.fin, `select count(*)::int n from work_rates`)).rows[0].n, 0);
  assert.equal((await asUser(db, u.worker, `select count(*)::int n from work_rates`)).rows[0].n, 0);
});

test('kỳ lương: quản lý lập và rà soát được, nhưng CHỈ chủ duyệt/khóa/mở khóa', async () => {
  const { db, org, u } = await setup();
  const period = 'f0000000-0000-4000-8000-000000000001';
  await db.query(`update organization_memberships set permissions = '{"payroll":"edit"}'::jsonb where user_id=$1`, [u.mgr]); // D83
  await asUser(db, u.mgr, `insert into payroll_periods (id,organization_id,start_date,end_date) values ($1,$2,current_date-10,current_date)`, [period, org]);
  await asUser(db, u.mgr, `update payroll_periods set status='reviewed' where id=$1`, [period]);
  await asUser(db, u.mgr, `update payroll_periods set status='pending_approval' where id=$1`, [period]);
  assert.match(await expectError(asUser(db, u.mgr, `update payroll_periods set status='locked' where id=$1`, [period])), /FORBIDDEN: Chỉ chủ/);
  await asUser(db, u.owner, `update payroll_periods set status='locked' where id=$1`, [period]);
  assert.match(await expectError(asUser(db, u.mgr, `update payroll_periods set status='pending_approval' where id=$1`, [period])), /FORBIDDEN: Chỉ chủ/);
  await asUser(db, u.owner, `update payroll_periods set status='pending_approval' where id=$1`, [period]); // chủ mở khóa được
});

async function teamSetup() {
  const s = await setup();
  const { db, org, u } = s;
  const mk = async (user, name) => (await db.query(`insert into worker_profiles (organization_id,user_id,full_name,work_mode) values ($1,$2,$3,'self_hourly') returning id`, [org, user, name])).rows[0].id;
  s.wLeader = await mk(u.leader, 'Hải (tổ trưởng)');
  s.wA = await mk(u.worker, 'Lan');
  s.team = (await asUser(db, u.mgr, `select create_team($1,'Tổ 1',$2) id`, [org, s.wLeader])).rows[0].id;
  await asUser(db, u.mgr, `select assign_worker_to_team($1,$2)`, [s.wA, s.team]);
  await asUser(db, u.mgr, `select assign_worker_to_team($1,$2)`, [s.wLeader, s.team]); // tổ trưởng cũng ở trong tổ
  return s;
}

test('tổ lao động: chủ/quản lý tạo; tổ trưởng phải có tài khoản; nhân viên thường không tạo được', async () => {
  const { db, org, u } = await setup();
  const noAccount = (await db.query(`insert into worker_profiles (organization_id,full_name) values ($1,'Không điện thoại') returning id`, [org])).rows[0].id;
  assert.match(await expectError(asUser(db, u.mgr, `select create_team($1,'Tổ X',$2)`, [org, noAccount])), /INVALID_LEADER/);
  assert.match(await expectError(asUser(db, u.worker, `select create_team($1,'Tổ Y',null)`, [org])), /row-level security/);
  await asUser(db, u.owner, `select create_team($1,'Tổ chưa có trưởng',null)`, [org]);
});

test('người KHÔNG có tài khoản: chỉ kiểu phân hệ do tổ trưởng chấm và bắt buộc thuộc tổ có tổ trưởng', async () => {
  const { db, org, u, team } = await teamSetup();
  const noLeaderTeam = (await asUser(db, u.mgr, `select create_team($1,'Tổ trống',null) id`, [org])).rows[0].id;
  const mk = (mode, t) => asUser(db, u.mgr, `select create_worker_without_account($1,'Bác Tư','0912345678',$2,$3) id`, [org, mode, t]);
  assert.match(await expectError(mk('self_hourly', team)), /INVALID_MODE/);
  assert.match(await expectError(mk('leader_hourly', null)), /TEAM_REQUIRED/);
  const idNoLeader = (await mk('leader_hourly', noLeaderTeam)).rows[0].id; // tổ chưa có tổ trưởng vẫn chọn được (D38)
  assert.ok(idNoLeader);
  const id = (await mk('leader_hourly', team)).rows[0].id;
  assert.ok(id);
  // báo những người "kiểu tổ trưởng" mà chưa có tổ trưởng
  await asUser(db, u.mgr, `select set_team_leader($1,null)`, [team]);
  const orphans = (await asUser(db, u.mgr, `select full_name from workers_without_leader`)).rows;
  assert.deepEqual(orphans.map((r) => r.full_name), ['Bác Tư', 'Bác Tư']);
});

test('tạo tài khoản nhân viên kiểu "tổ trưởng chấm" bắt buộc chọn tổ có tổ trưởng; kiêm nhiều vai trò', async () => {
  const { db, org, u, team } = await teamSetup();
  const noLeaderTeam = (await asUser(db, u.mgr, `select create_team($1,'Tổ trống',null) id`, [org])).rows[0].id;
  const fin = async (n, phone, mode, t, roles = '{worker,manager}') => {
    const pre = (await db.query(`select * from staff_precheck($1,$2,$3,$4::member_role[])`, [u.owner, org, phone, roles])).rows[0];
    await db.query(`insert into auth.users (id,instance_id,aud,role,email,encrypted_password) values ($1,$1,'authenticated','authenticated',$2,'h')`, [uid(n), pre.auth_email]);
    return db.query(`select staff_finalize($1,$2,$3,$4,$5,'NV',$6::member_role[],$7,$8)`, [u.owner, org, uid(n), pre.phone, pre.auth_email, roles, mode, t]);
  };
  assert.match(await expectError(fin(60, '0911111111', 'leader_hourly', null)), /TEAM_REQUIRED/);
  await fin(61, '0922222222', 'leader_output', noLeaderTeam); // tổ chưa có tổ trưởng vẫn chọn được (D38)
  await fin(62, '0933333333', 'leader_hourly', team);
  const roles = (await db.query(`select roles::text[] roles from organization_memberships where user_id=$1`, [uid(62)])).rows[0].roles;
  assert.deepEqual(roles, ['manager', 'worker']);
  const inTeam = (await db.query(`select count(*)::int n from worker_team_memberships m join worker_profiles w on w.id=m.worker_id where w.user_id=$1 and m.team_id=$2 and m.valid_to is null`, [uid(62), team])).rows[0].n;
  assert.equal(inTeam, 1);
});

test('tổ trưởng chấm công hộ người trong tổ nhưng KHÔNG tự xác nhận công của chính mình; quản lý xác nhận công của tổ trưởng', async () => {
  const { db, org, u, wLeader, wA } = await teamSetup();
  const mkAtt = (id, worker, source, user) => asUser(db, user, `insert into attendance_records (id,organization_id,worker_id,work_date,started_at,ended_at,source)
     values ($1,$2,$3,current_date,now()-interval '8 hours',now(),$4)`, [id, org, worker, source]);
  // chấm hộ cho người trong tổ: được
  await mkAtt('c0000000-0000-4000-8000-0000000000a1', wA, 'team_leader', u.leader);
  // chấm hộ cho CHÍNH MÌNH với tư cách "tổ trưởng": không
  assert.match(await expectError(mkAtt('c0000000-0000-4000-8000-0000000000a2', wLeader, 'team_leader', u.leader)), /row-level security/);
  // tự chấm công của mình: được; nhưng tổ trưởng không tự xác nhận
  await mkAtt('c0000000-0000-4000-8000-0000000000a3', wLeader, 'self', u.leader);
  const own = await asUser(db, u.leader, `update attendance_records set status='confirmed', approved_minutes=480 where id='c0000000-0000-4000-8000-0000000000a3' returning id`);
  assert.equal(own.rows.length, 0);
  // tổ trưởng xác nhận công của người trong tổ: được
  const ok = await asUser(db, u.leader, `update attendance_records set status='confirmed', approved_minutes=480 where id='c0000000-0000-4000-8000-0000000000a1' returning id`);
  assert.equal(ok.rows.length, 1);
  // quản lý xác nhận công của tổ trưởng: được
  const byMgr = await asUser(db, u.mgr, `update attendance_records set status='confirmed', approved_minutes=480 where id='c0000000-0000-4000-8000-0000000000a3' returning id`);
  assert.equal(byMgr.rows.length, 1);
  // tổ trưởng không xem tiền công / đơn giá của người trong tổ
  assert.equal((await asUser(db, u.leader, `select count(*)::int n from worker_pay_statements`)).rows[0].n, 0);
  assert.equal((await asUser(db, u.leader, `select count(*)::int n from work_rates`)).rows[0].n, 0);
});
