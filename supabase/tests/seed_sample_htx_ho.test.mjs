import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDb, addUser, asUser } from './harness.mjs';

// Dữ liệu mẫu HTX + hộ thành viên (supabase/maintenance/seed_sample_htx_ho.sql): dùng lại hộ có sẵn, tạo thêm cho đủ 5, dữ liệu nhất quán, chạy lại không nhân đôi, xóa sạch.
const raw = readFileSync(new URL('../maintenance/seed_sample_htx_ho.sql', import.meta.url), 'utf8');
const prep = (mode = 'THEM') => raw.replace("'plaumai.tnb@gmail.com'", "'u1@test.local'").replace("v_mode  constant text := 'THEM'", `v_mode  constant text := '${mode}'`);
const one = async (db, sql) => (await db.query(sql)).rows[0];

async function setup(extraManaged = 2) {
  const db = await createDb();
  const boss = await addUser(db, 1), farmer = await addUser(db, 2);
  const coop = (await asUser(db, boss, `select create_organization('cooperative','HTX Thử') id`)).rows[0].id;
  const managed = [];
  for (let i = 0; i < extraManaged; i++) managed.push((await asUser(db, boss, `select create_member_household($1,$2) id`, [coop, `Hộ do HTX tạo ${i + 1}`])).rows[0].id);
  const hh = (await asUser(db, farmer, `select create_organization('household','Hộ có tài khoản') id`)).rows[0].id;
  const inv = (await asUser(db, boss, `select invite_household($1,'u2@test.local') id`, [coop])).rows[0].id;
  await asUser(db, farmer, `select accept_coop_invitation($1,$2,false)`, [inv, hh]);   // hộ có tài khoản không chia sẻ
  return { db, boss, farmer, coop, managed, hh };
}

test('mẫu HTX + hộ: dùng 3 hộ có sẵn, tạo thêm 2, đủ dữ liệu, nhất quán, tôn trọng ý hộ, chạy lại và xóa sạch', async () => {
  const c = await setup();
  const before = await one(c.db, `select (select count(*)::int from organizations) orgs, (select count(*)::int from cooperative_memberships where status='active') mem`);
  await c.db.exec(prep());
  const x = await one(c.db, `select
    (select count(*)::int from cooperative_memberships where cooperative_org_id='${c.coop}' and status='active') hh,
    (select count(*)::int from production_areas where code like 'MAUHO-%' and parent_id is null) areas,
    (select count(*)::int from production_areas where code like 'MAUHO-%' and parent_id is not null) cells,
    (select count(*)::int from inventory_locations where description like 'Dữ liệu mẫu hộ%') locs,
    (select count(*)::int from production_cycles where code like 'MAUHO-%') cyc,
    (select count(*)::int from production_cycles where code like 'MAUHO-%' and status='ended') ended,
    (select count(*)::int from production_cycles where code like 'MAUHO-%' and status='active') active,
    (select count(*)::int from production_cycles where code like 'MAUHO-%' and status='preparing') prep,
    (select count(*)::int from production_cycles where code like 'MAUHO-%' and owner_org_id <> '${c.coop}') own,
    (select count(*)::int from activity_logs l join production_cycles pc on pc.id=l.cycle_id where pc.code like 'MAUHO-%') logs,
    (select count(*)::int from harvest_records h join production_cycles pc on pc.id=h.cycle_id where pc.code like 'MAUHO-%') harvests,
    (select count(*)::int from procurement_receipts where cooperative_org_id='${c.coop}') receipts,
    (select count(*)::int from procurement_payments) pays,
    (select count(*)::int from sales_records s join production_cycles pc on pc.id=s.cycle_id where pc.code like 'MAUHO-%') sales,
    (select count(*)::int from expense_records e join production_cycles pc on pc.id=e.cycle_id where pc.code like 'MAUHO-%') expenses,
    (select count(*)::int from coop_procurement_items where cooperative_org_id='${c.coop}' and is_active) items`);
  assert.deepEqual([x.hh, x.areas, x.cells, x.locs], [5, 5, 10, 5]);
  assert.deepEqual([x.cyc, x.ended, x.active, x.prep], [30, 10, 10, 10]);
  assert.equal(x.own, 2, 'chỉ hộ có tài khoản riêng có vụ riêng đã kết thúc (2 nhà màng)');
  assert.ok(x.logs > 800 && x.harvests > 40 && x.receipts > 30 && x.pays > 10 && x.sales > 30 && x.expenses > 30 && x.items === 1, JSON.stringify(x));
  // hộ có tài khoản riêng giữ nguyên ý (không chia sẻ); hộ do HTX quản lý bật chia sẻ
  const sh = (await c.db.query(`select o.managed_by_org is not null as managed, s.share_production sp from coop_data_sharing s join organizations o on o.id=s.household_org_id where s.cooperative_org_id='${c.coop}'`)).rows;
  assert.equal(sh.length, 5);
  for (const r of sh) assert.equal(r.sp, r.managed);
  // nhiều bản ghi nhất quán: mọi phiếu thu mua có đủ liên kết; tồn kho không âm; không phiếu trùng phiếu thu hoạch
  assert.equal((await one(c.db, `select count(*)::int n from procurement_receipts r left join harvest_records h on h.id=r.harvest_id where h.id is null`)).n, 0);
  assert.equal((await one(c.db, `select count(*)::int n from (select location_id, material_id, sum(quantity_delta) q from inventory_transactions group by 1,2) q where q < 0`)).n, 0);
  assert.equal((await one(c.db, `select count(*)::int n from production_stages s join production_cycles pc on pc.id=s.cycle_id where pc.code like 'MAUHO-%' and pc.status='ended' and s.status<>'done'`)).n, 0);
  // công nợ hai phía có đủ trạng thái; hộ số 5 còn nợ quá hạn
  const led = (await asUser(c.db, c.boss, `select get_procurement_ledger($1,'coop',false) l`, [c.coop])).rows[0].l;
  const st = new Set(led.map((l) => l.status));
  for (const want of ['paid', 'overdue']) assert.ok(st.has(want), 'ledger ' + [...st]);
  const rep = (await asUser(c.db, c.boss, `select get_procurement_report($1, current_date - 400, current_date, 'partner') r`, [c.coop])).rows[0].r;
  assert.equal(rep.rows.length, 5);
  // hộ có tài khoản riêng thấy sổ bán cho HTX của mình
  const mine = (await asUser(c.db, c.farmer, `select get_procurement_ledger($1,'household',false) l`, [c.hh])).rows[0].l;
  assert.ok(mine.length > 0);
  // công nợ phải thu / phải trả của HTX và hộ hoạt động
  assert.ok((await asUser(c.db, c.boss, `select jsonb_array_length(get_receivables($1,false)) n`, [c.coop])).rows[0].n > 0);

  // chạy lại: bỏ qua; xóa: trả về như cũ
  await c.db.exec(prep());
  assert.equal((await one(c.db, `select count(*)::int n from production_cycles where code like 'MAUHO-%'`)).n, 30);
  await c.db.exec(prep('XOA'));
  const after = await one(c.db, `select (select count(*)::int from organizations) orgs, (select count(*)::int from cooperative_memberships where status='active') mem,
    (select count(*)::int from production_cycles where code like 'MAUHO-%') cyc, (select count(*)::int from procurement_receipts) pr,
    (select count(*)::int from partners where note like 'Dữ liệu mẫu hộ%') parts, (select count(*)::int from inventory_transactions) tx`);
  assert.deepEqual([after.orgs, after.mem, after.cyc, after.pr, after.parts, after.tx], [before.orgs, before.mem, 0, 0, 0, 0]);
});

test('mẫu HTX + hộ: HTX chưa có hộ nào thì tạo đủ 5 hộ', async () => {
  const c = await setup(0).then(async (s) => { await s.db.exec(`delete from cooperative_memberships`); return s; });
  await c.db.exec(prep());
  assert.equal((await one(c.db, `select count(*)::int n from organizations where managed_by_org='${c.coop}' and name like 'Hộ mẫu %'`)).n, 5);
  assert.equal((await one(c.db, `select count(*)::int n from production_cycles where code like 'MAUHO-%'`)).n, 30);
});
