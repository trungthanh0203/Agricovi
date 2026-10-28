import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';
import { effectiveWorkTypes, fieldsForKind, workTypesForKind } from '../../apps/app/src/lib/catalog.ts';
import { STANDARD_FIELDS, sharedCodeFor } from '../../apps/app/src/lib/standardFields.ts';
import { checkSchemaDraft } from '../../apps/app/src/lib/fieldsLogic.ts';

// Điểm 2 (migration 0107): đầu việc và biểu mẫu theo loại vụ. Phần thuần (chọn biểu mẫu, lọc việc) + phần CSDL.

const f = (key, label = key) => ({ key, label, type: 'text' });
const shared = (code, name, extra = {}) => ({ id: `s-${code}`, code, name, field_schema: [f('base')], organization_id: null, is_active: true, ...extra });

test('biểu mẫu chuẩn: hợp lệ, khóa không trùng, giữ khóa mà Tăng trọng/FCR đọc (pigs, avg_kg, feed_kg)', () => {
  for (const [kind, byCode] of Object.entries(STANDARD_FIELDS)) {
    for (const [code, fields] of Object.entries(byCode)) {
      assert.equal(new Set(fields.map((x) => x.key)).size, fields.length, `${kind}/${code}: khóa trùng`);
      assert.equal(checkSchemaDraft(fields), null, `${kind}/${code}`);
    }
    if (kind === 'crop') continue; // cây trồng không có Cân mẫu / Cho ăn
    const keys = (c) => byCode[c].map((x) => x.key);
    assert.ok(keys('weighing').includes('avg_kg'), `${kind}: Cân mẫu cần khóa avg_kg`);
    assert.ok(keys('feeding').includes('feed_kg'), `${kind}: Cho ăn cần khóa feed_kg`);
  }
  assert.ok(STANDARD_FIELDS.livestock.weighing.some((x) => x.key === 'pigs'));
});

test('chọn biểu mẫu theo loại: bản chỉnh đúng loại > bản chỉnh mọi loại > biểu mẫu chuẩn > form gốc; cây trồng giữ form gốc', () => {
  const org = 'O';
  const row = shared('feeding', 'Cho ăn');
  assert.deepEqual(fieldsForKind(row, org, 'livestock'), STANDARD_FIELDS.livestock.feeding); // chưa chỉnh gì: chuẩn
  assert.deepEqual(fieldsForKind(row, org, 'crop'), [f('base')]); // cây trồng không có chuẩn: form gốc
  assert.deepEqual(fieldsForKind(row, org, undefined), [f('base')]);
  const any = { display_name: null, field_schema: [f('any')], is_active: true };
  const lv = { display_name: null, field_schema: [f('lv')], is_active: true };
  assert.deepEqual(fieldsForKind({ ...row, ov: { [org]: any } }, org, 'livestock'), [f('any')]); // bản chỉnh mọi loại giữ nguyên (cơ sở cũ không đổi)
  assert.deepEqual(fieldsForKind({ ...row, ov: { [org]: any }, ovk: { [org]: { livestock: lv } } }, org, 'livestock'), [f('lv')]);
  assert.deepEqual(fieldsForKind({ ...row, ov: { [org]: any }, ovk: { [org]: { livestock: lv } } }, org, 'aquatic'), [f('any')]); // loại khác không bị ghi đè
  assert.deepEqual(fieldsForKind({ ...row, ovk: { 'KHAC': { livestock: lv } } }, org, 'livestock'), STANDARD_FIELDS.livestock.feeding); // bản chỉnh của cơ sở khác
  // việc riêng của cơ sở: chỉ form của chính nó
  assert.deepEqual(fieldsForKind({ ...row, organization_id: org, field_schema: [f('mine')] }, org, 'livestock'), [f('mine')]);
});

test('lọc đầu việc theo loại: bỏ việc không áp dụng; việc riêng cùng tên thay việc chuẩn; loại Khác hoặc chưa rõ thì hiện đủ', () => {
  const rows = [
    shared('spraying', 'Phun thuốc', { applies_to: ['crop'] }),
    shared('feeding', 'Cho ăn', { applies_to: ['livestock', 'aquatic'] }),
    shared('vaccinating', 'Tiêm vaccine', { applies_to: ['livestock'] }),
    shared('harvesting', 'Thu hoạch'),
    { ...shared('mine', 'cho ăn'), id: 'mine', organization_id: 'O' },
  ];
  const eff = effectiveWorkTypes(rows, 'O', 'livestock');
  const names = (kind) => workTypesForKind(effectiveWorkTypes(rows, 'O', kind), kind).map((w) => w.name);
  assert.deepEqual(names('crop'), ['Phun thuốc', 'Thu hoạch', 'cho ăn']); // việc riêng không giới hạn loại nên vẫn hiện; việc chuẩn vật nuôi bị ẩn
  assert.deepEqual(names('livestock'), ['Tiêm vaccine', 'Thu hoạch', 'cho ăn']); // "Cho ăn" chuẩn nhường cho việc riêng cùng tên
  assert.deepEqual(names('aquatic'), ['Thu hoạch', 'cho ăn']);
  assert.equal(names('other').length, 5);
  assert.equal(workTypesForKind(eff, undefined).length, 5);
});

const id = (k, n) => `${k}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('CSDL: đầu việc chuẩn có sẵn đúng loại; bản chỉnh theo loại tách riêng; Tăng trọng nhận việc "Cân mẫu"', async () => {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  const code = async (c) => (await db.query(`select id, applies_to from work_types where organization_id is null and code=$1`, [c])).rows[0];

  assert.deepEqual((await code('vaccinating')).applies_to, ['livestock']);
  assert.deepEqual((await code('water_measuring')).applies_to, ['aquatic']);
  assert.deepEqual((await code('feeding')).applies_to, ['livestock']); // tách riêng từng đối tượng (migration 0111)
  assert.deepEqual((await code('feeding_aq')).applies_to, ['aquatic']);
  assert.deepEqual((await code('spraying')).applies_to, ['crop']);
  assert.deepEqual((await code('harvesting')).applies_to, ['crop']); // không còn việc dùng chung mọi loại
  assert.equal((await db.query(`select count(*)::int n from work_types where organization_id is null and (applies_to is null or cardinality(applies_to) <> 1)`)).rows[0].n, 0);
  // mọi mã có biểu mẫu chuẩn đều có việc dùng chung đúng loại (migration 0107/0108), và CSDL nhận biểu mẫu đó
  for (const [kind, byCode] of Object.entries(STANDARD_FIELDS)) {
    for (const [c, fields] of Object.entries(byCode)) {
      const w = await code(sharedCodeFor(kind, c));
      assert.ok(w, `${kind}/${c}: thiếu việc dùng chung`);
      assert.deepEqual(w.applies_to, [kind], `${kind}/${c}: mỗi việc dùng chung chỉ áp dụng cho một đối tượng`);
      assert.equal((await db.query(`select valid_field_schema($1::jsonb) ok`, [JSON.stringify(fields)])).rows[0].ok, true, `${kind}/${c}`);
    }
  }
  assert.match(await expectError(db.query(`insert into work_types (organization_id, code, name, applies_to) values ($1,'x1','Việc X','{xyz}')`, [org])), /check|applies_to/i);

  // cùng một việc, cùng cơ sở: bản chỉnh "mọi loại" và bản chỉnh riêng cho từng loại cùng tồn tại
  const wt = (await code('harvesting')).id;
  const put = (kind, name) => asUser(db, owner, `insert into org_catalog_overrides (organization_id,item_kind,item_id,kind,field_schema) values ($1,'work_type',$2,$3,$4::jsonb)`, [org, wt, kind, JSON.stringify([{ key: 'k1', label: name, type: 'text' }])]);
  await put('', 'chung');
  await put('livestock', 'vật nuôi');
  await put('aquatic', 'thủy sản');
  assert.equal((await db.query(`select count(*)::int n from org_catalog_overrides where item_id=$1`, [wt])).rows[0].n, 3);
  assert.match(await expectError(put('livestock', 'trùng')), /duplicate|unique|primary/i);
  assert.match(await expectError(put('khac_la', 'x')), /check|kind/i);

  // Tăng trọng/FCR nhận việc chuẩn "Cân mẫu" (mã weighing) lẫn "Cân heo" cũ
  const area = id('2', 1), cyc = id('3', 1);
  await db.query(`insert into production_areas (id,organization_id,name) values ($1,$2,'Chuồng')`, [area, org]);
  await db.query(`insert into production_cycles (id,owner_org_id,area_id,crop_type_id,status,plant_count) values ($1,$2,$3,(select id from crop_types limit 1),'active',100)`, [cyc, org, area]);
  const weighing = (await code('weighing')).id;
  await db.query(`insert into activity_logs (id,organization_id,cycle_id,work_type_id,performed_at,data) values ($1,$2,$3,$4,'2026-11-01T03:00:00Z',$5::jsonb)`, [id('4', 1), org, cyc, weighing, JSON.stringify({ pigs: 100, avg_kg: 30 })]);
  const old = (await db.query(`insert into work_types (organization_id, code, name) values ($1,'can_heo','Cân heo') returning id`, [org])).rows[0].id;
  await db.query(`insert into activity_logs (id,organization_id,cycle_id,work_type_id,performed_at,data) values ($1,$2,$3,$4,'2026-12-01T03:00:00Z',$5::jsonb)`, [id('4', 2), org, cyc, old, JSON.stringify({ pigs: 90, avg_kg: 55 })]);
  const g = (await asUser(db, owner, `select get_cycle_growth($1) g`, [cyc])).rows[0].g;
  assert.deepEqual(g.weighings.map((w) => [w.date, Number(w.avg_kg)]), [['2026-11-01', 30], ['2026-12-01', 55]]);
});
