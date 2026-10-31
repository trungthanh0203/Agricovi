import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0144: HTX xóa hộ do HTX tạo khỏi danh sách khi hộ chưa có dữ liệu sản xuất.

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const mgr = await addUser(db, 2);
  const other = await addUser(db, 3);
  const coop = (await asUser(db, owner, `select create_organization('cooperative','HTX A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[])`, [coop, mgr]);
  const hh = async (name) => (await asUser(db, owner, `select create_member_household($1,$2) id`, [coop, name])).rows[0].id;
  const count = async () => (await asUser(db, owner, `select count(*)::int c from list_coop_households($1)`, [coop])).rows[0].c;
  return { db, owner, mgr, other, coop, hh, count };
}

test('xóa hộ do HTX tạo khi chưa có dữ liệu: biến khỏi danh sách và khỏi hệ thống', async () => {
  const { db, owner, coop, hh, count } = await setup();
  const a = await hh('Hộ ông A'); await hh('Hộ bà B');
  assert.equal(await count(), 2);
  await asUser(db, owner, `select delete_managed_household($1,$2)`, [coop, a]);
  assert.equal(await count(), 1);
  assert.equal((await db.query(`select count(*)::int c from organizations where id=$1`, [a])).rows[0].c, 0);
});

test('hộ đã có phân khu hoặc vụ thì không xóa (báo rõ, không mất dữ liệu); hộ tự tham gia thì dùng Gỡ khỏi HTX', async () => {
  const { db, owner, coop, hh, count } = await setup();
  const a = await hh('Hộ ông A');
  await db.query(`insert into production_areas (id, organization_id, name) values (gen_random_uuid(), $1, 'Vườn 1')`, [a]);
  assert.match(await expectError(asUser(db, owner, `select delete_managed_household($1,$2)`, [coop, a])), /HAS_DATA/);
  assert.equal(await count(), 1);
  const self = (await db.query(`insert into organizations (type, name, created_by) values ('household','Hộ tự tham gia',$1) returning id`, [owner])).rows[0].id;
  await db.query(`insert into cooperative_memberships (household_org_id, cooperative_org_id, status, joined_at) values ($1,$2,'active',now())`, [self, coop]);
  assert.match(await expectError(asUser(db, owner, `select delete_managed_household($1,$2)`, [coop, self])), /NOT_MANAGED/);
});

test('chỉ chủ HTX được xóa; người ngoài và quản lý không xóa được', async () => {
  const { db, mgr, other, coop, hh } = await setup();
  const a = await hh('Hộ ông A');
  assert.match(await expectError(asUser(db, mgr, `select delete_managed_household($1,$2)`, [coop, a])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, other, `select delete_managed_household($1,$2)`, [coop, a])), /FORBIDDEN/);
});
