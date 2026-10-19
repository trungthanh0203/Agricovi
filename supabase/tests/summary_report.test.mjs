import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSummaryCsv, canCompare, summaryNotes } from '../../apps/app/src/lib/summaryReport.ts';

const full = {
  cycle_id: 'c1', status: 'ended', updated_at: '2026-10-19T03:00:00Z',
  cash_paid_other: 1000, cash_paid_material: 5000, material_used_cost: 450, material_used_manual: 0, allocated_or_estimated: 0,
  total_cost: 1450, harvested_gross_qty: 100, harvest_loss_qty: 10, harvested_net_qty: 90, sold_qty: 80, revenue_recorded: 2400000,
  cost_per_kg: 16, issues_missing_cost: 0, issues_cost_from_average: 0, has_estimated_cost: false, missing_harvest: false, missing_revenue: false,
};

test('đủ dữ liệu: không cảnh báo, so sánh thu chi được, CSV có chênh lệch', () => {
  assert.deepEqual(summaryNotes(full), []);
  assert.equal(canCompare(full), true);
  const csv = buildSummaryCsv({ cycleLabel: 'Dưa lưới · Nhà màng 1', summary: full });
  assert.ok(csv.startsWith('﻿'), 'có BOM để Excel đọc đúng tiếng Việt');
  assert.match(csv, /Giá thành mỗi kg,16,đồng\/kg,/);
  assert.match(csv, /Doanh thu trừ chi phí đã ghi,2398550,đồng/);
  assert.ok(csv.endsWith('\r\n'));
});

test('thiếu dữ liệu: cảnh báo đúng, không so sánh thu chi, giá thành để trống, không gọi là lợi nhuận', () => {
  const s = { ...full, missing_harvest: true, harvested_gross_qty: 0, harvested_net_qty: 0, harvest_loss_qty: 0, cost_per_kg: null,
    missing_revenue: true, revenue_recorded: 0, sold_qty: 0, issues_missing_cost: 2, issues_cost_from_average: 1, has_estimated_cost: true };
  const notes = summaryNotes(s, 3);
  const text = notes.map((n) => n.text).join('\n');
  assert.match(text, /3 bản ghi trên điện thoại chưa gửi/);
  assert.match(text, /Chưa ghi thu hoạch/);
  assert.match(text, /Chưa ghi doanh thu/);
  assert.match(text, /2 lần dùng vật tư chưa biết giá vốn/);
  assert.match(text, /1 lần dùng vật tư được tính theo giá nhập bình quân/);
  assert.match(text, /ước tính hoặc phân bổ/);
  assert.equal(notes.filter((n) => n.level === 'warn').length, 4);
  assert.equal(canCompare(s), false);
  const csv = buildSummaryCsv({ cycleLabel: 'x', summary: s, pendingCount: 3 });
  assert.match(csv, /Giá thành mỗi kg,,,Chưa đủ dữ liệu để tính/);
  assert.doesNotMatch(csv, /Doanh thu trừ chi phí/);
  assert.doesNotMatch(csv, /lợi nhuận chính thức/);
});

test('chỉ thiếu giá vốn một lần xuất cũng đủ để không so sánh thu chi', () => {
  assert.equal(canCompare({ ...full, issues_missing_cost: 1 }), false);
});

test('CSV: ô có dấu phẩy, ngoặc kép, xuống dòng được bọc đúng', () => {
  const csv = buildSummaryCsv({ cycleLabel: 'Vụ "A", khu 1\nnhà màng', summary: full });
  assert.match(csv, /Vụ trồng,"Vụ ""A"", khu 1\nnhà màng"/);
});
