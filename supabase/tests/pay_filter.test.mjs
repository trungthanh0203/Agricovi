import { test } from 'node:test';
import assert from 'node:assert/strict';
import { areaFamily, checkRange, isFullMonth, prevRangeOf, workerAreas, workerInArea, workersForArea } from '../../apps/app/src/lib/payFilter.ts';

// Bộ lọc Bảng lương (D208): phần thuần.

const areas = [{ id: 'A', name: 'Nhà màng', parent_id: null }, { id: 'A1', name: 'Ô 1', parent_id: 'A' }, { id: 'A2', name: 'Ô 2', parent_id: 'A' }, { id: 'B', name: 'Chuồng', parent_id: null }];
const memberAreas = { uAll: null, uA1: ['A1'], uB: ['B'], uNone: [] };
const teamArea = new Map([['tA', 'A'], ['tNo', null]]);
const w = (id, userId, teamId = null, status = 'active') => ({ id, name: id, userId, teamId, status });

test('phân khu của một người: tài khoản không giới hạn = mọi phân khu; được gán; phân khu của tổ; chưa gán', () => {
  assert.equal(workerAreas(w('w1', 'uAll'), memberAreas, teamArea), 'all');
  assert.deepEqual([...workerAreas(w('w2', 'uA1'), memberAreas, teamArea)], ['A1']);
  assert.deepEqual([...workerAreas(w('w3', 'uA1', 'tA'), memberAreas, teamArea)].sort(), ['A', 'A1']);   // thêm phân khu của tổ
  assert.deepEqual([...workerAreas(w('w4', null, 'tA'), memberAreas, teamArea)], ['A']);                 // không tài khoản: chỉ theo tổ
  assert.equal(workerAreas(w('w5', null, 'tNo'), memberAreas, teamArea).size, 0);
  assert.equal(workerAreas(w('w6', 'uNone'), memberAreas, teamArea).size, 0);
});

test('họ hàng của phân khu: chọn khu cha gồm khu con và ngược lại', () => {
  assert.deepEqual([...areaFamily('A', areas)].sort(), ['A', 'A1', 'A2']);
  assert.deepEqual([...areaFamily('A1', areas)].sort(), ['A', 'A1']);
  assert.deepEqual([...areaFamily('B', areas)], ['B']);
});

test('lọc người theo phân khu: Tất cả, khu cha thấy người ở ô con, người làm mọi nơi luôn thấy, chưa gán chỉ thấy ở Tất cả', () => {
  const all = [w('w1', 'uAll'), w('w2', 'uA1'), w('w3', 'uB'), w('w4', null, 'tA'), w('w5', null, 'tNo'), w('w6', 'uA1', null, 'inactive')];
  const names = (sel) => workersForArea(all, sel, areas, memberAreas, teamArea).map((x) => x.id);
  assert.deepEqual(names('all'), ['w1', 'w2', 'w3', 'w4', 'w5']);        // bỏ người đã ngừng làm
  assert.deepEqual(names('A'), ['w1', 'w2', 'w4']);                       // w2 ở ô con A1, w4 theo tổ khu A
  assert.deepEqual(names('A2'), ['w1', 'w4']);                            // w4 gán ở khu cha A nên cũng thấy ở ô A2
  assert.deepEqual(names('B'), ['w1', 'w3']);
  assert.equal(workerInArea(w('w5', null, 'tNo'), 'A', areas, memberAreas, teamArea), false);
});

test('đúng một tháng dương lịch và kỳ trước để so sánh', () => {
  assert.equal(isFullMonth('2026-11-01', '2026-11-30'), true);
  assert.equal(isFullMonth('2026-02-01', '2026-02-28'), true);
  assert.equal(isFullMonth('2026-11-01', '2026-11-20'), false);
  assert.equal(isFullMonth('2026-11-05', '2026-11-30'), false);
  assert.deepEqual(prevRangeOf('2026-11-01', '2026-11-30'), { from: '2026-10-01', to: '2026-10-30' });     // cùng 30 ngày đầu tháng trước
  assert.deepEqual(prevRangeOf('2026-11-01', '2026-11-20'), { from: '2026-10-01', to: '2026-10-20' });
  assert.deepEqual(prevRangeOf('2026-03-01', '2026-03-31'), { from: '2026-02-01', to: '2026-02-28' });     // tháng trước ngắn hơn: hết tháng đó
  assert.deepEqual(prevRangeOf('2026-11-10', '2026-11-16'), { from: '2026-11-03', to: '2026-11-09' });     // đoạn liền trước cùng 7 ngày
});

test('kiểm khoảng ngày: thiếu, đảo ngược, tương lai, quá 1 năm', () => {
  const today = '2026-11-20';
  assert.equal(checkRange('2026-11-01', '2026-11-20', today), null);
  assert.match(checkRange('', '2026-11-20', today), /Hãy chọn/);
  assert.match(checkRange('2026-11-20', '2026-11-01', today), /không được trước/);
  assert.match(checkRange('2026-11-01', '2026-11-21', today), /tương lai/);
  assert.match(checkRange('2025-01-01', '2026-11-20', today), /tối đa 1 năm/);
  assert.equal(checkRange('2025-11-20', '2026-11-20', today), null);
});
