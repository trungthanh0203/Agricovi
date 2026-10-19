import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser } from './harness.mjs';

test('mỗi người chỉ đọc dòng thành viên của mình; chủ/quản lý đọc cả cơ sở', async () => {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const mgr = await addUser(db, 2);
  const w1 = await addUser(db, 3);
  const w2 = await addUser(db, 4);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[]),($1,$3,array['worker']::member_role[]),($1,$4,array['worker']::member_role[])`, [org, mgr, w1, w2]);

  const q = `select user_id, roles::text[] as roles from organization_memberships where organization_id = $1`;
  // nhân viên chỉ thấy đúng 1 dòng, là dòng của chính mình với đúng vai trò
  const asWorker = (await asUser(db, w1, q, [org])).rows;
  assert.deepEqual(asWorker, [{ user_id: w1, roles: ['worker'] }]);
  // không thấy được chủ
  assert.equal((await asUser(db, w1, `select count(*)::int n from organization_memberships where 'owner' = any(roles)`)).rows[0].n, 0);
  // quản lý và chủ thấy cả 4 dòng
  assert.equal((await asUser(db, mgr, q, [org])).rows.length, 4);
  assert.equal((await asUser(db, owner, q, [org])).rows.length, 4);
  // truy vấn "cơ sở của tôi" như app: lọc theo chính mình, mỗi cơ sở đúng một dòng
  const mine = (await asUser(db, owner, `select m.roles::text[] as roles, o.id from organization_memberships m join organizations o on o.id = m.organization_id where m.status='active' and m.user_id = auth.uid()`)).rows;
  assert.equal(mine.length, 1);
  assert.deepEqual(mine[0].roles, ['owner']);
});
