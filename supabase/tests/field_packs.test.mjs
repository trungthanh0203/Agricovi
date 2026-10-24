import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from './harness.mjs';
import { FIELD_PACKS, planPackApply } from '../../apps/app/src/lib/fieldPacks.ts';
import { checkSchemaDraft } from '../../apps/app/src/lib/fieldsLogic.ts';

// D96: bộ mẫu theo loại hình phải hợp lệ với CSDL và khớp mã loại việc có sẵn.

test('mọi bộ mẫu hợp lệ: khóa không trùng, qua kiểm tra nháp, được CSDL nhận, mã việc có trong danh mục dùng chung', async () => {
  const db = await createDb();
  const shared = (await db.query(`select id, code, name, field_schema from work_types where organization_id is null`)).rows;
  assert.ok(FIELD_PACKS.length >= 1);
  for (const pack of FIELD_PACKS) {
    for (const [code, fields] of Object.entries(pack.workTypes)) {
      assert.equal(new Set(fields.map((f) => f.key)).size, fields.length, `${pack.id}/${code}: khóa trùng`);
      assert.equal(checkSchemaDraft(fields), null, `${pack.id}/${code}`);
      assert.ok(shared.some((w) => w.code === code), `${pack.id}: không có việc dùng chung mã ${code}`);
      // CSDL phải nhận (ràng buộc valid_field_schema)
      const w = shared.find((x) => x.code === code);
      await db.query(`update work_types set field_schema = $1::jsonb where id = $2`, [JSON.stringify(fields), w.id]);
    }
    const plan = planPackApply(pack, shared.map((w) => ({ ...w, shared: true })));
    assert.equal(plan.missing.length, 0);
    assert.equal(plan.steps.length, Object.keys(pack.workTypes).length);
  }
  // việc thiếu thì báo thiếu, không lỗi
  const p = planPackApply(FIELD_PACKS[0], []);
  assert.equal(p.steps.length, 0);
  assert.equal(p.missing.length, Object.keys(FIELD_PACKS[0].workTypes).length);
});
