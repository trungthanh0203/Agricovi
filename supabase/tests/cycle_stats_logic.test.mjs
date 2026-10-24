import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pctOf, budgetTone, statWarnings, hasAnyStat } from '../../apps/app/src/lib/cycleStatsLogic.ts';

// Số liệu tóm tắt của vụ (D93): phần tính thuần ở phía app.

test('phần trăm so với kế hoạch và màu ngân sách', () => {
  assert.equal(pctOf(720000, 1000000), 72);
  assert.equal(pctOf(1200000, 1000000), 120);
  assert.equal(pctOf(5, null), null);
  assert.equal(pctOf(5, 0), null);
  assert.equal(pctOf(null, 100), null);
  assert.deepEqual([budgetTone(50), budgetTone(80), budgetTone(100), budgetTone(101)], ['ok', 'warn', 'warn', 'bad']);
});

test('lưu ý thiếu dữ liệu và ẩn dòng thống kê khi không có quyền nào', () => {
  const base = { cost_total: null, harvest_net: null, revenue: null, labor_hours: null, missing_cost: null, has_estimate: null, missing_harvest: null, missing_revenue: null };
  assert.equal(hasAnyStat(undefined), false);
  assert.equal(hasAnyStat(base), false);
  assert.equal(hasAnyStat({ ...base, labor_hours: 2 }), true);
  assert.deepEqual(statWarnings(base), []);
  const w = statWarnings({ ...base, cost_total: 1, missing_cost: true, has_estimate: true, missing_harvest: true, missing_revenue: true });
  assert.equal(w.length, 4);
});
