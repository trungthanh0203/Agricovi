import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, asAnon, expectError } from './harness.mjs';

// Migration 0057 (G2-4, D77): khách hàng (dùng chung bảng Đối tác), bán có khách, công nợ phải thu, báo cáo theo khách.
// Quyền: khách hàng/công nợ phải thu gộp với mục Doanh thu; nhà cung ứng vẫn theo mục Chi phí.

const id = (k, n) => `${k}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const AREA = id('2', 1);
const CYC = id('3', 1);

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const mgr = await addUser(db, 2);
  const worker = await addUser(db, 3);
  const stranger = await addUser(db, 4);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[]),($1,$3,array['worker']::member_role[])`, [org, mgr, worker]);
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'N1')`, [AREA, org]);
  await db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status) values ($1,$2,$3,(select id from crop_types limit 1),'active')`, [CYC, org, AREA]);
  // khách 1 = chỉ khách; khách 2 = chỉ khách; NCC 3 = chỉ nhà cung ứng; 4 = vừa nhà cung ứng vừa khách
  await db.query(`insert into partners (id, organization_id, name, is_supplier, is_customer) values
    ($1,$5,'Khách An',false,true),($2,$5,'Khách Bình',false,true),($3,$5,'NCC Cường',true,false),($4,$5,'Đối tác Hai Mặt',true,true)`, [id('7', 1), id('7', 2), id('7', 3), id('7', 4), org]);
  return { db, org, owner, mgr, worker, stranger };
}

const today = async (db) => (await db.query(`select vn_today()::text d`)).rows[0].d;
const addDays = async (db, n) => (await db.query(`select (vn_today() + $1::int)::text d`, [n])).rows[0].d;

async function sell(db, u, org, { sale = 1, partner = 1, amount = 1000000, qty = 100, paid = 0, due = null, invoice = null, date = null } = {}) {
  const d = date ?? (await today(db));
  return asUser(db, u, `select * from record_sale($1,$2,$3,$4::date,$5,$6,null,$7,$8,$9::date,$10,'cash')`,
    [id('9', sale), org, CYC, d, qty, amount, partner ? id('7', partner) : null, invoice, due, paid]);
}
const recv = async (db, u, org, open = true) => (await asUser(db, u, `select get_receivables($1,$2) j`, [org, open])).rows[0].j;
const report = async (db, u, org, type, params = {}) => (await asUser(db, u, `select run_report($1,$2,$3::jsonb) r`, [org, type, JSON.stringify(params)])).rows[0].r;
const grantPerms = (db, owner, org, user, perms) => asUser(db, owner, `select set_member_permissions($1,$2,$3::jsonb)`, [org, user, JSON.stringify(perms)]);

test('quyền đối tác theo cờ: khách theo Doanh thu, nhà cung ứng theo Chi phí', async () => {
  const { db, org, owner, worker } = await setup();
  await grantPerms(db, owner, org, worker, { sales: 'view' });
  const names = async (u) => (await asUser(db, u, `select name from partners order by name`)).rows.map((r) => r.name);
  assert.deepEqual(await names(worker), ['Khách An', 'Khách Bình', 'Đối tác Hai Mặt']); // chỉ xem Doanh thu: thấy khách, không thấy nhà cung ứng thuần
  await grantPerms(db, owner, org, worker, { expenses: 'view' });
  assert.deepEqual(await names(worker), ['NCC Cường', 'Đối tác Hai Mặt']); // chỉ xem Chi phí: thấy nhà cung ứng
  await grantPerms(db, owner, org, worker, {});
  assert.deepEqual(await names(worker), []);
  // thêm khách cần quyền sửa Doanh thu
  await expectError(asUser(db, worker, `insert into partners (id, organization_id, name, is_supplier, is_customer) values ($1,$2,'Khách Mới',false,true)`, [id('7', 9), org]), /row-level security/i);
  await grantPerms(db, owner, org, worker, { sales: 'edit' });
  await asUser(db, worker, `insert into partners (id, organization_id, name, is_supplier, is_customer) values ($1,$2,'Khách Mới',false,true)`, [id('7', 9), org]);
  // nhưng không thêm được nhà cung ứng
  await expectError(asUser(db, worker, `insert into partners (id, organization_id, name) values ($1,$2,'NCC Mới')`, [id('7', 8), org]), /row-level security/i);
  await expectError(asAnon(db, `select id from partners`), /permission denied|row-level/i);
});

test('đối tác vừa là nhà cung ứng vừa là khách: cần cả hai quyền sửa; bật cờ khách qua update_partner', async () => {
  const { db, org, owner, worker } = await setup();
  await grantPerms(db, owner, org, worker, { sales: 'edit' });
  await expectError(asUser(db, worker, `select * from update_partner($1,1,$2,$3::jsonb)`, [id('7', 4), id('c', 1), JSON.stringify({ note: 'x' })]), /FORBIDDEN|row-level|quyền/i);
  // chủ bật cờ khách cho nhà cung ứng thuần
  const r = await asUser(db, owner, `select * from update_partner($1,1,$2,$3::jsonb)`, [id('7', 3), id('c', 2), JSON.stringify({ is_customer: true, customer_kind: 'trader' })]);
  assert.equal(r.rows[0].is_customer, true);
  assert.equal(r.rows[0].customer_kind, 'trader');
  // không bỏ hết cả hai cờ
  await expectError(asUser(db, owner, `select * from update_partner($1,2,$2,$3::jsonb)`, [id('7', 3), id('c', 3), JSON.stringify({ is_supplier: false, is_customer: false })]), /check constraint|partners_check/i);
});

test('bán có khách: lần bán + lần thu đầu cùng lúc; còn phải thu tính đúng; bán không khách không thành công nợ', async () => {
  const { db, org, owner } = await setup();
  const due = await addDays(db, 20);
  await sell(db, owner, org, { sale: 1, partner: 1, amount: 1000000, paid: 400000, due, invoice: 'PB01' });
  await sell(db, owner, org, { sale: 2, partner: null, amount: 500000 }); // bán lẻ
  const r = await recv(db, owner, org);
  assert.equal(r.length, 1);
  assert.equal(r[0].partner_name, 'Khách An');
  assert.equal(Number(r[0].collected), 400000);
  assert.equal(Number(r[0].remaining), 600000);
  assert.equal(r[0].status, 'ok');
  assert.equal(r[0].invoice_no, 'PB01');
  // bán không khách: bỏ qua số phiếu/hạn/đã thu
  const plain = (await db.query(`select partner_id, due_date from sales_records where id = $1`, [id('9', 2)])).rows[0];
  assert.equal(plain.partner_id, null);
  assert.equal(plain.due_date, null);
  assert.equal((await db.query(`select count(*)::int n from sale_receipts`)).rows[0].n, 1);
});

test('ghi lặp cùng mã không tạo thêm; thu nhiều hơn tiền bán bị từ chối', async () => {
  const { db, org, owner } = await setup();
  await sell(db, owner, org, { paid: 300000 });
  await sell(db, owner, org, { paid: 300000 }); // bấm lặp
  assert.equal((await db.query(`select count(*)::int n from sales_records`)).rows[0].n, 1);
  assert.equal((await db.query(`select count(*)::int n from sale_receipts`)).rows[0].n, 1);
  await expectError(sell(db, owner, org, { sale: 3, amount: 100000, paid: 100001 }), /OVERPAY/);
  assert.equal((await db.query(`select count(*)::int n from sales_records`)).rows[0].n, 1); // lần bán 3 không được tạo
});

test('thu tiền: không thu quá nợ; thu chung của khách trừ vào lần bán cũ nhất trước; ghi lặp không nhân đôi', async () => {
  const { db, org, owner } = await setup();
  await sell(db, owner, org, { sale: 1, amount: 400000, qty: 40, date: await addDays(db, -10), invoice: 'CU' });
  await sell(db, owner, org, { sale: 2, amount: 100000, qty: 10, invoice: 'MOI' });
  await expectError(asUser(db, owner, `select * from collect_sale($1,$2,400001,vn_today(),'cash',null)`, [id('a', 1), id('9', 1)]), /OVERPAY/);
  const op = id('b', 1);
  const r = await asUser(db, owner, `select * from collect_partner($1,$2,450000,vn_today(),'transfer',null)`, [op, id('7', 1)]);
  assert.equal(r.rows.length, 2);
  const open = await recv(db, owner, org);
  assert.equal(open.length, 1);
  assert.equal(open[0].invoice_no, 'MOI'); // lần bán cũ thu đủ trước, lần mới còn 50.000
  assert.equal(Number(open[0].remaining), 50000);
  await asUser(db, owner, `select * from collect_partner($1,$2,450000,vn_today(),'transfer',null)`, [op, id('7', 1)]); // lặp
  assert.equal((await db.query(`select count(*)::int n from sale_receipts`)).rows[0].n, 2);
  await expectError(asUser(db, owner, `select * from collect_partner($1,$2,50001,vn_today(),'cash',null)`, [id('b', 2), id('7', 1)]), /OVERPAY/);
  // không thu được lần bán không khách
  await sell(db, owner, org, { sale: 5, partner: null, amount: 1000 });
  await expectError(asUser(db, owner, `select * from collect_sale($1,$2,500,vn_today(),'cash',null)`, [id('a', 5), id('9', 5)]), /không ghi khách hàng/);
});

test('hủy lần thu làm nợ tăng; không hủy lần bán còn lần thu; không giảm tiền bán dưới số đã thu', async () => {
  const { db, org, owner } = await setup();
  await sell(db, owner, org, { amount: 1000000, paid: 1000000 });
  assert.equal((await recv(db, owner, org)).length, 0);
  const rid = (await db.query(`select id from sale_receipts`)).rows[0].id;
  await expectError(asUser(db, owner, `select * from void_sale_receipt($1,'')`, [rid]), /lý do/);

  const v1 = (await db.query(`select version from sales_records where id=$1`, [id('9', 1)])).rows[0].version;
  const voidSale = JSON.stringify({ voided_at: new Date().toISOString(), void_reason: 'Ghi nhầm' });
  await expectError(asUser(db, owner, `select * from update_sale($1,$2,$3,$4::jsonb)`, [id('9', 1), v1, id('c', 1), voidSale]), /HAS_RECEIPTS|hủy các lần thu/);
  await expectError(asUser(db, owner, `select * from update_sale($1,$2,$3,$4::jsonb)`, [id('9', 1), v1, id('c', 2), JSON.stringify({ amount: 900000 })]), /SALE_LOCKED|thấp hơn số đã thu/);

  await asUser(db, owner, `select * from void_sale_receipt($1,'Thu nhầm')`, [rid]);
  assert.equal(Number((await recv(db, owner, org))[0].remaining), 1000000);
  const v2 = (await db.query(`select version from sales_records where id=$1`, [id('9', 1)])).rows[0].version;
  await asUser(db, owner, `select * from update_sale($1,$2,$3,$4::jsonb)`, [id('9', 1), v2, id('c', 3), voidSale]);
  assert.equal((await recv(db, owner, org)).length, 0);
  await expectError(asUser(db, owner, `select * from collect_sale($1,$2,1000,vn_today(),'cash',null)`, [id('a', 9), id('9', 1)]), /đã hủy/);
});

test('sửa số phiếu và hạn thu của lần bán có khách; không đổi khách; hạn không trước ngày bán', async () => {
  const { db, org, owner } = await setup();
  await sell(db, owner, org, { invoice: 'PB-A' });
  const due = await addDays(db, 15);
  const r = await asUser(db, owner, `select * from update_sale($1,1,$2,$3::jsonb)`, [id('9', 1), id('c', 4), JSON.stringify({ invoice_no: 'PB-B', due_date: due })]);
  assert.equal(r.rows[0].invoice_no, 'PB-B');
  assert.equal(r.rows[0].due_date.toISOString?.().slice(0, 10) ?? String(r.rows[0].due_date).slice(0, 10), due);
  await expectError(asUser(db, owner, `update sales_records set partner_id = $2 where id = $1`, [id('9', 1), id('7', 2)]), /SALE_LOCKED|Không đổi khách/);
  await expectError(asUser(db, owner, `update sales_records set due_date = sold_date - 1 where id = $1`, [id('9', 1)]), /không được trước ngày bán|BILL_INVALID/);
});

test('khách phải cùng cơ sở, đang dùng và là khách hàng; nhà cung ứng thuần bị từ chối', async () => {
  const { db, org, owner, stranger } = await setup();
  await expectError(sell(db, owner, org, { sale: 1, partner: 3 }), /PARTNER_INVALID|chưa được đánh dấu/); // NCC thuần
  await sell(db, owner, org, { sale: 2, partner: 4 }); // đối tác hai mặt: được
  await asUser(db, owner, `select * from update_partner($1,1,$2,$3::jsonb)`, [id('7', 2), id('c', 5), JSON.stringify({ is_active: false })]);
  await expectError(sell(db, owner, org, { sale: 3, partner: 2 }), /đã dừng|PARTNER_INVALID/);
  // người ngoài không thấy công nợ và không bán với khách của cơ sở khác
  assert.equal((await recv(db, stranger, org)).length, 0);
  const org2 = (await asUser(db, stranger, `select create_organization('household','Hộ B') id`)).rows[0].id;
  await expectError(asUser(db, stranger, `select * from record_sale($1,$2,$3,vn_today(),1,1000,null,$4,null,null,0,'cash')`, [id('9', 9), org2, CYC, id('7', 1)]), /row-level|PARTNER_INVALID|không thuộc|cycle/i);
});

test('tình trạng hạn: quá hạn, sắp đến hạn, còn hạn, không nhập hạn; hạn không trước ngày bán', async () => {
  const { db, org, owner } = await setup();
  await sell(db, owner, org, { sale: 1, invoice: 'A', amount: 1000, date: await addDays(db, -20), due: await addDays(db, -2) });
  await sell(db, owner, org, { sale: 2, invoice: 'B', amount: 1000, date: await addDays(db, -1), due: await addDays(db, 5) });
  await sell(db, owner, org, { sale: 3, invoice: 'C', amount: 1000, due: await addDays(db, 30) });
  await sell(db, owner, org, { sale: 4, invoice: 'D', amount: 1000 }); // không nhập hạn
  const st = Object.fromEntries((await recv(db, owner, org)).map((x) => [x.invoice_no, x.status]));
  assert.deepEqual(st, { A: 'overdue', B: 'due_soon', C: 'ok', D: 'ok' });
  await expectError(sell(db, owner, org, { sale: 5, invoice: 'E', amount: 1000, due: await addDays(db, -3) }), /BILL_INVALID|không được trước ngày bán/);
});

test('báo cáo doanh thu theo khách: đã thu/còn thu; bán lẻ coi như thu đủ; lần thu đã hủy không tính; quyền theo Doanh thu', async () => {
  const { db, org, owner, mgr, worker } = await setup();
  await db.query(`update organization_memberships set permissions = '{"expenses":"view","sales":"view"}'::jsonb where user_id=$1`, [mgr]); // D83: quản lý xem chi phí/doanh thu khi được chủ cấp
  await sell(db, owner, org, { sale: 1, partner: 1, amount: 1000000, qty: 100, paid: 600000 });
  await sell(db, owner, org, { sale: 2, partner: 2, amount: 500000, qty: 50, paid: 500000 });
  await sell(db, owner, org, { sale: 3, partner: null, amount: 200000, qty: 20 });
  const rid = (await db.query(`select id from sale_receipts where sale_id=$1`, [id('9', 2)])).rows[0].id;
  await asUser(db, owner, `select * from void_sale_receipt($1,'Nhầm')`, [rid]);

  const r = await report(db, owner, org, 'customers');
  assert.equal(r.type, 'customers');
  const by = Object.fromEntries(r.rows.map((x) => [x.label, x]));
  assert.equal(Number(by['Khách An'].owed), 400000);
  assert.equal(Number(by['Khách Bình'].collected), 0); // lần thu đã hủy
  assert.equal(Number(by['Khách Bình'].owed), 500000);
  assert.equal(Number(by['Bán lẻ (không ghi khách)'].owed), 0);
  assert.equal(Number(by['Bán lẻ (không ghi khách)'].amount), 200000);
  const m = await report(db, owner, org, 'customers', { group: 'month' });
  assert.equal(m.columns[0].label, 'Tháng');
  assert.equal(Number(m.rows[0].amount), 1700000);

  assert.ok((await report(db, mgr, org, 'customers')).rows.length > 0); // quản lý xem được (Doanh thu xem)
  await expectError(report(db, worker, org, 'customers'), /FORBIDDEN|quyền xem/);
  // các loại báo cáo cũ vẫn chạy
  assert.equal((await report(db, owner, org, 'sales')).type, 'sales');
  assert.equal((await report(db, owner, org, 'purchases')).type, 'purchases');
  await asUser(db, owner, `insert into saved_reports (organization_id, name, report_type) values ($1,'Doanh thu khách','customers')`, [org]);
});

test('dữ liệu bán cũ không đổi: bán trực tiếp không khách không có công nợ và vẫn tính vào doanh thu', async () => {
  const { db, org, owner } = await setup();
  await asUser(db, owner, `insert into sales_records (id, organization_id, cycle_id, sold_date, quantity, amount) values ($1,$2,$3,vn_today(),10,50000)`, [id('9', 7), org, CYC]);
  assert.equal((await recv(db, owner, org, false)).length, 0);
  const s = await report(db, owner, org, 'sales');
  assert.equal(Number(s.rows[0].amount), 50000);
});
