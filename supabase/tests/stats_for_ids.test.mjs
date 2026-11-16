import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0210 (D173): số liệu tóm tắt chỉ cho các vụ được hỏi; kết quả khớp với bản tính cả cơ sở.

const id = (n) => `85000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), other = await addUser(db, 2);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  const org2 = (await asUser(db, other, `select create_organization('household','Hộ B') id`)).rows[0].id;
  const area = (await db.query(`insert into production_areas (id,organization_id,name) values (gen_random_uuid(),$1,'Khu') returning id`, [org])).rows[0].id;
  const area2 = (await db.query(`insert into production_areas (id,organization_id,name) values (gen_random_uuid(),$1,'Khu B') returning id`, [org2])).rows[0].id;
  const mk = async (n, o, a, status) => {
    await db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status,start_date) values ($1,$2,$3,(select id from crop_types limit 1),$4,current_date - 10)`, [id(n), o, a, status]);
    await db.query(`insert into expense_records (id,organization_id,cycle_id,category,kind,amount,expense_date) values ($1,$2,$3,'other','cash_paid',$4,current_date - 5)`, [id(100 + n), o, id(n), n * 1000000]);
  };
  await mk(1, org, area, 'active'); await mk(2, org, area, 'active'); await mk(3, org, area, 'ended'); await mk(9, org2, area2, 'active');
  return { db, owner, other, org, org2 };
}
const forIds = async (db, u, org, ids) => (await asUser(db, u, `select get_cycles_stats_for($1, $2::uuid[]) j`, [org, ids])).rows[0].j;

test('chỉ trả các vụ được hỏi, số liệu khớp bản tính cả cơ sở', async () => {
  const { db, owner, org } = await setup();
  const all = (await asUser(db, owner, `select get_cycles_stats($1) j`, [org])).rows[0].j.cycles;
  assert.equal(all.length, 3);
  const part = await forIds(db, owner, org, [id(1), id(3)]);
  assert.deepEqual(part.cycles.map((c) => c.cycle_id).sort(), [id(1), id(3)].sort());
  for (const c of part.cycles) assert.deepEqual(c, all.find((x) => x.cycle_id === c.cycle_id));
  assert.equal(part.can_money, true);
});

test('danh sách rỗng/null không trả vụ nào; vụ của cơ sở khác không lọt vào; quá 200 vụ bị từ chối; người ngoài bị chặn', async () => {
  const { db, owner, other, org } = await setup();
  assert.equal((await forIds(db, owner, org, [])).cycles.length, 0);
  assert.equal((await asUser(db, owner, `select get_cycles_stats_for($1, null) j`, [org])).rows[0].j.cycles.length, 0);
  assert.equal((await forIds(db, owner, org, [id(9), id(2)])).cycles.length, 1);   // vụ 9 của cơ sở khác bị bỏ
  const many = Array.from({ length: 201 }, (_, i) => id(1000 + i));
  assert.match(await expectError(asUser(db, owner, `select get_cycles_stats_for($1, $2::uuid[])`, [org, many])), /TOO_MANY/);
  assert.match(await expectError(asUser(db, other, `select get_cycles_stats_for($1, $2::uuid[])`, [org, [id(1)]])), /FORBIDDEN/);
});
