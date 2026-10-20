import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0026 (D36): vật tư mặc định tạo sẵn cho cơ sở mới; thông tin mở rộng; nút "Thêm vật tư mẫu".

test('cơ sở mới có sẵn vật tư mặc định, sửa được, mỗi cơ sở một bộ riêng', async () => {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const other = await addUser(db, 2);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await asUser(db, other, `select create_organization('household','Hộ B') id`);

  const rows = (await asUser(db, owner, `select m.name, m.category, m.brand, u.code unit from materials m join units_of_measure u on u.id=m.base_unit_id order by m.name`)).rows;
  assert.equal(rows.length, 11);
  assert.ok(rows.some((r) => r.name === 'Vôi' && r.unit === 'ton'));
  assert.ok(rows.some((r) => r.name === 'Urê' && r.unit === 'bag' && r.category === 'Phân bón vô cơ' && r.brand === 'Việt Nam'));
  assert.ok(rows.some((r) => r.name === 'Phân hữu cơ vi sinh' && r.category === 'Phân bón hữu cơ'));
  assert.equal((await asUser(db, other, `select count(*)::int n from materials`)).rows[0].n, 11); // bộ riêng của Hộ B

  await asUser(db, owner, `update materials set usage_guide='Bón lót 50 kg/1000 m2', withdrawal_days=7, is_active=false where name='Urê'`);
  const u = (await db.query(`select usage_guide, withdrawal_days, is_active from materials where organization_id=$1 and name='Urê'`, [org])).rows[0];
  assert.deepEqual([u.usage_guide, u.withdrawal_days, u.is_active], ['Bón lót 50 kg/1000 m2', 7, false]);
  assert.match(await expectError(asUser(db, owner, `update materials set withdrawal_days=-1 where name='Urê'`)), /check|withdrawal/i);
});

test('"Thêm vật tư mẫu" chỉ bổ sung mục thiếu, không ghi đè; người không có quyền Kho bị chặn', async () => {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const worker = await addUser(db, 2);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, worker]);
  await asUser(db, owner, `update materials set description='Mô tả của tôi' where name='Vôi'`);
  await asUser(db, owner, `delete from materials where name='Urê'`);
  assert.equal((await asUser(db, owner, `select add_default_materials($1) n`, [org])).rows[0].n, 1);
  assert.equal((await db.query(`select description from materials where organization_id=$1 and name='Vôi'`, [org])).rows[0].description, 'Mô tả của tôi');
  assert.equal((await db.query(`select count(*)::int n from materials where organization_id=$1`, [org])).rows[0].n, 11);
  assert.match(await expectError(asUser(db, worker, `select add_default_materials($1)`, [org])), /FORBIDDEN|quyền/);
});
