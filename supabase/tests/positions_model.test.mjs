import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0066 (D84): chức vụ CÓ vai trò (Quản lý/Nhân viên); mỗi người giữ đúng một chức vụ; vai trò và quyền theo chức vụ.

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), a = await addUser(db, 2), b = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Cơ sở A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[]),($1,$3,array['worker']::member_role[])`, [org, a, b]);
  return { db, owner, a, b, org };
}
const pos = async (db, org, name) => (await db.query(`select id from org_positions where organization_id=$1 and name=$2`, [org, name])).rows[0]?.id;
const roles = async (db, u) => (await db.query(`select roles::text[] r, position_ids p from organization_memberships where user_id=$1`, [u])).rows[0];
const save = (db, u, org, over = {}) => asUser(db, u, `select save_position($1,$2,$3,'Mô tả',$4::jsonb,null,$5,true,$6) id`,
  [org, over.id ?? null, over.name ?? 'Tổ trưởng vườn', JSON.stringify(over.perms ?? {}), over.stages ?? false, over.role ?? 'worker']);

test('chức vụ mới mặc định vai trò Nhân viên; gán chức vụ thì người đó nhận vai trò và quyền của chức vụ', async () => {
  const c = await setup();
  const id = (await save(c.db, c.owner, c.org)).rows[0].id;
  assert.equal((await c.db.query(`select base_role::text b from org_positions where id=$1`, [id])).rows[0].b, 'worker');
  await asUser(c.db, c.owner, `select set_member_position($1,$2,$3)`, [c.org, c.a, id]);
  assert.deepEqual(await roles(c.db, c.a), { r: ['worker'], p: [id] });
  assert.equal((await asUser(c.db, c.a, `select has_perm($1,'expenses','view') v`, [c.org])).rows[0].v, false);
  // chức vụ vai trò Quản lý + chọn thêm quyền
  const mg = (await save(c.db, c.owner, c.org, { name: 'Quản đốc', role: 'manager', perms: { expenses: 'view' } })).rows[0].id;
  await asUser(c.db, c.owner, `select set_member_position($1,$2,$3)`, [c.org, c.a, mg]);
  assert.deepEqual((await roles(c.db, c.a)).r, ['manager']);
  assert.equal((await asUser(c.db, c.a, `select has_perm($1,'expenses','view') v`, [c.org])).rows[0].v, true);
  assert.equal((await asUser(c.db, c.a, `select has_perm($1,'sales','view') v`, [c.org])).rows[0].v, false);
});

test('đổi vai trò của chức vụ thì những người đang giữ đổi theo; mỗi người đúng một chức vụ; chỉ chủ', async () => {
  const c = await setup();
  const id = (await save(c.db, c.owner, c.org)).rows[0].id;
  await asUser(c.db, c.owner, `select set_member_position($1,$2,$3)`, [c.org, c.a, id]);
  await save(c.db, c.owner, c.org, { id, role: 'manager' });
  assert.deepEqual((await roles(c.db, c.a)).r, ['manager']);
  assert.match(await expectError(asUser(c.db, c.owner, `select set_member_positions($1,$2,array[$3,$4]::uuid[])`, [c.org, c.a, id, await pos(c.db, c.org, 'Nhân viên')])), /INVALID_POSITION/);
  assert.match(await expectError(asUser(c.db, c.a, `select set_member_position($1,$2,$3)`, [c.org, c.b, id])), /FORBIDDEN/);
  assert.match(await expectError(save(c.db, c.a, c.org, { name: 'Tự tạo' })), /FORBIDDEN/);
  assert.match(await expectError(save(c.db, c.owner, c.org, { name: 'Chủ', role: 'owner' })), /INVALID_ROLE/);
  assert.match(await expectError(save(c.db, c.owner, c.org, { name: 'quản lý' })), /NAME_TAKEN/);
  assert.match(await expectError(asUser(c.db, c.owner, `select set_member_position($1,$2,$3)`, [c.org, c.owner, id])), /INVALID_TARGET/);
});

test('xóa chức vụ đang có người giữ bị chặn; Quản lý/Nhân viên có sẵn cũng sửa-xóa được như chức vụ thường', async () => {
  const c = await setup();
  const staff = await pos(c.db, c.org, 'Nhân viên');
  await asUser(c.db, c.owner, `select set_member_position($1,$2,$3)`, [c.org, c.a, staff]);
  assert.match(await expectError(asUser(c.db, c.owner, `select delete_position($1)`, [staff])), /IN_USE/);
  await asUser(c.db, c.owner, `select set_member_position($1,$2,$3)`, [c.org, c.a, await pos(c.db, c.org, 'Thủ kho và kế toán')]);
  await asUser(c.db, c.owner, `select delete_position($1)`, [staff]);
  assert.equal(await pos(c.db, c.org, 'Nhân viên'), undefined);
  assert.equal((await asUser(c.db, c.owner, `select add_builtin_roles($1) n`, [c.org])).rows[0].n, 1); // thêm lại chức vụ có sẵn đã xóa
  assert.ok(await pos(c.db, c.org, 'Nhân viên'));
});

test('mời bằng email kèm chức vụ: chấp nhận thì vào đúng chức vụ và vai trò', async () => {
  const c = await setup();
  const mg = await pos(c.db, c.org, 'Quản lý');
  const inv = (await asUser(c.db, c.owner, `select invite_member_position($1,'u9@test.local',$2) id`, [c.org, mg])).rows[0].id;
  const nu = await addUser(c.db, 9); // u9@test.local
  await asUser(c.db, nu, `select accept_invitation($1)`, [inv]);
  assert.deepEqual(await roles(c.db, nu), { r: ['manager'], p: [mg] });
  assert.match(await expectError(asUser(c.db, c.a, `select invite_member_position($1,'x@y.vn',$2)`, [c.org, mg])), /FORBIDDEN/);
});

test('di chuyển dữ liệu cũ: ai cũng giữ một chức vụ khớp vai trò (kiểm tra qua cơ sở tạo sau migration)', async () => {
  const c = await setup();
  // người thêm trực tiếp bằng SQL (không qua chức vụ) vẫn có quyền theo vai trò mặc định
  assert.equal((await asUser(c.db, c.a, `select has_perm($1,'harvest','edit') v`, [c.org])).rows[0].v, true);
  assert.equal((await asUser(c.db, c.a, `select has_perm($1,'inventory','view') v`, [c.org])).rows[0].v, false);
});
