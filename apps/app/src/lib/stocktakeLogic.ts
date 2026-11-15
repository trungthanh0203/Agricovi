/**
 * Kiểm kho (D168), phần thuần. Số liệu thô lấy từ get_stocktake. Lệch = số đếm − số sổ sách; dương là thừa, âm là thiếu.
 * Đợt còn nháp so với số sổ sách lúc MỞ đợt (chỉ để người đếm xem tham khảo); khi chốt, máy chủ so với tồn hiện tại.
 */
export interface StocktakeLine {
  id: string; version: number; material_id: string; material_name: string; unit: string;
  lot_id: string | null; lot_no: string | null; expiry_date: string | null;
  book_qty: number | null; counted_qty: number | null; note: string | null;
  book_at_finish: number | null; adjust_qty: number | null; unit_cost_est: number | null;
}
export interface StocktakeHead {
  id: string; organization_id: string; location_id: string; status: 'draft' | 'done' | 'cancelled'; blind: boolean; tolerance_pct: number;
  note: string | null; created_by_name: string | null; created_at: string; finished_by_name: string | null; finished_at: string | null; cancel_reason: string | null;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
export function normalizeLine(l: StocktakeLine): StocktakeLine {
  return { ...l, book_qty: num(l.book_qty), counted_qty: num(l.counted_qty), book_at_finish: num(l.book_at_finish), adjust_qty: num(l.adjust_qty), unit_cost_est: num(l.unit_cost_est) };
}

/** Lệch của một dòng (null nếu chưa nhập số đếm hoặc đếm mù chưa có số sổ sách) */
export function lineDiff(book: number | null, counted: number | null): number | null {
  return book === null || counted === null ? null : Math.round((counted - book) * 1000) / 1000;
}

/** Lệch có vượt ngưỡng phần trăm không (cùng cách tính với máy chủ: |lệch| × 100 > ngưỡng × max(|sổ sách|, 1)) */
export function overTolerance(book: number | null, counted: number | null, tolerancePct: number): boolean {
  const d = lineDiff(book, counted);
  return d !== null && d !== 0 && Math.abs(d) * 100 > tolerancePct * Math.max(Math.abs(book ?? 0), 1);
}

/** Đọc ô nhập số đếm: '' = chưa đếm (null); số không hợp lệ hoặc âm = 'bad' */
export function parseCount(raw: string): number | null | 'bad' {
  const s = raw.trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : 'bad';
}

export interface StocktakeTotals { counted: number; total: number; diffLines: number; shortage: number | null; surplus: number | null; net: number | null }

/** Tổng kết đợt đã chốt: số dòng đếm/lệch, giá trị thiếu và thừa ước theo giá nhập bình quân (null nếu không dòng lệch nào biết giá) */
export function stocktakeTotals(lines: StocktakeLine[]): StocktakeTotals {
  const counted = lines.filter((l) => l.counted_qty !== null);
  const diff = counted.filter((l) => l.adjust_qty !== null && l.adjust_qty !== 0);
  let shortage: number | null = null, surplus: number | null = null;
  for (const l of diff) {
    if (l.unit_cost_est === null) continue;
    const v = Math.round(Math.abs(l.adjust_qty!) * l.unit_cost_est);
    if (l.adjust_qty! < 0) shortage = (shortage ?? 0) + v; else surplus = (surplus ?? 0) + v;
  }
  return { counted: counted.length, total: lines.length, diffLines: diff.length, shortage, surplus, net: shortage === null && surplus === null ? null : (surplus ?? 0) - (shortage ?? 0) };
}
