/**
 * Ghép dữ liệu đọc từ ảnh phiếu với danh bạ của cơ sở (phần thuần, không phụ thuộc app): nhà cung cấp và vật tư.
 * Chuẩn hóa chữ (bỏ dấu, chữ thường), so khớp theo từ; "bí danh" đã học từ lần trước được ưu tiên.
 */

/** Bỏ dấu tiếng Việt, chữ thường, gom khoảng trắng; giữ chữ số và dấu - . / % để không mất "16-16-8", "50kg" */
export function norm(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd')
    .toLowerCase().replace(/[^a-z0-9\-./% ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// những từ hay gặp trên phiếu nhưng không giúp phân biệt hàng
const STOP = new Set(['cong', 'ty', 'tnhh', 'co', 'phan', 'cp', 'dai', 'ly', 'cua', 'hang', 'loai', 'bao', 'chai', 'goi', 'lo', 'thung', 'hop', 'kg', 'g', 'lit', 'l', 'ml', 'cai', 'bich', 'tui', 'vat', 'tu', 'nong', 'nghiep', 'dvt', 'sl']);

function tokens(s: string): string[] {
  const t = norm(s).split(/[ ]+/).filter(Boolean);
  const keep = t.filter((x) => !STOP.has(x));
  return keep.length > 0 ? keep : t;
}

/** Độ giống 0..1 giữa hai chuỗi: Dice theo từ, cộng điểm khi chuỗi này nằm trọn trong chuỗi kia */
export function similarity(a: string | null | undefined, b: string | null | undefined): number {
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = tokens(na), tb = tokens(nb);
  const setB = new Set(tb);
  const inter = ta.filter((x) => setB.has(x)).length;
  let score = (2 * inter) / (ta.length + tb.length);
  const shorter = na.length <= nb.length ? na : nb, longer = na.length <= nb.length ? nb : na;
  if (shorter.length >= 4 && longer.includes(shorter)) score = Math.max(score, 0.85);
  return score;
}

const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

export interface SupplierLike { id: string; name: string; phone?: string | null; tax_code?: string | null }
export interface SupplierGuess { ten: string | null; ma_so_thue: string | null; dien_thoai: string | null }

/** Nhà cung cấp trên phiếu → nhà cung cấp đã có: mã số thuế khớp > số điện thoại khớp > tên giống (≥ 0,7). Không khớp thì null. */
export function matchSupplier(g: SupplierGuess, partners: SupplierLike[]): { id: string; score: number; via: 'tax' | 'phone' | 'name' } | null {
  const tax = digits(g.ma_so_thue);
  if (tax.length >= 8) { const p = partners.find((x) => digits(x.tax_code) === tax); if (p) return { id: p.id, score: 1, via: 'tax' }; }
  const ph = digits(g.dien_thoai);
  if (ph.length >= 9) { const p = partners.find((x) => digits(x.phone).endsWith(ph.slice(-9)) && digits(x.phone).length >= 9); if (p) return { id: p.id, score: 0.95, via: 'phone' }; }
  let best: { id: string; score: number } | null = null;
  for (const p of partners) { const s = similarity(g.ten, p.name); if (s >= 0.7 && (!best || s > best.score)) best = { id: p.id, score: s }; }
  return best ? { ...best, via: 'name' } : null;
}

export interface MaterialLike { id: string; name: string }
export interface AliasLike { alias: string; material_id: string; partner_id?: string | null }

/**
 * Tên hàng trên phiếu → vật tư của cơ sở. Bí danh đã học trùng khớp thì chắc chắn (điểm 1, ưu tiên bí danh của đúng nhà cung cấp);
 * nếu không thì theo độ giống tên (≥ 0,6 mới gợi ý). `partnerId` để ưu tiên bí danh riêng của nhà cung cấp đó.
 */
export function matchMaterial(name: string, mats: MaterialLike[], aliases: AliasLike[] = [], partnerId: string | null = null): { id: string; score: number; via: 'alias' | 'name' } | null {
  const key = norm(name);
  if (!key) return null;
  const hit = aliases.filter((a) => a.alias === key && mats.some((m) => m.id === a.material_id))
    .sort((a, b) => Number(b.partner_id === partnerId) - Number(a.partner_id === partnerId))[0];
  if (hit) return { id: hit.material_id, score: 1, via: 'alias' };
  let best: { id: string; score: number } | null = null;
  for (const m of mats) { const s = similarity(name, m.name); if (s >= 0.6 && (!best || s > best.score)) best = { id: m.id, score: s }; }
  return best ? { ...best, via: 'name' } : null;
}

/** Đơn vị trên phiếu có khác đơn vị kho của vật tư không (so sánh sau khi bỏ dấu; thiếu một bên thì coi như không khác) */
export function unitsDiffer(invoiceUnit: string | null | undefined, stockUnit: string | null | undefined): boolean {
  const a = norm(invoiceUnit), b = norm(stockUnit);
  return Boolean(a && b && a !== b);
}
