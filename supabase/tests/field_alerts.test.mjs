import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alertOf, fieldAlerts, prefillValues } from '../../apps/app/src/lib/fieldAlerts.ts';
import { STANDARD_FIELDS } from '../../apps/app/src/lib/standardFields.ts';

// Phiếu đo môi trường nước: ngưỡng cảnh báo mềm và điền sẵn lần đo trước (migration 0120 + standardFields).

const water = STANDARD_FIELDS.aquatic.water_measuring;

test('ô số ngoài ngưỡng thì cảnh báo, trong ngưỡng hoặc trống thì không', () => {
  const oxy = water.find((f) => f.key === 'oxygen');
  assert.match(alertOf(oxy, '3,2'), /thấp hơn ngưỡng 4 mg\/l/);
  assert.equal(alertOf(oxy, '4'), null);
  assert.equal(alertOf(oxy, ''), null);
  assert.equal(alertOf(oxy, undefined), null);
  const ph = water.find((f) => f.key === 'ph');
  assert.match(alertOf(ph, 9), /cao hơn ngưỡng 8,5/);
  assert.equal(alertOf(ph, '8.0'), null);
  assert.equal(alertOf(water.find((f) => f.key === 'salinity'), '30'), null); // không đặt ngưỡng thì không cảnh báo
  assert.equal(alertOf({ key: 'x', label: 'X', type: 'text', alert_low: 1 }, '0'), null); // chỉ ô số
});

test('cảnh báo cả bản ghi theo biểu mẫu; điền sẵn chỉ cho ô đánh dấu prefill', () => {
  const data = { ph: 6.8, temperature: 29, oxygen: 3.5, salinity: 15, transparency: 40 };
  const a = fieldAlerts(water, data);
  assert.deepEqual(a.map((x) => x.key), ['ph', 'oxygen']);
  assert.match(a[0].text, /^pH 6,8 thấp hơn ngưỡng 7,5$/);
  const pre = prefillValues(water, data);
  assert.deepEqual(pre, { ph: '6,8', temperature: '29', oxygen: '3,5', salinity: '15', transparency: '40' });
  assert.deepEqual(prefillValues(water, null), {});
  // ô không đánh dấu prefill (Người kiểm tra) không được điền sẵn
  assert.equal('checker' in prefillValues(water, { ...data, checker: 'A' }), false);
});
