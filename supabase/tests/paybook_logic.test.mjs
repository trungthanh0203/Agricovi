import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rangeOf, shiftAnchor, groupByTeam, sumRows, buildPayBookCsv, hoursText } from '../../apps/app/src/lib/payBookLogic.ts';

// Bảng lương (D87): phần tính thuần ở phía app, không cần CSDL.

test('kỳ xem: tháng, quý, năm, 24 tháng; lùi/tiến', () => {
  assert.deepEqual(rangeOf('month', '2026-10-24'), { from: '2026-10-01', to: '2026-10-31', label: 'Tháng 10/2026' });
  assert.deepEqual(rangeOf('month', '2026-02-10'), { from: '2026-02-01', to: '2026-02-28', label: 'Tháng 2/2026' });
  assert.deepEqual(rangeOf('quarter', '2026-11-05'), { from: '2026-10-01', to: '2026-12-31', label: 'Quý 4/2026' });
  assert.deepEqual(rangeOf('year', '2026-06-01'), { from: '2026-01-01', to: '2026-12-31', label: 'Năm 2026' });
  const r = rangeOf('recent', '2026-10-24');
  assert.deepEqual([r.from, r.to], ['2024-11-01', '2026-10-31']);
  assert.equal(shiftAnchor('month', '2026-10-24', -1), '2026-09-01');
  assert.equal(shiftAnchor('month', '2026-01-15', -1), '2025-12-01');
  assert.equal(shiftAnchor('quarter', '2026-10-24', 1), '2027-01-01');
  assert.equal(shiftAnchor('year', '2026-10-24', -1), '2025-10-01');
});

const row = (name, team, hours, net) => ({ worker_id: name, name, user_id: null, status: 'active', team_id: null, team_name: team, hours, pending_hours: 0, days: 2, hourly: net, salary: 0, bonus: 0, deduction: 0, advance: 0, net, net_locked: 0, no_rate_days: 0 });

test('gom theo tổ: tổ theo tên, "Chưa có tổ" cuối, có tổng từng tổ; tổng chung và CSV', () => {
  const rows = [row('An', 'Tổ B', 8, 240000), row('Bình', null, 4, 120000), row('Cúc', 'Tổ A', 6.5, 195000), row('Dũng', 'Tổ B', 1.25, 37500)];
  const g = groupByTeam(rows);
  assert.deepEqual(g.map((x) => x.team), ['Tổ A', 'Tổ B', 'Chưa có tổ']);
  assert.deepEqual([g[1].rows.length, g[1].total.hours, g[1].total.net], [2, 9.25, 277500]);
  const all = sumRows(rows);
  assert.deepEqual([all.hours, all.net, all.days], [19.75, 592500, 8]);
  const csv = buildPayBookCsv(rows, { from: '2026-10-01', to: '2026-10-31' });
  assert.ok(csv.startsWith('﻿'));
  assert.match(csv, /"An","Tổ B",8,2,240000/);
  assert.match(csv, /"Tổng"/);
  assert.equal(hoursText(3.5), '3,5 giờ');
});

test('trạng thái từng người và phiếu lương dạng chữ', async () => {
  const { personState, buildPayslipText } = await import('../../apps/app/src/lib/payBookLogic.ts');
  const base = row('An', 'Tổ A', 8, 240000);
  assert.deepEqual(personState({ ...base, n_estimate: 2, n_calculated: 0, n_locked: 0, n_open: 0, no_rate_days: 0, pending_hours: 0 }), { label: 'Chưa tính', cls: 'warn', needs: false, reasons: [] });
  const calc = personState({ ...base, n_estimate: 0, n_calculated: 3, n_locked: 0, n_open: 1, no_rate_days: 1, pending_hours: 2 });
  assert.deepEqual([calc.label, calc.needs, calc.reasons.length], ['Đã tính', true, 3]);
  assert.equal(personState({ ...base, n_estimate: 0, n_calculated: 0, n_locked: 4, n_open: 0, no_rate_days: 0, pending_hours: 0 }).label, 'Đã chốt');
  assert.equal(personState({ ...base, n_estimate: 0, n_calculated: 0, n_locked: 0, n_open: 0, no_rate_days: 0, pending_hours: 0 }).label, 'Chưa có số liệu');
  const r = { ...base, hours: 3.5, days: 2, hourly: 105000, salary: 5000000, bonus: 300000, deduction: 100000, advance: 500000, net: 4805000, net_locked: 0 };
  const items = [{ kind: 'bonus', amount: 300000, label: 'Chuyên cần' }, { kind: 'advance', amount: -500000, label: 'Tạm ứng giữa tháng' }, { kind: 'hours', amount: 105000, label: null }];
  const t = buildPayslipText(r, items, 'Tháng 9/2026', 'Hộ A');
  assert.match(t, /^PHIẾU LƯƠNG THÁNG 9\/2026 · Hộ A/);
  assert.match(t, /Lương cố định: 5\.000\.000 đ/);
  assert.match(t, /Thưởng: \+300\.000 đ \(Chuyên cần\)/);
  assert.match(t, /Tạm ứng: −500\.000 đ \(Tạm ứng giữa tháng\)/);
  assert.match(t, /THỰC NHẬN: 4\.805\.000 đ/);
  assert.match(t, /dự tính/);
  assert.doesNotMatch(t, /undefined|NaN|null/);
});
