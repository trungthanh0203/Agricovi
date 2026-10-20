import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0029 (D40): tên hiển thị tự đặt.
test('đặt tên hiển thị: chỉ của mình, đúng độ dài; người khác không đọc; tên mới dùng cho nhật ký mới', async () => {
  const db = await createDb();
  const a = await addUser(db, 1);
  const b = await addUser(db, 2);
  const org = (await asUser(db, a, `select create_organization('household','Hộ A') id`)).rows[0].id;
  assert.equal((await asUser(db, a, `select set_display_name('  Anh Hai  ') n`)).rows[0].n, 'Anh Hai');
  await asUser(db, a, `select set_display_name('Anh Hai Nông')`);
  assert.match(await expectError(asUser(db, a, `select set_display_name('A')`)), /INVALID_NAME/);
  assert.equal((await asUser(db, a, `select display_name from user_profiles`)).rows[0].display_name, 'Anh Hai Nông');
  assert.equal((await asUser(db, b, `select count(*)::int n from user_profiles`)).rows[0].n, 0);
  assert.match(await expectError(asUser(db, b, `insert into user_profiles (user_id, display_name) values ($1,'Giả mạo')`, [a])), /row-level security|permission/);

  const area = (await asUser(db, a, `insert into production_areas (id,organization_id,name) values (gen_random_uuid(),$1,'T') returning id`, [org])).rows[0].id;
  await db.exec(`select set_config('agri.legacy_cycle_insert','on',false)`);
  const cyc = '30000000-0000-4000-8000-0000000000c1';
  await asUser(db, a, `insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status,created_by) values ($1,$2,$3,(select id from crop_types limit 1),'active',$4)`, [cyc, org, area, a]);
  await asUser(db, a, `insert into activity_logs (id,organization_id,cycle_id,work_type_id,performed_at,created_by,source) values ('40000000-0000-4000-8000-0000000000c1',$1,$2,(select id from work_types limit 1),now(),$3,'online')`, [org, cyc, a]);
  assert.equal((await db.query(`select author_name from activity_logs`)).rows[0].author_name, 'Anh Hai Nông');
});
