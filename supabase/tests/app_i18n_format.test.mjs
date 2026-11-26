// Đọc số theo ngôn ngữ (không đụng CSDL): tiếng Việt giữ như cũ, tiếng Anh không được hiểu nhầm dấu phẩy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDecimal, numberToInput, fmtMoney, LANG_KEY } from '../../apps/app/src/lib/format.ts';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
const num = (s) => Number(normalizeDecimal(s));

test('tiếng Việt: dấu phẩy là thập phân', () => {
  store.delete(LANG_KEY);
  assert.equal(num('1,5'), 1.5);
  assert.equal(num('1.5'), 1.5);
  assert.equal(num('1,500'), 1.5);
  assert.equal(numberToInput(1.125), '1,125');
  assert.equal(fmtMoney(40000), '40.000 đ');
});

test('tiếng Anh: dấu phẩy chỉ nhóm nghìn, còn lại báo lỗi', () => {
  store.set(LANG_KEY, 'en');
  assert.equal(num('1.5'), 1.5);
  assert.equal(num('1,500'), 1500);
  assert.equal(num('12,345.6'), 12345.6);
  assert.ok(Number.isNaN(num('1,5')));
  assert.ok(Number.isNaN(num('0,125')));
  assert.equal(num(numberToInput(1.125)), 1.125);
  assert.equal(fmtMoney(40000), '40,000 VND');
});
