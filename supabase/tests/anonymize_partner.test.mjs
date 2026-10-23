import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0060 (G2-5 R5, D78): ẩn danh khách theo yêu cầu xóa dữ liệu; giữ số tiền và công nợ.

const id = (k, n) => `${k}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const AREA = id('2', 1);
const CYC = id('3', 1);

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const mgr = await addUser(db, 2);
  const stranger = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[])`, [org, mgr]);
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'N1')`, [AREA, org]);
  await db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status) values ($1,$2,$3,(select id from crop_types limit 1),'active')`, [CYC, org, AREA]);
  await db.query(`insert into partners (id, organization_id, name, phone, address, goods, note, is_supplier, is_customer, customer_kind) values
    ($1,$3,'Chị Lan','0912345678','12 Lê Lợi','Dưa lưới','Ghi chú riêng',false,true,'retail'),
    ($2,$3,'NCC Cường','0900000000',null,null,null,true,false,null)`, [id('7', 1), id('7', 2), org]);
  return { db, org, owner, mgr, stranger };
}
const anon = (db, u, pid, reason = 'Khách yêu cầu xóa') => asUser(db, u, `select * from anonymize_partner($1,$2)`, [pid, reason]);

test('ẩn danh: xóa dữ liệu cá nhân, đổi tên, ngừng dùng; giữ lần bán, số tiền và công nợ', async () => {
  const { db, org, owner } = await setup();
  await asUser(db, owner, `select * from record_sale($1,$2,$3,vn_today(),50,1000000,null,$4,'PB1',null,300000,'cash')`, [id('9', 1), org, CYC, id('7', 1)]);
  const r = (await anon(db, owner, id('7', 1))).rows[0];
  assert.match(r.name, /^Khách đã ẩn danh [0-9A-F]{6}$/);
  assert.equal(r.phone, null);
  assert.equal(r.address, null);
  assert.equal(r.goods, null);
  assert.equal(r.customer_kind, null);
  assert.equal(r.is_active, false);
  assert.match(r.note, /Đã ẩn danh theo yêu cầu/);
  assert.doesNotMatch(r.note, /Ghi chú riêng/);
  const recv = (await asUser(db, owner, `select get_receivables($1,true) j`, [org])).rows[0].j;
  assert.equal(recv.length, 1);
  assert.equal(Number(recv[0].remaining), 700000); // công nợ còn nguyên
  assert.match(recv[0].partner_name, /Khách đã ẩn danh/);
  const audit = (await db.query(`select count(*)::int n from audit_events where entity = 'partners' and entity_id = $1 and action = 'UPDATE'`, [id('7', 1)])).rows[0].n;
  assert.ok(audit >= 1); // có nhật ký kiểm toán
});

test('gọi lặp không lỗi; cần lý do; chỉ ẩn danh được khách hàng', async () => {
  const { db, owner } = await setup();
  await anon(db, owner, id('7', 1));
  await anon(db, owner, id('7', 1)); // lặp
  await expectError(anon(db, owner, id('7', 1), ' '), /lý do/);
  await expectError(anon(db, owner, id('7', 2)), /Chỉ ẩn danh được đối tác là khách hàng/);
});

test('quyền: cần sửa Doanh thu; người ngoài bị từ chối', async () => {
  const { db, org, owner, mgr, stranger } = await setup();
  await expectError(anon(db, mgr, id('7', 1)), /FORBIDDEN|quyền/); // quản lý chỉ xem Doanh thu
  await expectError(anon(db, stranger, id('7', 1)), /FORBIDDEN|quyền/);
  await asUser(db, owner, `select set_member_permissions($1,$2,$3::jsonb)`, [org, mgr, JSON.stringify({ sales: 'edit' })]);
  assert.equal((await anon(db, mgr, id('7', 1))).rows.length, 1);
});
