import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';

// Đợt 2 (D142): tổng chi phí/doanh thu tính toàn bộ ở máy chủ, đúng quyền, bỏ khoản đã hủy.
test('expense_totals / sales_totals cộng đủ, bỏ khoản hủy, chặn người không có quyền', async () => {
  const db = await createDb();
  const owner = await addUser(db, 1), other = await addUser(db, 2);
  const org = (await asUser(db, owner, `select create_organization('household','Cơ sở A') id`)).rows[0].id;
  await asUser(db, other, `select create_organization('household','Cơ sở B') id`);
  const ins = (n, kind, amt, voided) => db.query(`insert into expense_records (id, organization_id, category, kind, amount, expense_date, voided_at, void_reason, note) values ($1,$2,'other',$3,$4,current_date, $5, $6, 'giả định')`,
    [`e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`, org, kind, amt, voided ? new Date() : null, voided ? 'sai' : null]);
  await ins(1, 'cash_paid', 100); await ins(2, 'cash_paid', 50); await ins(3, 'material_used', 30); await ins(4, 'estimated', 20); await ins(5, 'cash_paid', 999, true);
  const t = (await asUser(db, owner, `select expense_totals($1) t`, [org])).rows[0].t;
  assert.deepEqual([t.n, t.cash_paid, t.material_used, t.allocated_estimated], [4, 150, 30, 20]);
  const t2 = (await asUser(db, owner, `select expense_totals($1, null, true) t`, [org])).rows[0].t;
  assert.equal(t2.n, 4); // không gắn vụ nào
  await db.query(`insert into production_areas (id,organization_id,name) values ('20000000-0000-4000-8000-000000000001',$1,'A')`, [org]);
  await db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status) values ('30000000-0000-4000-8000-000000000001',$1,'20000000-0000-4000-8000-000000000001',(select id from crop_types limit 1),'active')`, [org]);
  await db.query(`insert into sales_records (id, organization_id, cycle_id, sold_date, quantity, amount) values ('50000000-0000-4000-8000-000000000001',$1,'30000000-0000-4000-8000-000000000001',current_date,10,500),('50000000-0000-4000-8000-000000000002',$1,'30000000-0000-4000-8000-000000000001',current_date,5,200)`, [org]);
  const s = (await asUser(db, owner, `select sales_totals($1) t`, [org])).rows[0].t;
  assert.deepEqual([s.n, Number(s.quantity), s.amount], [2, 15, 700]);
  assert.match(await expectError(asUser(db, other, `select expense_totals($1)`, [org])), /FORBIDDEN/);
  assert.match(await expectError(asUser(db, other, `select sales_totals($1)`, [org])), /FORBIDDEN/);
});
