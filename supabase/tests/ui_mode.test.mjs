import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0089 (D100): chế độ hiển thị đơn giản/đầy đủ của cơ sở; chỉ chủ đổi được; mọi thành viên đọc được.

test('mặc định đầy đủ; chủ đổi sang đơn giản và ngược lại; người khác và giá trị lạ bị từ chối; thành viên đọc được', async () => {
  const db = await createDb();
  const owner = await addUser(db, 1), mgr = await addUser(db, 2), other = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await asUser(db, other, `select create_organization('household','Hộ B') id`);
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[])`, [org, mgr]);
  const mode = async (u) => (await asUser(db, u, `select ui_mode from organizations where id=$1`, [org])).rows[0]?.ui_mode;
  assert.equal(await mode(owner), 'full');
  await asUser(db, owner, `select set_org_ui_mode($1,'simple')`, [org]);
  assert.equal(await mode(mgr), 'simple');           // thành viên khác cùng cơ sở thấy
  assert.equal(await mode(other), undefined);        // cơ sở khác không thấy
  assert.match(await expectError(asUser(db, mgr, `select set_org_ui_mode($1,'full')`, [org])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, other, `select set_org_ui_mode($1,'full')`, [org])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, owner, `select set_org_ui_mode($1,'sieu-don-gian')`, [org])), /INVALID_MODE/);
  await asUser(db, owner, `select set_org_ui_mode($1,'full')`, [org]);
  assert.equal(await mode(owner), 'full');
});
