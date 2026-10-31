import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser } from './harness.mjs';

// Đợt 1A (D138): tập vụ được xem tính một lần phải ĐÚNG như can_read_cycle() từng vụ.
const id = (k, n) => `${k}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('readable_cycle_ids() khớp can_read_cycle() cho chủ, người làm bị giới hạn trang trại, người ngoài', async () => {
  const db = await createDb();
  const owner = await addUser(db, 1), wk = await addUser(db, 3), other = await addUser(db, 4);
  const org = (await asUser(db, owner, `select create_organization('household','Cơ sở A') id`)).rows[0].id;
  await asUser(db, other, `select create_organization('household','Cơ sở B') id`);
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, wk]);
  const A = id('2', 1), B = id('2', 2);
  for (const [a, n] of [[A, 'A'], [B, 'B']]) await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,$3)`, [a, org, n]);
  for (const [c, a] of [[id('3', 1), A], [id('3', 2), B]]) await db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status) values ($1,$2,$3,(select id from crop_types limit 1),'active')`, [c, org, a]);
  await asUser(db, owner, `select set_member_areas($1,$2,$3::uuid[])`, [org, wk, [A]]);
  for (const u of [owner, wk, other]) {
    const fast = (await asUser(db, u, `select id from readable_cycle_ids() id order by 1`)).rows.map((r) => r.id);
    const slow = (await asUser(db, u, `select id from (select id from production_cycles) x where can_read_cycle(id) order by 1`)).rows.map((r) => r.id);
    assert.deepEqual(fast, slow);
  }
  assert.equal((await asUser(db, wk, `select count(*)::int n from readable_cycle_ids()`)).rows[0].n, 1);
  assert.equal((await asUser(db, other, `select count(*)::int n from readable_cycle_ids()`)).rows[0].n, 0);
});
