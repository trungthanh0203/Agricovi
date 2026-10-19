import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, asAnon, expectError } from './harness.mjs';

test('create_organization: người tạo là owner, có gói dùng thử, thấy được tổ chức; anon bị chặn', async () => {
  const db = await createDb();
  const u = await addUser(db, 1);
  const other = await addUser(db, 2);

  const id = (await asUser(db, u, `select create_organization('household', '  Vườn Dưa Xanh ') as id`)).rows[0].id;
  const mine = (await asUser(db, u, `select o.name, m.roles::text[] as roles from organization_memberships m join organizations o on o.id = m.organization_id`)).rows;
  assert.deepEqual(mine, [{ name: 'Vườn Dưa Xanh', roles: ['owner'] }]);

  const usage = (await asUser(db, u, `select * from org_plan_usage($1)`, [id])).rows[0];
  assert.equal(usage.status, 'trial');
  assert.equal(usage.max_cycles, 2);
  assert.equal(usage.used_cycles, 0);
  assert.equal(usage.is_current, true);

  assert.match(await expectError(asUser(db, other, `select * from org_plan_usage($1)`, [id])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, u, `select create_organization('household', 'A')`)), /INVALID_NAME/);
  assert.match(await expectError(asAnon(db, `select create_organization('household', 'Hộ X')`)), /permission denied/);
});

test('một người có thể thuộc nhiều tổ chức (nhưng chỉ tự tạo một cơ sở)', async () => {
  const db = await createDb();
  const boss = await addUser(db, 1);
  const u = await addUser(db, 2);
  const coop = (await asUser(db, boss, `select create_organization('cooperative', 'HTX Dưa lưới') id`)).rows[0].id;
  await asUser(db, u, `select create_organization('household', 'Hộ của tôi')`);
  const inv = (await asUser(db, boss, `select invite_member($1,'u2@test.local',array['worker']::member_role[]) id`, [coop])).rows[0].id;
  await asUser(db, u, `select accept_invitation($1)`, [inv]);
  const rows = (await asUser(db, u, `select o.type from organization_memberships m join organizations o on o.id = m.organization_id where m.user_id = auth.uid() order by o.type`)).rows;
  assert.deepEqual(rows.map((r) => r.type), ['household', 'cooperative']);
});
