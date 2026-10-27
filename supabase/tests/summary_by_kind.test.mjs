import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countSummary } from '../../apps/app/src/lib/countLogic.ts';
import { perHeadSummary } from '../../apps/app/src/lib/summaryByKind.ts';

// Điểm 5 (mục F): Tổng kết vụ theo con cho vật nuôi, thủy sản. Phần thuần.

test('heo: nhập 100, chết 3, loại 2, xuất 95 con (ở phiếu thu hoạch) → hao 5%, kg/con, chi phí/doanh thu/lãi mỗi con', () => {
  const counts = countSummary({ plant_count: 100 }, [{ kind: 'dead', quantity: 3 }, { kind: 'culled', quantity: 2 }], 95);
  const p = perHeadSummary({ counts, netKg: 9500, totalCost: 1900000, revenue: 2375000, compare: true });
  assert.deepEqual([p.entered, p.lost, p.lossPct, p.out], [100, 5, 5, 95]);
  assert.deepEqual([p.kgPerHead, p.costPerHead, p.revenuePerHead, p.profitPerHead], [100, 20000, 25000, 5000]);
  assert.deepEqual(p.missing, []);
});

test('lỗ thì âm; chưa đủ dữ liệu so sánh thì không tính lãi; xuất ghi bằng sự kiện "Xuất / chuyển đi" cũng tính', () => {
  const counts = countSummary({ plant_count: 50 }, [{ kind: 'out', quantity: 50 }], 0);
  const loss = perHeadSummary({ counts, netKg: 2500, totalCost: 3000000, revenue: 2000000, compare: true });
  assert.equal(loss.out, 50);
  assert.equal(loss.profitPerHead, -20000);
  assert.equal(perHeadSummary({ counts, netKg: 2500, totalCost: 3000000, revenue: 2000000, compare: false }).profitPerHead, null);
});

test('thiếu số con thì trả về null và liệt kê việc cần bổ sung, không đoán', () => {
  const counts = countSummary({ plant_count: null }, [], 0);
  const p = perHeadSummary({ counts, netKg: 800, totalCost: 500000, revenue: 0, compare: false });
  assert.equal(p.entered, null);
  assert.equal(p.kgPerHead, null);
  assert.equal(p.costPerHead, null);
  assert.equal(p.revenuePerHead, null);
  assert.equal(p.profitPerHead, null);
  assert.equal(p.missing.length, 2);
  // chỉ có số con nhập, chưa xuất
  const c2 = countSummary({ plant_count: 100 }, [], 0);
  const p2 = perHeadSummary({ counts: c2, netKg: 0, totalCost: 100000, revenue: 0, compare: false });
  assert.equal(p2.entered, 100);
  assert.equal(p2.costPerHead, null);
  assert.equal(p2.missing.length, 1);
});
