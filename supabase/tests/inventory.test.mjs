import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError, uid } from './harness.mjs';

// Bước C, lát C0 (migration 0016): thu hoạch/chi phí/doanh thu có phiên bản, đảo kho khi hủy nhật ký,
// giá vốn bình quân gia quyền, tổng kết vụ có kiểm quyền.

const AREA = '20000000-0000-4000-8000-0000000000aa';
const CYC = '30000000-0000-4000-8000-0000000000aa';
const LOG = '40000000-0000-4000-8000-0000000000aa';
const LOC = '50000000-0000-4000-8000-0000000000aa';
const M1 = '60000000-0000-4000-8000-0000000000a1';
const M2 = '60000000-0000-4000-8000-0000000000a2';
const wt = `(select id from work_types where code='irrigation')`;
const OP = (n) => uid(800 + n);
const tid = (n) => `70000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const mgr = await addUser(db, 2);
  const w1 = await addUser(db, 3);
  const w2 = await addUser(db, 4);
  const fin = await addUser(db, 5);
  const outsider = await addUser(db, 6);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await db.query(
    `insert into organization_memberships (organization_id,user_id,roles) values
     ($1,$2,array['manager']::member_role[]),($1,$3,array['worker']::member_role[]),
     ($1,$4,array['worker']::member_role[]),($1,$5,array['inventory_finance']::member_role[])`,
    [org, mgr, w1, w2, fin],
  );
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'N1')`, [AREA, org]);
  await db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status) values ($1,$2,$3,(select id from crop_types limit 1),'active')`, [CYC, org, AREA]);
  await db.query(`insert into inventory_locations (id,organization_id,name) values ($1,$2,'Kho chính')`, [LOC, org]);
  await db.query(
    `insert into materials (id,organization_id,name,base_unit_id) values
     ($1,$3,'Phân NPK',(select id from units_of_measure where code='kg')),
     ($2,$3,'Thuốc',(select id from units_of_measure where code='ml'))`,
    [M1, M2, org],
  );
  await asUser(db, w1, `insert into activity_logs (id,organization_id,cycle_id,work_type_id,performed_at,created_by) values ($1,$2,$3,${wt},now(),$4)`, [LOG, org, CYC, w1]);
  return { db, org, owner, mgr, w1, w2, fin, outsider };
}

const receipt = (db, fin, org, n, mat, qty, cost) =>
  asUser(db, fin, `insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,unit_cost,txn_date)
     values ($1,$2,$3,$4,'receipt',$5,$6,current_date)`, [tid(n), org, LOC, mat, qty, cost]);
const issue = (db, u, org, n, mat, qty, log = LOG) =>
  asUser(db, u, `insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,txn_date,activity_log_id)
     values ($1,$2,$3,$4,'issue',$5,current_date,$6)`, [tid(n), org, LOC, mat, -qty, log]);
const voidLog = (db, u, ver = 1) =>
  asUser(db, u, `select * from update_activity_log($1,$2,$3,$4::jsonb)`,
    [LOG, ver, OP(50), JSON.stringify({ voided_at: new Date().toISOString(), void_reason: 'ghi nhầm' })]);

// ------------------------------------------------------------------ Thu hoạch
const HV = '80000000-0000-4000-8000-0000000000aa';
const harvest = (db, u, extra = '') =>
  asUser(db, u, `insert into harvest_records (id,organization_id,cycle_id,harvested_at,quantity,loss_quantity ${extra ? ',' + extra.split('=')[0] : ''})
     values ($1,(select owner_org_id from production_cycles where id=$2),$2,now(),100,10 ${extra ? ',' + extra.split('=')[1] : ''})`, [HV, CYC]);
const updH = (db, u, ver, op, ch) => asUser(db, u, `select * from update_harvest($1,$2,$3,$4::jsonb)`, [HV, ver, OP(op), JSON.stringify(ch)]);

test('thu hoạch: nhân viên ghi được; sửa có phiên bản, xung đột, gửi lặp, quyền sửa', async () => {
  const { db, w1, w2, mgr, owner } = await setup();
  await harvest(db, w1);
  assert.match(await expectError(updH(db, w2, 1, 1, { quantity: 5 })), /NOT_FOUND|FORBIDDEN/);
  const r = (await updH(db, w1, 1, 2, { quantity: 120, grade: 'Loại 1' })).rows[0]; // người ghi sửa bản của mình
  assert.equal(r.version, 2);
  assert.equal(Number(r.quantity), 120);
  assert.equal((await updH(db, w1, 1, 2, { quantity: 120, grade: 'Loại 1' })).rows[0].version, 2); // gửi lặp
  assert.match(await expectError(updH(db, mgr, 1, 3, { note: 'x' })), /CONFLICT/);
  assert.equal((await updH(db, mgr, 2, 3, { note: 'quản lý ghi chú' })).rows[0].version, 3);
  assert.equal((await updH(db, owner, 3, 4, { loss_quantity: 12 })).rows[0].version, 4);
  // audit trước/sau
  const a = (await db.query(`select count(*)::int n from audit_events where entity='harvest_records' and action='UPDATE'`)).rows[0].n;
  assert.equal(a, 3);
});

test('thu hoạch: quá 24 giờ người ghi không sửa được; hủy một chiều; đơn vị kg; hao hụt <= số lượng', async () => {
  const { db, w1, mgr } = await setup();
  await harvest(db, w1);
  await db.exec(`alter table harvest_records disable trigger harvest_records_guard`);
  await db.query(`update harvest_records set received_at = now() - interval '25 hours' where id = $1`, [HV]);
  await db.exec(`alter table harvest_records enable trigger harvest_records_guard`);
  const ver = (await db.query(`select version from harvest_records where id=$1`, [HV])).rows[0].version;
  assert.match(await expectError(updH(db, w1, ver, 1, { note: 'muộn' })), /FORBIDDEN/);
  // quản lý hủy: cần lý do, không khôi phục, không sửa nội dung
  assert.match(await expectError(updH(db, mgr, ver, 2, { voided_at: new Date().toISOString() })), /check/);
  const v = (await updH(db, mgr, ver, 3, { voided_at: new Date().toISOString(), void_reason: 'nhập nhầm' })).rows[0];
  assert.ok(v.voided_at);
  assert.match(await expectError(updH(db, mgr, v.version, 4, { voided_at: null, void_reason: null })), /VOIDED/);
  assert.match(await expectError(updH(db, mgr, v.version, 5, { quantity: 1 })), /VOIDED/);

  assert.match(await expectError(asUser(db, w1, `insert into harvest_records (id,organization_id,cycle_id,harvested_at,quantity,unit)
     select '80000000-0000-4000-8000-0000000000ab', owner_org_id, id, now(), 5, 'thùng' from production_cycles where id=$1`, [CYC])), /harvest_unit_kg|check/);
  assert.match(await expectError(asUser(db, w1, `insert into harvest_records (id,organization_id,cycle_id,harvested_at,quantity,loss_quantity)
     select '80000000-0000-4000-8000-0000000000ac', owner_org_id, id, now(), 5, 6 from production_cycles where id=$1`, [CYC])), /harvest_loss_le_qty|check/);
});

test('thu hoạch: không đổi được vụ/người ghi/nguồn (kể cả gọi trực tiếp)', async () => {
  const { db, owner, w2 } = await setup();
  await harvest(db, owner);
  assert.match(await expectError(asUser(db, owner, `update harvest_records set created_by = $2 where id = $1`, [HV, w2])), /IMMUTABLE_FIELD/);
  assert.match(await expectError(asUser(db, owner, `update harvest_records set source = 'offline' where id = $1`, [HV])), /IMMUTABLE_FIELD/);
});

// ------------------------------------------------------------------ Chi phí và doanh thu
const EX = '90000000-0000-4000-8000-0000000000aa';
const SL = '91000000-0000-4000-8000-0000000000aa';
const insExpense = (db, u, org, cat = 'utility', kind = 'cash_paid', amount = 1000, id = EX) =>
  asUser(db, u, `insert into expense_records (id,organization_id,cycle_id,category,kind,amount,expense_date)
     values ($1,$2,$3,$4,$5,$6,current_date)`, [id, org, CYC, cat, kind, amount]);

test('chi phí: Kho & chi phí sửa có phiên bản; quản lý chỉ xem (FORBIDDEN); nhân viên không thấy; bất biến; hủy một chiều', async () => {
  const { db, org, fin, mgr, w1, owner } = await setup();
  await insExpense(db, fin, org);
  const call = (u, ver, op, ch) => asUser(db, u, `select * from update_expense($1,$2,$3,$4::jsonb)`, [EX, ver, OP(op), JSON.stringify(ch)]);
  assert.match(await expectError(call(mgr, 1, 1, { amount: 1 })), /FORBIDDEN/);
  assert.match(await expectError(call(w1, 1, 2, { amount: 1 })), /NOT_FOUND/);
  const r = (await call(fin, 1, 3, { amount: 2500, note: 'điện tháng 10' })).rows[0];
  assert.equal(r.version, 2);
  assert.equal(Number(r.amount), 2500);
  assert.equal((await call(fin, 1, 3, { amount: 2500 })).rows[0].version, 2); // gửi lặp
  assert.match(await expectError(call(owner, 1, 4, { amount: 1 })), /CONFLICT/);
  assert.match(await expectError(asUser(db, fin, `update expense_records set cycle_id = null where id = $1`, [EX])), /IMMUTABLE_FIELD/);
  const v = (await call(fin, 2, 5, { voided_at: new Date().toISOString(), void_reason: 'nhập nhầm' })).rows[0];
  assert.match(await expectError(call(fin, v.version, 6, { voided_at: null, void_reason: null })), /VOIDED/);
  assert.match(await expectError(call(fin, v.version, 7, { amount: 1 })), /VOIDED/);
  // ước tính phải ghi giả định
  assert.match(await expectError(insExpense(db, fin, org, 'other', 'estimated', 100, '90000000-0000-4000-8000-0000000000ab')), /check/);
});

test('doanh thu: chỉ Kho & chi phí/chủ ghi và sửa; đơn vị kg; sửa có phiên bản', async () => {
  const { db, org, fin, mgr, w1 } = await setup();
  const ins = (u) => asUser(db, u, `insert into sales_records (id,organization_id,cycle_id,sold_date,quantity,amount) values ($1,$2,$3,current_date,50,2000000)`, [SL, org, CYC]);
  assert.match(await expectError(ins(mgr)), /row-level security/);
  assert.match(await expectError(ins(w1)), /row-level security/);
  await ins(fin);
  const call = (u, ver, op, ch) => asUser(db, u, `select * from update_sale($1,$2,$3,$4::jsonb)`, [SL, ver, OP(op), JSON.stringify(ch)]);
  assert.match(await expectError(call(mgr, 1, 1, { amount: 1 })), /FORBIDDEN/);
  assert.equal((await call(fin, 1, 2, { amount: 2100000 })).rows[0].version, 2);
  assert.match(await expectError(call(fin, 1, 3, { amount: 1 })), /CONFLICT/);
  assert.match(await expectError(asUser(db, fin, `update sales_records set unit = 'thùng' where id = $1`, [SL])), /sales_unit_kg|check/);
});

// ------------------------------------------------------------------ Kho: liên kết vụ và đảo kho khi hủy nhật ký
test('hủy nhật ký có xuất kho: kho được đảo đúng một lần, giao dịch gốc giữ nguyên', async () => {
  const { db, org, fin, w1 } = await setup();
  await receipt(db, fin, org, 1, M1, 20, 100);
  await issue(db, w1, org, 2, M1, 4);
  const bal = async () => Number((await asUser(db, fin, `select balance::numeric b from inventory_balances where material_id=$1`, [M1])).rows[0].b);
  assert.equal(await bal(), 16);

  await voidLog(db, w1);
  assert.equal(await bal(), 20);
  const adj = (await db.query(`select quantity_delta::numeric q, reason, reverses_txn_id, activity_log_id from inventory_transactions where txn_type='adjustment'`)).rows;
  assert.equal(adj.length, 1);
  assert.equal(Number(adj[0].q), 4);
  assert.equal(adj[0].reason, 'Hủy nhật ký');
  assert.equal(adj[0].reverses_txn_id, tid(2));
  assert.equal((await db.query(`select count(*)::int n from inventory_transactions where id=$1 and txn_type='issue'`, [tid(2)])).rows[0].n, 1);
  // không đảo hai lần cho cùng giao dịch xuất
  assert.match(await expectError(db.query(`insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,txn_date,reason,reverses_txn_id)
     values ($1,$2,$3,$4,'adjustment',4,current_date,'đảo lại',$5)`, [tid(90), org, LOC, M1, tid(2)])), /inv_txn_reversed_once|duplicate/);
});

test('xuất kho đến muộn (đồng bộ offline) khi nhật ký đã bị hủy: được đảo ngay', async () => {
  const { db, org, fin, w1 } = await setup();
  await receipt(db, fin, org, 1, M1, 20, 100);
  await voidLog(db, w1);
  await issue(db, w1, org, 2, M1, 3);
  const bal = Number((await asUser(db, fin, `select balance::numeric b from inventory_balances where material_id=$1`, [M1])).rows[0].b);
  assert.equal(bal, 20);
  assert.equal((await db.query(`select count(*)::int n from inventory_transactions where reverses_txn_id=$1`, [tid(2)])).rows[0].n, 1);
});

test('giao dịch kho: cycle_id lấy theo nhật ký; vụ không thuộc tổ chức hoặc lệch vụ với nhật ký bị từ chối', async () => {
  const { db, org, fin, w1 } = await setup();
  await receipt(db, fin, org, 1, M1, 20, 100);
  await issue(db, w1, org, 2, M1, 1);
  assert.equal((await db.query(`select cycle_id from inventory_transactions where id=$1`, [tid(2)])).rows[0].cycle_id, CYC);

  // vụ của tổ chức khác
  const other = await addUser(db, 20);
  const org2 = (await asUser(db, other, `select create_organization('household','Hộ B') id`)).rows[0].id;
  await db.query(`insert into production_areas (id,organization_id,name) values ('20000000-0000-4000-8000-0000000000bb',$1,'B1')`, [org2]);
  await db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status) values ('30000000-0000-4000-8000-0000000000bb',$1,'20000000-0000-4000-8000-0000000000bb',(select id from crop_types limit 1),'active')`, [org2]);
  assert.match(await expectError(asUser(db, fin, `insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,txn_date,cycle_id)
     values ($1,$2,$3,$4,'issue',-1,current_date,'30000000-0000-4000-8000-0000000000bb')`, [tid(3), org, LOC, M1])), /không thuộc tổ chức/);

  // cycle_id khác vụ của nhật ký
  await db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status) values ('30000000-0000-4000-8000-0000000000ac',$1,$2,(select id from crop_types limit 1),'preparing')`, [org, AREA]);
  assert.match(await expectError(asUser(db, fin, `insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,txn_date,cycle_id,activity_log_id)
     values ($1,$2,$3,$4,'issue',-1,current_date,'30000000-0000-4000-8000-0000000000ac',$5)`, [tid(4), org, LOC, M1, LOG])), /cùng một vụ/);
});

// ------------------------------------------------------------------ Giá vốn và tổng kết vụ
test('giá vốn bình quân gia quyền; thiếu giá thì báo thiếu, không bịa số', async () => {
  const { db, org, fin, w1 } = await setup();
  await receipt(db, fin, org, 1, M1, 10, 100);
  await receipt(db, fin, org, 2, M1, 10, 200);
  await receipt(db, fin, org, 3, M2, 5, null);   // nhập không giá
  await issue(db, w1, org, 4, M1, 4);            // bình quân 150 => 600
  await issue(db, w1, org, 5, M2, 1);            // chưa biết giá
  const rows = (await asUser(db, fin, `select material_id, cost, cost_known, cost_from_average from inventory_issue_costs order by material_id`)).rows;
  assert.equal(Number(rows[0].cost), 600);
  assert.equal(rows[0].cost_known, true);
  assert.equal(rows[0].cost_from_average, true);
  assert.equal(rows[1].cost, null);
  assert.equal(rows[1].cost_known, false);
  // nhân viên chỉ thấy lần xuất của chính mình và không có giá vốn nào
  const mine = (await asUser(db, w1, `select cost, cost_known from inventory_issue_costs`)).rows;
  assert.equal(mine.length, 2);
  assert.ok(mine.every((r) => r.cost === null && r.cost_known === false));
});

test('tổng kết vụ: kiểm quyền, số liệu đúng, giá thành/kg chỉ khi đủ dữ liệu, giao dịch bị đảo không tính', async () => {
  const { db, org, fin, w1, mgr, owner, outsider } = await setup();
  const summary = async (u) => (await asUser(db, u, `select get_cycle_summary($1) s`, [CYC])).rows[0].s;

  // quyền
  assert.match(await expectError(summary(w1)), /FORBIDDEN/);
  assert.match(await expectError(summary(outsider)), /FORBIDDEN/);

  // chưa có dữ liệu: nêu rõ thiếu
  let s = await summary(owner);
  assert.equal(s.missing_harvest, true);
  assert.equal(s.missing_revenue, true);
  assert.equal(s.cost_per_kg, null);

  await receipt(db, fin, org, 1, M1, 20, 100);
  await issue(db, w1, org, 3, M2, 1);              // M2 chưa từng nhập => thiếu giá
  await insExpense(db, fin, org, 'utility', 'cash_paid', 1000);
  await insExpense(db, fin, org, 'material', 'cash_paid', 5000, '90000000-0000-4000-8000-0000000000b2');
  await harvest(db, w1);                            // 100 kg, hao hụt 10 => 90

  s = await summary(mgr);                           // quản lý xem được
  assert.equal(Number(s.cash_paid_other), 1000);
  assert.equal(Number(s.cash_paid_material), 5000);
  assert.equal(Number(s.harvested_net_qty), 90);
  assert.equal(s.issues_missing_cost, 1);
  assert.equal(s.cost_per_kg, null, 'còn lần xuất thiếu giá vốn thì chưa tính giá thành/kg');

  await receipt(db, fin, org, 4, M2, 10, 50);
  await issue(db, w1, org, 5, M1, 4);               // 4 x 100 = 400
  s = await summary(fin);
  assert.equal(s.issues_missing_cost, 0);
  assert.equal(Number(s.material_used_cost), 400 + 50);
  assert.equal(Number(s.total_cost), 1000 + 450);
  assert.equal(Number(s.cost_per_kg), Math.round(1450 / 90));
  assert.equal(s.missing_revenue, true);

  // hủy nhật ký => vật tư dùng bị đảo, không còn tính vào chi phí vụ
  await voidLog(db, w1);
  s = await summary(owner);
  assert.equal(Number(s.material_used_cost), 0);
  assert.equal(Number(s.total_cost), 1000);
});

// ------------------------------------------------------------------ Danh mục vật tư/kho (lát C1)
test('danh mục: chỉ chủ và Kho & chi phí thay đổi; mọi thành viên đọc được; tên vật tư/kho không trùng; chỉ vai trò kho đọc được tồn', async () => {
  const { db, org, fin, mgr, w1, owner, outsider } = await setup();
  const unit = `(select id from units_of_measure where code='kg')`;
  const addMat = (u, id, name) => asUser(db, u, `insert into materials (id,organization_id,name,base_unit_id) values ($1,$2,$3,${unit})`, [id, org, name]);
  const addLoc = (u, id, name) => asUser(db, u, `insert into inventory_locations (id,organization_id,name) values ($1,$2,$3)`, [id, org, name]);

  assert.match(await expectError(addMat(mgr, tid(70), 'Vôi')), /row-level security/);
  assert.match(await expectError(addMat(w1, tid(71), 'Vôi')), /row-level security/);
  assert.match(await expectError(addLoc(mgr, tid(72), 'Kho phụ')), /row-level security/);
  await addMat(fin, tid(73), 'Vôi');
  await addMat(owner, tid(74), 'Phân hữu cơ');
  await addLoc(fin, tid(75), 'Kho phụ');
  assert.match(await expectError(addMat(fin, tid(76), 'Vôi')), /duplicate|unique/);
  assert.match(await expectError(addLoc(owner, tid(77), 'Kho phụ')), /duplicate|unique/);

  // mọi thành viên đọc danh mục (nhân viên cần chọn vật tư khi ghi việc); người ngoài thì không
  for (const u of [mgr, w1, fin]) {
    assert.equal((await asUser(db, u, `select count(*)::int n from materials where id in ($1,$2)`, [M1, tid(73)])).rows[0].n, 2);
  }
  assert.equal((await asUser(db, outsider, `select count(*)::int n from materials`)).rows[0].n, 0);

  // ngừng dùng thay cho xóa (không có quyền xóa vì còn lịch sử kho)
  await asUser(db, fin, `update materials set is_active = false where id = $1`, [tid(73)]);
  assert.equal((await asUser(db, fin, `select is_active from materials where id=$1`, [tid(73)])).rows[0].is_active, false);

  // tồn: quản lý và Kho & chi phí xem được; nhân viên thì không
  await receipt(db, fin, org, 1, M1, 5, 100);
  for (const [u, n] of [[fin, 1], [mgr, 1], [owner, 1], [w1, 0], [outsider, 0]]) {
    assert.equal((await asUser(db, u, `select count(*)::int n from inventory_balances`)).rows[0].n, n);
  }
  // nhập kho: quản lý không được; điều chỉnh: quản lý không được
  assert.match(await expectError(asUser(db, mgr, `insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,txn_date)
     values ($1,$2,$3,$4,'receipt',1,current_date)`, [tid(80), org, LOC, M1])), /row-level security/);
  assert.match(await expectError(asUser(db, mgr, `insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,txn_date,reason)
     values ($1,$2,$3,$4,'adjustment',-1,current_date,'thử')`, [tid(81), org, LOC, M1])), /row-level security/);
});

test('nhân viên ghi xuất dùng bằng ON CONFLICT DO NOTHING (hàng đợi offline) được; vẫn không đọc nhập kho/tồn của người khác', async () => {
  const { db, org, fin, w1, w2 } = await setup();
  await receipt(db, fin, org, 1, M1, 20, 100);
  const up = (u, n) => asUser(db, u, `insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,txn_date,activity_log_id)
     values ($1,$2,$3,$4,'issue',-2,current_date,$5) on conflict (id) do nothing`, [tid(n), org, LOC, M1, LOG]);
  await up(w1, 2);
  await up(w1, 2); // gửi lặp
  assert.equal((await db.query(`select count(*)::int n from inventory_transactions where txn_type='issue'`)).rows[0].n, 1);
  // thấy lần xuất của chính mình, không thấy của người khác, không thấy nhập kho
  assert.deepEqual((await asUser(db, w1, `select txn_type from inventory_transactions`)).rows.map((r) => r.txn_type), ['issue']);
  assert.equal((await asUser(db, w2, `select count(*)::int n from inventory_transactions`)).rows[0].n, 0);
  // tồn không hiện cho nhân viên
  assert.equal((await asUser(db, w1, `select count(*)::int n from inventory_balances`)).rows[0].n, 0);
  assert.equal((await asUser(db, fin, `select balance::numeric b from inventory_balances`)).rows[0].b, '18');
  // nhập kho bằng ON CONFLICT vẫn bị từ chối với nhân viên
  assert.match(await expectError(asUser(db, w1, `insert into inventory_transactions (id,organization_id,location_id,material_id,txn_type,quantity_delta,txn_date)
     values ($1,$2,$3,$4,'receipt',5,current_date) on conflict (id) do nothing`, [tid(3), org, LOC, M1])), /row-level security/);
});
