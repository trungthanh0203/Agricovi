import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0061 (G2-7 biểu đồ, D79): số liệu theo tháng cho biểu đồ Trang chủ và báo cáo giờ công theo phòng/tổ.

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
  return { db, org, owner, mgr, worker, stranger };
}
const series = async (db, u, org, months = 6) => (await asUser(db, u, `select get_period_series($1,$2) j`, [org, months])).rows[0].j;
const monthsAgo = async (db, k) => (await db.query(`select to_char((date_trunc('month', now() at time zone 'Asia/Ho_Chi_Minh') - make_interval(months => $1))::date + 4, 'YYYY-MM-DD') d`, [k])).rows[0].d;

test('chuỗi theo tháng: đủ số tháng, tháng trống = 0, đúng tháng, đúng quy tắc chi phí (bỏ tiền mua vật tư, bỏ khoản hủy)', async () => {
  const { db, org, owner } = await setup();
  const d0 = await monthsAgo(db, 0);
  const d2 = await monthsAgo(db, 2);
  await db.query(`insert into expense_records (id, organization_id, cycle_id, category, kind, amount, expense_date) values
    ($1,$2,$3,'labor','cash_paid',1000000,$4), ($5,$2,$3,'material','cash_paid',9999999,$4), ($6,$2,$3,'utility','cash_paid',300000,$7)`, [id('b', 1), org, CYC, d0, id('b', 2), id('b', 3), d2]);
  await db.query(`insert into expense_records (id, organization_id, cycle_id, category, kind, amount, expense_date, voided_at, void_reason) values ($1,$2,$3,'labor','cash_paid',5000000,$4,now(),'nhầm')`, [id('b', 4), org, CYC, d0]);
  await db.query(`insert into sales_records (id, organization_id, cycle_id, sold_date, quantity, amount) values ($1,$2,$3,$4,10,2500000)`, [id('c', 1), org, CYC, d0]);
  await db.query(`insert into harvest_records (id, organization_id, cycle_id, harvested_at, quantity, loss_quantity) values ($1,$2,$3,($4::date + time '10:00')::timestamptz,100,5)`, [id('d', 1), org, CYC, d0]);

  const s = await series(db, owner, org, 6);
  assert.equal(s.months.length, 6);
  assert.equal(s.cost.length, 6);
  assert.equal(Number(s.cost[5]), 1000000); // tháng hiện tại: không cộng tiền mua vật tư, không cộng khoản đã hủy
  assert.equal(Number(s.cost[3]), 300000); // 2 tháng trước
  assert.equal(Number(s.cost[4]), 0); // tháng trống = 0
  assert.equal(Number(s.revenue[5]), 2500000);
  assert.equal(Number(s.harvest_kg[5]), 95); // sau hao hụt
  assert.match(s.months[5], /^\d{4}-\d{2}$/);
  assert.equal((await series(db, owner, org, 100)).months.length, 12); // tối đa 12 tháng
  assert.equal((await series(db, owner, org, 0)).months.length, 1); // tối thiểu 1 tháng
});

test('quyền theo mục: mục không có quyền xem trả null; không có quyền nào thì từ chối', async () => {
  const { db, org, owner, mgr, worker, stranger } = await setup();
  await asUser(db, owner, `select set_member_permissions($1,$2,$3::jsonb)`, [org, worker, JSON.stringify({ sales: 'view' })]);
  const s = await series(db, worker, org);
  assert.equal(s.cost, null);
  assert.ok(Array.isArray(s.revenue));
  assert.equal(s.harvest_kg.length, 6); // nhân viên mặc định xem được Thu hoạch
  const m = await series(db, mgr, org); // quản lý xem được Chi phí, Doanh thu, Thu hoạch
  assert.ok(Array.isArray(m.cost) && Array.isArray(m.revenue));
  await asUser(db, owner, `select set_member_permissions($1,$2,$3::jsonb)`, [org, worker, JSON.stringify({ harvest: 'none', sales: 'none', expenses: 'none' })]);
  await expectError(series(db, worker, org), /FORBIDDEN|quyền/);
  await expectError(series(db, stranger, org), /FORBIDDEN|quyền/);
});

test('giờ công theo phòng/tổ: gom đúng tổ tại ngày công; người chưa có tổ vào "Chưa có tổ"; quyền như báo cáo giờ công', async () => {
  const { db, org, owner, mgr, worker } = await setup();
  const w1 = id('4', 1), w2 = id('4', 2), w3 = id('4', 3);
  await db.query(`insert into worker_profiles (id, organization_id, full_name) values ($1,$4,'Công'),($2,$4,'Dũng'),($3,$4,'Em')`, [w1, w2, w3, org]);
  const t1 = id('5', 1), t2 = id('5', 2);
  await db.query(`insert into worker_teams (id, organization_id, name) values ($1,$3,'Tổ Thụ phấn'),($2,$3,'Tổ Thu hoạch')`, [t1, t2, org]);
  await db.query(`insert into worker_team_memberships (team_id, worker_id, valid_from) values ($1,$3,'2020-01-01'),($2,$4,'2020-01-01')`, [t1, t2, w1, w2]);
  const d = await monthsAgo(db, 0);
  let n = 0;
  for (const [w, mins] of [[w1, 480], [w1, 240], [w2, 360], [w3, 120]]) {
    n++;
    await db.query(`insert into attendance_records (id, organization_id, worker_id, work_date, started_at, ended_at, status, approved_minutes, source)
                    values ($1,$2,$3,$4,($4::date + time '07:00')::timestamptz,($4::date + time '15:00')::timestamptz,'confirmed',$5,'admin')`, [id('a', n), org, w, d, mins]);
  }
  const r = (await asUser(db, owner, `select run_report($1,'labor',$2::jsonb) r`, [org, JSON.stringify({ from: d, to: d, group: 'team' })])).rows[0].r;
  assert.equal(r.columns[0].label, 'Phòng / Tổ');
  const by = Object.fromEntries(r.rows.map((x) => [x.label, x]));
  assert.equal(Number(by['Tổ Thụ phấn'].hours), 12); // 480 + 240 phút
  assert.equal(by['Tổ Thụ phấn'].shifts, 2);
  assert.equal(Number(by['Tổ Thu hoạch'].hours), 6);
  assert.equal(Number(by['Chưa có tổ'].hours), 2);
  assert.ok((await asUser(db, mgr, `select run_report($1,'labor',$2::jsonb) r`, [org, JSON.stringify({ from: d, to: d, group: 'team' })])).rows[0].r.rows.length > 0);
  await expectError(asUser(db, worker, `select run_report($1,'labor',$2::jsonb) r`, [org, JSON.stringify({ from: d, to: d, group: 'team' })]), /FORBIDDEN|quyền xem/);
  // nhóm cũ của giờ công vẫn chạy qua hàm cũ
  const byWorker = (await asUser(db, owner, `select run_report($1,'labor',$2::jsonb) r`, [org, JSON.stringify({ from: d, to: d, group: 'worker' })])).rows[0].r;
  assert.equal(byWorker.type, 'labor');
});

test('các báo cáo khác vẫn chạy sau khi dựng lại run_report', async () => {
  const { db, org, owner } = await setup();
  const p = JSON.stringify({});
  for (const t of ['expenses', 'sales', 'harvest', 'stock', 'cycles', 'purchases', 'customers']) {
    assert.equal((await asUser(db, owner, `select run_report($1,$2,$3::jsonb) r`, [org, t, p])).rows[0].r.type, t);
  }
});
