import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0056 (G2-2 P4): báo cáo "Mua theo nhà cung ứng" trong run_report; các loại báo cáo cũ giữ nguyên.

const id = (k, n) => `${k}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const LOC = id('5', 1);
const MAT1 = id('6', 1);
const MAT2 = id('6', 2);

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const mgr = await addUser(db, 2);
  const worker = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[]),($1,$3,array['worker']::member_role[])`, [org, mgr, worker]);
  await db.query(`insert into inventory_locations (id,organization_id,name) values ($1,$2,'Kho')`, [LOC, org]);
  await db.query(`insert into materials (id,organization_id,name,base_unit_id) values ($1,$2,'Phân NPK',(select id from units_of_measure where code='kg')),($3,$2,'MKP',(select id from units_of_measure where code='kg'))`, [MAT1, org, MAT2]);
  await asUser(db, owner, `insert into partners (id, organization_id, name) values ($1,$2,'NCC An Phát'),($3,$2,'NCC Bình Minh')`, [id('7', 1), org, id('7', 2)]);
  return { db, org, owner, mgr, worker };
}

const lines = (n, mat, qty, cost) => JSON.stringify([{ id: id('8', n), location_id: LOC, material_id: mat, quantity: qty, unit_cost: cost }]);
const buy = (db, u, org, bill, partner, invoice, total, ln, paid = 0) =>
  asUser(db, u, `select * from record_purchase($1,$2,$3,$4,vn_today(),null,$5,null,$6::jsonb,$7,'cash')`, [id('9', bill), org, id('7', partner), invoice, total, ln, paid]);
const report = async (db, u, org, type, params = {}) => (await asUser(db, u, `select run_report($1,$2,$3::jsonb) r`, [org, type, JSON.stringify(params)])).rows[0].r;

test('mua theo nhà cung ứng: số hóa đơn, tổng, đã trả, còn nợ; hóa đơn đã hủy không tính', async () => {
  const { db, org, owner } = await setup();
  await buy(db, owner, org, 1, 1, 'A1', 200000, lines(1, MAT1, 10, 20000), 50000);
  await buy(db, owner, org, 2, 1, 'A2', 100000, lines(2, MAT1, 5, 20000), 100000);
  await buy(db, owner, org, 3, 2, 'B1', 300000, lines(3, MAT2, 10, 30000));
  await buy(db, owner, org, 4, 2, 'B2', 999000, lines(4, MAT2, 1, 999000)); // sẽ hủy
  await asUser(db, owner, `select * from update_bill($1,1,$2,$3::jsonb)`, [id('9', 4), id('c', 1), JSON.stringify({ voided_at: new Date().toISOString(), void_reason: 'Sai' })]);

  const r = await report(db, owner, org, 'purchases');
  assert.equal(r.type, 'purchases');
  assert.equal(r.columns[0].label, 'Nhà cung ứng');
  const byName = Object.fromEntries(r.rows.map((x) => [x.label, x]));
  assert.equal(byName['NCC An Phát'].count, 2);
  assert.equal(Number(byName['NCC An Phát'].total), 300000);
  assert.equal(Number(byName['NCC An Phát'].paid), 150000);
  assert.equal(Number(byName['NCC An Phát'].owed), 150000);
  assert.equal(Number(byName['NCC Bình Minh'].total), 300000); // hóa đơn đã hủy không cộng
  assert.equal(Number(byName['NCC Bình Minh'].owed), 300000);
});

test('theo tháng và theo vật tư; lần trả đã hủy không tính vào đã trả', async () => {
  const { db, org, owner } = await setup();
  await buy(db, owner, org, 1, 1, 'A1', 200000, lines(1, MAT1, 10, 20000), 200000);
  const pid = (await db.query(`select id from bill_payments`)).rows[0].id;
  await asUser(db, owner, `select * from void_bill_payment($1,'Nhầm')`, [pid]);
  const m = await report(db, owner, org, 'purchases', { group: 'month' });
  assert.equal(m.columns[0].label, 'Tháng');
  assert.equal(m.rows.length, 1);
  assert.equal(Number(m.rows[0].paid), 0);
  assert.equal(Number(m.rows[0].owed), 200000);
  const v = await report(db, owner, org, 'purchases', { group: 'material' });
  assert.equal(v.rows[0].label, 'Phân NPK');
  assert.equal(Number(v.rows[0].qty), 10);
  assert.equal(Number(v.rows[0].amount), 200000);
});

test('quyền: quản lý xem được (Chi phí xem), nhân viên bị từ chối; loại báo cáo cũ vẫn chạy', async () => {
  const { db, org, owner, mgr, worker } = await setup();
  await db.query(`update organization_memberships set permissions = '{"expenses":"view","sales":"view"}'::jsonb where user_id=$1`, [mgr]); // D83: quản lý xem chi phí/doanh thu khi được chủ cấp
  await buy(db, owner, org, 1, 1, 'A1', 200000, lines(1, MAT1, 10, 20000));
  assert.equal((await report(db, mgr, org, 'purchases')).rows.length, 1);
  await expectError(report(db, worker, org, 'purchases'), /FORBIDDEN|quyền xem/);
  const old = await report(db, owner, org, 'expenses');
  assert.equal(old.type, 'expenses');
  assert.ok(Array.isArray(old.rows));
  await expectError(report(db, owner, org, 'khong_co'), /FORBIDDEN|quyền xem/);
});

test('báo cáo đã lưu nhận loại purchases; hàm cũ không gọi trực tiếp được', async () => {
  const { db, org, owner } = await setup();
  await asUser(db, owner, `insert into saved_reports (organization_id, name, report_type) values ($1,'Mua hàng tháng này','purchases')`, [org]);
  assert.equal((await asUser(db, owner, `select count(*)::int n from saved_reports`)).rows[0].n, 1);
  await expectError(asUser(db, owner, `select run_report_base($1,'expenses','{}'::jsonb)`, [org]), /permission denied/i);
});
