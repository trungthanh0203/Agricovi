import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0069 (D87): Bảng lương xem theo người — số ước tính khớp "Tính tiền công"; quyền xem; xem tất cả / theo tổ.

const id = (k, n) => `${k}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const FROM = '2026-09-01', TO = '2026-09-30';

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), a = await addUser(db, 2), b = await addUser(db, 3), mgr = await addUser(db, 4);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[]),($1,$3,array['worker']::member_role[]),($1,$4,array['manager']::member_role[])`, [org, a, b, mgr]);
  const wa = (await db.query(`insert into worker_profiles (organization_id,user_id,full_name) values ($1,$2,'An') returning id`, [org, a])).rows[0].id;
  const wb = (await db.query(`insert into worker_profiles (organization_id,user_id,full_name) values ($1,$2,'Bình') returning id`, [org, b])).rows[0].id;
  const team = (await db.query(`insert into worker_teams (organization_id,name) values ($1,'Tổ 1') returning id`, [org])).rows[0].id;
  await db.query(`insert into worker_team_memberships (team_id,worker_id,valid_from) values ($1,$2,'2020-01-01')`, [team, wa]);
  return { db, owner, a, b, mgr, org, wa, wb, team };
}
const att = (c, w, n, day, minutes, status = 'confirmed') => c.db.query(`insert into attendance_records (id,organization_id,worker_id,work_date,started_at,ended_at,source,status,approved_minutes)
   values ($1,$2,$3,$4::date,($4::date + time '07:00')::timestamptz,($4::date + time '07:00')::timestamptz + make_interval(mins => $5),'admin',$6::attendance_status,$7)`,
  [id('a', n), c.org, w, day, minutes, status, status === 'confirmed' ? minutes : null]);
const rate = (c, w, type, amount) => asUser(c.db, c.owner, `insert into work_rates (organization_id,rate_type,worker_id,amount,valid_from) values ($1,$2::rate_type,$3,$4,'2026-01-01')`, [c.org, type, w, amount]);
const overview = async (c, u, w = null) => (await asUser(c.db, u, `select get_pay_overview($1,$2,$3,$4) r`, [c.org, FROM, TO, w])).rows[0].r;
const row = (o, w) => o.workers.find((x) => x.worker_id === w);

test('ước tính trước khi tính lương khớp với kết quả "Tính tiền công" và trạng thái đổi theo kỳ', async () => {
  const c = await setup();
  await rate(c, c.wa, 'hour', 30000); await rate(c, c.wa, 'month', 5000000);
  await att(c, c.wa, 1, '2026-09-05', 120); await att(c, c.wa, 2, '2026-09-06', 90);
  const est = row(await overview(c, c.a), c.wa);
  assert.deepEqual([est.hours, est.days, Number(est.hourly), Number(est.salary), Number(est.net)], [3.5, 2, 105000, 5000000, 5105000]);
  assert.equal(Number(est.net_locked), 0);
  const d1 = (await asUser(c.db, c.a, `select get_pay_detail($1,$2,$3,$4) r`, [c.org, c.wa, FROM, TO])).rows[0].r;
  assert.ok(d1.items.filter((i) => i.kind === 'hours').every((i) => i.status === 'estimate'));
  // tạo kỳ, tính lương: tổng khớp ước tính
  const per = (await c.db.query(`insert into payroll_periods (id,organization_id,start_date,end_date) values ($1,$2,$3,$4) returning id`, [id('b', 1), c.org, FROM, TO])).rows[0].id;
  await asUser(c.db, c.owner, `select compute_payroll($1)`, [per]);
  const calc = row(await overview(c, c.a), c.wa);
  assert.equal(Number(calc.net), Number((await c.db.query(`select total_estimated t from worker_pay_statements where worker_id=$1`, [c.wa])).rows[0].t));
  assert.equal(Number(calc.net), Number(est.net));
  assert.equal(Number(calc.net_locked), 0);
  await asUser(c.db, c.owner, `select lock_payroll($1)`, [per]);
  const locked = row(await overview(c, c.a), c.wa);
  assert.equal(Number(locked.net_locked), Number(est.net));
  const d2 = (await asUser(c.db, c.a, `select get_pay_detail($1,$2,$3,$4) r`, [c.org, c.wa, FROM, TO])).rows[0].r;
  assert.ok(d2.items.every((i) => i.status === 'locked'));
});

test('thưởng, phạt, tạm ứng vào thực nhận; công chờ xác nhận/bị từ chối hiện nhưng không tính tiền; thiếu giá báo no_rate', async () => {
  const c = await setup();
  await rate(c, c.wa, 'hour', 30000);
  await att(c, c.wa, 1, '2026-09-05', 120);
  await att(c, c.wa, 2, '2026-09-07', 60, 'needs_confirmation');
  await att(c, c.wb, 3, '2026-09-08', 60); // Bình chưa có giá
  const per = (await c.db.query(`insert into payroll_periods (id,organization_id,start_date,end_date) values ($1,$2,$3,$4) returning id`, [id('b', 1), c.org, FROM, TO])).rows[0].id;
  const adj = (kind, amt) => c.db.query(`insert into pay_adjustments (organization_id,worker_id,period_id,kind,amount,reason) values ($1,$2,$3,$4::pay_adjustment_kind,$5,'Lý do')`, [c.org, c.wa, per, kind, amt]);
  await adj('bonus', 100000); await adj('deduction', 20000); await adj('advance', 50000);
  const r = row(await overview(c, c.a), c.wa);
  assert.deepEqual([Number(r.hourly), Number(r.bonus), Number(r.deduction), Number(r.advance), Number(r.net)], [60000, 100000, 20000, 50000, 90000]);
  assert.equal(r.pending_hours, 1);
  const rb = row(await overview(c, c.owner), c.wb);
  assert.equal(rb.no_rate_days, 1);
  assert.equal(Number(rb.net), 0);
});

test('quyền xem: người thường chỉ của mình; chủ xem tất cả kèm tổ; quản lý chưa có quyền Tiền công chỉ của mình; được cấp thì xem tất cả', async () => {
  const c = await setup();
  await att(c, c.wa, 1, '2026-09-05', 60); await att(c, c.wb, 2, '2026-09-05', 60);
  const mine = await overview(c, c.a);
  assert.deepEqual([mine.can_see_all, mine.workers.length], [false, 1]);
  assert.match(await expectError(asUser(c.db, c.a, `select get_pay_overview($1,$2,$3,$4)`, [c.org, FROM, TO, c.wb])), /FORBIDDEN/);
  assert.match(await expectError(asUser(c.db, c.a, `select get_pay_detail($1,$2,$3,$4)`, [c.org, c.wb, FROM, TO])), /FORBIDDEN/);
  const all = await overview(c, c.owner);
  assert.deepEqual([all.can_see_all, all.workers.length], [true, 2]);
  assert.equal(row(all, c.wa).team_name, 'Tổ 1');
  assert.equal(row(all, c.wb).team_name, null);
  // người quản lý không có hồ sơ chấm công và chưa có quyền: không có gì để xem
  assert.equal((await overview(c, c.mgr)).workers.length, 0);
  await asUser(c.db, c.owner, `select set_member_permissions($1,$2,$3::jsonb)`, [c.org, c.mgr, JSON.stringify({ payroll: 'view' })]);
  assert.equal((await overview(c, c.mgr)).workers.length, 2);
  // người ngoài cơ sở bị chặn
  const stranger = await addUser(c.db, 9);
  assert.match(await expectError(asUser(c.db, stranger, `select get_pay_overview($1,$2,$3,null)`, [c.org, FROM, TO])), /FORBIDDEN/);
  assert.match(await expectError(asUser(c.db, c.owner, `select get_pay_overview($1,$2,$3,null)`, [c.org, TO, FROM])), /INVALID_DATE/);
});

test('lương tháng chưa tới không ước tính; tháng đã qua có ước tính, không lặp', async () => {
  const c = await setup();
  await rate(c, c.wa, 'month', 4000000);
  const two = (await asUser(c.db, c.a, `select get_pay_overview($1,'2026-08-01','2026-09-30',null) r`, [c.org])).rows[0].r;
  assert.equal(Number(row(two, c.wa).salary), 8000000); // tháng 8 và tháng 9
  const future = (await asUser(c.db, c.a, `select get_pay_overview($1,'2027-01-01','2027-01-31',null) r`, [c.org])).rows[0].r;
  assert.equal(Number(row(future, c.wa).salary), 0);
});
