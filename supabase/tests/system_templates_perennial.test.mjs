import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from './harness.mjs';

// Migration 0183: bốn mẫu hệ thống (nho, na, dê, bò) hợp lệ: đủ công đoạn và việc, mã loại việc đúng.
test('mẫu hệ thống nho, na, dê, bò có đủ công đoạn và việc', async () => {
  const db = await createDb();
  for (const [code, kind, phases, minStages] of [['grape_season', 'crop', 5, 16], ['custard_apple_year', 'crop', 6, 13], ['goat_herd_quarter', 'livestock', 4, 13], ['cattle_herd_quarter', 'livestock', 4, 13]]) {
    const t = (await db.query(`select id, kind from system_templates where code=$1`, [code])).rows[0];
    assert.ok(t, code);
    assert.equal(t.kind, kind);
    assert.equal((await db.query(`select count(*)::int n from system_template_phases where system_template_id=$1`, [t.id])).rows[0].n, phases);
    const st = (await db.query(`select count(*)::int n, count(work_type_id)::int w from system_template_stages where system_template_id=$1`, [t.id])).rows[0];
    assert.equal(st.n, minStages);
    assert.equal(st.w, st.n, `${code}: mọi việc phải có loại việc hợp lệ`);
  }
});
