import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';
import { PERM_MODULES, effectivePerm } from '../../apps/app/src/lib/permissions.ts';

// Migration 0019 (D27): quyền theo mục do chủ cơ sở cấp; mặc định theo vai trò giữ nguyên hành vi cũ.

const AREA = '20000000-0000-4000-8000-0000000000c1';
const CYC = '30000000-0000-4000-8000-0000000000c1';
const LOC = '50000000-0000-4000-8000-0000000000c1';
const MAT = '60000000-0000-4000-8000-0000000000c1';
const tid = (n) => `70000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const mgr = await addUser(db, 2);
  const worker = await addUser(db, 3);
  const fin = await addUser(db, 4);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[]),($1,$3,array['worker']::member_role[]),($1,$4,array['inventory_finance']::member_role[])`, [org, mgr, worker, fin]);
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'N1')`, [AREA, org]);
  await db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status) values ($1,$2,$3,(select id from crop_types limit 1),'active')`, [CYC, org, AREA]);
  await db.query(`insert into inventory_locations (id,organization_id,name) values ($1,$2,'Kho')`, [LOC, org]);
  await db.query(`insert into materials (id,organization_id,name,base_unit_id) values ($1,$2,'Phân NPK',(select id from units_of_measure where code='kg'))`, [MAT, org]);
  return { db, org, owner, mgr, worker, fin };
}
const grant = (db, owner, org, user, perms) =>
  asUser(db, owner, `select set_member_permissions($1,$2,$3::jsonb)`, [org, user, JSON.stringify(perms)]);
const insExpense = (db, u, org, n) =>
  asUser(db, u, `insert into expense_records (id,organization_id,cycle_id,category,kind,amount,expense_date) values ($1,$2,$3,'utility','cash_paid',1000,current_date)`, [tid(n), org, CYC]);
const insReceipt = (db, u, org, n) =>
  asUser(db, u, `insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,unit_cost,txn_date) values ($1,$2,$3,$4,'receipt',5,100,current_date)`, [tid(n), org, LOC, MAT]);
const count = async (db, u, sql) => (await asUser(db, u, sql)).rows[0].n;

test('mặc định theo vai trò khớp hàm giao diện (permissions.ts) cho mọi tổ hợp vai trò × mục', async () => {
  const { db, org } = await setup();
  const combos = [['owner'], ['manager'], ['worker'], ['inventory_finance'], ['profile_editor'], ['worker', 'inventory_finance'], ['manager', 'worker']];
  let n = 100;
  for (const roles of combos) {
    n += 1;
    const u = await addUser(db, n);
    if (roles[0] === 'owner') {
      await db.query(`update organization_memberships set roles = array['owner']::member_role[] where organization_id=$1 and user_id=(select created_by from organizations where id=$1)`, [org]);
      continue; // chủ đã có sẵn; đối chiếu riêng bên dưới
    }
    await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,$3::member_role[])`, [org, u, `{${roles.join(',')}}`]);
    for (const m of PERM_MODULES) {
      const lvl = (await asUser(db, u, `select perm_level($1,$2) l`, [org, m])).rows[0].l;
      const want = { none: 0, view: 1, edit: 2 }[effectivePerm(roles, null, m)];
      assert.equal(lvl, want, `${roles.join('+')} / ${m}`);
    }
  }
  // chủ: đủ quyền mọi mục
  const owner = (await db.query(`select created_by from organizations where id=$1`, [org])).rows[0].created_by;
  for (const m of PERM_MODULES) assert.equal((await asUser(db, owner, `select perm_level($1,$2) l`, [org, m])).rows[0].l, 2);
});

test('mặc định (D83): quản lý chỉ xem tồn kho, không thấy chi phí/doanh thu; Kho & chi phí (vai trò cũ) nhập liệu; nhân viên chỉ ghi thu hoạch', async () => {
  const { db, org, mgr, worker, fin } = await setup();
  await insExpense(db, fin, org, 1);
  assert.equal(await count(db, mgr, `select count(*)::int n from expense_records`), 0);
  assert.match(await expectError(insExpense(db, mgr, org, 2)), /row-level security/);
  assert.equal(await count(db, worker, `select count(*)::int n from expense_records`), 0);
  await insReceipt(db, fin, org, 3);
  assert.equal(await count(db, mgr, `select count(*)::int n from inventory_balances`), 1);
  assert.match(await expectError(insReceipt(db, mgr, org, 4)), /row-level security/);
  assert.equal(await count(db, worker, `select count(*)::int n from inventory_balances`), 0);
  await asUser(db, worker, `insert into harvest_records (id,organization_id,cycle_id,harvested_at,quantity,created_by) select '80000000-0000-4000-8000-0000000000c1', owner_org_id, id, now(), 10, auth.uid() from production_cycles where id=$1`, [CYC]);
  assert.equal(await count(db, worker, `select count(*)::int n from harvest_records`), 1);
});

test('chủ cấp thêm quyền: nhân viên được nhập liệu chi phí và doanh thu, thấy dữ liệu', async () => {
  const { db, org, owner, worker, fin } = await setup();
  await insExpense(db, fin, org, 1);
  await grant(db, owner, org, worker, { expenses: 'edit', sales: 'view' });
  assert.equal(await count(db, worker, `select count(*)::int n from expense_records`), 1);
  await insExpense(db, worker, org, 2);
  assert.equal(await count(db, worker, `select count(*)::int n from expense_records`), 2);
  assert.equal(await count(db, worker, `select count(*)::int n from sales_records`), 0);
  assert.match(await expectError(asUser(db, worker, `insert into sales_records (id,organization_id,cycle_id,sold_date,quantity,unit,amount) values ($1,$2,$3,current_date,5,'kg',100000)`, [tid(5), org, CYC])), /row-level security/);
  // quyền Kho chưa cấp thì vẫn không nhập kho được
  assert.match(await expectError(insReceipt(db, worker, org, 6)), /row-level security/);
});

test('chủ rút bớt quyền: Kho & chi phí chỉ còn xem kho; quản lý bị ẩn chi phí và tổng kết', async () => {
  const { db, org, owner, mgr, fin } = await setup();
  await insReceipt(db, fin, org, 1);
  await insExpense(db, fin, org, 2);
  await grant(db, owner, org, fin, { inventory: 'view' });
  assert.equal(await count(db, fin, `select count(*)::int n from inventory_balances`), 1);
  assert.match(await expectError(insReceipt(db, fin, org, 3)), /row-level security/);
  assert.match(await expectError(asUser(db, fin, `insert into materials (id,organization_id,name,base_unit_id) values ($1,$2,'Vôi',(select id from units_of_measure where code='kg'))`, [MAT.replace(/1$/, '9'), org])), /row-level security/);
  // việc khác của người đó không bị ảnh hưởng
  await insExpense(db, fin, org, 4);

  await grant(db, owner, org, mgr, { expenses: 'none', summary: 'none', inventory: 'none' });
  assert.equal(await count(db, mgr, `select count(*)::int n from expense_records`), 0);
  assert.equal(await count(db, mgr, `select count(*)::int n from inventory_balances`), 0);
  assert.match(await expectError(asUser(db, mgr, `select get_cycle_summary($1)`, [CYC])), /FORBIDDEN/);
  // chủ cấp lại quyền xem chi phí cho quản lý
  await grant(db, owner, org, mgr, { expenses: 'view' });
  assert.equal(await count(db, mgr, `select count(*)::int n from expense_records`), 2);
});

test('tổng kết vụ theo quyền mục "tổng kết": cấp cho nhân viên thì xem được', async () => {
  const { db, org, owner, worker } = await setup();
  assert.match(await expectError(asUser(db, worker, `select get_cycle_summary($1)`, [CYC])), /FORBIDDEN/);
  await grant(db, owner, org, worker, { summary: 'view' });
  const s = (await asUser(db, worker, `select get_cycle_summary($1) s`, [CYC])).rows[0].s;
  assert.equal(s.missing_harvest, true);
});

test('thu hoạch theo quyền: chỉ xem thì không ghi được; không thấy thì không đọc được', async () => {
  const { db, org, owner, worker, mgr } = await setup();
  const ins = (n) => asUser(db, worker, `insert into harvest_records (id,organization_id,cycle_id,harvested_at,quantity,created_by) select $1, owner_org_id, id, now(), 10, auth.uid() from production_cycles where id=$2`, [`80000000-0000-4000-8000-0000000000${n}`, CYC]);
  await ins(10);
  await grant(db, owner, org, worker, { harvest: 'view' });
  assert.equal(await count(db, worker, `select count(*)::int n from harvest_records`), 1);
  assert.match(await expectError(ins(11)), /row-level security/);
  // không sửa/hủy được bản của mình khi chỉ xem
  assert.match(await expectError(asUser(db, worker, `select * from update_harvest('80000000-0000-4000-8000-000000000010',1,'00000000-0000-4000-8000-000000000999','{"note":"x"}'::jsonb)`)), /FORBIDDEN|NOT_FOUND/);
  await grant(db, owner, org, worker, { harvest: 'none' });
  assert.equal(await count(db, worker, `select count(*)::int n from harvest_records`), 0);
  // người khác không bị ảnh hưởng
  assert.equal(await count(db, mgr, `select count(*)::int n from harvest_records`), 1);
});

test('cấp quyền: chỉ chủ, đúng định dạng, không áp cho chủ; nhân viên không tự nâng quyền', async () => {
  const { db, org, owner, mgr, worker } = await setup();
  assert.match(await expectError(grant(db, mgr, org, worker, { expenses: 'edit' })), /FORBIDDEN/);
  assert.match(await expectError(grant(db, owner, org, worker, { khong_co: 'edit' })), /INVALID_PERMISSIONS/);
  assert.match(await expectError(grant(db, owner, org, worker, { expenses: 'sua' })), /INVALID_PERMISSIONS/);
  assert.match(await expectError(grant(db, owner, org, worker, { summary: 'edit' })), /INVALID_PERMISSIONS/);
  assert.match(await expectError(grant(db, owner, org, owner, { expenses: 'none' })), /INVALID_TARGET/);
  assert.match(await expectError(grant(db, owner, org, '00000000-0000-4000-8000-00000000ffff', {})), /NOT_FOUND/);
  // tự sửa trực tiếp cột quyền: không có tác dụng (chỉ chủ ghi được bảng thành viên)
  await asUser(db, worker, `update organization_memberships set permissions = '{"expenses":"edit"}'::jsonb where user_id = auth.uid()`).catch(() => undefined);
  assert.equal(await count(db, worker, `select count(*)::int n from expense_records`), 0);
  assert.equal((await db.query(`select permissions from organization_memberships where user_id=$1`, [worker])).rows[0].permissions.expenses, undefined);
});

test('quyền đã cấp riêng: chỉ chủ xem được danh sách', async () => {
  const { db, org, owner, worker, mgr } = await setup();
  await grant(db, owner, org, worker, { expenses: 'edit' });
  const rows = (await asUser(db, owner, `select * from member_permission_overrides($1)`, [org])).rows;
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.find((r) => r.member_user_id === worker).member_overrides, { expenses: 'edit' });
  assert.match(await expectError(asUser(db, mgr, `select * from member_permission_overrides($1)`, [org])), /FORBIDDEN/);
});
