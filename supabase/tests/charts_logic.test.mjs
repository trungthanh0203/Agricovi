import { test } from 'node:test';
import assert from 'node:assert/strict';
import { niceScale, groupOthers, pct, compactNumber, monthShort, dayShort, clip, labelStep } from '../../apps/app/src/lib/chartMath.ts';
import { buildChartSpec } from '../../apps/app/src/lib/reportChart.ts';

// G2-7 (biểu đồ): phần tính toán thuần của biểu đồ và việc chọn loại biểu đồ cho từng báo cáo. Không cần CSDL.

test('thang trục: số tròn, luôn gồm mốc 0, bao hết số liệu', () => {
  const s = niceScale(0, 1234567, 4);
  assert.equal(s.min, 0);
  assert.ok(s.max >= 1234567);
  assert.ok(s.ticks.length >= 3 && s.ticks.length <= 8);
  assert.equal(s.ticks[0], 0);
  assert.ok(s.ticks.every((t, i, a) => i === 0 || Math.abs(t - a[i - 1] - s.step) < s.step * 1e-6));
  assert.ok([1, 2, 2.5, 5].includes(s.step / 10 ** Math.floor(Math.log10(s.step))));
});

test('thang trục: có số âm thì gồm cả mốc âm; không có số liệu vẫn vẽ được', () => {
  const neg = niceScale(-30, 100, 4);
  assert.ok(neg.min <= -30 && neg.max >= 100);
  assert.ok(neg.ticks.includes(0));
  const empty = niceScale(0, 0, 4);
  assert.ok(empty.max > empty.min);
  const nan = niceScale(Number.NaN, Number.NaN, 4);
  assert.ok(nan.max > nan.min);
});

test('gộp cơ cấu: tối đa 6 phần, phần nhỏ thành "Khác", bỏ phần không dương, tổng giữ nguyên', () => {
  const items = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((l, i) => ({ label: l, value: (8 - i) * 10 }));
  items.push({ label: 'Không', value: 0 }, { label: 'Âm', value: -5 });
  const g = groupOthers(items, 6);
  assert.equal(g.length, 6);
  assert.equal(g[5].label, 'Khác');
  assert.equal(g[5].value, 30 + 20 + 10); // F, G, H... phần thứ 6 trở đi
  assert.equal(g.reduce((s, x) => s + x.value, 0), 80 + 70 + 60 + 50 + 40 + 30 + 20 + 10);
  assert.deepEqual(groupOthers([{ label: 'X', value: 5 }, { label: 'Y', value: 7 }], 6).map((x) => x.label), ['Y', 'X']);
  assert.deepEqual(groupOthers([], 6), []);
});

test('phần trăm, số rút gọn, nhãn tháng/ngày, cắt chữ, bước nhãn', () => {
  assert.equal(pct(1, 3), 33.3);
  assert.equal(pct(5, 0), 0);
  assert.equal(compactNumber(0), '0');
  assert.equal(compactNumber(850), '850');
  assert.equal(compactNumber(1200), '1,2 k');
  assert.equal(compactNumber(25000), '25 k');
  assert.equal(compactNumber(1_500_000), '1,5 tr');
  assert.equal(compactNumber(3_400_000_000), '3,4 tỷ');
  assert.equal(compactNumber(-2_000_000), '-2 tr');
  assert.equal(monthShort('2026-10'), 'T10/26');
  assert.equal(monthShort('Vật tư'), 'Vật tư');
  assert.equal(dayShort('2026-10-23'), '23/10');
  assert.equal(clip('Dưa lưới vụ thu đông', 9), 'Dưa lưới…');
  assert.equal(clip('Ngắn', 9), 'Ngắn');
  assert.equal(labelStep(12, 6), 2);
  assert.equal(labelStep(4, 6), 1);
});

const cols = (keys) => keys.map((k) => ({ key: k, label: k, kind: 'num' }));

test('báo cáo theo tháng: cột theo thời gian, nhãn T10/26, màu theo nghĩa (chi đỏ, thu xanh)', () => {
  const exp = buildChartSpec({ type: 'expenses', group: 'month', columns: cols(['label', 'count', 'amount']),
    rows: [{ label: '2026-09', count: 2, amount: 500000 }, { label: '2026-10', count: 3, amount: '800000' }] });
  assert.equal(exp.kind, 'bars');
  assert.deepEqual(exp.shortLabels, ['T9/26', 'T10/26']);
  assert.equal(exp.series[0].tone, 'bad');
  assert.deepEqual(exp.values, [[500000, 800000]]);
  const sales = buildChartSpec({ type: 'sales', group: 'month', columns: cols(['label', 'qty', 'count', 'amount']), rows: [{ label: '2026-10', qty: 10, count: 1, amount: 1 }] });
  assert.equal(sales.series[0].tone, 'ok');
  const harvest = buildChartSpec({ type: 'harvest', group: 'day', columns: cols(['label', 'gross', 'loss', 'net']), rows: [{ label: '2026-10-05', gross: 100, loss: 5, net: 95 }] });
  assert.deepEqual(harvest.shortLabels, ['05/10']);
  assert.equal(harvest.series.length, 2);
});

test('chi phí theo nhóm: vòng cơ cấu; quá nhiều nhóm thì thanh ngang Top N', () => {
  const few = buildChartSpec({ type: 'expenses', group: 'default', columns: cols(['label', 'count', 'amount']),
    rows: [{ label: 'Nhân công', count: 1, amount: 700 }, { label: 'Điện nước', count: 1, amount: 300 }, { label: 'Khác', count: 1, amount: 0 }] });
  assert.equal(few.kind, 'donut');
  assert.deepEqual(few.items.map((i) => i.label), ['Nhân công', 'Điện nước']); // phần 0 bị bỏ
  const many = buildChartSpec({ type: 'expenses', group: 'cycle', columns: cols(['label', 'count', 'amount']),
    rows: Array.from({ length: 12 }, (_, i) => ({ label: `Vụ ${i}`, count: 1, amount: (i + 1) * 100 })) });
  assert.equal(many.kind, 'hbars');
  assert.equal(many.items.length, 8);
  assert.equal(many.items[0].label, 'Vụ 11'); // lớn nhất trước
});

test('theo khách, nhà cung ứng, vật tư, người: thanh ngang số đo chính', () => {
  const cus = buildChartSpec({ type: 'customers', group: 'partner', columns: cols(['label', 'count', 'qty', 'amount', 'collected', 'owed']),
    rows: [{ label: 'An', amount: 5, owed: 1 }, { label: 'Bình', amount: 9, owed: 0 }] });
  assert.equal(cus.kind, 'hbars');
  assert.deepEqual(cus.items.map((i) => i.label), ['Bình', 'An']);
  const pur = buildChartSpec({ type: 'purchases', group: 'material', columns: cols(['label', 'qty', 'amount']), rows: [{ label: 'NPK', qty: 5, amount: 100 }] });
  assert.equal(pur, null); // báo cáo theo vật tư không có cột "total": không đoán bừa
});

test('tổng hợp theo vụ: so sánh chi phí và doanh thu; không có dữ liệu thì không vẽ', () => {
  const cyc = buildChartSpec({ type: 'cycles', group: 'default', columns: cols(['label', 'cost', 'net', 'revenue', 'cps']),
    rows: [{ label: 'Vụ A rất dài tên', cost: 100, net: 1, revenue: 300, cps: 1 }, { label: 'Vụ B', cost: 500, net: 1, revenue: 200, cps: 1 }] });
  assert.equal(cyc.kind, 'bars');
  assert.deepEqual(cyc.labels, ['Vụ B', 'Vụ A rất dài tên']); // chi phí lớn trước
  assert.equal(cyc.series[1].tone, 'ok');
  assert.equal(buildChartSpec({ type: 'expenses', group: 'month', columns: cols(['label', 'amount']), rows: [] }), null);
  assert.equal(buildChartSpec({ type: 'expenses', group: 'category', columns: cols(['label', 'amount']), rows: [{ label: 'X', amount: 0 }] }), null);
});
