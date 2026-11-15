import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0205 (D168): đợt kiểm kê kho. Chốt đợt chỉ thêm giao dịch điều chỉnh; không sửa tồn trực tiếp.

const LOC = '50000000-0000-4000-8000-0000000000d1';
const LOC2 = '50000000-0000-4000-8000-0000000000d2';
const M1 = '60000000-0000-4000-8000-0000000000d1';
const M2 = '60000000-0000-4000-8000-0000000000d2';
const tid = (n) => `70000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), wk = await addUser(db, 2), other = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await asUser(db, other, `select create_organization('household','Hộ B') id`);
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, wk]);
  await db.query(`insert into inventory_locations (id,organization_id,name) values ($1,$2,'Kho 1'),($3,$2,'Kho 2')`, [LOC, org, LOC2]);
  const kg = `(select id from units_of_measure where code='kg')`;
  await db.query(`insert into materials (id,organization_id,name,base_unit_id) values ($1,$3,'Cám',${kg}),($2,$3,'Phân NPK',${kg})`, [M1, M2, org]);
  const txn = (n, mat, type, qty, extra = {}) => db.query(
    `insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,txn_date,unit_cost,reason,lot_no)
     values ($1,$2,$3,$4,$5,$6,current_date,$7,$8,$9)`, [tid(n), org, LOC, mat, type, qty, extra.cost ?? null, extra.reason ?? null, extra.lot ?? null]);
  await txn(1, M1, 'receipt', 100, { cost: 10000 });
  await txn(2, M2, 'receipt', 50, { cost: 20000 });
  const bal = async (mat) => Number((await db.query(`select coalesce(sum(quantity_delta),0) b from inventory_transactions where location_id=$1 and material_id=$2`, [LOC, mat])).rows[0].b);
  return { db, owner, wk, other, org, txn, bal };
}
const getLines = async (db, user, id) => (await asUser(db, user, `select get_stocktake($1) j`, [id])).rows[0].j;

test('mở đợt chụp tồn; mỗi kho một đợt nháp; nhân viên/người ngoài không mở được', async () => {
  const { db, owner, wk, other } = await setup();
  const s = (await asUser(db, owner, `select * from start_stocktake($1, false, 20, 'Cuối tháng')`, [LOC])).rows[0];
  assert.equal(s.status, 'draft');
  const j = await getLines(db, owner, s.id);
  assert.deepEqual(j.lines.map((l) => [l.material_name, Number(l.book_qty)]).sort(), [['Cám', 100], ['Phân NPK', 50]]);
  assert.match(await expectError(asUser(db, owner, `select * from start_stocktake($1)`, [LOC])), /đang có một đợt kiểm kê/);
  assert.match(await expectError(asUser(db, wk, `select * from start_stocktake($1)`, [LOC2])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, other, `select * from start_stocktake($1)`, [LOC2])), /FORBIDDEN/);
  await asUser(db, owner, `select * from start_stocktake($1)`, [LOC2]);   // kho khác mở được
  assert.equal((await asUser(db, other, `select count(*)::int n from stocktakes`)).rows[0].n, 0);
  assert.match(await expectError(asUser(db, owner, `select * from stocktake_lines`)), /permission denied/i);
});

test('đếm mù không trả số sổ sách khi nháp, trả đủ sau khi chốt', async () => {
  const { db, owner } = await setup();
  const s = (await asUser(db, owner, `select * from start_stocktake($1, true)`, [LOC])).rows[0];
  const j = await getLines(db, owner, s.id);
  assert.ok(j.lines.every((l) => l.book_qty === null));
  const l0 = j.lines[0];
  await asUser(db, owner, `select set_stocktake_counts($1,$2::jsonb)`, [s.id, JSON.stringify([{ id: l0.id, version: l0.version, counted: Number(100) }])]);
  await asUser(db, owner, `select * from finish_stocktake($1)`, [s.id]);
  assert.ok((await getLines(db, owner, s.id)).lines.every((l) => l.book_qty !== null));
});

test('chốt: dòng lệch sinh giao dịch điều chỉnh; dòng khớp và chưa đếm không đổi; có xuất nhập giữa chừng thì lệch tính theo tồn hiện tại', async () => {
  const { db, owner, txn, bal } = await setup();
  const s = (await asUser(db, owner, `select * from start_stocktake($1, false, 50)`, [LOC])).rows[0];
  const j = await getLines(db, owner, s.id);
  const byName = Object.fromEntries(j.lines.map((l) => [l.material_name, l]));
  // trong lúc kiểm có xuất 10 kg cám: tồn hiện tại 90
  await txn(3, M1, 'issue', -10);
  // đếm: cám 85 (lệch -5 so với tồn hiện tại 90), phân chưa đếm
  await asUser(db, owner, `select set_stocktake_counts($1,$2::jsonb)`, [s.id, JSON.stringify([{ id: byName['Cám'].id, version: byName['Cám'].version, counted: 85 }])]);
  const fin = (await asUser(db, owner, `select * from finish_stocktake($1)`, [s.id])).rows[0];
  assert.equal(fin.status, 'done');
  assert.equal(await bal(M1), 85);     // tồn khớp số đếm
  assert.equal(await bal(M2), 50);     // chưa đếm: không đổi
  const adj = (await db.query(`select quantity_delta::numeric q, reason, txn_type from inventory_transactions where location_id=$1 and txn_type='adjustment'`, [LOC])).rows;
  assert.equal(adj.length, 1); assert.equal(Number(adj[0].q), -5); assert.match(adj[0].reason, /^Kiểm kê/);
  const done = (await getLines(db, owner, s.id)).lines.find((l) => l.material_name === 'Cám');
  assert.equal(Number(done.adjust_qty), -5); assert.equal(Number(done.book_at_finish), 90); assert.equal(Number(done.unit_cost_est), 10000);
  // đợt đã chốt: bất biến
  assert.match(await expectError(asUser(db, owner, `select * from finish_stocktake($1)`, [s.id])), /STOCKTAKE_CLOSED/);
  assert.match(await expectError(asUser(db, owner, `select * from cancel_stocktake($1,'abc')`, [s.id])), /STOCKTAKE_CLOSED/);
  assert.match(await expectError(asUser(db, owner, `select set_stocktake_counts($1,'[]'::jsonb)`, [s.id])), /STOCKTAKE_CLOSED/);
});

test('lệch quá ngưỡng bắt buộc ghi chú; chưa đếm gì thì không chốt được', async () => {
  const { db, owner, bal } = await setup();
  const s = (await asUser(db, owner, `select * from start_stocktake($1, false, 20)`, [LOC])).rows[0];
  assert.match(await expectError(asUser(db, owner, `select * from finish_stocktake($1)`, [s.id])), /NOTHING_COUNTED/);
  let j = await getLines(db, owner, s.id);
  const cam = j.lines.find((l) => l.material_name === 'Cám');
  await asUser(db, owner, `select set_stocktake_counts($1,$2::jsonb)`, [s.id, JSON.stringify([{ id: cam.id, version: cam.version, counted: 40 }])]);   // lệch 60%
  assert.match(await expectError(asUser(db, owner, `select * from finish_stocktake($1)`, [s.id])), /NOTE_REQUIRED/);
  assert.equal(await bal(M1), 100);   // chưa đổi gì
  j = await getLines(db, owner, s.id);
  const cam2 = j.lines.find((l) => l.material_name === 'Cám');
  await asUser(db, owner, `select set_stocktake_counts($1,$2::jsonb)`, [s.id, JSON.stringify([{ id: cam2.id, version: cam2.version, counted: 40, note: 'Chuột phá bao cám' }])]);
  await asUser(db, owner, `select * from finish_stocktake($1)`, [s.id]);
  assert.equal(await bal(M1), 40);
});

test('phiên bản dòng: người sau lệch phiên bản báo CONFLICT; số đếm âm bị chặn; hủy cần lý do và mở lại được', async () => {
  const { db, owner } = await setup();
  const s = (await asUser(db, owner, `select * from start_stocktake($1)`, [LOC])).rows[0];
  const l = (await getLines(db, owner, s.id)).lines[0];
  await asUser(db, owner, `select set_stocktake_counts($1,$2::jsonb)`, [s.id, JSON.stringify([{ id: l.id, version: l.version, counted: 10 }])]);
  assert.match(await expectError(asUser(db, owner, `select set_stocktake_counts($1,$2::jsonb)`, [s.id, JSON.stringify([{ id: l.id, version: l.version, counted: 11 }])])), /CONFLICT/);
  const l2 = (await getLines(db, owner, s.id)).lines.find((x) => x.id === l.id);
  assert.match(await expectError(asUser(db, owner, `select set_stocktake_counts($1,$2::jsonb)`, [s.id, JSON.stringify([{ id: l.id, version: l2.version, counted: -1 }])])), /INVALID_QUANTITY/);
  assert.match(await expectError(asUser(db, owner, `select * from cancel_stocktake($1,'')`, [s.id])), /REASON_REQUIRED/);
  await asUser(db, owner, `select * from cancel_stocktake($1,'Đếm nhầm kho')`, [s.id]);
  await asUser(db, owner, `select * from start_stocktake($1)`, [LOC]);   // hủy xong mở đợt mới được
});

test('theo lô: dòng lô riêng, điều chỉnh mang đúng lô, tồn theo lô khớp lại', async () => {
  const { db, owner, txn } = await setup();
  await txn(4, M2, 'receipt', 20, { lot: 'L-01' });   // phân NPK có thêm lô L-01 (20 kg), 50 kg không lô
  const s = (await asUser(db, owner, `select * from start_stocktake($1, false, 100)`, [LOC])).rows[0];
  const j = await getLines(db, owner, s.id);
  const lot = j.lines.find((l) => l.lot_no === 'L-01');
  assert.equal(Number(lot.book_qty), 20);
  await asUser(db, owner, `select set_stocktake_counts($1,$2::jsonb)`, [s.id, JSON.stringify([{ id: lot.id, version: lot.version, counted: 18 }])]);
  await asUser(db, owner, `select * from finish_stocktake($1)`, [s.id]);
  const r = (await db.query(`select coalesce(sum(t.quantity_delta),0)::numeric q from inventory_transactions t join material_lots l on l.id=t.lot_id where l.lot_no='L-01'`)).rows[0];
  assert.equal(Number(r.q), 18);
});
