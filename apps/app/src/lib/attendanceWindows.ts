/**
 * Dự phòng cho cơ sở dữ liệu CŨ (chưa chạy migration 0229/0230): hàm `attendance_list` bản cũ từ chối khoảng ngày quá 92 ngày. Khi bấm Xem ở khung Cần xử lý
 * (công chờ xác nhận, ca quên ra ca: đếm mọi ngày), app tự chia khoảng thành các đoạn ≤ 90 ngày từ mới về cũ và ghép lại thành MỘT danh sách phân trang,
 * dừng khi đã thấy đủ số lượng dự kiến (con số trong khung Cần xử lý). Phần thuần, có test; hàm lấy dữ liệu truyền vào.
 */
export interface PageReq { from: string; to: string; limit: number; offset: number }
export interface PageRes<R> { total: number; rows: R[] }

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const addDays = (iso: string, n: number) => new Date(utc(iso).getTime() + n * 86400000).toISOString().slice(0, 10);

export async function listWindowed<R>(
  fetchPage: (r: PageReq) => Promise<PageRes<R>>,
  o: PageReq, expected?: number, windowDays = 90, maxWindows = 12,
): Promise<PageRes<R>> {
  const wantStart = o.offset, wantEnd = o.offset + o.limit;
  const rows: R[] = [];
  let consumed = 0;      // số dòng đã đi qua ở các đoạn mới hơn
  let to = o.to;
  for (let w = 0; w < maxWindows && to >= o.from; w++) {
    const from = addDays(to, -(windowDays - 1)) < o.from ? o.from : addDays(to, -(windowDays - 1));
    // phần của trang cần lấy nằm trong đoạn này (tính theo vị trí toàn cục)
    const sliceStart = Math.max(wantStart, consumed) - consumed;
    const sliceLimit = Math.min(100, wantEnd - Math.max(wantStart, consumed));
    let total = 0;
    if (sliceLimit > 0) {
      const r = await fetchPage({ from, to, limit: sliceLimit, offset: sliceStart });
      if (r.rows.length > 0) { rows.push(...r.rows); total = r.total; }
      else if (sliceStart === 0) total = 0;                                // đoạn trống thật
      else total = (await fetchPage({ from, to, limit: 1, offset: 0 })).total;   // trang nằm quá cuối đoạn: hỏi lại tổng của đoạn
    } else {
      total = (await fetchPage({ from, to, limit: 1, offset: 0 })).total;  // đã đủ dòng cho trang, chỉ cần đếm tổng
    }
    consumed += total;
    to = addDays(from, -1);
    if (expected !== undefined && consumed >= expected) break;
  }
  return { total: consumed, rows };
}
