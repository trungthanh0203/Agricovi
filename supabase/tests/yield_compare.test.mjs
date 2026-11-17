import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareRows, previousCycleIds, yieldChangePct } from '../../apps/app/src/lib/yieldCompare.ts';

// So năng suất theo diện tích với các vụ trước cùng nơi (H6, D185): phần thuần.

const cyc = (id, over = {}) => ({ id, area_id: 'A', crop_type_id: 'melon', status: 'ended', end_date: '2026-01-01', ...over });
const stat = (id, y, over = {}) => ({ cycle_id: id, yield_per_1000m2: y, cost_per_1000m2: 1000, profit_per_1000m2: 500, cost_per_kg: 10, ...over });

test('chọn vụ trước: cùng khu, cùng sản phẩm, đã kết thúc, mới nhất trước, tối đa 3', () => {
  const cur = cyc('cur', { status: 'active' });
  const all = [cur, cyc('a', { end_date: '2025-03-01' }), cyc('b', { end_date: '2025-09-01' }), cyc('c', { end_date: '2025-06-01' }), cyc('d', { end_date: '2024-01-01' }),
    cyc('x', { area_id: 'B' }), cyc('y', { crop_type_id: 'pig' }), cyc('z', { status: 'active' })];
  assert.deepEqual(previousCycleIds(cur, all), ['b', 'c', 'a']);
  assert.deepEqual(previousCycleIds(cur, all, 1), ['b']);
});

test('hàng so sánh: vụ này đứng đầu, bỏ vụ không có số liệu', () => {
  const rows = compareRows('cur', [stat('cur', 120), stat('b', 100)], ['b', 'a']);
  assert.deepEqual(rows.map((r) => [r.cycleId, r.current]), [['cur', true], ['b', false]]);
});

test('thay đổi năng suất so với vụ trước gần nhất có năng suất', () => {
  assert.equal(yieldChangePct(compareRows('cur', [stat('cur', 120), stat('b', 100)], ['b'])), 20);
  assert.equal(yieldChangePct(compareRows('cur', [stat('cur', 80), stat('b', 100)], ['b'])), -20);
  assert.equal(yieldChangePct(compareRows('cur', [stat('cur', 80), stat('b', null), stat('c', 160)], ['b', 'c'])), -50);   // bỏ qua vụ chưa có năng suất
  assert.equal(yieldChangePct(compareRows('cur', [stat('cur', null), stat('b', 100)], ['b'])), null);
  assert.equal(yieldChangePct(compareRows('cur', [stat('cur', 80)], [])), null);
});
