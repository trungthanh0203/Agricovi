import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0037 (D49): danh mục vai trò = vai trò có sẵn + tự tạo; sửa/xóa được.

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), mgr = await addUser(db, 2), wk = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[]),($1,$3,array['worker']::member_role[])`, [org, mgr, wk]);
  return { db, owner, mgr, wk, org };
}
const roleRow = async (db, org, base) => (await db.query(`select * from org_positions where organization_id=$1 and is_builtin and base_role=$2`, [org, base])).rows[0];
const lvl = async (db, u, org, m) => (await asUser(db, u, `select perm_level($1,$2) l`, [org, m])).rows[0].l;
const save = (db, u, org, row, over = {}) => asUser(db, u, `select save_position($1,$2,$3,$4,$5::jsonb,$6::uuid[],$7,$8,$9) id`,
  [org, row.id ?? null, over.name ?? row.name, over.desc ?? row.description, JSON.stringify(over.perms ?? row.perms), over.wts ?? row.work_type_ids ?? null,
    over.stages ?? row.can_manage_stages ?? false, true, over.base ?? row.base_role ?? 'worker']);

test('mỗi cơ sở có sẵn 2 vai trò có sẵn (Quản lý, Nhân viên) với quyền tối thiểu (D83); cơ sở mới cũng được tạo', async () => {
  const { db, org, mgr, wk } = await setup();
  const rows = (await db.query(`select base_role::text b, name, perms from org_positions where organization_id=$1 and is_builtin order by base_role`, [org])).rows;
  assert.deepEqual(rows.map((r) => r.b).sort(), ['manager', 'worker']);
  assert.equal(rows.find((r) => r.b === 'manager').perms.inventory, 'view');
  assert.equal(rows.find((r) => r.b === 'manager').perms.expenses, 'none');
  assert.equal(await lvl(db, mgr, org, 'inventory'), 1);
  assert.equal(await lvl(db, wk, org, 'harvest'), 2);
  const coop = await addUser(db, 9);
  const co = (await asUser(db, coop, `select create_organization('cooperative','HTX') id`)).rows[0].id;
  assert.ok((await db.query(`select 1 from org_positions where organization_id=$1 and name='Quản lý hợp tác xã' and not is_builtin`, [co])).rows.length === 1);
});

test('sửa vai trò có sẵn: quyền đổi theo ngay cho người giữ; không đổi được tên; chỉ chủ', async () => {
  const { db, owner, mgr, wk, org } = await setup();
  const row = await roleRow(db, org, 'manager');
  assert.match(await expectError(save(db, mgr, org, row)), /FORBIDDEN/);
  await save(db, owner, org, row, { name: 'Tên khác', perms: { ...row.perms, inventory: 'edit', declare: 'none' }, stages: false });
  const after = await roleRow(db, org, 'manager');
  assert.equal(after.name, 'Quản lý'); // tên vai trò có sẵn giữ nguyên
  assert.equal(await lvl(db, mgr, org, 'inventory'), 2);
  assert.equal(await lvl(db, mgr, org, 'declare'), 0);
  assert.equal(await lvl(db, wk, org, 'inventory'), 0); // người khác không đổi
  // hạn chế loại việc cho vai trò Nhân viên: chỉ tưới nước
  const worker = await roleRow(db, org, 'worker');
  const irr = (await db.query(`select id from work_types where organization_id is null and code='irrigation'`)).rows[0].id;
  await save(db, owner, org, worker, { wts: [irr] });
  assert.equal((await asUser(db, wk, `select work_type_allowed($1,$2) a`, [org, irr])).rows[0].a, true);
  const other = (await db.query(`select id from work_types where organization_id is null and code='spraying'`)).rows[0].id;
  assert.equal((await asUser(db, wk, `select work_type_allowed($1,$2) a`, [org, other])).rows[0].a, false);
});

test('xóa vai trò có sẵn: chặn khi còn người giữ; xóa được khi không ai giữ; thêm lại được', async () => {
  const { db, owner, org, wk } = await setup();
  const worker = await roleRow(db, org, 'worker');
  assert.match(await expectError(asUser(db, owner, `select delete_position($1)`, [worker.id])), /IN_USE/);
  await db.query(`delete from organization_memberships where user_id=$1`, [wk]);
  await asUser(db, owner, `select delete_position($1)`, [worker.id]); // không còn ai giữ
  assert.equal(await roleRow(db, org, 'worker'), undefined);
  assert.equal((await asUser(db, owner, `select add_builtin_roles($1) n`, [org])).rows[0].n, 1);
  assert.ok(await roleRow(db, org, 'worker'));
  assert.match(await expectError(asUser(db, wk, `select add_builtin_roles($1)`, [org])), /FORBIDDEN/);
});

test('chức vụ tự tạo: gán thì cộng quyền nhưng KHÔNG đổi vai trò chính; sửa/xóa như thường', async () => {
  const { db, owner, org } = await setup();
  const tech = await addUser(db, 7);
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, tech]);
  const id = (await save(db, owner, org, { perms: { declare: 'edit' }, name: 'Kỹ thuật viên', description: 'KT' }, { base: 'worker' })).rows[0].id;
  await asUser(db, owner, `select set_member_positions($1,$2,$3::uuid[])`, [org, tech, [id]]);
  const r = (await db.query(`select roles::text[] r from organization_memberships where user_id=$1`, [tech])).rows[0].r;
  assert.deepEqual(r, ['worker']); // vai trò chính giữ nguyên
  assert.equal(await lvl(db, tech, org, 'declare'), 2);
  const builtin = await roleRow(db, org, 'worker');
  assert.match(await expectError(asUser(db, owner, `select set_member_positions($1,$2,$3::uuid[])`, [org, tech, [builtin.id]])), /INVALID_POSITION/); // có sẵn gán qua vai trò, không qua đây
  await asUser(db, owner, `select delete_position($1)`, [id]);
  assert.equal(await lvl(db, tech, org, 'declare'), 0);
});
