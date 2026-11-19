import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listWindowed } from '../../apps/app/src/lib/attendanceWindows.ts';

// Dự phòng cho CSDL cũ: ghép nhiều đoạn ≤ 90 ngày thành một danh sách phân trang (hàm lấy dữ liệu giả lập đúng hành vi hàm cũ).

const utc = (iso) => new Date(`${iso}T00:00:00Z`).getTime();
const day = (n) => new Date(Date.UTC(2026, 10, 19) - n * 86400000).toISOString().slice(0, 10);   // n ngày trước 19/11/2026

// mỗi "công" là {id, d}; hàm giả lập: từ chối khoảng > 92 ngày, sắp mới → cũ, cắt trang, và trả total = 0 khi trang rỗng (như hàm cũ)
function fake(items) {
  const calls = [];
  const fetchPage = async ({ from, to, limit, offset }) => {
    calls.push({ from, to, limit, offset });
    if ((utc(to) - utc(from)) / 86400000 > 92) throw new Error('INVALID_ARGUMENT: Hãy chọn khoảng ngày không quá 92 ngày.');
    const inR = items.filter((x) => x.d >= from && x.d <= to).sort((a, b) => b.d.localeCompare(a.d) || a.id - b.id);
    const rows = inR.slice(offset, offset + limit);
    return { total: rows.length === 0 ? 0 : inR.length, rows };
  };
  return { fetchPage, calls };
}

// 12 công: 5 trong 30 ngày gần nhất, 4 cách 100–150 ngày, 3 cách 250–300 ngày
const items = [1, 3, 10, 20, 29, 100, 110, 130, 150, 250, 270, 300].map((n, i) => ({ id: i, d: day(n) }));

test('gom đủ mọi công ở nhiều đoạn, theo thứ tự mới → cũ, dừng khi đủ số dự kiến', async () => {
  const { fetchPage, calls } = fake(items);
  const r = await listWindowed(fetchPage, { from: '2000-01-01', to: day(0), limit: 50, offset: 0 }, 12);
  assert.equal(r.total, 12);
  assert.deepEqual(r.rows.map((x) => x.id), items.map((x) => x.id));
  assert.ok(calls.length <= 8, `quá nhiều lần gọi: ${calls.length}`);
});

test('phân trang xuyên các đoạn: từng trang 5 dòng ghép lại đủ 12 công, không sót không trùng', async () => {
  const { fetchPage } = fake(items);
  const seen = [];
  for (let p = 0; p < 3; p++) {
    const r = await listWindowed(fetchPage, { from: '2000-01-01', to: day(0), limit: 5, offset: p * 5 }, 12);
    assert.equal(r.total, 12);
    seen.push(...r.rows.map((x) => x.id));
  }
  assert.deepEqual(seen, items.map((x) => x.id));
});

test('chỉ có công trong đoạn đầu: dừng ngay, không quét về năm 2000', async () => {
  const { fetchPage, calls } = fake(items.slice(0, 5));
  const r = await listWindowed(fetchPage, { from: '2000-01-01', to: day(0), limit: 50, offset: 0 }, 5);
  assert.equal(r.total, 5);
  assert.equal(calls.length, 1);
});

test('không có số dự kiến thì chỉ quét tối đa số đoạn cho phép (2 đoạn × 90 ngày = 180 ngày gần nhất)', async () => {
  const { fetchPage, calls } = fake(items);
  const r = await listWindowed(fetchPage, { from: '2000-01-01', to: day(0), limit: 50, offset: 0 }, undefined, 90, 2);
  assert.equal(calls.length, 2);
  assert.equal(r.total, 9);                                   // các công cách 250–300 ngày nằm ngoài 180 ngày
});
