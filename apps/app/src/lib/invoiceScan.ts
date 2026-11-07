import { callFunction } from './staff';
import { supabase } from './supabase';
import { norm, type AliasLike } from './invoiceMatch';

/**
 * Đọc ảnh phiếu / hóa đơn nhập kho (G2-3, D158). Ảnh được thu nhỏ ngay trên máy rồi gửi cho Edge Function `scan-invoice`; ảnh KHÔNG được lưu ở đâu cả.
 * Kết quả chỉ là BẢN NHÁP để người dùng kiểm tra. Cần mạng và quyền sửa Chi phí + Kho.
 */
export interface DraftLine { ten: string; don_vi: string | null; so_luong: number | null; don_gia: number | null; thanh_tien: number | null }
export interface InvoiceDraft {
  loai_chung_tu: string;
  nha_cung_cap: { ten: string | null; ma_so_thue: string | null; dien_thoai: string | null; dia_chi: string | null };
  ma_don: string | null;
  ngay: string | null;
  tong_tien: number | null;
  dong_hang: DraftLine[];
  ghi_chu_khong_chac: string | null;
  canh_bao: string[];
}
export interface ScanUsage { status: string; limit: number; used: number; remaining: number }

export const MAX_PHOTOS = 3;
const MAX_SIDE = 1600;
const MAX_CHARS = 1_900_000; // dưới giới hạn 2 triệu ký tự của máy chủ

/** Thu nhỏ ảnh (cạnh dài tối đa 1600 điểm, tự xoay đúng chiều, JPEG), giảm chất lượng dần nếu vẫn quá lớn; trả về data URL */
export async function prepareImage(file: Blob): Promise<string> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => { throw new Error('BAD_IMAGE: Không mở được ảnh này. Hãy chọn ảnh JPG hoặc PNG.'); });
  let side = MAX_SIDE, q = 0.82;
  for (let i = 0; i < 6; i++) {
    const k = Math.min(1, side / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    if (!ctx) break;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    const url = cv.toDataURL('image/jpeg', q);
    if (url.length <= MAX_CHARS) { bmp.close?.(); return url; }
    side = Math.round(side * 0.8); q = Math.max(0.6, q - 0.06);
  }
  bmp.close?.();
  throw new Error('BAD_IMAGE: Ảnh quá lớn, hãy chụp lại gần hơn hoặc chọn ảnh nhỏ hơn.');
}

export async function scanInvoice(orgId: string, images: string[]): Promise<{ draft: InvoiceDraft; usage: ScanUsage }> {
  if (!navigator.onLine) throw new Error('OFFLINE: Đọc phiếu cần có mạng. Bạn vẫn nhập tay được.');
  const res = await callFunction<{ ok: boolean; draft: InvoiceDraft; usage: ScanUsage }>({ organization_id: orgId, scan_id: crypto.randomUUID(), images }, 'scan-invoice');
  return { draft: res.draft, usage: res.usage };
}

export async function getScanUsage(orgId: string): Promise<ScanUsage | null> {
  if (!supabase || !navigator.onLine) return null;
  const { data, error } = await supabase.rpc('get_invoice_scan_usage', { p_org: orgId });
  if (error) return null;
  return data as ScanUsage;
}

/** Bí danh đã học cho nhà cung cấp này (và bí danh chung); lỗi thì coi như chưa có */
export async function loadAliases(orgId: string, partnerId: string | null): Promise<AliasLike[]> {
  if (!supabase || !navigator.onLine) return [];
  const { data, error } = await supabase.rpc('get_material_aliases', { p_org: orgId, p_partner: partnerId });
  if (error) return [];
  return (data ?? []) as AliasLike[];
}

/** Lưu các cặp "tên trên phiếu → vật tư" sau khi hóa đơn đã lưu (làm lặng lẽ, lỗi không báo vì chỉ là tiện ích) */
export async function saveAliases(orgId: string, partnerId: string | null, items: { name: string; materialId: string }[]): Promise<void> {
  if (!supabase || items.length === 0) return;
  const payload = items.map((i) => ({ alias: norm(i.name), material_id: i.materialId })).filter((i) => i.alias.length >= 2);
  if (payload.length === 0) return;
  await supabase.rpc('save_material_aliases', { p_org: orgId, p_partner: partnerId, p_items: payload }).then(() => undefined, () => undefined);
}
