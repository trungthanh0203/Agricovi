import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDecimal, toM2, fromM2, fmtArea, per1000ToUnit } from '../../apps/app/src/lib/areaUnits.ts';

// Đơn vị diện tích (D94, T1): quy đổi và đọc số người gõ.

test('đọc số: dấu chấm hàng nghìn, dấu phẩy thập phân, ô trống và chữ', () => {
  assert.equal(parseDecimal('1.200'), 1200);
  assert.equal(parseDecimal('1.200.000'), 1200000);
  assert.equal(parseDecimal('1,5'), 1.5);
  assert.equal(parseDecimal('2.5'), 2.5);
  assert.equal(parseDecimal(' 500 '), 500);
  assert.equal(parseDecimal(''), null);
  assert.equal(parseDecimal('abc'), null);
});

test('quy đổi m² với ha, sào, công; hiển thị; năng suất theo đơn vị', () => {
  assert.equal(toM2(2, 'ha'), 20000);
  assert.equal(toM2(1, 'sao_bb'), 360);
  assert.equal(toM2(1, 'sao_tb'), 500);
  assert.equal(toM2(3, 'cong'), 3000);
  assert.equal(fromM2(720, 'sao_bb'), 2);
  assert.equal(fromM2(500, 'm2'), 500);
  assert.equal(fmtArea(500, 'm2'), '500 m²');
  assert.equal(fmtArea(20000, 'ha'), '2 ha');
  assert.equal(fmtArea(540, 'sao_bb'), '1,5 sào');
  assert.equal(toM2(1, 'không-có'), 1); // đơn vị lạ coi như m²
  assert.equal(per1000ToUnit(2000, 'ha'), 20000); // 2.000 kg/1.000 m² = 20.000 kg/ha
  assert.equal(per1000ToUnit(2000, 'm2'), 2); // 2.000 kg/1.000 m² = 2 kg/m²
});
