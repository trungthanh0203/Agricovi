import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarCells, compareWithPrev, filterCounts, filterRows, rowStatus, singleRate, sortRows, statement } from '../../apps/app/src/lib/payView.ts';

// Giao diện Bảng lương mới (D207): phần thuần.

const row = (name, o = {}) => ({
  worker_id: name, name, user_id: null, status: 'active', team_id: null, team_name: null, hours: 100, pending_hours: 0, days: 10, hourly: 4000000, salary: 0, piece: 0,
  bonus: 0, deduction: 0, advance: 0, net: 4000000, net_locked: 4000000, no_rate_days: 0, n_locked: 5, n_calculated: 0, n_estimate: 0, n_open: 0, ...o,
});
const rows = [
  row('An', { net: 5000000, hours: 120 }),
  row('Bình', { net: 3000000, hours: 90, n_locked: 0, n_estimate: 4, net_locked: 0 }),                       // chưa chốt
  row('Chi', { net: 4000000, hours: 150, pending_hours: 8 }),                                               // cần xử lý: chờ xác nhận
  row('Dũng', { net: 0, hours: 0, days: 0, n_locked: 0, hourly: 0, net_locked: 0 }),                         // chưa có số liệu
];

test('trạng thái từng người: cần xử lý, đã chốt, chưa chốt, chưa có số liệu', () => {
  assert.deepEqual(rows.map(rowStatus), ['locked', 'open', 'attention', 'none']);
  assert.equal(rowStatus(row('X', { no_rate_days: 2 })), 'attention');
  assert.equal(rowStatus(row('Y', { n_open: 1 })), 'attention');
});

test('lọc và đếm: Cần xử lý, Chưa chốt (gồm cả cần xử lý), Đã chốt', () => {
  assert.deepEqual(filterRows(rows, 'todo').map((r) => r.name), ['Chi']);
  assert.deepEqual(filterRows(rows, 'locked').map((r) => r.name), ['An']);
  assert.deepEqual(filterRows(rows, 'open').map((r) => r.name), ['Bình', 'Chi']);
  assert.deepEqual(filterCounts(rows), { all: 4, todo: 1, open: 2, locked: 1 });
});

test('sắp xếp: tên theo tiếng Việt, thực nhận, giờ công, cần xử lý trước; không đổi mảng gốc', () => {
  const names = (k) => sortRows(rows, k).map((r) => r.name);
  assert.deepEqual(names('name'), ['An', 'Bình', 'Chi', 'Dũng']);
  assert.deepEqual(names('net_desc'), ['An', 'Chi', 'Bình', 'Dũng']);
  assert.deepEqual(names('net_asc'), ['Dũng', 'Bình', 'Chi', 'An']);
  assert.deepEqual(names('hours_desc'), ['Chi', 'An', 'Bình', 'Dũng']);
  assert.deepEqual(names('todo_first'), ['Chi', 'An', 'Bình', 'Dũng']);
  assert.deepEqual(rows.map((r) => r.name), ['An', 'Bình', 'Chi', 'Dũng']);
});

test('phiếu lương: thu nhập − khấu trừ = thực nhận; gap báo lệch', () => {
  const s = statement(row('L', { hourly: 6720000, piece: 1200000, bonus: 800000, deduction: 100000, advance: 200000, net: 8420000 }));
  assert.deepEqual(s, { income: 8720000, deduct: 300000, net: 8420000, gap: 0 });
  assert.equal(statement(row('M', { hourly: 1000, net: 5000 })).gap, 4000);
});

test('so với kỳ trước: phần trăm, tăng giảm, không có kỳ trước thì null', () => {
  assert.deepEqual(compareWithPrev(106, 100), { pct: 6, tone: 'up' });
  assert.deepEqual(compareWithPrev(90, 100), { pct: -10, tone: 'down' });
  assert.deepEqual(compareWithPrev(100, 100), { pct: 0, tone: 'same' });
  assert.equal(compareWithPrev(100, 0), null);
  assert.equal(compareWithPrev(100, undefined), null);
});

test('đơn giá giờ: một mức, nhiều mức, không có', () => {
  const it = (rate, kind = 'hours') => ({ kind, date: '2026-11-01', id: null, minutes: 480, amount: 0, rate, status: 'estimate', label: null, started_at: null, ended_at: null, break_minutes: null });
  assert.equal(singleRate([it(40000), it(40000)]), 40000);
  assert.equal(singleRate([it(40000), it(45000)]), 'multi');
  assert.equal(singleRate([it(null, 'bonus')]), null);
});

test('lịch công: tuần bắt đầu thứ hai, ô trống đầu tuần, trạng thái từng ngày, kỳ quá 62 ngày không vẽ', () => {
  const it = (date, minutes, kind = 'hours') => ({ kind, date, id: null, minutes, amount: 0, rate: 1, status: 'estimate', label: null, started_at: null, ended_at: null, break_minutes: null });
  // 1/11/2026 là chủ nhật → 6 ô trống đầu
  const c = calendarCells('2026-11-01', '2026-11-30', [it('2026-11-02', 510), it('2026-11-03', 240), it('2026-11-04', 480, 'pending'), it('2026-11-05', 0, 'open')], ['2026-11-06', '2026-11-03']);
  assert.equal(c.filter((x) => x.date === null).length, 6);
  assert.equal(c.length, 6 + 30);
  const st = (d) => c.find((x) => x.date === d).state;
  assert.deepEqual(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'].map(st), ['none', 'full', 'part', 'pending', 'pending', 'off']);   // 3/11 có công nên thắng ghi nghỉ
  assert.equal(c.find((x) => x.date === '2026-11-02').hours, 8.5);
  assert.deepEqual(calendarCells('2026-01-01', '2026-12-31', [], []), []);
  assert.equal(calendarCells('2026-11-02', '2026-11-08', [], []).filter((x) => x.date === null).length, 0);   // thứ hai: không có ô trống
});
