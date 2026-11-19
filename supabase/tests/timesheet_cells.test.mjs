import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cellLabel, parseCell, personTotals, totalText, workMinutes } from '../../apps/app/src/lib/timesheetCells.ts';

// Đọc chữ gõ trong ô bảng chấm công giấy (D200): phần thuần.

const p = (t, m = 'shift') => parseCell(t, m);

test('trống, gạch ngang, đủ ca, nửa ca', () => {
  assert.deepEqual(p(''), { kind: 'empty' });
  assert.deepEqual(p('   '), { kind: 'empty' });
  assert.deepEqual(p('-'), { kind: 'none' });
  assert.deepEqual(p('–'), { kind: 'none' });
  for (const t of ['x', 'X', '✓', '✔']) assert.deepEqual(p(t), { kind: 'full' });
  assert.deepEqual(p('½'), { kind: 'half' });
  assert.deepEqual(p('0,5'), { kind: 'half' });
  assert.deepEqual(p('0.5'), { kind: 'half' });
});

test('kiểu ghi ca: 1 = đủ ca, số khác = giờ; kiểu ghi giờ: mọi số là giờ', () => {
  assert.deepEqual(p('1'), { kind: 'full' });
  assert.deepEqual(p('6,5'), { kind: 'hours', hours: 6.5 });
  assert.deepEqual(p('8', 'shift'), { kind: 'hours', hours: 8 });
  assert.deepEqual(p('1', 'hours'), { kind: 'hours', hours: 1 });
  assert.deepEqual(p('0,5', 'hours'), { kind: 'hours', hours: 0.5 });
  assert.deepEqual(p('½', 'hours'), { kind: 'hours', hours: 0.5 });
  assert.deepEqual(p('x', 'hours'), { kind: 'full' });
});

test('ký hiệu nghỉ P Ô V K (gõ thường hoặc hoa, o cũng là Ô)', () => {
  assert.deepEqual(p('p'), { kind: 'P' });
  assert.deepEqual(p('o'), { kind: 'O' });
  assert.deepEqual(p('ô'), { kind: 'O' });
  assert.deepEqual(p('Ô'), { kind: 'O' });
  assert.deepEqual(p('v'), { kind: 'V' });
  assert.deepEqual(p('K'), { kind: 'K' });
});

test('ô sai: số 0, quá 16 giờ, ký hiệu lạ', () => {
  assert.equal(p('0').kind, 'error');
  assert.equal(p('17').kind, 'error');
  assert.equal(p('abc').kind, 'error');
  assert.equal(p('8h').kind, 'error');
  assert.equal(p('1,2,3').kind, 'error');
});

test('chữ hiện lại sau khi gõ', () => {
  assert.equal(cellLabel(p('x')), '✓');
  assert.equal(cellLabel(p('0,5')), '½');
  assert.equal(cellLabel(p('6.5')), '6,5');
  assert.equal(cellLabel(p('o')), 'Ô');
  assert.equal(cellLabel(p('-')), '–');
  assert.equal(cellLabel(p('')), '');
});

test('phút làm và tổng một người (ca đủ 510 phút)', () => {
  assert.equal(workMinutes(p('x'), 510), 510);
  assert.equal(workMinutes(p('½'), 510), 255);
  assert.equal(workMinutes(p('6,5'), 510), 390);
  assert.equal(workMinutes(p('p'), 510), 0);
  const t = personTotals([p('x'), p('x'), p('½'), p('p'), p('abc'), p('')], 510);
  assert.deepEqual(t, { minutes: 1275, off: 1, invalid: 1 });
  assert.equal(totalText(t, 'shift', 510), '2,5 công · 1 nghỉ');
  assert.equal(totalText(personTotals([p('8'), p('6,5')], 510), 'hours', 510), '14,5 giờ');
  assert.equal(totalText(personTotals([p('x')], 510, 510, 2), 'shift', 510), '2 công · 2 nghỉ');   // cộng phần đã có sẵn trong hệ thống
});
