import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0079 (D96): dữ liệu mẫu dưa lưới. Chỉ chủ, một lần; vụ mẫu đang trong cách ly, có sự cố mở và việc quá hạn.

test('nạp dữ liệu mẫu: chỉ chủ, một lần; vụ mẫu có cách ly, sự cố và thống kê', async () => {
  const db = await createDb();
  const owner = await addUser(db, 1), wk = await addUser(db, 2);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, wk]);
  assert.match(await expectError(asUser(db, wk, `select seed_demo_data($1)`, [org])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, owner, `select seed_demo_data($1,'heo')`, [org])), /INVALID_KIND/);
  const cyc = (await asUser(db, owner, `select seed_demo_data($1) id`, [org])).rows[0].id;
  assert.match(await expectError(asUser(db, owner, `select seed_demo_data($1)`, [org])), /ALREADY_SEEDED/);

  const n = async (q) => (await db.query(q, [cyc])).rows[0].n;
  assert.equal(await n(`select count(*)::int n from activity_logs where cycle_id=$1`), 7);
  assert.equal(await n(`select count(*)::int n from production_stages where cycle_id=$1`), 5);
  assert.equal(await n(`select count(*)::int n from inventory_transactions where cycle_id=$1 and txn_type='issue'`), 3);
  const w = (await db.query(`select safe_date::text s, (safe_date - (now() at time zone 'Asia/Ho_Chi_Minh')::date) d, jsonb_array_length(items) n from cycle_withdrawal where cycle_id=$1`, [cyc])).rows[0];
  assert.equal(w.d, 4);       // phun Radiant cách đây 3 ngày, cách ly 7 ngày
  assert.equal(w.n, 2);
  const s = (await asUser(db, owner, `select get_cycles_stats($1) r`, [org])).rows[0].r.cycles[0];
  assert.equal(s.open_incidents, 1);
  assert.equal(s.overdue_actions, 1);
  assert.equal(s.area_m2, 500);
  // thu hoạch hôm nay đang trong cách ly: phải ghi lý do
  assert.match(await expectError(asUser(db, owner, `insert into harvest_records (id,organization_id,cycle_id,harvested_at,quantity) values (gen_random_uuid(),$1,$2,now(),50)`, [org, cyc])), /WITHDRAWAL_REASON/);
});
