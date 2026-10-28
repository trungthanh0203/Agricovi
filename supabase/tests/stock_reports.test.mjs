import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';
import { buildStockCsv, useTotals } from '../../apps/app/src/lib/stockReports.ts';

// Migration 0124: báo cáo kho (nhập–xuất–tồn theo kỳ, vật tư dùng theo vụ).

const id = (k, n) => `${k}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const L1 = id('5', 1), L2 = id('5', 2), MAT = id('6', 1), MAT2 = id('6', 2), CYC = id('3', 1), AREA = id('2', 1);

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), worker = await addUser(db, 2), other = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Cơ sở A') id`)).rows[0].id;
  await asUser(db, other, `select create_organization('household','Cơ sở B') id`);
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, worker]);
  await db.query(`insert into inventory_locations (id,organization_id,name) values ($1,$3,'Kho A'),($2,$3,'Kho B')`, [L1, L2, org]);
  await db.query(`insert into materials (id,organization_id,name,base_unit_id) values ($1,$3,'Phân NPK',(select id from units_of_measure where code='kg')),($2,$3,'Thuốc B',(select id from units_of_measure where code='kg'))`, [MAT, MAT2, org]);
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'Nhà màng 1')`, [AREA, org]);
  await db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status,name) values ($1,$2,$3,(select id from crop_types limit 1),'active','Dưa vụ 1')`, [CYC, org, AREA]);
  let n = 0;
  const tx = (loc, mat, type, qty, date, extra = '') => db.query(
    `insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,unit_cost,txn_date,source${extra ? ',cycle_id' : ''}${extra === 'cycle' ? ',issue_kind,reason' : ''}) values ($1,$2,$3,$4,$5,$6,$7,$8,'online'${extra ? ',$9' : ''}${extra === 'cycle' ? ",'cycle','Xuất cho vụ'" : ''})`,
    extra ? [id('7', ++n), org, loc, mat, type, qty, type === 'receipt' ? 20000 : null, date, CYC] : [id('7', ++n), org, loc, mat, type, qty, type === 'receipt' ? 20000 : null, date]);
  return { db, owner, worker, other, org, tx };
}

test('nhập–xuất–tồn theo kỳ: đầu kỳ, nhập, xuất, điều chỉnh, cuối kỳ khớp; lọc theo kho; vật tư không có giao dịch không hiện', async () => {
  const { db, owner, org, tx } = await setup();
  await tx(L1, MAT, 'receipt', 100, '2026-08-20');         // trước kỳ
  await tx(L1, MAT, 'issue', -10, '2026-08-25', 'cycle');  // trước kỳ
  await tx(L1, MAT, 'receipt', 50, '2026-09-05');          // trong kỳ
  await tx(L1, MAT, 'issue', -30, '2026-09-10', 'cycle');
  await tx(L2, MAT, 'receipt', 20, '2026-09-12');
  await db.query(`insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,txn_date,reason,source) values ($1,$2,$3,$4,'adjustment',-2,'2026-09-20','Kiểm kê',$5)`, [id('9', 7), org, L1, MAT, 'online']); // hao hụt kiểm kê
  await tx(L1, MAT, 'receipt', 5, '2026-10-02');           // sau kỳ
  const rep = async (loc = null) => (await asUser(db, owner, `select * from get_stock_period_report($1,'2026-09-01','2026-09-30',$2)`, [org, loc])).rows;
  let r = (await rep()).find((x) => x.material_id === MAT);
  assert.deepEqual([r.opening, r.receipts, r.issues, r.adjustments, r.closing].map(Number), [90, 70, 30, -2, 128]);
  assert.ok(r.unit_name.length > 0);
  r = (await rep(L1)).find((x) => x.material_id === MAT);
  assert.deepEqual([r.opening, r.receipts, r.issues, r.adjustments, r.closing].map(Number), [90, 50, 30, -2, 108]);
  assert.equal((await rep()).some((x) => x.material_id === MAT2), false);
});

test('vật tư dùng theo vụ: lượng ròng và giá vốn trong kỳ, tính cả phần trả về kho; kiểm tra quyền và ngày', async () => {
  const { db, owner, worker, other, org, tx } = await setup();
  await tx(L1, MAT, 'receipt', 100, '2026-10-01');
  await tx(L1, MAT, 'issue', -30, '2026-10-10', 'cycle');
  await db.query(`insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,txn_date,is_return,cycle_id,source) values ($1,$2,$3,$4,'adjustment',5,'2026-10-15',true,$5,'online')`, [id('9', 1), org, L1, MAT, CYC]);
  const use = async (who = owner, from = '2026-10-01', to = '2026-10-31') => (await asUser(db, who, `select * from get_material_use_by_cycle($1,$2,$3)`, [org, from, to])).rows;
  const rows = await use();
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].cycle_name, rows[0].area_name, rows[0].material_name], ['Dưa vụ 1', 'Nhà màng 1', 'Phân NPK']);
  assert.equal(Number(rows[0].quantity), 25);          // 30 xuất − 5 trả
  assert.equal(Number(rows[0].cost), 25 * 20000);
  assert.equal((await use(owner, '2026-11-01', '2026-11-30')).length, 0);
  assert.match(await expectError(use(worker)), /FORBIDDEN/);
  assert.match(await expectError(use(other)), /FORBIDDEN/);
  assert.match(await expectError(use(owner, '2026-11-01', '2026-10-01')), /INVALID_DATE/);
  assert.match(await expectError(asUser(db, worker, `select * from get_stock_period_report($1,'2026-10-01','2026-10-31',null)`, [org])), /FORBIDDEN/);
});

test('CSV báo cáo kho: có BOM, tiêu đề, dòng tổng; chữ có dấu phẩy hoặc ngoặc kép được bọc; tổng giá vốn cộng đúng', () => {
  const csv = buildStockCsv('Vật tư dùng theo vụ', 'Trại "A", Hộ', '2026-10-01', '2026-10-31', ['Vụ', 'Giá vốn'], [['Dưa, vụ 1', 500000], ['Heo', 20000]], ['Tổng', 520000]);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.ok(csv.includes('"Trại ""A"", Hộ"'));
  assert.ok(csv.includes('"Dưa, vụ 1",500000'));
  assert.ok(csv.trimEnd().endsWith('Tổng,520000'));
  assert.deepEqual(useTotals([{ cost: 500000, cost_unknown: 1 }, { cost: 20000, cost_unknown: 0 }]), { cost: 520000, unknown: 1 });
});
