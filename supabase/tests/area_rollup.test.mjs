import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser } from './harness.mjs';

// Migration 0214 (D177): tổng hợp theo khu tính sẵn ở máy chủ; khớp với cộng số liệu từng vụ.

const id = (n) => `8a000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), wk = await addUser(db, 2);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, wk]);
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'P')`, [id(1), org]);
  await db.query(`insert into production_areas (id,organization_id,parent_id,name) values ($1,$2,$3,'C1'),($4,$2,$3,'C2')`, [id(11), org, id(1), id(12)]);
  const crop = `(select id from crop_types limit 1)`;
  const cyc = async (n, area, status, end, cost, rev, kg) => {
    await db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status,start_date,end_date) values ($1,$2,$3,${crop},$4,current_date - 400,$5)`, [id(n), org, area, status, end]);
    if (cost) await db.query(`insert into expense_records (id,organization_id,cycle_id,category,kind,amount,expense_date) values ($1,$2,$3,'other','cash_paid',$4,current_date - 300)`, [id(100 + n), org, id(n), cost]);
    if (kg) await db.query(`insert into harvest_records (id,organization_id,cycle_id,harvested_at,quantity,unit) values ($1,$2,$3,now() - interval '10 days',$4,'kg')`, [id(200 + n), org, id(n), kg]);
    if (rev) await db.query(`insert into sales_records (id,organization_id,cycle_id,sold_date,quantity,unit,amount) values ($1,$2,$3,current_date - 9,$4,'kg',$5)`, [id(300 + n), org, id(n), kg ?? 1, rev]);
  };
  await cyc(21, id(11), 'ended', new Date(Date.now() - 100 * 864e5).toISOString().slice(0, 10), 1000000, 3000000, 100);   // kết thúc gần đây
  await cyc(22, id(11), 'ended', new Date(Date.now() - 600 * 864e5).toISOString().slice(0, 10), 2000000, 1500000, 50);   // kết thúc lâu rồi
  await cyc(23, id(12), 'active', null, 500000, 0, null);                                                                  // đang chạy, chưa bán
  await cyc(24, id(12), 'active', null, 700000, 900000, 30);                                                               // đang chạy, đã bán
  await cyc(25, id(12), 'cancelled', null, 9000000, 0, null);                                                              // đã hủy: không tính
  return { db, owner, wk, org };
}
const roll = async (db, u, org, args = 'null,null,null') => (await asUser(db, u, `select get_area_rollup($1, ${args}) j`, [org])).rows[0].j;
const rowOf = (j, area) => j.rows.find((r) => r.area_id === id(area));

test('cộng theo khu: số vụ, chi phí, thu hoạch, doanh thu; lãi/lỗ bỏ vụ chưa bán; vụ hủy không tính', async () => {
  const { db, owner, org } = await setup();
  const j = await roll(db, owner, org);
  const c1 = rowOf(j, 11), c2 = rowOf(j, 12);
  assert.deepEqual([c1.cycles, Number(c1.cost), Number(c1.harvest), Number(c1.revenue), Number(c1.profit)], [2, 3000000, 150, 4500000, 1500000]);
  assert.deepEqual([c2.cycles, c2.running, Number(c2.cost), Number(c2.revenue)], [2, 2, 1200000, 900000]);
  assert.equal(Number(c2.profit), 200000);              // chỉ vụ 24 (đã có doanh thu) vào lãi/lỗ; vụ 23 chưa bán thì không
  assert.equal(j.rows.length, 2);                        // chỉ khu có vụ
  // khớp với cộng số liệu từng vụ
  const st = (await asUser(db, owner, `select get_cycles_stats($1) j`, [org])).rows[0].j.cycles;
  const sum = (cs, k) => cs.reduce((t, c) => t + Number(c[k] ?? 0), 0);
  assert.equal(sum(st.filter((c) => [id(21), id(22), id(23), id(24)].includes(c.cycle_id)), 'cost_total'), Number(c1.cost) + Number(c2.cost));
});

test('lọc theo trạng thái và theo thời gian kết thúc (chỉ áp cho vụ đã kết thúc)', async () => {
  const { db, owner, org } = await setup();
  const act = await roll(db, owner, org, `array['active'], null, null`);
  assert.equal(act.rows.length, 1); assert.equal(act.rows[0].cycles, 2);
  const from = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  const recent = await roll(db, owner, org, `array['ended'], '${from}'::date, null`);
  assert.equal(recent.rows.length, 1); assert.equal(recent.rows[0].cycles, 1);     // chỉ vụ kết thúc trong 12 tháng
  const mixed = await roll(db, owner, org, `null, '${from}'::date, null`);
  assert.equal(rowOf(mixed, 11).cycles, 1); assert.equal(rowOf(mixed, 12).cycles, 2);   // vụ đang chạy không bị giới hạn bởi ngày
});

test('người không có quyền xem tiền/thu hoạch không thấy số đó nhưng vẫn thấy số vụ', async () => {
  const { db, wk, org } = await setup();
  const j = await roll(db, wk, org);
  assert.equal(j.can_money, false);
  const c1 = rowOf(j, 11);
  assert.equal(c1.cycles, 2); assert.equal(c1.cost, null); assert.equal(c1.revenue, null); assert.equal(c1.profit, null);
});
