import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDaysIso, weekLabel, delta, deltaTone, deltaText, buildWeeklyText, attentionCount } from '../../apps/app/src/lib/weekly.ts';

// Báo cáo tuần (G2-7, D80): phần tính thuần ở phía app. Không cần CSDL.

test('cộng ngày không lệch múi giờ, qua tháng và năm', () => {
  assert.equal(addDaysIso('2026-10-26', 1), '2026-10-27');
  assert.equal(addDaysIso('2026-10-31', 1), '2026-11-01');
  assert.equal(addDaysIso('2026-12-31', 1), '2027-01-01');
  assert.equal(addDaysIso('2026-03-01', -1), '2026-02-28');
  assert.equal(addDaysIso('2026-10-26', -7), '2026-10-19');
});

test('nhãn tuần', () => {
  assert.equal(weekLabel('2026-10-19', '2026-10-25'), '19/10 – 25/10/2026');
});

test('so sánh với tuần trước: tăng, giảm, bằng, tuần trước chưa có', () => {
  assert.deepEqual(delta(120, 100), { dir: 'up', pct: 20 });
  assert.deepEqual(delta(50, 100), { dir: 'down', pct: 50 });
  assert.deepEqual(delta(100, 100), { dir: 'flat', pct: 0 });
  assert.deepEqual(delta(0, 0), { dir: 'flat', pct: 0 });
  assert.deepEqual(delta(5, 0), { dir: 'new', pct: null });
  assert.equal(deltaText(delta(120, 100), '100'), '▲ 20% so với tuần trước (100)');
  assert.equal(deltaText(delta(50, 100), '100'), '▼ 50% so với tuần trước (100)');
  assert.equal(deltaText(delta(1, 1), '1'), 'Bằng tuần trước');
  assert.equal(deltaText(delta(5, 0), '0'), 'Tuần trước chưa có');
});

test('màu theo nghĩa: doanh thu tăng là tốt, chi phí tăng là xấu, giờ công chỉ để biết', () => {
  assert.equal(deltaTone('revenue', delta(120, 100)), 'ok');
  assert.equal(deltaTone('revenue', delta(80, 100)), 'bad');
  assert.equal(deltaTone('cost', delta(120, 100)), 'bad');
  assert.equal(deltaTone('cost', delta(80, 100)), 'ok');
  assert.equal(deltaTone('labor_hours', delta(120, 100)), 'neutral');
  assert.equal(deltaTone('revenue', delta(100, 100)), 'neutral');
  assert.equal(deltaTone('web_orders', delta(3, 0)), 'ok');
});

const report = (over = {}) => ({
  week_start: '2026-10-19', week_end: '2026-10-25', is_current_week: false,
  cur: { logs: 42, harvest_kg: 1234.5, revenue: 12000000, cost: 5000000, labor_hours: 96, collected: 3000000, paid_out: null, web_orders: 2, web_quotes: 1 },
  prev: { logs: 30, harvest_kg: 1000, revenue: 0, cost: 5000000, labor_hours: 90, collected: 0, paid_out: null, web_orders: 2, web_quotes: 0 },
  daily: [], generated_at: '2026-10-26T00:00:00Z',
  attention: { overdue_payables: { count: 2, amount: 700000 }, overdue_receivables: null, low_stock: 1, late_cycles: 0, pending_attendance: 3, web_orders_waiting: null },
  ...over,
});

test('tóm tắt dạng chữ: có tuần, tên cơ sở, các chỉ số được phép, so sánh, điểm cần chú ý; bỏ chỉ số không có quyền', () => {
  const t = buildWeeklyText(report(), 'Hộ A');
  assert.match(t, /^BÁO CÁO TUẦN 19\/10 – 25\/10\/2026 · Hộ A/);
  assert.match(t, /Việc đã ghi: 42 \(tăng 40% so với tuần trước\)/);
  assert.match(t, /Doanh thu: 12\.000\.000 đ \(tuần trước chưa có\)/);
  assert.match(t, /Chi phí: 5\.000\.000 đ \(bằng tuần trước\)/);
  assert.doesNotMatch(t, /Đã trả nợ/); // không có quyền xem: bỏ hẳn, không in "null"
  assert.match(t, /2 hóa đơn mua quá hạn \(700\.000 đ\)/);
  assert.match(t, /1 vật tư sắp hết/);
  assert.match(t, /3 ca công chờ xác nhận/);
  assert.doesNotMatch(t, /null|undefined|NaN/);
  assert.match(t, /Chi phí không gồm tiền mua vật tư/);
});

test('không có điểm cần chú ý thì không in mục "Cần chú ý"; đếm điểm chú ý', () => {
  const quiet = report({ attention: { overdue_payables: { count: 0, amount: 0 }, overdue_receivables: null, low_stock: 0, late_cycles: 0, pending_attendance: 0, web_orders_waiting: null } });
  assert.doesNotMatch(buildWeeklyText(quiet, 'Hộ A'), /Cần chú ý/);
  assert.equal(attentionCount(quiet.attention), 0);
  assert.equal(attentionCount(report().attention), 3);
});
