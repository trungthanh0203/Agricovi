import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0027 (D37): trang trại/sản phẩm có thêm thông tin và hình ảnh; kho có ngày nhập cuối + điều chỉnh gần nhất; chặn ngày nhập kho tương lai.

test('trang trại, sản phẩm, vật tư lưu được thông tin mở rộng và hình ảnh', async () => {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  const img = 'data:image/jpeg;base64,/9j/4AAQ';
  await asUser(db, owner, `insert into production_areas (id,organization_id,name,location,area_size,area_unit,description,image)
    values (gen_random_uuid(),$1,'Trang trại 1','Xã A, huyện B',2.5,'ha','Đất cát pha',$2)`, [org, img]);
  const f = (await db.query(`select location, area_size::float s, area_unit, image from production_areas where organization_id=$1`, [org])).rows[0];
  assert.deepEqual([f.location, f.s, f.area_unit, f.image], ['Xã A, huyện B', 2.5, 'ha', img]);
  assert.match(await expectError(asUser(db, owner, `update production_areas set area_unit='acre' where organization_id=$1`, [org])), /check/i);

  await asUser(db, owner, `insert into crop_types (organization_id,name,kind,image) values ($1,'Gà ta','livestock',$2)`, [org, img]);
  assert.equal((await db.query(`select kind from crop_types where organization_id=$1 and name='Gà ta'`, [org])).rows[0].kind, 'livestock');
  assert.equal((await db.query(`select kind from crop_types where organization_id is null and code='melon'`)).rows[0].kind, 'crop');
  assert.match(await expectError(asUser(db, owner, `insert into crop_types (organization_id,name,kind) values ($1,'X','plant')`, [org])), /check/i);

  await asUser(db, owner, `update materials set image=$2 where organization_id=$1 and name='Urê'`, [org, img]);
  assert.equal((await db.query(`select image from materials where organization_id=$1 and name='Urê'`, [org])).rows[0].image, img);
  assert.match(await expectError(asUser(db, owner, `update materials set image=$2 where organization_id=$1 and name='Urê'`, [org, 'x'.repeat(400001)])), /check/i);
});

test('kho: ngày nhập cuối, điều chỉnh gần nhất trên tồn; không nhập kho ngày tương lai', async () => {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  const loc = (await asUser(db, owner, `insert into inventory_locations (id,organization_id,name) values (gen_random_uuid(),$1,'Kho chính') returning id`, [org])).rows[0].id;
  const mat = (await db.query(`select id from materials where organization_id=$1 and name='Urê'`, [org])).rows[0].id;
  const txn = (id, type, qty, date, reason) => asUser(db, owner,
    `insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,txn_date,reason) values ($1,$2,$3,$4,$5,$6,$7::date,$8)`,
    [id, org, loc, mat, type, qty, date, reason ?? null]);
  const N = (n) => `70000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;

  assert.match(await expectError(txn(N(1), 'receipt', 10, '2099-01-01')), /INVALID_DATE|sau ngày hôm nay/);
  await txn(N(2), 'receipt', 50, '2026-10-01');
  await txn(N(3), 'receipt', 20, '2026-10-10');
  await txn(N(4), 'adjustment', -3, '2026-10-12', 'Kiểm kê hao hụt');
  await txn(N(5), 'adjustment', 1, '2026-10-15', 'Kiểm kê lại');
  const b = (await asUser(db, owner, `select balance::float b, last_receipt_date::text r, last_adjust_date::text ad, last_adjust_delta::float adl, last_adjust_reason ar from inventory_balances`)).rows[0];
  assert.deepEqual([b.b, b.r, b.ad, b.adl, b.ar], [68, '2026-10-10', '2026-10-15', 1, 'Kiểm kê lại']);
});
