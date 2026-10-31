import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDb, addUser } from './harness.mjs';

// Script đo báo cáo (supabase/maintenance/measure_reports.sql) chạy được trên dữ liệu nạp nhỏ và mọi hàm trả kết quả không lỗi.
const read = (f) => readFileSync(new URL(`../maintenance/${f}`, import.meta.url), 'utf8');
test('measure_reports.sql chạy được, mọi báo cáo không lỗi', async () => {
  const db = await createDb();
  await addUser(db, 1);
  const seed = read('seed_load_test.sql').replace("'KHONG'", "'TAO-DU-LIEU-THU'").replace("'email-cua-ban@...'", "'u1@test.local'")
    .replace(/v_part(\s+)constant integer := 0;/, 'v_part$1constant integer := 0;').replace(/v_scale(\s+)constant numeric := 1;/, 'v_scale$1constant numeric := 0.02;');
  await db.exec(seed);
  const sql = read('measure_reports.sql').replace("'email-cua-ban@...'", "'u1@test.local'");
  await db.exec(sql);
  const r = (await db.query(`select name, run, err from perf_out order by name, run`)).rows;
  assert.equal(r.length, 30);
  assert.deepEqual(r.filter((x) => x.err), []);
});
