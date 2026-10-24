import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0071 (D89): chốt lương trong Bảng lương — kỳ là cả tháng, khóa bị chặn khi còn việc dang dở, thưởng/phạt tự tính lại.

const id = (k, n) => `${k}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const M = '2026-09-01';

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), a = await addUser(db, 2), mgr = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[]),($1,$3,array['manager']::member_role[])`, [org, a, mgr]);
  const wa = (await db.query(`insert into worker_profiles (organization_id,user_id,full_name) values ($1,$2,'An') returning id`, [org, a])).rows[0].id;
  return { db, owner, a, mgr, org, wa };
}
const att = (c, n, day, minutes, status = 'confirmed', open = false) => c.db.query(`insert into attendance_records (id,organization_id,worker_id,work_date,started_at,ended_at,source,status,approved_minutes)
   values ($1,$2,$3,$4::date,($4::date + time '07:00')::timestamptz,$5,'admin',$6::attendance_status,$7)`,
  [id('a', n), c.org, c.wa, day, open ? null : `${day}T${String(7 + Math.floor(minutes / 60)).padStart(2, '0')}:00:00Z`, status, status === 'confirmed' ? minutes : null]);
const rate = (c, type, amount) => asUser(c.db, c.owner, `insert into work_rates (organization_id,rate_type,worker_id,amount,valid_from) values ($1,$2::rate_type,$3,$4,'2026-01-01')`, [c.org, type, c.wa, amount]);
const state = async (c, u = c.owner) => (await asUser(c.db, u, `select get_pay_settle_state($1,$2) r`, [c.org, M])).rows[0].r;
const lock = (c, pid) => asUser(c.db, c.owner, `select lock_payroll($1)`, [pid]);

test('kỳ là cả tháng, tạo một lần; không tạo tháng chưa tới; kỳ cũ trùng một phần bị từ chối; quản lý chưa có quyền thì không tạo', async () => {
  const c = await setup();
  const p1 = (await asUser(c.db, c.owner, `select ensure_month_period($1,'2026-09-17') p`, [c.org])).rows[0].p;
  const p2 = (await asUser(c.db, c.owner, `select ensure_month_period($1,'2026-09-01') p`, [c.org])).rows[0].p;
  assert.equal(p1, p2);
  const row = (await c.db.query(`select start_date::text s, end_date::text e from payroll_periods where id=$1`, [p1])).rows[0];
  assert.deepEqual([row.s, row.e], ['2026-09-01', '2026-09-30']);
  assert.match(await expectError(asUser(c.db, c.owner, `select ensure_month_period($1,'2030-01-01')`, [c.org])), /INVALID_DATE/);
  await c.db.query(`insert into payroll_periods (organization_id,start_date,end_date) values ($1,'2026-10-10','2026-10-20')`, [c.org]);
  assert.match(await expectError(asUser(c.db, c.owner, `select ensure_month_period($1,'2026-10-05')`, [c.org])), /PERIOD_OVERLAP/);
  assert.match(await expectError(asUser(c.db, c.mgr, `select ensure_month_period($1,'2026-08-01')`, [c.org])), /FORBIDDEN/);
});

test('khóa kỳ bị chặn khi còn việc dang dở; hết việc thì khóa được; chỉ chủ khóa', async () => {
  const c = await setup();
  await att(c, 1, '2026-09-03', 120);
  await att(c, 2, '2026-09-04', 60, 'needs_confirmation');
  await att(c, 3, '2026-09-05', 60, 'needs_confirmation', true); // ca đang mở
  await c.db.query(`insert into attendance_adjustments (organization_id,attendance_id,requested_by,problem_type,reason) values ($1,$2,$3,'sai giờ','Sai giờ ra')`, [c.org, id('a', 1), c.a]);
  const st0 = await state(c);
  assert.equal(st0.status, 'none');
  assert.deepEqual([st0.blockers.pending_attendance, st0.blockers.open_shifts, st0.blockers.pending_requests, st0.blockers.missing_rate.length], [1, 1, 1, 1]);
  const res = (await asUser(c.db, c.owner, `select settle_month($1,$2) r`, [c.org, M])).rows[0].r;
  assert.equal(res.missing_rate_hours, 1);
  const pid = res.period_id;
  const blocked = await expectError(lock(c, pid));
  assert.match(blocked, /BLOCKED/);
  assert.match(blocked, /chờ xác nhận/);
  // gỡ dần từng việc
  await c.db.query(`update attendance_records set status='confirmed', approved_minutes=60 where id=$1`, [id('a', 2)]);
  await c.db.query(`update attendance_records set ended_at = started_at + interval '1 hour', status='rejected' where id=$1`, [id('a', 3)]);
  await c.db.query(`update attendance_adjustments set status='rejected' where attendance_id=$1`, [id('a', 1)]);
  await rate(c, 'hour', 30000);
  assert.match(await expectError(lock(c, pid)), /chưa tính/); // có giá rồi nhưng chưa Tính lại
  await asUser(c.db, c.owner, `select settle_month($1,$2)`, [c.org, M]);
  assert.equal((await state(c)).blockers.blocked, false);
  assert.match(await expectError(asUser(c.db, c.mgr, `select lock_payroll($1)`, [pid])), /FORBIDDEN/);
  await lock(c, pid);
  assert.equal((await state(c)).status, 'locked');
  assert.equal(Number((await c.db.query(`select total_approved t from worker_pay_statements`)).rows[0].t), 90000);
});

test('thưởng, phạt, tạm ứng: thêm, sửa, xóa đều tự tính lại; kỳ đã khóa thì chặn; người không có quyền bị từ chối', async () => {
  const c = await setup();
  await rate(c, 'hour', 30000);
  await att(c, 1, '2026-09-03', 120);
  const total = async () => Number((await c.db.query(`select total_estimated t from worker_pay_statements where worker_id=$1`, [c.wa])).rows[0].t);
  const add = (kind, amt, why = 'Lý do') => asUser(c.db, c.owner, `select add_pay_adjustment($1,$2,$3,$4::pay_adjustment_kind,$5,$6) r`, [c.org, c.wa, M, kind, amt, why]);
  const r1 = (await add('bonus', 100000)).rows[0].r;
  assert.equal(Number(r1.total), 160000);
  await add('advance', 50000);
  assert.equal(await total(), 110000);
  const adjId = (await c.db.query(`select id from pay_adjustments where kind='advance'`)).rows[0].id;
  await asUser(c.db, c.owner, `select update_pay_adjustment($1,null,20000,'Tạm ứng nhỏ hơn')`, [adjId]);
  assert.equal(await total(), 140000);
  await asUser(c.db, c.owner, `select delete_pay_adjustment($1)`, [adjId]);
  assert.equal(await total(), 160000);
  assert.match(await expectError(add('bonus', 0)), /INVALID_AMOUNT/);
  assert.match(await expectError(add('bonus', 1000, 'x')), /REASON_REQUIRED/);
  assert.match(await expectError(asUser(c.db, c.mgr, `select add_pay_adjustment($1,$2,$3,'bonus',1000,'Thử')`, [c.org, c.wa, M])), /FORBIDDEN/);
  const pid = (await c.db.query(`select id from payroll_periods`)).rows[0].id;
  await lock(c, pid);
  assert.match(await expectError(add('bonus', 1000)), /PERIOD_LOCKED/);
  assert.match(await expectError(asUser(c.db, c.owner, `select delete_pay_adjustment($1)`, [(await c.db.query(`select id from pay_adjustments limit 1`)).rows[0].id])), /PERIOD_LOCKED/);
});
