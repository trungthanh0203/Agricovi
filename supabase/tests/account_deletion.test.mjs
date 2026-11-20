import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser } from './harness.mjs';

// Migration 0234 (D220): xóa tài khoản trong app: yêu cầu, thời gian chờ, hủy, quản trị thực hiện.

async function setup() {
  const db = await createDb();
  const admin = await addUser(db, 1), owner = await addUser(db, 2), other = await addUser(db, 3);
  await db.query(`insert into platform_admins (user_id) values ($1)`, [admin]);
  const org = (await asUser(db, owner, `select create_organization('household','Trại A') id`)).rows[0].id;
  const org2 = (await asUser(db, other, `select create_organization('household','Trại B') id`)).rows[0].id;
  await db.query(`insert into production_areas (id,organization_id,name) values (gen_random_uuid(),$1,'Khu 1')`, [org]);
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[])`, [org2, owner]);
  return { db, admin, owner, other, org, org2 };
}

test('yêu cầu xóa: có hạn chờ, gọi lặp không nhân đôi, hủy được', async () => {
  const { db, owner } = await setup();
  const a = (await asUser(db, owner, `select request_account_deletion('không dùng nữa') r`)).rows[0].r;
  const b = (await asUser(db, owner, `select request_account_deletion() r`)).rows[0].r;
  assert.equal(a.scheduled_for, b.scheduled_for);
  assert.equal((await db.query(`select count(*)::int n from account_deletion_requests`)).rows[0].n, 1);
  assert.equal((await asUser(db, owner, `select my_account_deletion() r`)).rows[0].r.status, 'pending');
  await asUser(db, owner, `select cancel_account_deletion()`);
  assert.equal((await asUser(db, owner, `select my_account_deletion() r`)).rows[0].r, null);
});

test('quản trị thực hiện: chưa đến hạn phải có lý do; xóa cơ sở của chủ, giữ cơ sở người khác', async () => {
  const { db, admin, owner, other, org, org2 } = await setup();
  await asUser(db, owner, `select request_account_deletion()`);
  const id = (await db.query(`select id from account_deletion_requests`)).rows[0].id;
  await assert.rejects(asUser(db, owner, `select admin_execute_account_deletion($1)`, [id]), /FORBIDDEN/);
  await assert.rejects(asUser(db, admin, `select admin_execute_account_deletion($1)`, [id]), /NOT_DUE/);
  const res = (await asUser(db, admin, `select admin_execute_account_deletion($1,'Người dùng gọi điện đề nghị xóa ngay') r`, [id])).rows[0].r;
  assert.equal(res.orgs, 1);
  assert.equal((await db.query(`select count(*)::int n from organizations where id=$1`, [org])).rows[0].n, 0);
  assert.equal((await db.query(`select count(*)::int n from production_areas where organization_id=$1`, [org])).rows[0].n, 0);
  assert.equal((await db.query(`select count(*)::int n from auth.users where id=$1`, [owner])).rows[0].n, 0);
  assert.equal((await db.query(`select count(*)::int n from organizations where id=$1`, [org2])).rows[0].n, 1);       // cơ sở người khác còn
  assert.equal((await db.query(`select count(*)::int n from organization_memberships where organization_id=$1 and user_id=$2`, [org2, owner])).rows[0].n, 0); // chỉ gỡ liên kết
  assert.equal((await db.query(`select status from account_deletion_requests where id=$1`, [id])).rows[0].status, 'done');
  assert.equal((await db.query(`select count(*)::int n from auth.users where id=$1`, [other])).rows[0].n, 1);
  await assert.rejects(asUser(db, admin, `select admin_execute_account_deletion($1)`, [id]), /ALREADY_DECIDED/);
});

test('đến hạn thì không cần lý do; quản trị viên không tự xóa theo cách này', async () => {
  const { db, admin, other } = await setup();
  await assert.rejects(asUser(db, admin, `select request_account_deletion()`), /FORBIDDEN/);
  await asUser(db, other, `select request_account_deletion()`);
  await db.query(`update account_deletion_requests set scheduled_for = now() - interval '1 hour'`);
  const list = (await asUser(db, admin, `select admin_list_deletion_requests() r`)).rows[0].r;
  assert.equal(list[0].due, true);
  await asUser(db, admin, `select admin_execute_account_deletion($1)`, [list[0].id]);
  assert.equal((await db.query(`select count(*)::int n from auth.users where id=$1`, [other])).rows[0].n, 0);
});
