import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0067–0068 (D86): trả công theo từng người (theo giờ hoặc lương cố định theo tháng); thưởng/phạt/tạm ứng; phiếu lương.

const id = (k, n) => `${k}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), a = await addUser(db, 2), b = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[]),($1,$3,array['worker']::member_role[])`, [org, a, b]);
  const wa = (await db.query(`insert into worker_profiles (organization_id,user_id,full_name) values ($1,$2,'An') returning id`, [org, a])).rows[0].id;
  const wb = (await db.query(`insert into worker_profiles (organization_id,user_id,full_name) values ($1,$2,'Bình') returning id`, [org, b])).rows[0].id;
  return { db, owner, a, b, org, wa, wb };
}
const att = (db, org, w, n, day, minutes) => db.query(`insert into attendance_records (id,organization_id,worker_id,work_date,started_at,ended_at,source,status,approved_minutes)
   values ($1,$2,$3,$4::date,($4::date + time '07:00')::timestamptz,($4::date + time '07:00')::timestamptz + make_interval(mins => $5),'admin','confirmed',$5)`, [id('a', n), org, w, day, minutes]);
const rate = (c, who, type, amount, from = '2026-01-01') => asUser(c.db, c.owner, `insert into work_rates (organization_id,rate_type,worker_id,amount,valid_from) values ($1,$2::rate_type,$3,$4,$5)`, [c.org, type, who, amount, from]);
const period = async (c, n, s, e) => (await c.db.query(`insert into payroll_periods (id,organization_id,start_date,end_date) values ($1,$2,$3,$4) returning id`, [id('b', n), c.org, s, e])).rows[0].id;
const comp = async (c, p) => (await asUser(c.db, c.owner, `select compute_payroll($1) r`, [p])).rows[0].r;
const total = async (c, w, p) => Number((await c.db.query(`select total_estimated t from worker_pay_statements where worker_id=$1 and period_id=$2`, [w, p])).rows[0]?.t ?? 0);

test('giá công chỉ đặt theo từng người: bỏ giá chung theo tổ/cơ sở và theo sản lượng', async () => {
  const c = await setup();
  await rate(c, c.wa, 'hour', 30000);
  await rate(c, c.wa, 'month', 6000000);
  const bad = (sql, p) => expectError(asUser(c.db, c.owner, sql, p));
  assert.match(await bad(`insert into work_rates (organization_id,rate_type,amount,valid_from) values ($1,'hour',30000,'2026-01-01')`, [c.org]), /work_rates_person_only|check/);
  assert.match(await bad(`insert into work_rates (organization_id,rate_type,worker_id,unit,amount,valid_from) values ($1,'quantity',$2,'kg',2000,'2026-01-01')`, [c.org, c.wa]), /invalid input value|work_rates_person_only|check/);
  assert.match(await expectError(asUser(c.db, c.a, `insert into work_rates (organization_id,rate_type,worker_id,amount,valid_from) values ($1,'hour',$2,1,'2026-01-01')`, [c.org, c.wa])), /row-level security/);
});

test('theo giờ: công đã xác nhận × giá giờ riêng; đổi giá theo ngày hiệu lực; thiếu giá thì báo', async () => {
  const c = await setup();
  await att(c.db, c.org, c.wa, 1, '2026-10-05', 120); // 2 giờ
  await att(c.db, c.org, c.wa, 2, '2026-10-20', 60);  // 1 giờ, sau ngày đổi giá
  await att(c.db, c.org, c.wb, 3, '2026-10-06', 60);  // Bình chưa có giá
  await rate(c, c.wa, 'hour', 30000, '2026-01-01');
  await rate(c, c.wa, 'hour', 40000, '2026-10-15');
  const p = await period(c, 1, '2026-10-01', '2026-10-31');
  const r = await comp(c, p);
  assert.equal(r.missing_rate_hours, 1);
  assert.equal(await total(c, c.wa, p), 2 * 30000 + 1 * 40000);
  assert.equal(await total(c, c.wb, p), 0);
});

test('lương cố định theo tháng: trả một lần mỗi tháng, kỳ khác cùng tháng không trả lại; người có lương tháng không bị báo thiếu giá giờ', async () => {
  const c = await setup();
  await rate(c, c.wa, 'month', 6000000);
  await att(c.db, c.org, c.wa, 1, '2026-10-05', 120);
  const p1 = await period(c, 1, '2026-10-01', '2026-10-15');
  const r1 = await comp(c, p1);
  assert.deepEqual([r1.salary_lines, r1.missing_rate_hours], [1, 0]);
  assert.equal(await total(c, c.wa, p1), 6000000);
  const line = (await c.db.query(`select line_type::text t, amount::float a, explanation from pay_statement_lines`)).rows[0];
  assert.deepEqual([line.t, line.a], ['salary', 6000000]);
  assert.match(line.explanation, /tháng 10\/2026/);
  // kỳ thứ hai cùng tháng: không trả lương tháng lần nữa
  const p2 = await period(c, 2, '2026-10-16', '2026-10-31');
  assert.equal((await comp(c, p2)).salary_lines, 0);
  // tính lại kỳ đầu vẫn ra lương tháng (không tự trùng với chính nó)
  assert.equal((await comp(c, p1)).salary_lines, 1);
  // tháng sau trả tiếp
  const p3 = await period(c, 3, '2026-11-01', '2026-11-30');
  assert.equal((await comp(c, p3)).salary_lines, 1);
});

test('giờ + lương tháng + thưởng − phạt − tạm ứng = thực nhận; khóa kỳ chốt số; nhân viên xem phiếu của mình', async () => {
  const c = await setup();
  await rate(c, c.wa, 'month', 5000000);
  await rate(c, c.wa, 'hour', 30000);
  await att(c.db, c.org, c.wa, 1, '2026-10-05', 120);
  const p = await period(c, 1, '2026-10-01', '2026-10-31');
  const adj = (kind, amt, why) => asUser(c.db, c.owner, `insert into pay_adjustments (organization_id,worker_id,period_id,kind,amount,reason) values ($1,$2,$3,$4::pay_adjustment_kind,$5,$6)`, [c.org, c.wa, p, kind, amt, why]);
  await adj('bonus', 300000, 'Thưởng chuyên cần');
  await adj('deduction', 100000, 'Nghỉ không phép 1 ngày');
  await adj('advance', 500000, 'Tạm ứng giữa tháng');
  assert.match(await expectError(adj('bonus', 1000, '')), /check|reason/i); // lý do bắt buộc
  await comp(c, p);
  assert.equal(await total(c, c.wa, p), 5000000 + 60000 + 300000 - 100000 - 500000);
  await asUser(c.db, c.owner, `select lock_payroll($1)`, [p]);
  assert.equal(Number((await c.db.query(`select total_approved t from worker_pay_statements where worker_id=$1`, [c.wa])).rows[0].t), 4760000);
  assert.match(await expectError(adj('bonus', 1000, 'Sau khóa')), /PERIOD_LOCKED/);
  // phiếu lương: người đó thấy dòng và các khoản của mình; người khác không thấy
  assert.equal((await asUser(c.db, c.a, `select count(*)::int n from pay_statement_lines`)).rows[0].n, 2);
  assert.equal((await asUser(c.db, c.a, `select count(*)::int n from pay_adjustments`)).rows[0].n, 3);
  assert.equal((await asUser(c.db, c.b, `select count(*)::int n from pay_statement_lines`)).rows[0].n, 0);
  assert.equal((await asUser(c.db, c.b, `select count(*)::int n from pay_adjustments`)).rows[0].n, 0);
});

test('quyền: quản lý chưa được cấp Tiền công không tính được lương', async () => {
  const c = await setup();
  const m = await addUser(c.db, 9);
  await c.db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[])`, [c.org, m]);
  const p = await period(c, 1, '2026-10-01', '2026-10-31');
  assert.match(await expectError(asUser(c.db, m, `select compute_payroll($1)`, [p])), /FORBIDDEN/);
});
