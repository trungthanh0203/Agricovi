import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser } from './harness.mjs';

// Migration 0208 (D171): công đã xác nhận nhưng chưa vào bảng lương được tính TẠM vào chi phí nhân công của vụ; không cộng trùng khi đã có bảng lương.

const id = (n) => `83000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), wk = await addUser(db, 2);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, wk]);
  const w1 = (await db.query(`insert into worker_profiles (organization_id,user_id,full_name,work_mode) values ($1,$2,'Công nhân','self_hourly') returning id`, [org, wk])).rows[0].id;
  const w2 = (await db.query(`insert into worker_profiles (organization_id,full_name,work_mode) values ($1,'Không có giá','self_hourly') returning id`, [org])).rows[0].id;
  const area = (await asUser(db, owner, `insert into production_areas (id,organization_id,name) values (gen_random_uuid(),$1,'Chuồng') returning id`, [org])).rows[0].id;
  const cyc = id(900);
  await db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status,created_by,start_date) values ($1,$2,$3,(select id from crop_types limit 1),'active',$4,current_date - 30)`, [cyc, org, area, owner]);
  await asUser(db, owner, `insert into work_rates (organization_id,rate_type,worker_id,amount,valid_from) values ($1,'hour',$2,30000,'2020-01-01')`, [org, w1]);
  return { db, owner, org, cyc, w1, w2 };
}
const summary = async (db, owner, cyc) => (await asUser(db, owner, `select get_cycle_summary($1) j`, [cyc])).rows[0].j;

test('công đã xác nhận chưa vào bảng lương: tính tạm vào chi phí nhân công, ca thiếu đơn giá được báo', async () => {
  const { db, owner, org, cyc, w1, w2 } = await setup();
  // chủ nhập công: hợp lệ ngay (D169). 4 giờ × 30.000 = 120.000
  await asUser(db, owner, `select * from record_shift($1,$2,now() - interval '2 days', now() - interval '2 days' + interval '4 hours', 0, $3)`, [id(1), w1, cyc]);
  await asUser(db, owner, `select * from record_shift($1,$2,now() - interval '2 days', now() - interval '2 days' + interval '2 hours', 0, $3)`, [id(2), w2, cyc]);
  const s = await summary(db, owner, cyc);
  assert.equal(Number(s.labor_unposted), 120000);
  assert.equal(s.labor_unposted_missing_rate, 1);
  assert.equal(Number(s.labor_estimated), 120000);
  assert.equal(Number(s.total_cost), 120000);
  assert.equal(s.has_estimated_cost, true);
  const st = (await asUser(db, owner, `select get_cycles_stats($1) j`, [org])).rows[0].j.cycles[0];
  assert.equal(Number(st.cost_labor), 120000); assert.equal(Number(st.labor_unposted), 120000);
});

test('đã lập bảng lương thì dòng lương thay số tạm, không cộng trùng; công ghi tay được báo riêng', async () => {
  const { db, owner, org, cyc, w1 } = await setup();
  await asUser(db, owner, `select * from record_shift($1,$2,now() - interval '2 days', now() - interval '2 days' + interval '4 hours', 0, $3)`, [id(1), w1, cyc]);
  await db.query(`insert into expense_records (id,organization_id,cycle_id,category,kind,amount,expense_date) values ($1,$2,$3,'labor','cash_paid',500000,current_date - 3)`, [id(5), org, cyc]);
  let s = await summary(db, owner, cyc);
  assert.equal(Number(s.labor_manual), 500000);
  assert.equal(Number(s.total_cost), 500000 + 120000);   // không tự gộp hay loại: chỉ báo để giao diện cảnh báo
  const per = (await asUser(db, owner, `insert into payroll_periods (id,organization_id,start_date,end_date) values ($1,$2,current_date - 6, current_date) returning id`, [id(30), org])).rows[0].id;
  await asUser(db, owner, `select compute_payroll($1)`, [per]);
  s = await summary(db, owner, cyc);
  assert.equal(Number(s.labor_unposted), 0);
  assert.equal(Number(s.labor_estimated), 120000);       // kỳ chưa khóa: vẫn là dự tính, nhưng từ dòng lương
  assert.equal(Number(s.total_cost), 500000 + 120000);
});
