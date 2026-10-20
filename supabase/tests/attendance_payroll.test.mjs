import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0030 (D42): chấm công, sản lượng, đơn giá, tính tiền công, khóa kỳ.

const id = (n) => `80000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), mgr = await addUser(db, 2), leader = await addUser(db, 3), wk = await addUser(db, 4);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values
    ($1,$2,array['manager']::member_role[]),($1,$3,array['worker']::member_role[]),($1,$4,array['worker']::member_role[])`, [org, mgr, leader, wk]);
  const lw = (await db.query(`insert into worker_profiles (organization_id,user_id,full_name,work_mode) values ($1,$2,'Tổ trưởng','self_hourly') returning id`, [org, leader])).rows[0].id;
  const ww = (await db.query(`insert into worker_profiles (organization_id,user_id,full_name,work_mode) values ($1,$2,'Công nhân','self_hourly') returning id`, [org, wk])).rows[0].id;
  const team = (await db.query(`insert into worker_teams (organization_id,name,leader_worker_id) values ($1,'Tổ 1',$2) returning id`, [org, lw])).rows[0].id;
  await db.query(`insert into worker_team_memberships (team_id,worker_id,valid_from) values ($1,$2,'2020-01-01')`, [team, ww]);
  return { db, owner, mgr, leader, wk, org, lw, ww, team };
}
const shiftSql = `select * from record_shift($1,$2,now() - interval '2 days', now() - interval '2 days' + interval '4 hours', 30, null, null)`;

test('vào ca / ra ca của chính mình: không mở hai ca; bấm lặp không nhân đôi; người không có hồ sơ bị chặn', async () => {
  const { db, wk, org, mgr } = await setup();
  const a = (await asUser(db, wk, `select * from clock_in($1,$2)`, [id(1), org])).rows[0];
  assert.equal(a.source, 'self');
  assert.equal((await asUser(db, wk, `select * from clock_in($1,$2)`, [id(1), org])).rows.length, 1);
  assert.match(await expectError(asUser(db, wk, `select * from clock_in($1,$2)`, [id(2), org])), /SHIFT_OPEN/);
  const out = (await asUser(db, wk, `select * from clock_out($1, 5)`, [id(1)])).rows[0];
  assert.ok(out.ended_at);
  assert.equal((await db.query(`select count(*)::int n from attendance_records`)).rows[0].n, 1);
  assert.match(await expectError(asUser(db, mgr, `select * from clock_in($1,$2)`, [id(3), org])), /NO_WORKER/);
  // không tự xác nhận công của mình
  assert.match(await expectError(asUser(db, wk, `select * from confirm_attendance($1)`, [id(1)])), /FORBIDDEN/);
});

test('tổ trưởng chấm hộ chờ xác nhận, tổ trưởng xác nhận được; quản lý nhập thì xác nhận ngay; người ngoài tổ bị chặn', async () => {
  const { db, wk, leader, mgr, owner, org, ww, lw } = await setup();
  const r = (await asUser(db, leader, shiftSql, [id(10), ww])).rows[0];
  assert.equal(r.status, 'needs_confirmation');
  assert.equal(r.source, 'team_leader');
  const c = (await asUser(db, leader, `select * from confirm_attendance($1)`, [id(10)])).rows[0];
  assert.deepEqual([c.status, c.approved_minutes], ['confirmed', 210]);

  const m = (await asUser(db, mgr, shiftSql, [id(11), lw])).rows[0];
  assert.deepEqual([m.status, m.approved_minutes, m.source], ['confirmed', 210, 'admin']);
  // tổ trưởng không chấm hộ chính mình; nhân viên thường không chấm hộ ai
  assert.match(await expectError(asUser(db, leader, shiftSql, [id(12), lw])), /row-level security/);
  assert.match(await expectError(asUser(db, wk, shiftSql, [id(13), lw])), /row-level security/);
  // giờ tương lai và giờ ngược bị từ chối
  assert.match(await expectError(asUser(db, owner, `select * from record_shift($1,$2,now(), now() + interval '5 hours', 0)`, [id(14), ww])), /INVALID_TIME/);
  assert.match(await expectError(asUser(db, owner, `select * from record_shift($1,$2,now() - interval '1 day', now() - interval '2 days', 0)`, [id(15), ww])), /INVALID_TIME/);
  // từ chối cần lý do
  await asUser(db, mgr, `select * from record_shift($1,$2,now() - interval '3 days', now() - interval '3 days' + interval '2 hours', 0)`, [id(16), ww]);
  assert.match(await expectError(asUser(db, mgr, `select * from reject_attendance($1,'x')`, [id(16)])), /REASON_REQUIRED/);
  assert.equal((await asUser(db, mgr, `select * from reject_attendance($1,'Chấm nhầm người')`, [id(16)])).rows[0].status, 'rejected');
  void org;
});

test('tính tiền công: thiếu đơn giá thì báo; đơn giá cụ thể nhất thắng; sản lượng; khoản cộng; truy ngược dòng', async () => {
  const { db, owner, mgr, leader, wk, org, ww, team } = await setup();
  await asUser(db, leader, shiftSql, [id(20), ww]);
  await asUser(db, leader, `select * from confirm_attendance($1)`, [id(20)]);
  const per = (await asUser(db, mgr, `insert into payroll_periods (id,organization_id,start_date,end_date) values ($1,$2,current_date - 6, current_date) returning id`, [id(30), org])).rows[0].id;
  const comp = async () => (await asUser(db, mgr, `select compute_payroll($1) r`, [per])).rows[0].r;

  let r = await comp();
  assert.deepEqual([r.lines, r.missing_rate_hours], [0, 1]); // thiếu đơn giá: báo, không tính 0

  assert.match(await expectError(asUser(db, mgr, `insert into work_rates (organization_id,rate_type,amount,valid_from) values ($1,'hour',30000,'2020-01-01')`, [org])), /row-level security/);
  await asUser(db, owner, `insert into work_rates (organization_id,rate_type,amount,valid_from) values ($1,'hour',30000,'2020-01-01')`, [org]);
  r = await comp();
  assert.deepEqual([r.lines, r.total], [1, 105000]); // 3,5 giờ × 30.000

  // đơn giá của tổ đè đơn giá chung
  await asUser(db, owner, `insert into work_rates (organization_id,rate_type,team_id,amount,valid_from) values ($1,'hour',$2,40000,'2020-01-01')`, [org, team]);
  assert.equal((await comp()).total, 140000);

  // sản lượng: nháp chưa tính, xác nhận mới tính
  await asUser(db, leader, `select * from record_output($1,$2,current_date - 1,null,null,10,'kg')`, [id(40), ww]);
  assert.equal((await comp()).lines, 1);
  await asUser(db, leader, `select * from confirm_output($1)`, [id(40)]);
  assert.equal((await comp()).missing_rate_output, 1);
  await asUser(db, owner, `insert into work_rates (organization_id,rate_type,unit,amount,valid_from) values ($1,'quantity','kg',2000,'2020-01-01')`, [org]);
  r = await comp();
  assert.deepEqual([r.lines, r.total], [2, 160000]);

  await asUser(db, mgr, `insert into pay_adjustments (organization_id,worker_id,period_id,kind,amount,reason) values ($1,$2,$3,'bonus',5000,'Thưởng chuyên cần'), ($1,$2,$3,'advance',20000,'Tạm ứng')`, [org, ww, per]);
  r = await comp();
  assert.equal(r.total, 145000); // 160.000 + 5.000 − 20.000

  const lines = (await db.query(`select line_type, amount::float a, explanation, rate_amount::float ra from pay_statement_lines order by line_type`)).rows;
  assert.deepEqual(lines.map((l) => [l.line_type, l.a, l.ra]), [['hours', 140000, 40000], ['output', 20000, 2000]]);
  assert.match(lines[0].explanation, /3\.5 giờ/);

  // chỉ người lao động đó và quản lý thấy bảng; tổ trưởng không thấy tiền công của người khác
  assert.equal((await asUser(db, wk, `select count(*)::int n from worker_pay_statements`)).rows[0].n, 1);
  assert.equal((await asUser(db, leader, `select count(*)::int n from worker_pay_statements`)).rows[0].n, 0);
});

test('khóa kỳ: chỉ chủ; sau khóa không tính lại, không sửa công; mở khóa cần lý do và có audit', async () => {
  const { db, owner, mgr, leader, org, ww } = await setup();
  await asUser(db, leader, shiftSql, [id(50), ww]);
  await asUser(db, leader, `select * from confirm_attendance($1)`, [id(50)]);
  await asUser(db, owner, `insert into work_rates (organization_id,rate_type,amount,valid_from) values ($1,'hour',30000,'2020-01-01')`, [org]);
  const per = (await asUser(db, mgr, `insert into payroll_periods (id,organization_id,start_date,end_date) values ($1,$2,current_date - 6, current_date) returning id`, [id(60), org])).rows[0].id;
  await asUser(db, mgr, `select compute_payroll($1)`, [per]);

  assert.match(await expectError(asUser(db, mgr, `select lock_payroll($1)`, [per])), /FORBIDDEN/);
  await asUser(db, owner, `select lock_payroll($1)`, [per]);
  const st = (await db.query(`select total_estimated::float e, total_approved::float a from worker_pay_statements`)).rows[0];
  assert.deepEqual([st.e, st.a], [105000, 105000]);
  assert.match(await expectError(asUser(db, mgr, `select compute_payroll($1)`, [per])), /PERIOD_LOCKED/);
  assert.match(await expectError(asUser(db, owner, `update attendance_records set note='sửa' where id=$1`, [id(50)])), /PERIOD_LOCKED/);

  assert.match(await expectError(asUser(db, mgr, `select unlock_payroll($1,'Cần sửa lại công')`, [per])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, owner, `select unlock_payroll($1,'x')`, [per])), /REASON_REQUIRED/);
  await asUser(db, owner, `select unlock_payroll($1,'Cần sửa lại công')`, [per]);
  assert.equal((await db.query(`select status from payroll_periods where id=$1`, [per])).rows[0].status, 'draft');
  assert.equal((await db.query(`select count(*)::int n from audit_events where entity='payroll_period' and action='unlock'`)).rows[0].n, 1);
  await asUser(db, mgr, `select compute_payroll($1)`, [per]); // mở khóa rồi tính lại được
});
