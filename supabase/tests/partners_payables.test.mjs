import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, asAnon, expectError } from './harness.mjs';

// Migration 0055 (G2-2, D76): đối tác, hóa đơn mua, công nợ phải trả. Quyền gộp với mục Chi phí.

const id = (k, n) => `${k}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const LOC = id('5', 1);
const MAT1 = id('6', 1);
const MAT2 = id('6', 2);

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const mgr = await addUser(db, 2);
  const worker = await addUser(db, 3);
  const fin = await addUser(db, 4);
  const stranger = await addUser(db, 5);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[]),($1,$3,array['worker']::member_role[]),($1,$4,array['inventory_finance']::member_role[])`, [org, mgr, worker, fin]);
  await db.query(`insert into inventory_locations (id,organization_id,name) values ($1,$2,'Kho')`, [LOC, org]);
  await db.query(`insert into materials (id,organization_id,name,base_unit_id) values ($1,$2,'Phân NPK',(select id from units_of_measure where code='kg')),($3,$2,'MKP',(select id from units_of_measure where code='kg'))`, [MAT1, org, MAT2]);
  return { db, org, owner, mgr, worker, fin, stranger };
}

const today = async (db) => (await db.query(`select vn_today()::text d`)).rows[0].d;
const addDays = async (db, n) => (await db.query(`select (vn_today() + $1::int)::text d`, [n])).rows[0].d;

const newPartner = (db, u, org, n, name = `NCC ${n}`) =>
  asUser(db, u, `insert into partners (id, organization_id, name, phone) values ($1,$2,$3,'0900000000')`, [id('7', n), org, name]);

const lines = (a = 10, b = 5) => JSON.stringify([
  { id: id('8', 1), location_id: LOC, material_id: MAT1, quantity: a, unit_cost: 20000 },
  { id: id('8', 2), location_id: LOC, material_id: MAT2, quantity: b, unit_cost: 40000 },
]); // tổng dòng = 10×20.000 + 5×40.000 = 400.000

async function buy(db, u, org, { bill = 1, partner = 1, invoice = 'HD001', total = 400000, paid = 0, due = null, bdate = null, ln = lines() } = {}) {
  const d = bdate ?? (await today(db));
  return asUser(db, u, `select * from record_purchase($1,$2,$3,$4,$5::date,$6::date,$7,$8,$9::jsonb,$10,'cash')`,
    [id('9', bill), org, id('7', partner), invoice, d, due, total, null, ln, paid]);
}
const payables = async (db, u, org, open = true) => (await asUser(db, u, `select get_payables($1,$2) j`, [org, open])).rows[0].j;
const stock = async (db, mat) => Number((await db.query(`select coalesce(sum(quantity_delta),0) b from inventory_transactions where material_id=$1`, [mat])).rows[0].b);

test('quyền gộp với Chi phí: chủ ghi; quản lý chỉ xem; nhân viên và người ngoài không thấy; khách chưa đăng nhập không thấy', async () => {
  const { db, org, owner, mgr, worker, fin, stranger } = await setup();
  await newPartner(db, owner, org, 1);
  await newPartner(db, fin, org, 2); // Kho & chi phí ghi được
  assert.equal((await asUser(db, mgr, `select id from partners`)).rows.length, 2); // quản lý xem được
  await expectError(newPartner(db, mgr, org, 3), /row-level security/i); // nhưng không ghi
  assert.equal((await asUser(db, worker, `select id from partners`)).rows.length, 0);
  await expectError(newPartner(db, worker, org, 4), /row-level security/i);
  assert.equal((await asUser(db, stranger, `select id from partners`)).rows.length, 0);
  await expectError(asAnon(db, `select id from partners`), /permission denied|row-level/i);
});

test('tên đối tác không trùng trong cơ sở (không phân biệt hoa thường)', async () => {
  const { db, org, owner } = await setup();
  await newPartner(db, owner, org, 1, 'Đại lý An Phát');
  await expectError(newPartner(db, owner, org, 2, '  đại lý an phát '), /duplicate key/i);
});

test('mua theo hóa đơn: tạo hóa đơn + dòng nhập kho + lần trả đầu cùng lúc; còn nợ tính đúng', async () => {
  const { db, org, owner } = await setup();
  await newPartner(db, owner, org, 1);
  const due = await addDays(db, 30);
  await buy(db, owner, org, { paid: 150000, due });
  assert.equal(await stock(db, MAT1), 10);
  assert.equal(await stock(db, MAT2), 5);
  const pay = await payables(db, owner, org);
  assert.equal(pay.length, 1);
  assert.equal(Number(pay[0].total_amount), 400000);
  assert.equal(Number(pay[0].paid), 150000);
  assert.equal(Number(pay[0].remaining), 250000);
  assert.equal(pay[0].status, 'ok');
  assert.equal((await db.query(`select count(*)::int n from inventory_transactions where bill_id = $1`, [id('9', 1)])).rows[0].n, 2);
});

test('mua lặp cùng mã không tạo thêm; lỗi ở một dòng thì không lưu gì cả', async () => {
  const { db, org, owner } = await setup();
  await newPartner(db, owner, org, 1);
  await buy(db, owner, org);
  await buy(db, owner, org); // bấm lặp
  assert.equal((await db.query(`select count(*)::int n from purchase_bills`)).rows[0].n, 1);
  assert.equal(await stock(db, MAT1), 10);

  const bad = JSON.stringify([{ id: id('8', 5), location_id: LOC, material_id: MAT1, quantity: 1, unit_cost: 1000 },
    { id: id('8', 6), location_id: LOC, material_id: id('6', 99), quantity: 1, unit_cost: 1000 }]);
  await assert.rejects(buy(db, owner, org, { bill: 2, invoice: 'HD002', ln: bad, total: 2000 }));
  assert.equal((await db.query(`select count(*)::int n from purchase_bills`)).rows[0].n, 1); // hóa đơn 2 không được tạo
  assert.equal(await stock(db, MAT1), 10); // dòng hợp lệ của hóa đơn lỗi cũng không vào kho
});

test('không trả quá số còn nợ; trả đủ thì hết nợ', async () => {
  const { db, org, owner } = await setup();
  await newPartner(db, owner, org, 1);
  await buy(db, owner, org, { paid: 100000 });
  await expectError(asUser(db, owner, `select * from pay_bill($1,$2,300001,vn_today(),'cash',null)`, [id('a', 1), id('9', 1)]), /OVERPAY/);
  await asUser(db, owner, `select * from pay_bill($1,$2,300000,vn_today(),'transfer','Chuyển khoản')`, [id('a', 1), id('9', 1)]);
  assert.equal((await payables(db, owner, org)).length, 0); // không còn hóa đơn nợ
  assert.equal((await payables(db, owner, org, false))[0].status, 'paid');
  // gọi lặp cùng mã lần trả: không ghi hai lần
  await asUser(db, owner, `select * from pay_bill($1,$2,300000,vn_today(),'transfer',null)`, [id('a', 1), id('9', 1)]);
  assert.equal((await db.query(`select count(*)::int n from bill_payments`)).rows[0].n, 2);
});

test('trả cho nhà cung ứng tự trừ vào hóa đơn cũ nhất trước; lặp cùng mã không ghi hai lần', async () => {
  const { db, org, owner } = await setup();
  await newPartner(db, owner, org, 1);
  const old = await addDays(db, -10);
  await buy(db, owner, org, { bill: 1, invoice: 'CU', total: 400000, bdate: old });
  const l2 = JSON.stringify([{ id: id('8', 7), location_id: LOC, material_id: MAT1, quantity: 5, unit_cost: 20000 }]);
  await buy(db, owner, org, { bill: 2, invoice: 'MOI', total: 100000, ln: l2 });
  const op = id('b', 1);
  const r = await asUser(db, owner, `select * from pay_partner($1,$2,450000,vn_today(),'cash',null)`, [op, id('7', 1)]);
  assert.equal(r.rows.length, 2);
  const open = await payables(db, owner, org);
  assert.equal(open.length, 1);
  assert.equal(open[0].invoice_no, 'MOI'); // hóa đơn cũ trả đủ 400.000 trước, hóa đơn mới còn 50.000
  assert.equal(Number(open[0].remaining), 50000);
  await asUser(db, owner, `select * from pay_partner($1,$2,450000,vn_today(),'cash',null)`, [op, id('7', 1)]); // lặp
  assert.equal((await db.query(`select count(*)::int n from bill_payments`)).rows[0].n, 2);
  await expectError(asUser(db, owner, `select * from pay_partner($1,$2,50001,vn_today(),'cash',null)`, [id('b', 2), id('7', 1)]), /OVERPAY/);
});

test('hủy lần trả làm nợ tăng lại; không hủy được hóa đơn còn lần trả; hủy hóa đơn không đảo kho', async () => {
  const { db, org, owner } = await setup();
  await newPartner(db, owner, org, 1);
  await buy(db, owner, org, { paid: 400000 });
  assert.equal((await payables(db, owner, org)).length, 0);
  const pid = (await db.query(`select id from bill_payments`)).rows[0].id;
  await expectError(asUser(db, owner, `select * from void_bill_payment($1,'')`, [pid]), /lý do/);
  await asUser(db, owner, `select * from void_bill_payment($1,'Ghi nhầm')`, [pid]);
  assert.equal(Number((await payables(db, owner, org))[0].remaining), 400000);

  const bill = (await db.query(`select version from purchase_bills where id=$1`, [id('9', 1)])).rows[0];
  const voidChanges = JSON.stringify({ voided_at: new Date().toISOString(), void_reason: 'Nhập nhầm' });
  await asUser(db, owner, `select * from pay_bill($1,$2,1000,vn_today(),'cash',null)`, [id('a', 2), id('9', 1)]);
  await expectError(asUser(db, owner, `select * from update_bill($1,$2,$3,$4::jsonb)`, [id('9', 1), bill.version, id('c', 1), voidChanges]), /HAS_PAYMENTS|hủy các lần trả/);
  await asUser(db, owner, `select * from void_bill_payment($1,'Hủy')`, [id('a', 2)]);
  await asUser(db, owner, `select * from update_bill($1,$2,$3,$4::jsonb)`, [id('9', 1), bill.version, id('c', 1), voidChanges]);
  assert.equal((await payables(db, owner, org)).length, 0);
  assert.equal(await stock(db, MAT1), 10); // kho không bị đảo
  await expectError(asUser(db, owner, `select * from pay_bill($1,$2,1000,vn_today(),'cash',null)`, [id('a', 3), id('9', 1)]), /đã hủy/);
});

test('sửa hóa đơn: đổi số hóa đơn/hạn có kiểm tra phiên bản; tổng tiền và ngày mua bất biến', async () => {
  const { db, org, owner } = await setup();
  await newPartner(db, owner, org, 1);
  await buy(db, owner, org, { invoice: 'HD-A' });
  const due = await addDays(db, 20);
  const r = await asUser(db, owner, `select * from update_bill($1,1,$2,$3::jsonb)`, [id('9', 1), id('c', 1), JSON.stringify({ invoice_no: 'HD-B', due_date: due })]);
  assert.equal(r.rows[0].invoice_no, 'HD-B');
  assert.equal(r.rows[0].version, 2);
  await expectError(asUser(db, owner, `select * from update_bill($1,1,$2,$3::jsonb)`, [id('9', 1), id('c', 2), JSON.stringify({ note: 'x' })]), /CONFLICT|thay đổi/);
  await expectError(asUser(db, owner, `update purchase_bills set total_amount = 1 where id = $1`, [id('9', 1)]), /BILL_LOCKED|Không sửa được tổng tiền/);
  await expectError(asUser(db, owner, `update purchase_bills set bill_date = bill_date - 1 where id = $1`, [id('9', 1)]), /BILL_LOCKED/);
});

test('không nhập trùng số hóa đơn của cùng nhà cung ứng; hủy rồi nhập lại được', async () => {
  const { db, org, owner } = await setup();
  await newPartner(db, owner, org, 1);
  await newPartner(db, owner, org, 2);
  await buy(db, owner, org, { bill: 1, invoice: 'HD-77' });
  const l2 = JSON.stringify([{ id: id('8', 9), location_id: LOC, material_id: MAT1, quantity: 1, unit_cost: 1000 }]);
  await expectError(buy(db, owner, org, { bill: 2, invoice: ' hd-77 ', total: 1000, ln: l2 }), /DUPLICATE_INVOICE|đã được nhập/);
  const l3 = JSON.stringify([{ id: id('8', 10), location_id: LOC, material_id: MAT1, quantity: 1, unit_cost: 1000 }]);
  await buy(db, owner, org, { bill: 3, partner: 2, invoice: 'HD-77', total: 1000, ln: l3 }); // nhà cung ứng khác thì được
  await asUser(db, owner, `select * from update_bill($1,1,$2,$3::jsonb)`, [id('9', 1), id('c', 3), JSON.stringify({ voided_at: new Date().toISOString(), void_reason: 'Sai' })]);
  const l4 = JSON.stringify([{ id: id('8', 11), location_id: LOC, material_id: MAT1, quantity: 1, unit_cost: 1000 }]);
  await buy(db, owner, org, { bill: 4, invoice: 'HD-77', total: 1000, ln: l4 });
});

test('tình trạng hạn: quá hạn, sắp đến hạn, còn hạn; hạn không trước ngày mua', async () => {
  const { db, org, owner } = await setup();
  await newPartner(db, owner, org, 1);
  const mk = (n) => JSON.stringify([{ id: id('8', 20 + n), location_id: LOC, material_id: MAT1, quantity: 1, unit_cost: 1000 }]);
  await buy(db, owner, org, { bill: 1, invoice: 'A', total: 1000, bdate: await addDays(db, -20), due: await addDays(db, -2), ln: mk(1) });
  await buy(db, owner, org, { bill: 2, invoice: 'B', total: 1000, bdate: await addDays(db, -1), due: await addDays(db, 5), ln: mk(2) });
  await buy(db, owner, org, { bill: 3, invoice: 'C', total: 1000, due: await addDays(db, 30), ln: mk(3) });
  const st = Object.fromEntries((await payables(db, owner, org)).map((x) => [x.invoice_no, x.status]));
  assert.deepEqual(st, { A: 'overdue', B: 'due_soon', C: 'ok' });
  await expectError(buy(db, owner, org, { bill: 5, invoice: 'D', total: 1000, due: await addDays(db, -3), ln: mk(5) }), /purchase_bills_check|check constraint/i);
});

test('cô lập cơ sở: không dùng đối tác của cơ sở khác; người ngoài không xem công nợ', async () => {
  const { db, org, owner, stranger } = await setup();
  const org2 = (await asUser(db, stranger, `select create_organization('household','Hộ B') id`)).rows[0].id;
  await newPartner(db, owner, org, 1);
  await buy(db, owner, org, { invoice: 'X' });
  assert.equal((await payables(db, stranger, org)).length, 0); // RLS: người ngoài không thấy gì
  assert.equal((await payables(db, stranger, org2)).length, 0);
  // người ngoài không tạo hóa đơn với đối tác của cơ sở khác
  await expectError(asUser(db, stranger, `select * from record_purchase($1,$2,$3,'Z',vn_today(),null,1000,null,$4::jsonb,0,'cash')`,
    [id('9', 9), org2, id('7', 1), JSON.stringify([{ id: id('8', 30), location_id: LOC, material_id: MAT1, quantity: 1, unit_cost: 1000 }])]), /PARTNER_INVALID|row-level|không thuộc/);
});

test('người chỉ có quyền Chi phí (không có quyền Kho) không tự nhập kho qua hóa đơn; quản lý chỉ xem công nợ', async () => {
  const { db, org, owner, mgr } = await setup();
  await newPartner(db, owner, org, 1);
  await buy(db, owner, org, { invoice: 'Y' });
  assert.equal((await payables(db, mgr, org)).length, 1); // quản lý xem được công nợ (quyền xem Chi phí)
  await expectError(asUser(db, mgr, `select * from pay_bill($1,$2,1000,vn_today(),'cash',null)`, [id('a', 9), id('9', 1)]), /row-level security|permission/i);
});
