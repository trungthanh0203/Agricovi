import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0190: đưa tỉnh/thành gõ tay về tên chuẩn khi khớp chắc chắn; tên không khớp được giữ nguyên.
test('web_canon_province: khớp không dấu/tiền tố/cách gọi quen; không đoán tỉnh đã sáp nhập', async () => {
  const db = await createDb();
  const c = async (s) => (await db.query(`select web_canon_province($1) r`, [s])).rows[0].r;
  assert.equal(await c('ha noi'), 'Hà Nội');
  assert.equal(await c('Thành phố Hồ Chí Minh'), 'TP. Hồ Chí Minh');
  assert.equal(await c('Hồ Chí Minh'), 'TP. Hồ Chí Minh');
  assert.equal(await c('TP.HCM'), 'TP. Hồ Chí Minh');
  assert.equal(await c(' Tỉnh Đồng Nai '), 'Đồng Nai');
  assert.equal(await c('Đắk Lắk'), 'Đắk Lắk');
  assert.equal(await c('Long An'), null);        // đã sáp nhập: không tự đoán
  assert.equal(await c(''), null);
});

test('chuẩn hóa dữ liệu hiện có và xem tên chưa khớp (chỉ quản trị nền tảng)', async () => {
  const db = await createDb();
  const admin = await addUser(db, 1), u = await addUser(db, 2);
  await db.query(`insert into platform_admins (user_id) values ($1)`, [admin]);
  await db.query(`insert into buyer_addresses (user_id, label, recipient, phone, province, address) values ($1,'Nhà','An','0912345678','Hồ Chí Minh','1 A'), ($1,'Kho','An','0912345678','Long An','2 B')`, [u]);
  // chạy lại phần chuẩn hóa như migration
  await db.query(`update buyer_addresses set province = web_canon_province(province) where web_canon_province(province) is not null and province is distinct from web_canon_province(province)`);
  const rows = (await db.query(`select province from buyer_addresses order by label`)).rows.map((r) => r.province);
  assert.deepEqual(rows, ['Long An', 'TP. Hồ Chí Minh']); // Kho (giữ nguyên), Nhà (đã chuẩn hóa)
  const un = (await asUser(db, admin, `select * from web_list_unmatched_provinces()`)).rows;
  assert.deepEqual(un.map((r) => [r.source, r.province, Number(r.total)]), [['địa chỉ nhận hàng', 'Long An', 1]]);
  assert.match(await expectError(asUser(db, u, `select * from web_list_unmatched_provinces()`)), /FORBIDDEN/);
});
