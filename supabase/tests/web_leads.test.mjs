import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0058 (G2-5 R2, D78): thêm yêu cầu báo giá từ website vào khách hàng; nối khách trùng số điện thoại; không tạo trùng.

const id = (k, n) => `${k}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const mgr = await addUser(db, 2);
  const fin = await addUser(db, 3);
  const stranger = await addUser(db, 4);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[]),($1,$3,array['inventory_finance']::member_role[])`, [org, mgr, fin]);
  return { db, org, owner, mgr, fin, stranger };
}

const quote = async (db, org, n, { name = `Khách ${n}`, phone = null, email = null, target = null } = {}) => {
  await db.query(`insert into quote_requests (id, kind, sender_name, sender_phone, sender_email, target_name, message, organization_id)
                  values ($1, 'profile', $2, $3, $4, $5, 'Cần mua', $6)`, [id('a', n), name, phone, email, target, org]);
  return id('a', n);
};
const link = (db, u, org, q) => asUser(db, u, `select link_lead_to_customer($1,$2) j`, [org, q]).then((r) => r.rows[0].j);

test('chuẩn hóa số điện thoại: bỏ ký tự lạ, +84/84 thành 0', async () => {
  const db = await createDb();
  const n = async (p) => (await db.query(`select norm_phone($1) v`, [p])).rows[0].v;
  assert.equal(await n('0912 345 678'), '0912345678');
  assert.equal(await n('+84912345678'), '0912345678');
  assert.equal(await n('84912345678'), '0912345678');
  assert.equal(await n(null), '');
});

test('tạo khách mới từ yêu cầu; email và sản phẩm quan tâm vào ghi chú; gọi lặp không tạo thêm', async () => {
  const { db, org, owner } = await setup();
  const q = await quote(db, org, 1, { name: 'Chị Lan', phone: '0912345678', email: 'lan@example.com', target: 'Dưa lưới loại 1' });
  const r = await link(db, owner, org, q);
  assert.equal(r.created, true);
  const p = (await db.query(`select * from partners where id = $1`, [r.partner_id])).rows[0];
  assert.equal(p.name, 'Chị Lan');
  assert.equal(p.is_customer, true);
  assert.equal(p.is_supplier, false);
  assert.match(p.note, /Từ website/);
  assert.match(p.note, /lan@example\.com/);
  assert.match(p.note, /Dưa lưới loại 1/);
  const again = await link(db, owner, org, q);
  assert.equal(again.already, true);
  assert.equal(again.partner_id, r.partner_id);
  assert.equal((await db.query(`select count(*)::int n from partners where is_customer`)).rows[0].n, 1);
});

test('trùng số điện thoại với khách đã có thì nối vào khách đó, không tạo mới', async () => {
  const { db, org, owner } = await setup();
  await db.query(`insert into partners (id, organization_id, name, phone, is_supplier, is_customer) values ($1,$2,'Chị Lan chợ đầu mối','+84 912 345 678',false,true)`, [id('7', 1), org]);
  const q = await quote(db, org, 2, { name: 'Lan', phone: '0912345678' });
  const r = await link(db, owner, org, q);
  assert.equal(r.created, false);
  assert.equal(r.partner_id, id('7', 1));
  assert.equal((await db.query(`select count(*)::int n from partners`)).rows[0].n, 1);
});

test('tên trùng một đối tác khác (ví dụ nhà cung ứng) thì thêm hậu tố, không lỗi trùng tên', async () => {
  const { db, org, owner } = await setup();
  await db.query(`insert into partners (id, organization_id, name, is_supplier, is_customer) values ($1,$2,'Đại lý An Phát',true,false)`, [id('7', 2), org]);
  const q = await quote(db, org, 3, { name: 'đại lý an phát', phone: '0900000001' });
  const r = await link(db, owner, org, q);
  assert.equal(r.created, true);
  const p = (await db.query(`select name from partners where id = $1`, [r.partner_id])).rows[0];
  assert.match(p.name, /từ website/);
});

test('quyền: cần xử lý được website VÀ sửa được Doanh thu; người ngoài và yêu cầu của cơ sở khác bị từ chối', async () => {
  const { db, org, owner, mgr, fin, stranger } = await setup();
  const q = await quote(db, org, 4, { phone: '0900000002' });
  // quản lý xử lý được website nhưng chỉ xem Doanh thu: không thêm khách được
  await expectError(link(db, mgr, org, q), /FORBIDDEN|quyền sửa mục Doanh thu/);
  // Kho & chi phí sửa được Doanh thu nhưng không xử lý website
  await expectError(link(db, fin, org, q), /FORBIDDEN|Chỉ chủ, quản lý/);
  await expectError(link(db, stranger, org, q), /FORBIDDEN/);
  // quản lý được cấp quyền sửa Doanh thu thì làm được
  await asUser(db, owner, `select set_member_permissions($1,$2,$3::jsonb)`, [org, mgr, JSON.stringify({ sales: 'edit', website: 'edit' })]); // D83: quản lý cần cả quyền website
  assert.equal((await link(db, mgr, org, q)).created, true);
  // yêu cầu của cơ sở khác
  const org2 = (await asUser(db, stranger, `select create_organization('household','Hộ B') id`)).rows[0].id;
  await expectError(link(db, stranger, org2, q), /NOT_FOUND|không tìm thấy/i);
});

test('bảng liên kết: người xem Doanh thu đọc được, không ghi trực tiếp được', async () => {
  const { db, org, owner, mgr } = await setup();
  await db.query(`update organization_memberships set permissions = '{"sales":"view"}'::jsonb where user_id=$1`, [mgr]); // D83: quản lý xem Doanh thu khi được chủ cấp
  const q = await quote(db, org, 5, { phone: '0900000003' });
  const r = await link(db, owner, org, q);
  assert.equal((await asUser(db, mgr, `select partner_id from web_lead_links where quote_id = $1`, [q])).rows[0].partner_id, r.partner_id);
  await expectError(asUser(db, owner, `insert into web_lead_links (organization_id, quote_id, partner_id) values ($1,$2,$3)`, [org, id('a', 99), r.partner_id]), /row-level security/i);
});
