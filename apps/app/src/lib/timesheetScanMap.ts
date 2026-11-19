/**
 * Ghép kết quả AI đọc ảnh bảng chấm công giấy vào lưới nhập (D201, lớp B). Phần thuần, có test.
 * AI trả theo STT hàng và SỐ CỘT (vị trí từ trái sang phải); ở đây đổi thành (người, ngày) của bảng, kiểm tra tên đọc được có khớp người ở hàng đó
 * không, và đánh dấu ô nghi ngờ. Kết quả chỉ là bản nháp: không bao giờ tự lưu.
 */
export interface ScanRow { stt: number; ten: string | null; o: Record<string, string>; khong_chac: number[] }
export interface ScanResult { ma_bang: string | null; hang: ScanRow[]; canh_bao: string[] }
export interface GridWorker { worker_id: string; name: string }

export interface MapOut {
  /** key "mã người|ngày" → chữ đọc được trong ô */
  fill: Record<string, string>;
  /** các key nghi ngờ (AI báo không chắc, hoặc tên ở hàng đó không khớp) */
  uncertain: string[];
  cells: number;
  rowsMatched: number;
  nameMismatch: { stt: number; expected: string; read: string }[];
  unmatched: { stt: number; read: string | null }[];
  /** mã bảng đọc được trên ảnh nếu khác mã bảng đang nhập */
  codeMismatch: string | null;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
const tokens = (s: string) => fold(s).split(/[^a-z0-9]+/).filter(Boolean);
/** Độ giống tên: số từ chung / số từ của tên ngắn hơn (đủ để "Lan" khớp "Nguyễn Thị Lan"); 0 nếu thiếu tên */
export function nameScore(a: string | null, b: string): number {
  if (!a) return 0;
  const x = tokens(a), y = tokens(b);
  if (x.length === 0 || y.length === 0) return 0;
  const set = new Set(y);
  const inter = x.filter((t) => set.has(t)).length;
  return inter / Math.min(x.length, y.length);
}

export const key = (workerId: string, date: string) => `${workerId}|${date}`;

export function mapScan(res: ScanResult, workers: GridWorker[], dates: string[], code: string): MapOut {
  const out: MapOut = { fill: {}, uncertain: [], cells: 0, rowsMatched: 0, nameMismatch: [], unmatched: [], codeMismatch: res.ma_bang && res.ma_bang !== code ? res.ma_bang : null };
  const used = new Set<number>();
  for (const row of res.hang) {
    let idx = row.stt - 1 >= 0 && row.stt - 1 < workers.length ? row.stt - 1 : -1;
    let mismatch = false;
    if (idx >= 0 && row.ten && nameScore(row.ten, workers[idx]!.name) < 0.5) {
      // tên đọc được không khớp người ở hàng này: tìm người khác khớp rõ hơn, không có thì vẫn dùng hàng này nhưng đánh dấu nghi ngờ
      let best = -1, bestScore = 0;
      workers.forEach((w, i) => { const s = nameScore(row.ten, w.name); if (!used.has(i) && s > bestScore) { best = i; bestScore = s; } });
      if (best >= 0 && bestScore >= 0.75) idx = best; else mismatch = true;
    }
    if (idx < 0 && row.ten) {
      let best = -1, bestScore = 0;
      workers.forEach((w, i) => { const s = nameScore(row.ten, w.name); if (!used.has(i) && s > bestScore) { best = i; bestScore = s; } });
      if (best >= 0 && bestScore >= 0.75) idx = best;
    }
    if (idx < 0 || used.has(idx)) { out.unmatched.push({ stt: row.stt, read: row.ten }); continue; }
    used.add(idx);
    out.rowsMatched += 1;
    const w = workers[idx]!;
    if (mismatch) out.nameMismatch.push({ stt: row.stt, expected: w.name, read: row.ten ?? '' });
    const unsure = new Set(row.khong_chac);
    for (const [c, text] of Object.entries(row.o)) {
      const col = Number(c);
      const date = dates[col - 1];
      if (!date || typeof text !== 'string' || text === '') continue;
      const k = key(w.worker_id, date);
      out.fill[k] = text;
      out.cells += 1;
      if (mismatch || unsure.has(col)) out.uncertain.push(k);
    }
  }
  return out;
}
