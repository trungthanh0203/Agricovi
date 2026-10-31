import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDb, addUser, expectError } from './harness.mjs';

// Script nạp dữ liệu giả để đo hiệu năng (supabase/maintenance/seed_load_test.sql): chạy ở quy mô nhỏ, kiểm tra đủ bảng, chạy lại không nhân đôi, dọn sạch.

const raw = readFileSync(new URL('../maintenance/seed_load_test.sql', import.meta.url), 'utf8');
const prep = (opts = {}) => raw
  .replace("'KHONG'", opts.confirm ?? "'TAO-DU-LIEU-THU'")
  .replace("'email-cua-ban@...'", "'u1@test.local'")
  .replace(/v_part(\s+)constant integer := 0;/, `v_part$1constant integer := ${opts.part ?? 0};`)
  .replace(/v_scale(\s+)constant numeric := 1;/, `v_scale$1constant numeric := ${opts.scale ?? 0.02};`);

const counts = async (db) => (await db.query(`select
  (select count(*)::int from worker_profiles w join organizations o on o.id=w.organization_id where o.name='ZZ_THU_TAI') workers,
  (select count(*)::int from production_cycles c join organizations o on o.id=c.owner_org_id where o.name='ZZ_THU_TAI') cycles,
  (select count(*)::int from production_stages s join organizations o on o.id=s.organization_id where o.name='ZZ_THU_TAI') stages,
  (select count(*)::int from activity_logs l join organizations o on o.id=l.organization_id where o.name='ZZ_THU_TAI') logs,
  (select count(*)::int from harvest_records l join organizations o on o.id=l.organization_id where o.name='ZZ_THU_TAI') harvests,
  (select count(*)::int from sales_records l join organizations o on o.id=l.organization_id where o.name='ZZ_THU_TAI') sales,
  (select count(*)::int from expense_records l join organizations o on o.id=l.organization_id where o.name='ZZ_THU_TAI') expenses,
  (select count(*)::int from inventory_transactions l join organizations o on o.id=l.organization_id where o.name='ZZ_THU_TAI') txns,
  (select count(*)::int from attendance_records l join organizations o on o.id=l.organization_id where o.name='ZZ_THU_TAI') att`)).rows[0];

test('không có xác nhận thì không chạy', async () => {
  const db = await createDb();
  await addUser(db, 1);
  assert.match(await expectError(db.exec(prep({ confirm: "'KHONG'" }))), /DUNG LAI/);
});

test('nạp đủ các bảng ở quy mô nhỏ; chạy lại không nhân đôi; dọn sạch bằng v_part = 99', async () => {
  const db = await createDb();
  await addUser(db, 1);
  await db.exec(prep());
  const a = await counts(db);
  console.log('SEED', JSON.stringify(a));
  assert.ok(a.workers >= 3 && a.cycles >= 3 && a.stages >= 120 && a.logs >= 50 && a.harvests >= 10 && a.sales >= 10 && a.expenses >= 10 && a.txns > 80 && a.att > 20, JSON.stringify(a));
  await db.exec(prep());                                   // chạy lại: bỏ qua phần đã có
  assert.deepEqual(await counts(db), a);
  await db.exec(prep({ part: 99 }));
  assert.deepEqual(await counts(db), { workers: 0, cycles: 0, stages: 0, logs: 0, harvests: 0, sales: 0, expenses: 0, txns: 0, att: 0 });
  assert.equal((await db.query(`select count(*)::int c from organizations where name='ZZ_THU_TAI'`)).rows[0].c, 0);
});
