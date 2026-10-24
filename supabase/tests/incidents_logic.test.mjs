import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortIncidents, openCount, overdueActions, dueActions, lossTotals, kindLabel } from '../../apps/app/src/lib/incidentsLogic.ts';

// D95 (T3): phần thuần của sự cố và việc khắc phục.
const inc = (id, date, status = 'open', extra = {}) => ({ id, incident_date: date, status, voided_at: null, loss_amount: null, ...extra });
const act = (id, incident_id, due, done = false) => ({ id, incident_id, due_date: due, done });

test('sắp xếp: đang mở trước, mới nhất trước; đếm bỏ sự cố đã hủy', () => {
  const l = [inc('a', '2026-10-01', 'closed'), inc('b', '2026-10-05'), inc('c', '2026-10-10'), inc('d', '2026-10-12', 'open', { voided_at: 'x' })];
  assert.deepEqual(sortIncidents(l).map((i) => i.id), ['d', 'c', 'b', 'a']);
  assert.equal(openCount(l), 2);
  assert.equal(kindLabel('pest'), 'Sâu bệnh');
});

test('việc quá hạn và đến hạn chỉ tính sự cố đang mở và việc chưa xong; tổng thiệt hại bỏ sự cố đã hủy', () => {
  const l = [inc('a', '2026-10-01'), inc('b', '2026-10-02', 'closed'), inc('c', '2026-10-03', 'open', { voided_at: 'x' })];
  const a = [act('1', 'a', '2026-10-20'), act('2', 'a', '2026-10-27'), act('3', 'a', '2026-10-10', true), act('4', 'b', '2026-10-01'), act('5', 'c', '2026-10-01'), act('6', 'a', null)];
  assert.deepEqual(overdueActions(a, l, '2026-10-25').map((x) => x.id), ['1']);
  assert.deepEqual(dueActions(a, l, '2026-10-28').map((x) => x.id), ['1', '2']);
  assert.equal(lossTotals([inc('a', '2026-10-01', 'open', { loss_amount: 100 }), inc('b', '2026-10-01', 'open', { loss_amount: 50, voided_at: 'x' })]).amount, 100);
  assert.equal(lossTotals([inc('a', '2026-10-01')]).amount, null);
});
