import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0018: tên + vai trò người làm được máy chủ chụp lại khi tạo nhật ký / giao dịch kho.

const AREA = '20000000-0000-4000-8000-0000000000d1';
const CYC = '30000000-0000-4000-8000-0000000000d1';
const wt = `(select id from work_types where code='pollination' or code='irrigation' order by code desc limit 1)`;
const tid = (n) => `70000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const worker = await addUser(db, 2);
  const multi = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[]),($1,$3,array['worker','inventory_finance']::member_role[])`, [org, worker, multi]);
  // nhân viên có hồ sơ lao động (họ tên)
  await db.query(`insert into worker_profiles (organization_id,user_id,full_name) values ($1,$2,'Công'),($1,$3,'Lan')`, [org, worker, multi]);
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'N1')`, [AREA, org]);
  await db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status) values ($1,$2,$3,(select id from crop_types limit 1),'active')`, [CYC, org, AREA]);
  return { db, org, owner, worker, multi };
}
const addLog = (db, u, id, extra = '') =>
  asUser(db, u, `insert into activity_logs (id,organization_id,cycle_id,work_type_id,performed_at,created_by ${extra ? ',' + extra.split('=')[0] : ''})
     select $1, owner_org_id, id, ${wt}, now(), auth.uid() ${extra ? ',' + extra.split('=')[1] : ''} from production_cycles where id = $2`, [id, CYC]);
const logOf = async (db, id) => (await db.query(`select author_name, author_roles from activity_logs where id=$1`, [id])).rows[0];

test('nhật ký: máy chủ chụp họ tên và vai trò người làm (nhân viên, nhiều vai trò, chủ)', async () => {
  const { db, owner, worker, multi } = await setup();
  await addLog(db, worker, '40000000-0000-4000-8000-0000000000d1');
  await addLog(db, multi, '40000000-0000-4000-8000-0000000000d2');
  await addLog(db, owner, '40000000-0000-4000-8000-0000000000d3');
  assert.deepEqual({ ...(await logOf(db, '40000000-0000-4000-8000-0000000000d1')) }, { author_name: 'Công', author_roles: ['worker'] });
  assert.deepEqual({ ...(await logOf(db, '40000000-0000-4000-8000-0000000000d2')) }, { author_name: 'Lan', author_roles: ['worker', 'inventory_finance'] });
  // chủ là tài khoản email: lấy phần trước dấu @
  assert.deepEqual({ ...(await logOf(db, '40000000-0000-4000-8000-0000000000d3')) }, { author_name: 'u1', author_roles: ['owner'] });
});

test('nhật ký: client không giả mạo được tên/vai trò; không sửa được sau khi tạo; đổi vai trò sau này không đổi lịch sử', async () => {
  const { db, org, worker, owner } = await setup();
  const id = '40000000-0000-4000-8000-0000000000d4';
  await addLog(db, worker, id, `author_name='Chủ cơ sở'`);
  assert.equal((await logOf(db, id)).author_name, 'Công');
  assert.match(await expectError(asUser(db, owner, `update activity_logs set author_name = 'X' where id = $1`, [id])), /IMMUTABLE_FIELD/);
  assert.match(await expectError(asUser(db, owner, `update activity_logs set author_roles = array['owner']::member_role[] where id = $1`, [id])), /IMMUTABLE_FIELD/);
  await db.query(`update organization_memberships set roles = array['manager']::member_role[] where organization_id=$1 and user_id=$2`, [org, worker]);
  assert.deepEqual((await logOf(db, id)).author_roles, ['worker']);
});

test('nhật ký: hộ ghi theo vụ của HTX thì lấy vai trò ở cơ sở sở hữu khu trồng (hộ)', async () => {
  const { db, owner, worker, org } = await setup();
  const coopOwner = await addUser(db, 9);
  const coop = (await asUser(db, coopOwner, `select create_organization('cooperative','HTX B') id`)).rows[0].id;
  await db.query(`insert into cooperative_memberships (household_org_id,cooperative_org_id,status,joined_at) values ($1,$2,'active',now())`, [org, coop]);
  const coopCycle = '30000000-0000-4000-8000-0000000000d2';
  await db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status) values ($1,$2,$3,(select id from crop_types limit 1),'active')`, [coopCycle, coop, AREA]);
  const id = '40000000-0000-4000-8000-0000000000d5';
  await asUser(db, worker, `insert into activity_logs (id,organization_id,cycle_id,work_type_id,performed_at,created_by)
     values ($1,$2,$3,${wt},now(),auth.uid())`, [id, coop, coopCycle]);
  // chủ vụ là HTX nên bản ghi thuộc HTX, nhưng vai trò lấy ở hộ vì người làm không phải thành viên HTX
  const r = (await db.query(`select organization_id, author_name, author_roles from activity_logs where id=$1`, [id])).rows[0];
  assert.equal(r.organization_id, coop);
  assert.deepEqual({ name: r.author_name, roles: r.author_roles }, { name: 'Công', roles: ['worker'] });
  void owner;
});

test('giao dịch kho: nhập kho, xuất dùng, đảo kho khi hủy nhật ký đều có tên và vai trò người ghi', async () => {
  const { db, org, worker, multi } = await setup();
  const loc = '50000000-0000-4000-8000-0000000000d1';
  const mat = '60000000-0000-4000-8000-0000000000d1';
  await db.query(`insert into inventory_locations (id,organization_id,name) values ($1,$2,'Kho')`, [loc, org]);
  await db.query(`insert into materials (id,organization_id,name,base_unit_id) values ($1,$2,'Phân NPK',(select id from units_of_measure where code='kg'))`, [mat, org]);
  const ins = (u, n, type, qty, extra = '') => asUser(db, u, `insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,txn_date ${extra ? ',' + extra.split('=')[0] : ''})
     values ($1,$2,$3,$4,$5,$6,current_date ${extra ? ',' + extra.split('=')[1] : ''})`, [tid(n), org, loc, mat, type, qty]);
  await ins(multi, 1, 'receipt', 50);                 // Lan có vai trò Kho & chi phí
  const logId = '40000000-0000-4000-8000-0000000000d6';
  await addLog(db, worker, logId);
  await asUser(db, worker, `insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,txn_date,activity_log_id,author_name)
     values ($1,$2,$3,$4,'issue',-4,current_date,$5,'Giả mạo')`, [tid(2), org, loc, mat, logId]);
  const rows = (await db.query(`select id, txn_type, author_name, author_roles from inventory_transactions order by txn_type`)).rows;
  const by = (t) => rows.find((r) => r.txn_type === t);
  assert.deepEqual({ n: by('receipt').author_name, r: by('receipt').author_roles }, { n: 'Lan', r: ['worker', 'inventory_finance'] });
  assert.deepEqual({ n: by('issue').author_name, r: by('issue').author_roles }, { n: 'Công', r: ['worker'] });

  // hủy nhật ký -> giao dịch đảo kho ghi theo người đã hủy
  await asUser(db, worker, `select * from update_activity_log($1,1,'00000000-0000-4000-8000-000000000999',$2::jsonb)`, [logId, JSON.stringify({ voided_at: new Date().toISOString(), void_reason: 'ghi nhầm' })]);
  const adj = (await db.query(`select author_name, author_roles from inventory_transactions where txn_type='adjustment'`)).rows[0];
  assert.deepEqual({ n: adj.author_name, r: adj.author_roles }, { n: 'Công', r: ['worker'] });
});

test('hàm tra cứu tên/vai trò là nội bộ: người dùng không gọi trực tiếp được', async () => {
  const { db, worker } = await setup();
  assert.match(await expectError(asUser(db, worker, `select author_display_name($1,null,null)`, [worker])), /permission denied/);
  assert.match(await expectError(asUser(db, worker, `select author_roles_in($1,null,null)`, [worker])), /permission denied/);
});
