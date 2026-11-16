import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0215 (D178): bản chụp số liệu vụ kết thúc và danh sách vụ theo khu.

const id = (n) => `8b000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const day = (n) => `(current_date + ${n})`;

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), wk = await addUser(db, 2);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, wk]);
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'P')`, [id(1), org]);
  await db.query(`insert into production_areas (id,organization_id,parent_id,name) values ($1,$2,$3,'C1'),($4,$2,$3,'C2')`, [id(11), org, id(1), id(12)]);
  const crop = `(select id from crop_types limit 1)`;
  const cyc = async (n, area, status, start, end) => db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status,start_date,end_date,name) values ($1,$2,$3,${crop},$4,${day(start)},${end === null ? 'null' : day(end)},$5)`, [id(n), org, area, status, 'Vụ ' + n]);
  await cyc(21, id(11), 'ended', -200, -100);
  await cyc(22, id(11), 'ended', -150, -60);
  await cyc(23, id(12), 'active', -20, null);
  await db.query(`insert into expense_records (id,organization_id,cycle_id,category,kind,amount,expense_date) values ($1,$2,$3,'other','cash_paid',1000000,${day(-150)})`, [id(101), org, id(21)]);
  await db.query(`insert into sales_records (id,organization_id,cycle_id,sold_date,quantity,unit,amount) values ($1,$2,$3,${day(-90)},10,'kg',3000000)`, [id(301), org, id(21)]);
  return { db, owner, wk, org };
}
const roll = async (db, u, org, extra = '') => (await asUser(db, u, `select get_area_rollup($1, null, null, null${extra}) j`, [org])).rows[0].j;
const snaps = async (db) => (await db.query(`select cycle_id, dirty, computed_at, (summary->>'total_cost')::numeric cost from cycle_stat_snapshots order by cycle_id`)).rows;

test('tính một lần rồi dùng lại; ghi chép mới đánh dấu cần tính lại; tính lại đúng số', async () => {
  const { db, owner, org } = await setup();
  let j = await roll(db, owner, org);
  assert.equal((await snaps(db)).length, 2);                         // chỉ vụ kết thúc có bản chụp
  const c1 = j.rows.find((r) => r.area_id === id(11));
  assert.deepEqual([c1.cycles, Number(c1.cost), Number(c1.revenue), Number(c1.profit)], [2, 1000000, 3000000, 2000000]);
  const t0 = (await snaps(db)).find((s) => s.cycle_id === id(21)).computed_at;
  await roll(db, owner, org);
  assert.equal((await snaps(db)).find((s) => s.cycle_id === id(21)).computed_at.getTime(), t0.getTime());   // không tính lại
  await db.query(`insert into expense_records (id,organization_id,cycle_id,category,kind,amount,expense_date) values ($1,$2,$3,'other','cash_paid',500000,${day(-120)})`, [id(102), org, id(21)]);
  const s = (await snaps(db)).find((x) => x.cycle_id === id(21));
  assert.equal(s.dirty, true);
  j = await roll(db, owner, org);
  assert.equal(Number(j.rows.find((r) => r.area_id === id(11)).cost), 1500000);
  assert.equal((await snaps(db)).find((x) => x.cycle_id === id(21)).dirty, false);
  // p_refresh tính lại dù chưa dirty
  const t1 = (await snaps(db)).find((x) => x.cycle_id === id(21)).computed_at;
  await new Promise((r) => setTimeout(r, 20));
  await roll(db, owner, org, ', true');
  assert.notEqual((await snaps(db)).find((x) => x.cycle_id === id(21)).computed_at.getTime(), t1.getTime());
});

test('nhập kho đầu vào có ngày trước ngày kết thúc đánh dấu cần tính lại; nhập ngày mới thì không', async () => {
  const { db, owner, org } = await setup();
  await roll(db, owner, org);
  const loc = (await db.query(`insert into inventory_locations (id,organization_id,name) values (gen_random_uuid(),$1,'Kho') returning id`, [org])).rows[0].id;
  const mat = (await db.query(`insert into materials (id,organization_id,name,base_unit_id) values (gen_random_uuid(),$1,'Phân',(select id from units_of_measure where code='kg')) returning id`, [org])).rows[0].id;
  const rec = (n, d) => db.query(`insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,unit_cost,txn_date) values ($1,$2,$3,$4,'receipt',10,1000,${day(d)})`, [id(n), org, loc, mat]);
  await rec(401, -5);   // sau ngày kết thúc của cả hai vụ
  assert.ok((await snaps(db)).every((s) => !s.dirty));
  await rec(402, -80);  // trước ngày kết thúc của vụ 22 (-60) nhưng sau vụ 21 (-100)
  const d = Object.fromEntries((await snaps(db)).map((s) => [s.cycle_id, s.dirty]));
  assert.equal(d[id(22)], true); assert.equal(d[id(21)], false);
});

test('vụ không còn kết thúc thì xóa bản chụp; người không có quyền xem tiền không tạo bản chụp', async () => {
  const { db, owner, wk, org } = await setup();
  await roll(db, wk, org);
  assert.equal((await snaps(db)).length, 0);
  await roll(db, owner, org);
  assert.equal((await snaps(db)).length, 2);
  await db.query(`update production_cycles set status = 'active' where id = $1`, [id(22)]);
  assert.deepEqual((await snaps(db)).map((s) => s.cycle_id), [id(21)]);
});

test('danh sách vụ của khu: phân trang, đang chạy trước, lãi/lỗ bỏ vụ chưa bán, phân khu gồm ô con, quyền', async () => {
  const { db, owner, wk, org } = await setup();
  const call = (u, area, args = 'null, null, null, 50, 0') => asUser(db, u, `select get_area_cycles($1, $2, ${args}) j`, [org, area]);
  const all = (await call(owner, id(1))).rows[0].j;
  assert.equal(all.total, 3);
  assert.equal(all.items[0].status, 'active');                          // đang chạy lên trước
  assert.equal(all.items[0].profit, null); assert.equal(all.items[0].pending, true);
  const v21 = all.items.find((x) => x.cycle_id === id(21));
  assert.deepEqual([Number(v21.cost), Number(v21.revenue), Number(v21.profit)], [1000000, 3000000, 2000000]);
  const cell = (await call(owner, id(11))).rows[0].j;
  assert.equal(cell.total, 2);                                          // ô chỉ có vụ của ô
  const page = (await call(owner, id(1), 'null, null, null, 2, 2')).rows[0].j;
  assert.equal(page.items.length, 1); assert.equal(page.total, 3);
  const ended = (await call(owner, id(1), `array['ended'], null, null, 50, 0`)).rows[0].j;
  assert.equal(ended.total, 2);
  const w = (await call(wk, id(1))).rows[0].j;
  assert.equal(w.can_money, false); assert.equal(w.items[0].cost, null);
  assert.match(await expectError(call(owner, id(999))), /NOT_FOUND/);
});
