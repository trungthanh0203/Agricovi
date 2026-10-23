import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0062 (G2-7, D80): báo cáo tuần cho chủ và quản lý; so sánh tuần trước; số liệu từng ngày; điểm cần chú ý; kiểm quyền từng chỉ số.

const id = (k, n) => `${k}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const AREA = id('2', 1);
const CYC = id('3', 1);
const LOC = id('5', 1);
const MAT = id('6', 1);

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const mgr = await addUser(db, 2);
  const worker = await addUser(db, 3);
  const fin = await addUser(db, 4);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[]),($1,$3,array['worker']::member_role[]),($1,$4,array['inventory_finance']::member_role[])`, [org, mgr, worker, fin]);
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'N1')`, [AREA, org]);
  await db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status) values ($1,$2,$3,(select id from crop_types limit 1),'active')`, [CYC, org, AREA]);
  return { db, org, owner, mgr, worker, fin };
}
// ngày thứ Hai của tuần hiện tại (giờ Việt Nam) cộng k ngày
const day = async (db, k) => (await db.query(`select (date_trunc('week', vn_today())::date + $1::int)::text d`, [k])).rows[0].d;
const weekly = async (db, u, org, d = null) => (await asUser(db, u, `select get_weekly_report($1,$2::date) r`, [org, d])).rows[0].r;

async function seed(c) {
  const lastMon = await day(c.db, -7), lastWed = await day(c.db, -5), prevWed = await day(c.db, -12);
  // tuần vừa qua: 2 nhật ký, chi 1.000.000, bán 3.000.000, thu hoạch 95 kg
  for (const [n, d] of [[1, lastMon], [2, lastWed]]) {
    await c.db.query(`insert into activity_logs (id, organization_id, cycle_id, work_type_id, performed_at, data) values ($1,$2,$3,(select id from work_types limit 1),($4::date + time '09:00')::timestamptz,'{}')`, [id('a', n), c.org, CYC, d]);
  }
  await c.db.query(`insert into expense_records (id, organization_id, cycle_id, category, kind, amount, expense_date) values ($1,$2,$3,'labor','cash_paid',1000000,$4), ($5,$2,$3,'material','cash_paid',7777777,$4)`, [id('b', 1), c.org, CYC, lastWed, id('b', 2)]);
  await c.db.query(`insert into sales_records (id, organization_id, cycle_id, sold_date, quantity, amount) values ($1,$2,$3,$4,30,3000000)`, [id('c', 1), c.org, CYC, lastWed]);
  await c.db.query(`insert into harvest_records (id, organization_id, cycle_id, harvested_at, quantity, loss_quantity) values ($1,$2,$3,($4::date + time '07:00')::timestamptz,100,5)`, [id('d', 1), c.org, CYC, lastWed]);
  // tuần trước nữa: 1 nhật ký, chi 400.000
  await c.db.query(`insert into activity_logs (id, organization_id, cycle_id, work_type_id, performed_at, data) values ($1,$2,$3,(select id from work_types limit 1),($4::date + time '09:00')::timestamptz,'{}')`, [id('a', 9), c.org, CYC, prevWed]);
  await c.db.query(`insert into expense_records (id, organization_id, cycle_id, category, kind, amount, expense_date) values ($1,$2,$3,'labor','cash_paid',400000,$4)`, [id('b', 3), c.org, CYC, prevWed]);
}

test('tuần vừa qua (mặc định): đúng số liệu, đúng quy tắc chi phí, có so sánh tuần trước và số liệu từng ngày', async () => {
  const c = await setup();
  await seed(c);
  const r = await weekly(c.db, c.owner, c.org);
  assert.equal(r.week_start, await day(c.db, -7));
  assert.equal(r.week_end, await day(c.db, -1));
  assert.equal(r.is_current_week, false);
  assert.equal(r.cur.logs, 2);
  assert.equal(Number(r.cur.cost), 1000000); // bỏ tiền mua vật tư
  assert.equal(Number(r.cur.revenue), 3000000);
  assert.equal(Number(r.cur.harvest_kg), 95);
  assert.equal(r.prev.logs, 1);
  assert.equal(Number(r.prev.cost), 400000);
  assert.equal(r.daily.length, 7);
  assert.equal(r.daily[0].logs, 1); // thứ Hai
  assert.equal(r.daily[2].logs, 1); // thứ Tư
  assert.equal(Number(r.daily[2].revenue), 3000000);
  assert.equal(r.daily.reduce((s, x) => s + x.logs, 0), 2);
});

test('chọn tuần bất kỳ bằng ngày trong tuần; không xem tuần chưa tới; tuần này là tuần hiện tại', async () => {
  const c = await setup();
  await seed(c);
  const mid = await weekly(c.db, c.owner, c.org, await day(c.db, -4)); // một ngày giữa tuần vừa qua
  assert.equal(mid.week_start, await day(c.db, -7));
  const now = await weekly(c.db, c.owner, c.org, await day(c.db, 0));
  assert.equal(now.is_current_week, true);
  await expectError(weekly(c.db, c.owner, c.org, await day(c.db, 8)), /Chưa tới tuần này/);
  await expectError(weekly(c.db, c.owner, c.org, '2020-01-01'), /2 năm/);
});

test('quyền: chỉ chủ và quản lý; chỉ số không có quyền xem trả null', async () => {
  const c = await setup();
  await seed(c);
  await expectError(weekly(c.db, c.worker, c.org), /FORBIDDEN|Chỉ chủ và quản lý/);
  await expectError(weekly(c.db, c.fin, c.org), /FORBIDDEN|Chỉ chủ và quản lý/); // Kho & chi phí không phải quản lý
  const m = await weekly(c.db, c.mgr, c.org);
  assert.equal(Number(m.cur.cost), 1000000); // quản lý xem được Chi phí, Doanh thu, Thu hoạch (mức xem)
  await asUser(c.db, c.owner, `select set_member_permissions($1,$2,$3::jsonb)`, [c.org, c.mgr, JSON.stringify({ expenses: 'none', sales: 'none' })]);
  const limited = await weekly(c.db, c.mgr, c.org);
  assert.equal(limited.cur.cost, null);
  assert.equal(limited.cur.revenue, null);
  assert.equal(limited.attention.overdue_payables, null);
  assert.equal(limited.daily[2].cost, null);
  assert.equal(limited.cur.logs, 2); // số việc đã ghi không phụ thuộc quyền tiền
});

test('điểm cần chú ý: nợ quá hạn, tồn thấp, vụ trễ, công chờ xác nhận, đơn website chờ báo giá', async () => {
  const c = await setup();
  const yday = (await c.db.query(`select (vn_today() - 1)::text d`)).rows[0].d;
  const old = (await c.db.query(`select (vn_today() - 20)::text d`)).rows[0].d;
  // hóa đơn mua quá hạn còn nợ 300.000
  await c.db.query(`insert into partners (id, organization_id, name) values ($1,$2,'NCC')`, [id('7', 1), c.org]);
  await c.db.query(`insert into purchase_bills (id, organization_id, partner_id, bill_date, due_date, total_amount) values ($1,$2,$3,$4,$5,500000)`, [id('9', 1), c.org, id('7', 1), old, yday]);
  await c.db.query(`insert into bill_payments (id, organization_id, bill_id, paid_on, amount) values ($1,$2,$3,$4,200000)`, [id('9', 2), c.org, id('9', 1), old]);
  // khoản phải thu quá hạn 800.000
  await c.db.query(`insert into partners (id, organization_id, name, is_supplier, is_customer) values ($1,$2,'Khách',false,true)`, [id('7', 2), c.org]);
  await c.db.query(`insert into sales_records (id, organization_id, cycle_id, sold_date, quantity, amount, partner_id, due_date) values ($1,$2,$3,$4,10,800000,$5,$6)`, [id('c', 1), c.org, CYC, old, id('7', 2), yday]);
  // tồn thấp: ngưỡng 10, tồn 5
  await c.db.query(`insert into inventory_locations (id,organization_id,name) values ($1,$2,'Kho')`, [LOC, c.org]);
  await c.db.query(`insert into materials (id,organization_id,name,base_unit_id,reorder_threshold) values ($1,$2,'Phân',(select id from units_of_measure where code='kg'),10)`, [MAT, c.org]);
  await c.db.query(`insert into inventory_transactions (id, organization_id, location_id, material_id, txn_type, quantity_delta, txn_date) values ($1,$2,$3,$4,'receipt',5,$5)`, [id('8', 1), c.org, LOC, MAT, old]);
  // vụ trễ: giai đoạn chưa xong đã quá hạn
  await c.db.query(`insert into production_stages (id, cycle_id, name, seq, status, planned_start, planned_end) values ($1,$2,'Tưới',1,'in_progress',$3,$4)`, [id('1', 1), CYC, old, yday]);
  // đơn website chờ báo giá
  const buyer = await addUser(c.db, 9);
  await c.db.query(`insert into web_orders (id, code, buyer_id, organization_id, supplier_name, status, recipient, recipient_phone, province, address) values ($1,'DH-1',$2,$3,'Hộ A','placed','Nam','0987654321','LA','12 A')`, [id('e', 1), buyer, c.org]);

  const a = (await weekly(c.db, c.owner, c.org)).attention;
  assert.deepEqual([a.overdue_payables.count, Number(a.overdue_payables.amount)], [1, 300000]);
  assert.deepEqual([a.overdue_receivables.count, Number(a.overdue_receivables.amount)], [1, 800000]);
  assert.equal(a.low_stock, 1);
  assert.equal(a.late_cycles, 1);
  assert.equal(a.web_orders_waiting, 1);
  assert.equal(a.pending_attendance, 0);
});

test('hàm nội bộ không gọi trực tiếp được; người ngoài bị từ chối', async () => {
  const c = await setup();
  const stranger = await addUser(c.db, 8);
  await expectError(weekly(c.db, stranger, c.org), /FORBIDDEN|Chỉ chủ và quản lý/);
  await expectError(asUser(c.db, c.owner, `select weekly_metrics($1, vn_today(), vn_today(), true, true, true, true, true)`, [c.org]), /permission denied/i);
});
