import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migrations 0034–0035 (D46): tạm dừng / dùng lại thành viên.
test('tạm dừng: mất quyền ngay, vẫn nằm trong danh sách nhân sự, dùng lại thì khôi phục; chỉ chủ làm được', async () => {
  const db = await createDb();
  const owner = await addUser(db, 1), mgr = await addUser(db, 2), wk = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[]),($1,$3,array['worker']::member_role[])`, [org, mgr, wk]);
  const area = (await asUser(db, owner, `insert into production_areas (id,organization_id,name) values (gen_random_uuid(),$1,'T') returning id`, [org])).rows[0].id;

  const canSee = async () => (await asUser(db, wk, `select count(*)::int n from production_areas`)).rows[0].n;
  assert.equal(await canSee(), 1);
  assert.match(await expectError(asUser(db, mgr, `select set_member_suspended($1,$2,true)`, [org, wk])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, owner, `select set_member_suspended($1,$2,true)`, [org, owner])), /INVALID_ROLE/);
  await asUser(db, owner, `select set_member_suspended($1,$2,true)`, [org, wk]);
  assert.equal(await canSee(), 0);
  assert.equal((await asUser(db, wk, `select count(*)::int n from organization_memberships where status='active'`)).rows[0].n, 0);
  const list = (await asUser(db, owner, `select user_id, status::text s from list_org_members($1)`, [org])).rows;
  assert.equal(list.find((r) => r.user_id === wk).s, 'suspended');
  await asUser(db, owner, `select set_member_suspended($1,$2,false)`, [org, wk]);
  assert.equal(await canSee(), 1);
  void area;
});
