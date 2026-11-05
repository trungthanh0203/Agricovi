import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0177: tìm gian hàng vật tư trên website và thêm vào nhà cung ứng của cơ sở (chép cả điện thoại, địa chỉ).
test('app_find_suppliers / add_supplier_from_web: lọc tỉnh, từ khóa, thêm không nhân đôi, nối khi trùng tên, kiểm quyền', async () => {
  const db = await createDb();
  const owner = await addUser(db, 1), seller = await addUser(db, 2), seller2 = await addUser(db, 3), stranger = await addUser(db, 4);
  const org = (await asUser(db, owner, `select create_organization('household','Vườn A') id`)).rows[0].id;
  const shop = '86000000-0000-4000-8000-000000000001', shop2 = '86000000-0000-4000-8000-000000000002';
  await db.query(`insert into material_shops (id, owner_id, slug, name, description, province, district, address, phone, license_no, status, license_verified)
                  values ($1,$2,'hoa-binh','Đại lý Hòa Bình','Phân bón các loại','Cần Thơ','Phường Ninh Kiều','12 Lê Lợi','0901234567','GP-1','active',true),
                         ($3,$4,'pending-shop','Đại lý Chờ Duyệt','x','Cần Thơ',null,null,null,'GP-2','pending',false)`, [shop, seller, shop2, seller2]);
  await db.query(`insert into site_materials (slug, name, status, shop_id) values ('phan-npk','Phân NPK 16-16-8','published',$1), ('nhap','Bản nháp','draft',$1)`, [shop]);

  let r = (await asUser(db, owner, `select app_find_suppliers($1,'phan bon','TP. Cần Thơ') r`, [org])).rows[0].r;
  assert.equal(Number(r.total), 1);
  assert.deepEqual([r.rows[0].name, r.rows[0].phone, r.rows[0].address, r.rows[0].materials, r.rows[0].added_partner_id], ['Đại lý Hòa Bình', '0901234567', '12 Lê Lợi', ['Phân NPK 16-16-8'], null]);
  r = (await asUser(db, owner, `select app_find_suppliers($1,'npk',null) r`, [org])).rows[0].r;
  assert.equal(Number(r.total), 1); // tìm theo tên vật tư
  r = (await asUser(db, owner, `select app_find_suppliers($1,null,'Hà Nội') r`, [org])).rows[0].r;
  assert.equal(Number(r.total), 0);

  const a = (await asUser(db, owner, `select add_supplier_from_web($1,$2,'Giao nhanh') r`, [org, shop])).rows[0].r;
  assert.equal(a.status, 'created');
  const p = (await db.query(`select name, phone, address, province, ward, goods, note, is_supplier, web_shop_id from partners where id=$1`, [a.id])).rows[0];
  assert.deepEqual([p.name, p.phone, p.address, p.province, p.ward, p.note, p.is_supplier, p.web_shop_id], ['Đại lý Hòa Bình', '0901234567', '12 Lê Lợi', 'Cần Thơ', 'Phường Ninh Kiều', 'Giao nhanh', true, shop]);
  assert.match(p.goods, /NPK/);
  assert.equal((await asUser(db, owner, `select add_supplier_from_web($1,$2,null) r`, [org, shop])).rows[0].r.status, 'existing');
  assert.equal((await db.query(`select count(*)::int n from partners where organization_id=$1`, [org])).rows[0].n, 1);
  r = (await asUser(db, owner, `select app_find_suppliers($1,null,null) r`, [org])).rows[0].r;
  assert.equal(r.rows[0].added_partner_id, a.id);

  // nhà cung ứng nhập tay trùng tên: nối vào, không tạo thêm, không ghi đè chỗ đã có
  const org2 = (await asUser(db, seller, `select create_organization('household','Vườn B') id`)).rows[0].id;
  await db.query(`insert into partners (id, organization_id, name, phone, is_supplier) values (gen_random_uuid(), $1, ' đại lý hòa bình ', '0999', true)`, [org2]);
  const l = (await asUser(db, seller, `select add_supplier_from_web($1,$2,null) r`, [org2, shop])).rows[0].r;
  assert.equal(l.status, 'linked');
  const q = (await db.query(`select phone, address, web_shop_id from partners where id=$1`, [l.id])).rows[0];
  assert.deepEqual([q.phone, q.address, q.web_shop_id], ['0999', '12 Lê Lợi', shop]);

  assert.match(await expectError(asUser(db, owner, `select add_supplier_from_web($1,$2,null)`, [org, shop2])), /NOT_FOUND/);
  assert.match(await expectError(asUser(db, stranger, `select app_find_suppliers($1,null,null)`, [org])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, stranger, `select add_supplier_from_web($1,$2,null)`, [org, shop])), /FORBIDDEN/);
});
