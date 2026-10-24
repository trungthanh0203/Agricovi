import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0074 (D93): kế hoạch của vụ (sản lượng, ngân sách dự kiến) và số liệu tóm tắt của các vụ; quyền theo mục.

const wt = (code) => `(select id from work_types where organization_id is null and code='${code}')`;
const melon = `(select id from crop_types where organization_id is null and code='melon')`;
const CYC = '30000000-0000-4000-8000-0000000000d1';
const CYC2 = '30000000-0000-4000-8000-0000000000d2';
const id = (k, n) => `${k}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function setup() {
  const db = await createDb();
  await db.exec(`select set_config('agri.legacy_cycle_insert', 'off', false)`);
  const owner = await addUser(db, 1), mgr = await addUser(db, 2), wk = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['manager']::member_role[]),($1,$3,array['worker']::member_role[])`, [org, mgr, wk]);
  const area = (await asUser(db, owner, `insert into production_areas (id,organization_id,name) values (gen_random_uuid(),$1,'Nhà màng 1') returning id`, [org])).rows[0].id;
  const tpl = (await asUser(db, owner, `insert into cycle_templates (organization_id,crop_type_id,name) values ($1,${melon},'Mẫu') returning id`, [org])).rows[0].id;
  await asUser(db, owner, `insert into template_stages (template_id,work_type_id,duration_days) values ($1,${wt('irrigation')},3)`, [tpl]);
  for (const c of [CYC, CYC2]) await asUser(db, owner, `select create_cycle_from_template($1,$2,$3,$4,'2026-09-01'::date,'active'::cycle_status,null)`, [c, org, area, tpl]);
  const wid = (await db.query(`insert into worker_profiles (organization_id,user_id,full_name) values ($1,$2,'An') returning id`, [org, wk])).rows[0].id;
  // vụ 1: chi 100.000 (nhân công, tiền mặt), thu hoạch 100 kg hao 10, bán 50 kg được 500.000 (khách nợ 200.000), 2 giờ công, 1 nhật ký
  await db.query(`insert into expense_records (id,organization_id,cycle_id,category,kind,amount,expense_date) values ($1,$2,$3,'labor','cash_paid',100000,'2026-09-05')`, [id('b', 1), org, CYC]);
  await db.query(`insert into harvest_records (id,organization_id,cycle_id,harvested_at,quantity,loss_quantity) values ($1,$2,$3,'2026-09-20 07:00+07',100,10)`, [id('d', 1), org, CYC]);
  await db.query(`insert into partners (id,organization_id,name,is_supplier,is_customer) values ($1,$2,'Khách A',false,true)`, [id('7', 1), org]);
  await db.query(`insert into sales_records (id,organization_id,cycle_id,sold_date,quantity,amount,partner_id) values ($1,$2,$3,'2026-09-21',50,500000,$4)`, [id('c', 1), org, CYC, id('7', 1)]);
  await db.query(`insert into sale_receipts (id,organization_id,sale_id,received_on,amount) values ($1,$2,$3,'2026-09-22',300000)`, [id('e', 1), org, id('c', 1)]).catch(() => undefined);
  await db.query(`insert into attendance_records (id,organization_id,worker_id,work_date,started_at,ended_at,source,status,approved_minutes,cycle_id) values ($1,$2,$3,'2026-09-06','2026-09-06 07:00+07','2026-09-06 09:00+07','admin','confirmed',120,$4)`, [id('a', 1), org, wid, CYC]);
  await db.query(`insert into activity_logs (id,organization_id,cycle_id,work_type_id,performed_at,data) values ($1,$2,$3,${wt('irrigation')},now(),'{}')`, [id('f', 1), org, CYC]);
  return { db, owner, mgr, wk, org };
}
const stats = async (c, u) => (await asUser(c.db, u, `select get_cycles_stats($1) r`, [c.org])).rows[0].r;
const of = (s, cyc) => s.cycles.find((x) => x.cycle_id === cyc);

test('kế hoạch của vụ: người quản lý vụ đặt được; giá trị âm bị từ chối; nhân viên không đặt được', async () => {
  const c = await setup();
  await asUser(c.db, c.owner, `select set_cycle_plan($1, 5000, 2000000)`, [CYC]);
  const row = (await c.db.query(`select target_yield_kg::float t, budget_amount::float b from production_cycles where id=$1`, [CYC])).rows[0];
  assert.deepEqual([row.t, row.b], [5000, 2000000]);
  assert.match(await expectError(asUser(c.db, c.owner, `select set_cycle_plan($1, -1, 1)`, [CYC])), /INVALID_AMOUNT/);
  assert.match(await expectError(asUser(c.db, c.wk, `select set_cycle_plan($1, 1, 1)`, [CYC])), /FORBIDDEN/);
  await asUser(c.db, c.owner, `select set_cycle_plan($1, null, null)`, [CYC]);
  assert.equal((await c.db.query(`select target_yield_kg t from production_cycles where id=$1`, [CYC])).rows[0].t, null);
});

test('số liệu tóm tắt của chủ: chi phí, thu hoạch, doanh thu, lãi/lỗ, phải thu, giờ công, nhật ký, kế hoạch', async () => {
  const c = await setup();
  await asUser(c.db, c.owner, `select set_cycle_plan($1, 500, 400000)`, [CYC]);
  const s = await stats(c, c.owner);
  assert.deepEqual([s.can_money, s.can_ops, s.cycles.length], [true, true, 2]);
  const v = of(s, CYC);
  assert.deepEqual([Number(v.cost_total), Number(v.cost_other), Number(v.cost_labor), Number(v.cost_material)], [100000, 100000, 0, 0]);
  assert.deepEqual([Number(v.harvest_gross), Number(v.harvest_loss), Number(v.harvest_net)], [100, 10, 90]);
  assert.deepEqual([Number(v.sold), Number(v.unsold), Number(v.revenue), Number(v.avg_price)], [50, 40, 500000, 10000]);
  assert.deepEqual([Number(v.profit), Number(v.profit_per_kg), Number(v.cost_per_kg)], [400000, 4444, 1111]);
  assert.deepEqual([v.labor_hours, v.workers, v.logs], [2, 1, 1]);
  assert.equal(Number(v.receivable), 200000); // bán 500.000, đã thu 300.000
  assert.deepEqual([Number(v.target_yield_kg), Number(v.budget_amount)], [500, 400000]);
  assert.ok(v.days_planned >= 1 && v.days_elapsed >= 1);
  const empty = of(s, CYC2); // vụ chưa có số liệu
  assert.deepEqual([Number(empty.cost_total), Number(empty.harvest_net), Number(empty.revenue), empty.missing_harvest, empty.missing_revenue], [0, 0, 0, true, true]);
});

test('quyền: quản lý chưa có quyền Tổng kết không thấy tiền, vẫn thấy tiến độ/giờ công; nhân viên chỉ thấy phần cơ bản; người ngoài bị chặn', async () => {
  const c = await setup();
  const m = of(await stats(c, c.mgr), CYC);
  assert.deepEqual([m.cost_total, m.revenue, m.profit, m.budget_amount], [null, null, null, null]);
  assert.deepEqual([m.labor_hours, m.workers, m.logs], [2, 1, 1]);
  assert.equal(Number(m.harvest_net), 90); // mặc định quản lý xem được Thu hoạch
  await asUser(c.db, c.owner, `select set_member_permissions($1,$2,$3::jsonb)`, [c.org, c.mgr, JSON.stringify({ summary: 'view' })]);
  assert.equal(Number(of(await stats(c, c.mgr), CYC).cost_total), 100000);
  const w = await stats(c, c.wk);
  assert.deepEqual([w.can_ops, of(w, CYC).labor_hours, of(w, CYC).cost_total], [false, null, null]);
  const stranger = await addUser(c.db, 9);
  assert.match(await expectError(asUser(c.db, stranger, `select get_cycles_stats($1)`, [c.org])), /FORBIDDEN/);
});
