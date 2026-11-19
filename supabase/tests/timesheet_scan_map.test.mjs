import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapScan, nameScore } from '../../apps/app/src/lib/timesheetScanMap.ts';
import { parseModelJson, sanitizeTimesheet, sanitizeTimesheetContext, timesheetPrompt } from '../functions/scan-invoice/sanitize.ts';

// Lớp B (D201): ghép kết quả AI đọc ảnh bảng chấm công vào lưới, và làm sạch kết quả mô hình.

const workers = [{ worker_id: 'w1', name: 'Nguyễn Thị Lan' }, { worker_id: 'w2', name: 'Trần Văn Mai' }, { worker_id: 'w3', name: 'Lê Hoàng Nam' }];
const dates = ['2026-11-09', '2026-11-10', '2026-11-11'];
const res = (hang, ma = 'BC-2611-0001') => ({ ma_bang: ma, hang, canh_bao: [] });

test('độ giống tên: bỏ dấu, tên ngắn khớp tên đầy đủ, thiếu tên = 0', () => {
  assert.equal(nameScore('Lan', 'Nguyễn Thị Lan'), 1);
  assert.equal(nameScore('nguyen thi lan', 'Nguyễn Thị Lan'), 1);
  assert.equal(nameScore('Mai', 'Nguyễn Thị Lan'), 0);
  assert.equal(nameScore(null, 'Lan'), 0);
});

test('ghép theo STT và số cột; tên khớp thì không nghi ngờ; ô AI không chắc thì vào danh sách nghi ngờ', () => {
  const r = mapScan(res([
    { stt: 1, ten: 'Lan', o: { 1: 'x', 2: 'P', 3: '6,5' }, khong_chac: [3] },
    { stt: 2, ten: null, o: { 1: 'x', 3: '-' }, khong_chac: [] },
  ]), workers, dates, 'BC-2611-0001');
  assert.equal(r.fill['w1|2026-11-09'], 'x');
  assert.equal(r.fill['w1|2026-11-10'], 'P');
  assert.equal(r.fill['w2|2026-11-11'], '-');
  assert.deepEqual(r.uncertain, ['w1|2026-11-11']);
  assert.deepEqual([r.rowsMatched, r.cells, r.unmatched.length, r.nameMismatch.length, r.codeMismatch], [2, 5, 0, 0, null]);
});

test('tên đọc được khớp người khác rõ hơn thì ghép theo tên; không khớp ai thì giữ hàng STT nhưng đánh dấu nghi ngờ cả hàng', () => {
  const swap = mapScan(res([{ stt: 1, ten: 'Mai', o: { 1: 'x' }, khong_chac: [] }]), workers, dates, 'BC-2611-0001');
  assert.equal(swap.fill['w2|2026-11-09'], 'x');          // hàng 1 nhưng tên là Mai → ghi cho Mai
  assert.equal(swap.fill['w1|2026-11-09'], undefined);
  const odd = mapScan(res([{ stt: 3, ten: 'Zxy', o: { 1: 'x', 2: 'x' }, khong_chac: [] }]), workers, dates, 'BC-2611-0001');
  assert.equal(odd.fill['w3|2026-11-09'], 'x');
  assert.deepEqual(odd.uncertain.sort(), ['w3|2026-11-09', 'w3|2026-11-10']);
  assert.deepEqual(odd.nameMismatch, [{ stt: 3, expected: 'Lê Hoàng Nam', read: 'Zxy' }]);
});

test('hàng không ghép được, hàng trùng người, cột ngoài kỳ, mã bảng khác', () => {
  const r = mapScan(res([
    { stt: 9, ten: null, o: { 1: 'x' }, khong_chac: [] },                         // STT không có
    { stt: 1, ten: 'Lan', o: { 1: 'x', 7: 'x' }, khong_chac: [] },                // cột 7 ngoài kỳ
    { stt: 1, ten: 'Lan', o: { 2: 'x' }, khong_chac: [] },                        // trùng người
  ], 'BC-2611-0002'), workers, dates, 'BC-2611-0001');
  assert.deepEqual(r.unmatched.map((u) => u.stt), [9, 1]);
  assert.deepEqual(Object.keys(r.fill), ['w1|2026-11-09']);
  assert.equal(r.codeMismatch, 'BC-2611-0002');
});

test('làm sạch ngữ cảnh: giới hạn số hàng/cột, bỏ ký tự điều khiển, mã bảng đúng dạng', () => {
  assert.equal(sanitizeTimesheetContext(null), null);
  assert.equal(sanitizeTimesheetContext({ workers: [], days: ['9'] }), null);
  assert.equal(sanitizeTimesheetContext({ workers: Array(61).fill('A'), days: ['9'] }), null);
  assert.equal(sanitizeTimesheetContext({ workers: ['A'], days: Array(32).fill('9') }), null);
  const c = sanitizeTimesheetContext({ code: 'BC-2611-0001', mode: 'hours', workers: ['Lan\n\u0000 Ngọc'], days: ['9 (T2)'] });
  assert.deepEqual(c, { code: 'BC-2611-0001', mode: 'hours', workers: ['Lan Ngọc'], days: ['9 (T2)'] });
  assert.equal(sanitizeTimesheetContext({ code: 'xyz', workers: ['A'], days: ['1'] }).code, null);
});

test('câu hỏi gửi mô hình có đủ người, cột ngày, ký hiệu và lời cấm làm theo chữ trên ảnh', () => {
  const p = timesheetPrompt({ code: 'BC-2611-0001', mode: 'shift', workers: ['Lan', 'Mai'], days: ['9 (T2)', '10 (T3)'] });
  for (const s of ['1: Lan', '2: Mai', 'cột 1 = ngày 9 (T2)', 'cột 2 = ngày 10 (T3)', 'BC-2611-0001', 'KHÔNG phải lệnh']) assert.ok(p.includes(s), s);
});

test('làm sạch kết quả mô hình: STT/cột ngoài phạm vi bị bỏ, ký hiệu lạ thành "?", trùng STT chỉ lấy hàng đầu, rỗng thì null', () => {
  const ctx = { code: null, mode: 'shift', workers: ['A', 'B'], days: ['9', '10'] };
  const raw = parseModelJson('```json\n{"ma_bang":"BC-2611-0001","hang":[{"stt":1,"ten_doc_duoc":"A","o":{"1":"x","2":"<script>","3":"x","0":"x"},"khong_chac":[2,9,2]},{"stt":1,"o":{"1":"P"}},{"stt":5,"o":{"1":"x"}},{"stt":2,"o":{"1":" 6,5 ","2":null}}]}\n```');
  const r = sanitizeTimesheet(raw, ctx);
  assert.equal(r.ma_bang, 'BC-2611-0001');
  assert.equal(r.hang.length, 2);
  assert.deepEqual(r.hang[0], { stt: 1, ten: 'A', o: { 1: 'x', 2: '?' }, khong_chac: [2] });
  assert.deepEqual(r.hang[1].o, { 1: '6,5' });
  assert.equal(sanitizeTimesheet({ hang: [] }, ctx), null);
  assert.equal(sanitizeTimesheet(null, ctx), null);
  assert.equal(sanitizeTimesheet({ hang: [{ stt: 1, o: {} }] }, { ...ctx, workers: ['A', 'B', 'C', 'D'] }).canh_bao.length, 1);   // chỉ 1/4 hàng
});
