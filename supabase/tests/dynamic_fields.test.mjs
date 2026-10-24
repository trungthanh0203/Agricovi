import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, addUser, asUser, expectError } from './harness.mjs';
import { initialValues, validateFields, fieldsToData, summarizeFields, checkSchemaDraft } from '../../apps/app/src/lib/fieldsLogic.ts';

// Migration 0077 (D96): form động. Phần thuần (kiểm tra nhập, đổi sang data, tóm tắt) và ràng buộc dạng field_schema ở CSDL.

const schema = [
  { key: 'a', label: 'Thuốc', type: 'select', options: ['Radiant', 'Ridomil'], required: true },
  { key: 'b', label: 'Lượng nước', type: 'number', unit: 'lít', min: 1, max: 500 },
  { key: 'c', label: 'Đối tượng', type: 'multiselect', options: ['Rệp', 'Nấm', 'Sâu'] },
  { key: 'd', label: 'Đúng liều', type: 'bool' },
  { key: 'e', label: 'Ngày pha', type: 'date' },
  { key: 'f', label: 'Ghi chú', type: 'text', default: 'Sáng sớm' },
];

test('kiểm tra nhập: bắt buộc, số trong khoảng, dấu phẩy; đổi sang data và tóm tắt đúng kiểu', () => {
  assert.equal(initialValues(schema).f, 'Sáng sớm');
  assert.equal(initialValues(schema, {}).f, '');
  assert.match(validateFields(schema, {}), /Thuốc/);
  assert.match(validateFields(schema, { a: 'Radiant', b: 'abc' }), /phải là số/);
  assert.match(validateFields(schema, { a: 'Radiant', b: '0' }), /không được nhỏ hơn 1/);
  assert.match(validateFields(schema, { a: 'Radiant', b: '600' }), /không được lớn hơn 500/);
  assert.match(validateFields(schema, { a: 'Radiant', e: '12/10' }), /chọn ngày/);
  const v = { a: 'Radiant', b: '12,5', c: 'Rệp|Nấm', d: 'yes', e: '2026-10-20', f: '' };
  assert.equal(validateFields(schema, v), null);
  const data = fieldsToData(schema, v, { keep: 1, f: 'cũ' });
  assert.deepEqual(data, { keep: 1, a: 'Radiant', b: 12.5, c: ['Rệp', 'Nấm'], d: true, e: '2026-10-20' });
  assert.equal(summarizeFields(schema, data), 'Thuốc: Radiant · Lượng nước: 12.5 lít · Đối tượng: Rệp, Nấm · Đúng liều: Có · Ngày pha: 20/10/2026');
  assert.deepEqual(initialValues(schema, data).c, 'Rệp|Nấm');
  assert.equal(initialValues(schema, data).d, 'yes');
  assert.match(checkSchemaDraft([{ key: 'x', label: 'X', type: 'select' }]), /ít nhất một lựa chọn/);
  assert.match(checkSchemaDraft([{ key: 'x', label: 'X', type: 'number', min: 5, max: 1 }]), /nhỏ nhất lớn hơn/);
});

test('CSDL chỉ nhận field_schema hợp lệ (loại việc và bản chỉnh của cơ sở)', async () => {
  const db = await createDb();
  const owner = await addUser(db, 1);
  const org = (await asUser(db, owner, `select create_organization('household','Hộ A') id`)).rows[0].id;
  const ins = (schemaJson) => db.query(`insert into work_types (organization_id, code, name, field_schema) values ($1, 'c' || gen_random_uuid()::text, 'Việc thử', $2::jsonb)`, [org, JSON.stringify(schemaJson)]);
  await ins(schema);
  await ins([]);
  assert.match(await expectError(ins([{ key: 'a', label: 'X', type: 'photo' }])), /work_types_field_schema_valid/);
  assert.match(await expectError(ins([{ key: 'a b', label: 'X', type: 'text' }])), /work_types_field_schema_valid/);
  assert.match(await expectError(ins([{ key: 'a', label: 'X', type: 'text' }, { key: 'a', label: 'Y', type: 'text' }])), /work_types_field_schema_valid/);
  assert.match(await expectError(ins([{ key: 'a', label: 'X', type: 'number', min: 9, max: 1 }])), /work_types_field_schema_valid/);
  assert.match(await expectError(ins([{ key: 'a', label: '', type: 'text' }])), /work_types_field_schema_valid/);
  assert.match(await expectError(ins({ key: 'a' })), /work_types_field_schema_valid/);
  const shared = (await db.query(`select id from work_types where organization_id is null and code = 'spraying'`)).rows[0].id;
  await asUser(db, owner, `insert into org_catalog_overrides (organization_id, item_kind, item_id, field_schema) values ($1, 'work_type', $2, $3::jsonb)`, [org, shared, JSON.stringify(schema)]);
  assert.match(await expectError(asUser(db, owner, `update org_catalog_overrides set field_schema = '[{"key":"z","label":"Z","type":"zzz"}]'::jsonb where organization_id = $1`, [org])), /overrides_field_schema_valid/);
});
