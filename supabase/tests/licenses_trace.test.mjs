import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0038 (D50): giấy phép, chứng chỉ; dữ liệu truy xuất vụ cho mã QR.
const id = (n) => `84000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), mgr = await addUser(db, 2), wk = await addUser(db, 3), other = await addUser(db, 4);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await asUser(db, other, `select create_organization('household','Hộ B') id`);
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[]),($1,$3,array['worker']::member_role[])`, [org, mgr, wk]);
  return { db, owner, mgr, wk, other, org };
}

test('giấy phép, chứng chỉ: mọi thành viên xem, chỉ chủ ghi, người ngoài không thấy, hạn không trước ngày cấp', async () => {
  const { db, owner, mgr, wk, other, org } = await setup();
  const ins = (u, n, issued, exp) => asUser(db, u, `insert into org_licenses (organization_id,name,issuer,number,issued_date,expires_date,image) values ($1,$2,'Sở NN','VG-01',$3,$4,'data:image/jpeg;base64,AAAA')`, [org, n, issued, exp]);
  await ins(owner, 'Chứng nhận VietGAP', '2026-01-01', '2029-01-01');
  await ins(owner, 'Giấy phép kinh doanh', null, null);
  assert.match(await expectError(ins(mgr, 'Quản lý tự thêm', null, null)), /row-level security/);
  assert.match(await expectError(ins(wk, 'Tự thêm', '2026-01-01', '2027-01-01')), /row-level security/);
  assert.match(await expectError(ins(owner, 'Sai ngày', '2026-05-01', '2026-01-01')), /check/i);
  assert.equal((await asUser(db, wk, `select count(*)::int n from org_licenses`)).rows[0].n, 2);
  assert.equal((await asUser(db, other, `select count(*)::int n from org_licenses`)).rows[0].n, 0);
  assert.equal((await asUser(db, wk, `delete from org_licenses returning id`)).rows.length, 0);
  assert.equal((await asUser(db, mgr, `update org_licenses set expires_date='2030-01-01' where name='Chứng nhận VietGAP' returning id`)).rows.length, 0);
  assert.equal((await asUser(db, mgr, `delete from org_licenses returning id`)).rows.length, 0);
  await asUser(db, owner, `update org_licenses set expires_date='2030-01-01' where name='Chứng nhận VietGAP'`);
});

test('truy xuất vụ: tên, nơi trồng, thời gian, vật tư đã dùng (trừ phần đã đảo khi hủy nhật ký); người ngoài bị chặn', async () => {
  const { db, owner, wk, other, org } = await setup();
  const area = (await asUser(db, owner, `insert into production_areas (id,organization_id,name,location,area_size,area_unit) values (gen_random_uuid(),$1,'Nhà màng 1','Xã A',500,'m2') returning id`, [org])).rows[0].id;
  const cyc = id(900);
  await db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status,name,created_by,start_date,expected_end_date) values ($1,$2,$3,(select id from crop_types where code='melon'),'active','Dưa vụ 1',$4,'2026-10-01','2026-12-30')`, [cyc, org, area, owner]);
  const loc = (await db.query(`insert into inventory_locations (id,organization_id,name) values ($1,$2,'Kho') returning id`, [id(1), org])).rows[0].id;
  const mat = (await db.query(`select id from materials where organization_id=$1 and name='Urê'`, [org])).rows[0].id;
  await db.query(`insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,txn_date) values ($1,$2,$3,$4,'receipt',50,'2026-10-01')`, [id(2), org, loc, mat]);
  await db.query(`insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,txn_date,cycle_id) values
    ($1,$5,$2,$3,'issue',-5,'2026-10-10',$4), ($6,$5,$2,$3,'issue',-3,'2026-10-20',$4)`, [id(3), loc, mat, cyc, org, id(4)]);
  const t = (await asUser(db, wk, `select get_cycle_trace($1) t`, [cyc])).rows[0].t;
  assert.equal(t.name, 'Dưa vụ 1');
  assert.deepEqual([t.farm, t.location, t.crop, t.start_date, t.expected_end_date], ['Nhà màng 1', 'Xã A', 'Dưa lưới', '2026-10-01', '2026-12-30']);
  assert.equal(t.materials.length, 1);
  assert.deepEqual([t.materials[0].name, Number(t.materials[0].quantity), t.materials[0].first, t.materials[0].last], ['Urê', 8, '2026-10-10', '2026-10-20']);
  assert.equal(JSON.stringify(t).includes('cost'), false);
  // đảo một lần xuất (hủy nhật ký) thì trừ đi
  await db.query(`insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,txn_date,cycle_id,reason,reverses_txn_id) values ($1,$2,$3,$4,'adjustment',5,'2026-10-21',$5,'Hủy nhật ký',$6)`, [id(5), org, loc, mat, cyc, id(3)]);
  const t2 = (await asUser(db, wk, `select get_cycle_trace($1) t`, [cyc])).rows[0].t;
  assert.equal(Number(t2.materials[0].quantity), 3);
  assert.match(await expectError(asUser(db, other, `select get_cycle_trace($1)`, [cyc])), /FORBIDDEN/);
});
