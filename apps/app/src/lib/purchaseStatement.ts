import { supabase } from './supabase';

/**
 * Bảng kê thu mua nông sản trực tiếp từ người sản xuất (mục 13 lát 1). HTX lập từ phiếu thu mua có sẵn; thông tin người bán (dữ liệu cá nhân) do HTX nhập kèm
 * xác nhận người bán đã đồng ý. Mẫu là BẢN THAM KHẢO, chưa đối chiếu văn bản pháp lý gốc (xem docs/PHAN_TICH_THUE_CO_QUAN_THUE.md). Cần mạng.
 */
export interface SellerStatus {
  household_org_id: string; household_name: string; has_profile: boolean;
  full_name: string | null; id_masked: string | null; address: string | null; phone: string | null; consent_at: string | null;
}
export interface StatementSeller { full_name: string; id_number: string; address: string; phone: string | null }
export interface StatementRow {
  receipt_id: string; receipt_date: string; invoice_no: string | null; household_org_id: string; household_name: string;
  seller: StatementSeller | null; crop_name: string | null; quantity: number; unit_price: number; amount: number; paid: number; cash_paid: number;
}
export interface Statement { from: string; to: string; generated_at: string; rows: StatementRow[] }

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  if (!navigator.onLine) throw new Error('OFFLINE: Cần có mạng để thực hiện. Hãy kết nối mạng rồi thử lại.');
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const fetchSellerStatus = (coopId: string) => rpc<SellerStatus[]>('get_procurement_sellers', { p_coop: coopId });

export interface SellerInput { fullName: string; idNumber: string; address: string; phone: string; consent: boolean; consentNote: string }
export const saveSeller = (coopId: string, householdId: string, i: SellerInput) =>
  rpc<unknown>('set_procurement_seller', { p_coop: coopId, p_household: householdId, p_name: i.fullName, p_id_number: i.idNumber, p_address: i.address, p_phone: i.phone || null, p_consent: i.consent, p_consent_note: i.consentNote || null });
export const deleteSeller = (coopId: string, householdId: string) => rpc<unknown>('delete_procurement_seller', { p_coop: coopId, p_household: householdId });

export async function fetchStatement(coopId: string, from: string, to: string): Promise<Statement> {
  const d = await rpc<{ from: string; to: string; generated_at: string; rows: StatementRow[] }>('get_purchase_statement', { p_coop: coopId, p_from: from, p_to: to });
  return { ...d, rows: d.rows.map((r) => ({ ...r, quantity: Number(r.quantity), unit_price: Number(r.unit_price), amount: Number(r.amount), paid: Number(r.paid), cash_paid: Number(r.cash_paid) })) };
}

// ---------------------------------------------------------------- phần thuần
/** Mức từ đó thanh toán nên không dùng tiền mặt (theo tài liệu phân tích thuế, cần kế toán xác nhận) */
export const CASH_LIMIT = 5_000_000;

const vnd = (n: number) => `${Math.round(n).toLocaleString('vi-VN')} đ`;
export const vnDate = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

export interface StatementGap { level: 'warn' | 'info'; text: string }

/** "Còn thiếu gì trước khi nộp": người bán chưa có thông tin, phiếu từ 5 triệu có trả tiền mặt */
export function statementGaps(rows: StatementRow[]): StatementGap[] {
  const gaps: StatementGap[] = [];
  if (rows.length === 0) return [{ level: 'info', text: 'Không có phiếu thu mua nào trong khoảng ngày này.' }];
  const missing = new Map<string, { name: string; n: number }>();
  for (const r of rows) if (!r.seller) { const m = missing.get(r.household_org_id) ?? { name: r.household_name, n: 0 }; m.n += 1; missing.set(r.household_org_id, m); }
  if (missing.size > 0) {
    gaps.push({ level: 'warn', text: `Chưa có thông tin người bán (họ tên, CCCD, địa chỉ) của: ${[...missing.values()].map((m) => `${m.name} (${m.n} phiếu)`).join(', ')}. Bảng kê chưa đủ cho các dòng này.` });
  }
  for (const r of rows) {
    if (r.amount >= CASH_LIMIT && r.cash_paid > 0) {
      gaps.push({ level: 'warn', text: `Phiếu ${r.invoice_no ?? vnDate(r.receipt_date)} (${r.household_name}, ${vnd(r.amount)}) có trả tiền mặt ${vnd(r.cash_paid)}. Khoản từ ${vnd(CASH_LIMIT)} nên thanh toán không dùng tiền mặt (hãy hỏi kế toán để xác nhận).` });
    }
  }
  return gaps;
}

export function statementTotals(rows: StatementRow[]) {
  return { receipts: rows.length, quantity: rows.reduce((s, r) => s + r.quantity, 0), amount: rows.reduce((s, r) => s + r.amount, 0), cash: rows.reduce((s, r) => s + r.cash_paid, 0) };
}

export const STATEMENT_HEADERS = ['STT', 'Ngày mua', 'Số phiếu', 'Họ tên người bán', 'Số CCCD/CMND', 'Địa chỉ', 'Điện thoại', 'Tên hàng', 'Đơn vị tính', 'Số lượng', 'Đơn giá (đ)', 'Giá trị (đ)', 'Đã trả bằng tiền mặt (đ)'];

/** Một dòng bảng kê dạng chữ; CCCD ghi dạng chữ để Excel không bỏ số 0 đầu */
export function statementCells(r: StatementRow, stt: number): string[] {
  return [
    String(stt), vnDate(r.receipt_date), r.invoice_no ?? '', r.seller?.full_name ?? `(chưa có thông tin người bán: ${r.household_name})`, r.seller?.id_number ?? '', r.seller?.address ?? '', r.seller?.phone ?? '',
    r.crop_name ?? 'Nông sản', 'kg', String(r.quantity).replace('.', ','), String(r.unit_price), String(r.amount), String(r.cash_paid),
  ];
}

/** CSV mở được bằng Excel (UTF-8 có BOM, ngăn cách dấu chấm phẩy); số giấy tờ bọc dạng ="..." để giữ số 0 đầu */
export function statementCsv(st: Statement, orgName: string): string {
  const q = (s: string) => (/[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines: string[] = [
    q('BẢNG KÊ THU MUA NÔNG SẢN TRỰC TIẾP TỪ NGƯỜI SẢN XUẤT (mẫu tham khảo)'),
    q(`Đơn vị thu mua: ${orgName}`),
    q(`Kỳ: từ ${vnDate(st.from)} đến ${vnDate(st.to)}`),
    STATEMENT_HEADERS.map(q).join(';'),
  ];
  st.rows.forEach((r, i) => {
    const c = statementCells(r, i + 1);
    // số giấy tờ dạng ="..." (không bọc thêm dấu nháy) để Excel giữ số 0 đầu
    lines.push(c.map((v, j) => (j === 4 && v ? `="${v}"` : q(v))).join(';'));
  });
  const t = statementTotals(st.rows);
  lines.push(['', '', '', 'Cộng', '', '', '', '', '', String(t.quantity).replace('.', ','), '', String(t.amount), String(t.cash)].map(q).join(';'));
  return '﻿' + lines.join('\r\n');
}
