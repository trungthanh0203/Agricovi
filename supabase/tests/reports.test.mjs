import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0036 (D48): báo cáo theo nhu cầu — kiểm quyền theo mục, số liệu từng loại, báo cáo đã lưu.
const id = (n) => `83000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), mgr = await addUser(db, 2), wk = await addUser(db, 3), fin = await addUser(db, 4), other = await addUser(db, 5);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await asUser(db, other, `select create_organization('household','Hộ B') id`);
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values
    ($1,$2,array['manager']::member_role[]),($1,$3,array['worker']::member_role[]),($1,$4,array['inventory_finance']::member_role[])`, [org, mgr, wk, fin]);
  const area = (await asUser(db, owner, `insert into production_areas (id,organization_id,name) values (gen_random_uuid(),$1,'T') returning id`, [org])).rows[0].id;
  const cyc = id(900);
  await db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status,name,created_by,start_date) values ($1,$2,$3,(select id from crop_types limit 1),'active','Vụ xuân',$4,current_date - 20)`, [cyc, org, area, owner]);
  await db.query(`insert into expense_records (id,organization_id,cycle_id,category,kind,amount,expense_date) values
    ($1,$3,$2,'utility','cash_paid',100000,current_date - 5), ($4,$3,$2,'labor','cash_paid',300000,current_date - 4),
    ($5,$3,$2,'material','cash_paid',999999,current_date - 4)`, [id(1), cyc, org, id(2), id(3)]);
  await db.query(`insert into sales_records (id,organization_id,cycle_id,sold_date,quantity,amount) values ($1,$2,$3,current_date - 2,50,2500000)`, [id(10), org, cyc]);
  await db.query(`insert into harvest_records (id,organization_id,cycle_id,harvested_at,quantity,loss_quantity,grade) values ($1,$2,$3,now() - interval '3 days',80,5,'Loại 1')`, [id(11), org, cyc]);
  return { db, owner, mgr, wk, fin, other, org, cyc };
}
const run = (db, u, org, type, params = {}) => asUser(db, u, `select run_report($1,$2,$3::jsonb) r`, [org, type, JSON.stringify(params)]).then((x) => x.rows[0].r);

test('chi phí: gom theo nhóm, bỏ tiền mua vật tư; theo vụ; lọc ngày/vụ', async () => {
  const { db, owner, org } = await setup();
  let r = await run(db, owner, org, 'expenses');
  assert.deepEqual(Object.fromEntries(r.rows.map((x) => [x.label, Number(x.amount)])), { 'Điện nước': 100000, 'Nhân công': 300000 });
  r = await run(db, owner, org, 'expenses', { group: 'cycle' });
  assert.deepEqual(r.rows.map((x) => [x.label, Number(x.amount)]), [['Vụ xuân', 400000]]);
  r = await run(db, owner, org, 'expenses', { from: '2000-01-01', to: '2000-01-31' });
  assert.deepEqual(r.rows, []);
  r = await run(db, owner, org, 'expenses', { cycle_id: id(999) });
  assert.deepEqual(r.rows, []);
  assert.match(await expectError(run(db, owner, org, 'expenses', { from: '2026-02-01', to: '2026-01-01' })), /INVALID_DATE/);
});

test('doanh thu, thu hoạch, vật tư, nhân công, tổng hợp theo vụ', async () => {
  const { db, owner, org, cyc } = await setup();
  const s = await run(db, owner, org, 'sales', { group: 'cycle' });
  assert.deepEqual([s.rows[0].label, Number(s.rows[0].qty), Number(s.rows[0].amount)], ['Vụ xuân', 50, 2500000]);
  const h = await run(db, owner, org, 'harvest', { group: 'grade' });
  assert.deepEqual([h.rows[0].label, Number(h.rows[0].gross), Number(h.rows[0].loss), Number(h.rows[0].net)], ['Loại 1', 80, 5, 75]);

  const loc = (await db.query(`insert into inventory_locations (id,organization_id,name) values ($1,$2,'Kho') returning id`, [id(20), org])).rows[0].id;
  const mat = (await db.query(`select id from materials where organization_id=$1 and name='Urê'`, [org])).rows[0].id;
  await db.query(`insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,txn_date) values
    ($1,$5,$2,$3,'receipt',10,current_date - 3),($4,$5,$2,$3,'issue',-4,current_date - 2)`, [id(21), loc, mat, id(22), org]);
  const st = await run(db, owner, org, 'stock');
  assert.deepEqual([st.rows[0].label, Number(st.rows[0].receipt), Number(st.rows[0].issue), Number(st.rows[0].net)], ['Urê', 10, -4, 6]);

  const w = (await db.query(`insert into worker_profiles (organization_id,full_name,work_mode) values ($1,'Bác Tư','leader_hourly') returning id`, [org])).rows[0].id;
  await db.query(`insert into attendance_records (id,worker_id,work_date,started_at,ended_at,source,status,approved_minutes,cycle_id) values
    ($1,$2,current_date - 3, now() - interval '3 days', now() - interval '3 days' + interval '4 hours','admin','confirmed',240,$3)`, [id(30), w, cyc]);
  const lb = await run(db, owner, org, 'labor');
  assert.deepEqual([lb.rows[0].label, Number(lb.rows[0].shifts), Number(lb.rows[0].hours), Number(lb.rows[0].pay)], ['Bác Tư', 1, 4, 0]);

  const cy = await run(db, owner, org, 'cycles');
  assert.equal(cy.rows[0].label, 'Vụ xuân');
  assert.equal(Number(cy.rows[0].cost), 400000);
  assert.equal(Number(cy.rows[0].revenue), 2500000);
  assert.equal(Number(cy.rows[0].net), 75);
});

test('quyền theo loại báo cáo: theo mục D27 và vai trò', async () => {
  const { db, owner, mgr, wk, fin, other, org } = await setup();
  for (const t of ['expenses', 'sales', 'stock', 'labor', 'cycles']) assert.match(await expectError(run(db, wk, org, t)), /FORBIDDEN/);
  await run(db, wk, org, 'harvest'); // nhân viên ghi/xem thu hoạch theo mặc định
  await run(db, mgr, org, 'expenses');
  await run(db, mgr, org, 'labor');
  await run(db, fin, org, 'stock');
  await run(db, fin, org, 'expenses');
  assert.match(await expectError(run(db, fin, org, 'labor')), /FORBIDDEN/);
  assert.match(await expectError(run(db, other, org, 'expenses')), /FORBIDDEN/); // người ngoài cơ sở
  await asUser(db, owner, `select set_member_permissions($1,$2,'{"sales":"view"}'::jsonb)`, [org, wk]); // chủ cấp riêng
  await run(db, wk, org, 'sales');
  assert.match(await expectError(run(db, owner, org, 'unknown')), /FORBIDDEN/);
});

test('báo cáo đã lưu: của tôi chỉ mình thấy, chia sẻ thì cả cơ sở thấy; người ngoài không; người xem vẫn bị kiểm quyền khi chạy', async () => {
  const { db, owner, mgr, wk, other, org } = await setup();
  const ins = (u, name, shared) => asUser(db, u, `insert into saved_reports (organization_id,name,report_type,params,shared) values ($1,$2,'expenses','{"group":"month"}'::jsonb,$3)`, [org, name, shared]);
  await ins(mgr, 'Chi phí theo tháng (của tôi)', false);
  await ins(mgr, 'Chi phí chia sẻ', true);
  const names = async (u) => (await asUser(db, u, `select name from saved_reports order by name`)).rows.map((r) => r.name);
  assert.equal((await names(mgr)).length, 2);
  assert.deepEqual(await names(wk), ['Chi phí chia sẻ']);
  assert.deepEqual(await names(other), []);
  assert.match(await expectError(run(db, wk, org, 'expenses')), /FORBIDDEN/); // thấy tên báo cáo nhưng không chạy được
  assert.match(await expectError(asUser(db, wk, `insert into saved_reports (organization_id,owner_id,name,report_type) values ($1,$2,'Giả mạo','expenses')`, [org, mgr])), /row-level security/);
  assert.match(await expectError(asUser(db, wk, `insert into saved_reports (organization_id,name,report_type) values ($1,'Xyz','bậy')`, [org])), /check/i);
  assert.equal((await asUser(db, wk, `delete from saved_reports where shared returning id`)).rows.length, 0);
  assert.equal((await asUser(db, owner, `delete from saved_reports where shared returning id`)).rows.length, 1);
});
