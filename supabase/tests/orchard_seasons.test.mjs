import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0213 (D176): vườn cây theo mùa vụ. Đầu tư không vào chi phí chăm sóc mà chia khấu hao vào vụ mùa.

const id = (n) => `89000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const day = (n) => `(current_date + ${n})`;

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), wk = await addUser(db, 2);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, wk]);
  const area = (await db.query(`insert into production_areas (id,organization_id,name,area_size,area_unit) values (gen_random_uuid(),$1,'Vườn na',5000,'m2') returning id`, [org])).rows[0].id;
  const tpl = (await asUser(db, owner, `insert into cycle_templates (organization_id,crop_type_id,name) values ($1,(select id from crop_types limit 1),'Mùa na') returning id`, [org])).rows[0].id;
  await asUser(db, owner, `insert into template_stages (template_id,work_type_id,duration_days) values ($1,(select id from work_types where organization_id is null and code='irrigation'),60)`, [tpl]);
  // vườn: trồng 2000 ngày trước, 3 năm kiến thiết (kinh doanh từ 905 ngày trước), khấu hao 10 năm; đầu tư 3.650.000 => 1.000 đ/ngày
  await db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status,start_date,cycle_mode,planting_date,maturity_years,amort_years,plant_count,planted_area_m2,variety_name)
                  values ($1,$2,$3,(select id from crop_types limit 1),'active',${day(-2000)},'perennial',${day(-2000)},3,10,200,5000,'Na Thái')`, [id(1), org, area]);
  await db.query(`insert into expense_records (id,organization_id,cycle_id,category,kind,amount,expense_date,is_capital) values ($1,$2,$3,'other','cash_paid',3650000,${day(-2000)},true)`, [id(100), org, id(1)]);
  return { db, owner, wk, org, area, tpl };
}
const sum = async (db, u, c) => (await asUser(db, u, `select get_cycle_summary($1) j`, [c])).rows[0].j;

test('vườn cũ chưa mở vụ mùa: không tính đầu tư vào chi phí, tính khấu hao cả đời đến nay (không còn lỗ giả)', async () => {
  const { db, owner, org } = await setup();
  await db.query(`insert into expense_records (id,organization_id,cycle_id,category,kind,amount,expense_date) values ($1,$2,$3,'labor','cash_paid',1000000,${day(-30)})`, [id(101), org, id(1)]);
  const s = await sum(db, owner, id(1));
  // khấu hao từ ngày bước vào kinh doanh (905 ngày trước) đến hôm nay: 906 ngày x 1.000 đ
  assert.equal(Number(s.orchard_depreciation), 906000);
  assert.equal(Number(s.capital_total), 3650000);
  assert.equal(Number(s.total_cost), 1000000 + 906000);
  assert.equal(s.has_estimated_cost, true);
  assert.equal(s.seasons, 0);
});

test('mở vụ mùa: liên kết vườn, khấu hao theo số ngày của vụ mùa, vườn chỉ báo đầu tư', async () => {
  const { db, owner, org, tpl } = await setup();
  await asUser(db, owner, `select open_orchard_season($1,$2,'Mùa na 2026',(current_date - 20),$3,'active')`, [id(2), id(1), tpl]);
  const link = (await db.query(`select orchard_cycle_id, cycle_mode, status from production_cycles where id=$1`, [id(2)])).rows[0];
  assert.equal(link.orchard_cycle_id, id(1)); assert.equal(link.cycle_mode, 'batch');
  // gọi lặp không tạo trùng
  await asUser(db, owner, `select open_orchard_season($1,$2,'Mùa na 2026',(current_date - 20),$3,'active')`, [id(2), id(1), tpl]);
  assert.equal((await db.query(`select count(*)::int n from production_cycles where orchard_cycle_id=$1`, [id(1)])).rows[0].n, 1);
  await db.query(`insert into expense_records (id,organization_id,cycle_id,category,kind,amount,expense_date) values ($1,$2,$3,'labor','cash_paid',2000000,${day(-10)})`, [id(102), org, id(2)]);
  const m = await sum(db, owner, id(2));
  assert.equal(Number(m.orchard_depreciation), 21000);          // 21 ngày (từ 20 ngày trước đến hôm nay) x 1.000 đ
  assert.equal(Number(m.total_cost), 2000000 + 21000);
  const v = await sum(db, owner, id(1));
  assert.equal(v.seasons, 1);
  assert.equal(Number(v.orchard_depreciation), 0);              // vườn đã có vụ mùa: không tự tính lãi/lỗ cả đời
  assert.equal(Number(v.depreciated_to_date), 906000);
  assert.equal(Number(v.total_cost), 0);
  // số liệu danh sách có kiểu vụ và liên kết
  const st = (await asUser(db, owner, `select get_cycles_stats($1) j`, [org])).rows[0].j.cycles;
  const me = st.find((c) => c.cycle_id === id(2));
  assert.equal(me.orchard_cycle_id, id(1)); assert.equal(Number(me.orchard_depreciation), 21000);
  assert.equal(st.find((c) => c.cycle_id === id(1)).cycle_mode, 'perennial');
});

test('không khấu hao khi để trống số năm; vụ mùa chưa bắt đầu chưa có khấu hao; quyền và loại vụ được kiểm tra', async () => {
  const { db, owner, wk, org, area, tpl } = await setup();
  await db.query(`update production_cycles set amort_years = null where id = $1`, [id(1)]);
  await asUser(db, owner, `select open_orchard_season($1,$2,'Mùa sau',(current_date + 30),$3)`, [id(3), id(1), tpl]);
  assert.equal(Number((await sum(db, owner, id(3))).orchard_depreciation), 0);
  await db.query(`update production_cycles set amort_years = 10 where id = $1`, [id(1)]);
  assert.equal(Number((await sum(db, owner, id(3))).orchard_depreciation), 0);   // bắt đầu trong tương lai
  assert.match(await expectError(asUser(db, wk, `select open_orchard_season($1,$2,'X y',current_date,$3)`, [id(4), id(1), tpl])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, owner, `select open_orchard_season($1,$2,'Mùa lỗi',current_date,null)`, [id(5), id(1)])), /INVALID_TEMPLATE/);
  await db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status,start_date) values ($1,$2,$3,(select id from crop_types limit 1),'active',current_date)`, [id(9), org, area]);
  assert.match(await expectError(asUser(db, owner, `select open_orchard_season($1,$2,'Mùa lỗi',current_date,$3)`, [id(6), id(9), tpl])), /INVALID_MODE/);
});
