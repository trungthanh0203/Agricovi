import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser } from './harness.mjs';

// Migration 0176: địa chỉ chuẩn Tỉnh/thành phố · Xã/phường · Địa chỉ cho hộ thành viên HTX, nhà cung ứng/khách hàng và phân khu.
test('địa chỉ 2 cấp: hộ thành viên, đối tác và phân khu lưu được tỉnh và xã', async () => {
  const db = await createDb();
  const boss = await addUser(db, 1);
  const C = (await asUser(db, boss, `select create_organization('cooperative','HTX') id`)).rows[0].id;
  const H = (await asUser(db, boss, `select create_member_household($1,'Hộ bác Tư') id`, [C])).rows[0].id;
  await asUser(db, boss, `select update_coop_household($1,$2,null,null,null,'Ấp 3',null,null,null,'active',null,'Cần Thơ','Phường Ninh Kiều')`, [C, H]);
  const r = (await asUser(db, boss, `select * from list_coop_households($1) where household_org_id=$2`, [C, H])).rows[0];
  assert.deepEqual([r.address, r.province, r.ward], ['Ấp 3', 'Cần Thơ', 'Phường Ninh Kiều']);
  await asUser(db, boss, `select update_coop_household($1,$2,null,null,null,null,null,null,null,'active',null,'  ','')`, [C, H]);
  const r2 = (await asUser(db, boss, `select province, ward from list_coop_households($1) where household_org_id=$2`, [C, H])).rows[0];
  assert.deepEqual([r2.province, r2.ward], [null, null]);

  await db.query(`insert into partners (id, organization_id, name, address, province, ward, is_supplier) values (gen_random_uuid(), $1, 'Đại lý A', '12 Lê Lợi', 'Đồng Nai', 'Phường Biên Hòa', true)`, [C]);
  await db.query(`insert into production_areas (id, organization_id, name, location, province, ward) values (gen_random_uuid(), $1, 'Khu 1', 'Ấp 2', 'Lâm Đồng', 'Xã Đức Trọng')`, [C]);
  assert.equal((await db.query(`select count(*)::int n from partners where province='Đồng Nai' and ward is not null`)).rows[0].n, 1);
  assert.equal((await db.query(`select count(*)::int n from production_areas where province='Lâm Đồng'`)).rows[0].n, 1);
});
