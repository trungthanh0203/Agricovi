import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

test('quota_contexts: hộ thấy ngữ cảnh riêng + HTX đang tham gia với mức dùng đúng; người ngoài bị chặn', async () => {
  const db = await createDb();
  const hh = await addUser(db, 1);
  const boss = await addUser(db, 2);
  const stranger = await addUser(db, 3);
  const HH = (await asUser(db, hh, `select create_organization('household','Hộ A') id`)).rows[0].id;
  const HTX = (await asUser(db, boss, `select create_organization('cooperative','HTX Dưa') id`)).rows[0].id;
  await db.query(`insert into cooperative_memberships (household_org_id,cooperative_org_id,status,joined_at) values ($1,$2,'active',now())`, [HH, HTX]);
  const area = '20000000-0000-4000-8000-00000000000a';
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'Nhà màng')`, [area, HH]);
  await asUser(db, hh, `insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status)
     values ('30000000-0000-4000-8000-000000000001',$1,$2,(select id from crop_types limit 1),'active')`, [HTX, area]);

  const rows = (await asUser(db, hh, `select * from quota_contexts($1)`, [HH])).rows;
  assert.deepEqual(rows.map((r) => r.kind), ['own', 'cooperative']);
  assert.equal(rows[0].used_cycles, 0);
  assert.equal(rows[0].max_cycles, 2);
  assert.equal(rows[1].org_name, 'HTX Dưa');
  assert.equal(rows[1].used_cycles, 1);
  assert.equal(rows[1].max_cycles, 5);
  assert.equal(rows[1].is_current, true);

  assert.match(await expectError(asUser(db, stranger, `select * from quota_contexts($1)`, [HH])), /FORBIDDEN/);
});
