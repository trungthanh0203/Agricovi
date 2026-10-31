import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from './harness.mjs';

// Migration 0146: chỉ mục theo cột sắp xếp của các truy vấn đồng bộ "mới nhất trước, giới hạn 200 dòng".
test('có chỉ mục theo cột sắp xếp cho các truy vấn đồng bộ', async () => {
  const db = await createDb();
  const idx = (await db.query(`select indexname from pg_indexes where schemaname='public'`)).rows.map((r) => r.indexname);
  for (const n of ['activity_logs_performed_idx', 'harvest_records_harvested_idx', 'expense_records_date_idx', 'sales_records_sold_idx', 'cycle_notes_note_date_idx']) assert.ok(idx.includes(n), n);
});
