import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0031 (D43): vị trí khi chấm công, ca tự ghi/offline do máy chủ quyết định trạng thái, yêu cầu sửa công, nhân công trong tổng kết vụ.

const id = (n) => `81000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), mgr = await addUser(db, 2), wk = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[]),($1,$3,array['worker']::member_role[])`, [org, mgr, wk]);
  const ww = (await db.query(`insert into worker_profiles (organization_id,user_id,full_name,work_mode) values ($1,$2,'Công nhân','self_hourly') returning id`, [org, wk])).rows[0].id;
  const area = (await asUser(db, owner, `insert into production_areas (id,organization_id,name) values (gen_random_uuid(),$1,'T') returning id`, [org])).rows[0].id;
  const cyc = id(900);
  await asUser(db, owner, `insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status,created_by) values ($1,$2,$3,(select id from crop_types limit 1),'active',$4)`, [cyc, org, area, owner]);
  return { db, owner, mgr, wk, org, ww, cyc };
}

test('vào/ra ca lưu vị trí; ra ca chuyển sang chờ xác nhận', async () => {
  const { db, wk, org } = await setup();
  const a = (await asUser(db, wk, `select * from clock_in($1,$2,null,10.5,106.7,12)`, [id(1), org])).rows[0];
  assert.deepEqual([a.status, a.start_lat, a.start_lng, a.start_accuracy_m], ['open', 10.5, 106.7, 12]);
  const o = (await asUser(db, wk, `select * from clock_out($1,15,10.6,106.8,20)`, [id(1)])).rows[0];
  assert.deepEqual([o.status, o.break_minutes, o.end_lat, o.end_accuracy_m], ['needs_confirmation', 15, 10.6, 20]);
});

test('ca tự ghi gửi từ hàng đợi offline: máy chủ ép trạng thái, ngày công, không cho tự xác nhận hay giờ tương lai', async () => {
  const { db, wk, org, ww } = await setup();
  const ins = (n, extra) => asUser(db, wk, `insert into attendance_records (id,worker_id,work_date,started_at,ended_at,source,status,approved_minutes,confirmed_by ${extra.cols ?? ''})
    values ($1,$2,'2000-01-01', ${extra.start}, ${extra.end}, 'self', 'confirmed', 999, $3 ${extra.vals ?? ''}) on conflict (id) do nothing`, [id(n), ww, wk]);
  await ins(10, { start: `now() - interval '5 hours'`, end: `now() - interval '1 hour'` });
  const r = (await db.query(`select status, approved_minutes, confirmed_by, work_date::text d, organization_id from attendance_records where id=$1`, [id(10)])).rows[0];
  assert.deepEqual([r.status, r.approved_minutes, r.confirmed_by], ['needs_confirmation', null, null]);
  assert.notEqual(r.d, '2000-01-01');
  assert.equal(r.organization_id, org);
  await ins(10, { start: `now() - interval '5 hours'`, end: `now() - interval '1 hour'` }); // gửi lặp không nhân đôi
  assert.equal((await db.query(`select count(*)::int n from attendance_records`)).rows[0].n, 1);
  assert.match(await expectError(ins(11, { start: `now() + interval '3 hours'`, end: `now() + interval '5 hours'` })), /INVALID_TIME/);
});

test('yêu cầu sửa công: người lao động đề nghị, quản lý duyệt cập nhật giờ và giữ giá trị trước/sau; kỳ khóa chặn', async () => {
  const { db, wk, mgr, owner, org, ww } = await setup();
  await asUser(db, mgr, `select * from record_shift($1,$2,now() - interval '3 days', now() - interval '3 days' + interval '2 hours', 0)`, [id(20), ww]); // 120 phút
  await asUser(db, mgr, `select * from confirm_attendance($1)`, [id(20)]);
  const req = (await asUser(db, wk, `select * from request_attendance_adjustment($1, jsonb_build_object('ended_at', (now() - interval '3 days' + interval '4 hours')), 'Quên ra ca')`, [id(20)])).rows[0];
  assert.equal(req.status, 'pending');
  assert.equal(req.before_values.approved_minutes, 120);
  assert.match(await expectError(asUser(db, wk, `select * from request_attendance_adjustment($1, '{}'::jsonb, 'x y z')`, [id(20)])), /INVALID_ARGUMENT/);
  assert.match(await expectError(asUser(db, wk, `select * from decide_attendance_adjustment($1, true)`, [req.id])), /FORBIDDEN/);
  const done = (await asUser(db, mgr, `select * from decide_attendance_adjustment($1, true)`, [req.id])).rows[0];
  assert.equal(done.status, 'approved');
  assert.equal(done.after_values.approved_minutes, 240);
  assert.equal((await db.query(`select approved_minutes from attendance_records where id=$1`, [id(20)])).rows[0].approved_minutes, 240);
  assert.match(await expectError(asUser(db, mgr, `select * from decide_attendance_adjustment($1, false)`, [req.id])), /INVALID_TRANSITION/);

  // kỳ đã khóa: không sửa công được
  const req2 = (await asUser(db, wk, `select * from request_attendance_adjustment($1, jsonb_build_object('break_minutes', 30), 'Có nghỉ trưa')`, [id(20)])).rows[0];
  await asUser(db, owner, `insert into work_rates (organization_id,rate_type,amount,valid_from) values ($1,'hour',30000,'2020-01-01')`, [org]);
  const per = (await asUser(db, mgr, `insert into payroll_periods (id,organization_id,start_date,end_date) values ($1,$2,current_date - 6, current_date) returning id`, [id(30), org])).rows[0].id;
  await asUser(db, mgr, `select compute_payroll($1)`, [per]);
  await asUser(db, owner, `select lock_payroll($1)`, [per]);
  assert.match(await expectError(asUser(db, mgr, `select * from decide_attendance_adjustment($1, true)`, [req2.id])), /PERIOD_LOCKED/);
});

test('tổng kết vụ có nhân công: kỳ chưa khóa là dự tính, kỳ đã khóa là đã duyệt; vào tổng chi phí', async () => {
  const { db, owner, mgr, org, ww, cyc } = await setup();
  await asUser(db, mgr, `select * from record_shift($1,$2,now() - interval '2 days', now() - interval '2 days' + interval '4 hours', 0, $3)`, [id(40), ww, cyc]); // 4 giờ
  await asUser(db, mgr, `select * from confirm_attendance($1)`, [id(40)]);
  await asUser(db, mgr, `select * from record_shift($1,$2,now() - interval '1 day', now() - interval '1 day' + interval '2 hours', 0, null)`, [id(41), ww]); // không gắn vụ
  await asUser(db, mgr, `select * from confirm_attendance($1)`, [id(41)]);
  await asUser(db, owner, `insert into work_rates (organization_id,rate_type,amount,valid_from) values ($1,'hour',30000,'2020-01-01')`, [org]);
  const per = (await asUser(db, mgr, `insert into payroll_periods (id,organization_id,start_date,end_date) values ($1,$2,current_date - 6, current_date) returning id`, [id(50), org])).rows[0].id;
  await asUser(db, mgr, `select compute_payroll($1)`, [per]);
  let s = (await asUser(db, owner, `select get_cycle_summary($1) s`, [cyc])).rows[0].s;
  assert.deepEqual([s.labor_cost, s.labor_estimated, s.total_cost, s.has_estimated_cost], [0, 120000, 120000, true]); // chỉ ca gắn vụ
  await asUser(db, owner, `select lock_payroll($1)`, [per]);
  s = (await asUser(db, owner, `select get_cycle_summary($1) s`, [cyc])).rows[0].s;
  assert.deepEqual([s.labor_cost, s.labor_estimated, s.total_cost, s.has_estimated_cost], [120000, 0, 120000, false]);
});
