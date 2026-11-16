import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Migration 0212 (D175): chia chi phí chung cho vụ ở cấp ô, phân khu (gồm ô con) và cả cơ sở.

const id = (n) => `88000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const OP = id(777);

async function setup() {
  const db = await createDb();
  const owner = await addUser(db, 1), wk = await addUser(db, 2), other = await addUser(db, 3);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  await asUser(db, other, `select create_organization('household','Hộ B') id`);
  await db.query(`insert into organization_memberships (organization_id,user_id,roles) values ($1,$2,array['worker']::member_role[])`, [org, wk]);
  const crop = `(select id from crop_types limit 1)`;
  // phân khu P có hai ô C1 (300 m²) và C2 (100 m²); phân khu Q có ô Q1 không khai diện tích
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'P'),($3,$2,'Q')`, [id(1), org, id(2)]);
  await db.query(`insert into production_areas (id,organization_id,parent_id,name,area_size,area_unit) values ($1,$2,$3,'C1',300,'m2'),($4,$2,$3,'C2',100,'m2')`, [id(11), org, id(1), id(12)]);
  await db.query(`insert into production_areas (id,organization_id,parent_id,name) values ($1,$2,$3,'Q1')`, [id(13), org, id(2)]);
  const cyc = (n, area, m2) => db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status,start_date,end_date,planted_area_m2) values ($1,$2,$3,${crop},'ended','2026-01-01','2026-01-10',$4)`, [id(n), org, area, m2]);
  await cyc(21, id(11), 300);    // 300 m² x 10 ngày
  await cyc(22, id(12), null);   // chưa khai: lấy 100 m² của ô
  await cyc(23, id(13), null);   // không có diện tích nào: không được chia
  return { db, owner, wk, other, org };
}
const prev = async (db, u, org, area, amount = 4000000) =>
  (await asUser(db, u, `select preview_shared_expense($1,$2,'2026-01-01','2026-01-10',$3) j`, [org, area, amount])).rows[0].j;

test('cấp phân khu gồm các ô con, diện tích lấy từ ô khi vụ chưa khai; tổng các phần đúng bằng số tiền', async () => {
  const { db, owner, org } = await setup();
  const p = await prev(db, owner, org, id(1));
  assert.equal(p.shares.length, 2);
  const by = Object.fromEntries(p.shares.map((s) => [s.cycle_id, Number(s.amount)]));
  assert.equal(by[id(21)], 3000000); assert.equal(by[id(22)], 1000000);
  assert.equal(p.shares.reduce((t, s) => t + Number(s.amount), 0), 4000000);
  assert.equal((await prev(db, owner, org, id(11))).shares.length, 1);   // cấp ô chỉ lấy vụ của ô đó
});

test('cả cơ sở: chia cho mọi vụ có diện tích; vụ không có diện tích được báo riêng', async () => {
  const { db, owner, org } = await setup();
  const p = await prev(db, owner, org, null, 1000000);
  assert.equal(p.shares.length, 2);
  assert.deepEqual(p.skipped.map((s) => s.cycle_id), [id(23)]);
  assert.equal(p.shares.reduce((t, s) => t + Number(s.amount), 0), 1000000);
});

test('ghi nhận: mỗi vụ một khoản "phân bổ" có ghi cách chia, bấm lặp không nhân đôi, vào chi phí của vụ', async () => {
  const { db, owner, org } = await setup();
  const call = () => asUser(db, owner, `select allocate_shared_expense($1,null,'2026-01-01','2026-01-10',4000000,'rent','Thuê đất quý 1',$2) j`, [org, OP]);
  const r = (await call()).rows[0].j;
  assert.equal(r.created, 2); assert.equal(r.already, false);
  assert.equal((await call()).rows[0].j.already, true);
  const rows = (await db.query(`select cycle_id, amount::bigint a, kind, note from expense_records where category='rent'`)).rows;
  assert.equal(rows.length, 2);
  assert.ok(rows.every((x) => x.kind === 'allocated' && /cả cơ sở/.test(x.note)));
  const mine = Number(rows.find((x) => x.cycle_id === id(21)).a);
  const s = (await asUser(db, owner, `select get_cycle_summary($1) j`, [id(21)])).rows[0].j;
  assert.equal(Number(s.allocated_or_estimated), mine);
  assert.equal(Number(s.total_cost), mine);
});

test('quyền và dữ liệu sai bị chặn', async () => {
  const { db, wk, other, owner, org } = await setup();
  assert.match(await expectError(asUser(db, wk, `select preview_shared_expense($1,null,'2026-01-01','2026-01-10',1000)`, [org])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, other, `select preview_shared_expense($1,null,'2026-01-01','2026-01-10',1000)`, [org])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, owner, `select preview_shared_expense($1,$2,'2026-01-01','2026-01-10',1000)`, [org, id(999)])), /NOT_FOUND/);
  assert.match(await expectError(asUser(db, owner, `select allocate_shared_expense($1,null,'2026-02-01','2026-01-10',1000,'rent',null,$2)`, [org, id(5)])), /INVALID_DATE/);
  assert.match(await expectError(asUser(db, owner, `select allocate_shared_expense($1,null,'2026-01-01','2026-01-10',0,'rent',null,$2)`, [org, id(5)])), /INVALID_AMOUNT/);
});
