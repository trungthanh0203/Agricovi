import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser } from './harness.mjs';

// Migration 0224 (D190): số ngày phép năm của cơ sở và tổng hợp ngày nghỉ theo người/tháng/loại.

const A = (n) => `72000000-0000-4000-8000-0000000000b${n}`;

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), mgr = await addUser(db, 2);
  const org = (await asUser(db, owner, `select create_organization('household','Trại A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[])`, [org, mgr]);
  const w1 = (await db.query(`insert into worker_profiles (organization_id,full_name) values ($1,'Lan') returning id`, [org])).rows[0].id;
  const w2 = (await db.query(`insert into worker_profiles (organization_id,full_name) values ($1,'Mai') returning id`, [org])).rows[0].id;
  return { db, owner, mgr, org, w1, w2 };
}
const mk = (db, u, id, w, from, to, kind, half = false) => asUser(db, u,
  `select * from create_worker_absence($1,$2,$3::date,$4::date,$5,$6,'before','zalo',null,null,true,null,null)`, [id, w, from, to, half, kind]);
const sum = async (db, u, org, year, w = null) => (await asUser(db, u, `select absence_year_summary($1,$2,$3) s`, [org, year, w])).rows[0].s;

test('phép năm mặc định 12, chỉ chủ đổi, giới hạn 0–60', async () => {
  const { db, owner, mgr, org } = await setup();
  assert.equal((await sum(db, owner, org, 2026)).allowance, 12);
  assert.equal((await asUser(db, owner, `select set_annual_leave_days($1,15) d`, [org])).rows[0].d, 15);
  assert.equal((await sum(db, mgr, org, 2026)).allowance, 15);
  await assert.rejects(asUser(db, mgr, `select set_annual_leave_days($1,10)`, [org]), /FORBIDDEN/);
  await assert.rejects(asUser(db, owner, `select set_annual_leave_days($1,61)`, [org]), /INVALID_ARGUMENT/);
});

test('tổng hợp theo tháng và loại; nửa ngày = 0,5; ghi nghỉ vắt qua năm chỉ tính phần trong năm; đã hủy không tính', async () => {
  const { db, owner, org, w1, w2 } = await setup();
  await mk(db, owner, A(1), w1, '2026-11-28', '2026-12-02', 'annual');        // 3 ngày tháng 11, 2 ngày tháng 12
  await mk(db, owner, A(2), w1, '2026-12-10', '2026-12-10', 'sick', true);    // nửa ngày
  await mk(db, owner, A(3), w1, '2026-12-31', '2027-01-02', 'unpaid');        // năm 2026 chỉ 1 ngày
  await mk(db, owner, A(4), w2, '2026-11-05', '2026-11-06', 'sick');
  await mk(db, owner, A(5), w2, '2026-11-20', '2026-11-21', 'annual');
  await asUser(db, owner, `select * from cancel_worker_absence($1,1)`, [A(5)]);
  const s = await sum(db, owner, org, 2026);
  const d = (w, m, k) => Number(s.rows.find((r) => r.worker_id === w && r.month === m && r.kind === k)?.days ?? 0);
  assert.equal(d(w1, 11, 'annual'), 3);
  assert.equal(d(w1, 12, 'annual'), 2);
  assert.equal(d(w1, 12, 'sick'), 0.5);
  assert.equal(d(w1, 12, 'unpaid'), 1);
  assert.equal(d(w2, 11, 'sick'), 2);
  assert.equal(d(w2, 11, 'annual'), 0);                                       // đã hủy
  assert.equal(Number((await sum(db, owner, org, 2027)).rows.find((r) => r.worker_id === w1 && r.kind === 'unpaid').days), 2);
  assert.ok((await sum(db, owner, org, 2026, w2)).rows.every((r) => r.worker_id === w2));   // lọc theo người
});
