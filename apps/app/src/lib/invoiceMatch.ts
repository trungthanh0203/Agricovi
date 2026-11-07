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

// ---------------------------------------------------------------- đọc nhãn vật tư
const GROUP_WORDS: Record<string, string[]> = {
  phan_bon: ['phan'],
  thuoc_bvtv: ['bvtv', 'bao ve thuc vat', 'tru sau', 'tru benh', 'tru co', 'nong duoc', 'thuoc tru'],
  thuoc_thu_y: ['thu y'],
  thuc_an: ['thuc an'],
  giong: ['giong'],
};

/** Loại sản phẩm đọc từ nhãn → nhóm vật tư của cơ sở (so theo từ khóa trong tên nhóm); không rõ thì null */
export function suggestGroup(loai: string | null | undefined, groups: { id: string; label: string }[]): string | null {
  const words = loai ? GROUP_WORDS[loai] : undefined;
  if (!words) return null;
  return groups.find((g) => { const n = norm(g.label); return words.some((w) => n.includes(w)); })?.id ?? null;
}

const UNIT_SYNONYMS: Record<string, string> = { kilogam: 'kg', kilogram: 'kg', 'ki lo gam': 'kg', lit: 'l', litre: 'l', liter: 'l', gam: 'g', gram: 'g', 'mililit': 'ml' };
const unitKey = (s: string | null | undefined) => { const n = norm(s); return UNIT_SYNONYMS[n] ?? n; };

/** Đơn vị đọc từ nhãn ("kg", "lít", "gói"…) → đơn vị đã có trong kho; không khớp thì null (người dùng tự chọn) */
export function suggestUnit(donVi: string | null | undefined, units: { id: string; name: string }[]): string | null {
  const k = unitKey(donVi);
  if (!k) return null;
  return units.find((u) => unitKey(u.name) === k)?.id ?? null;
}

const regKey = (s: string | null | undefined) => norm(s).replace(/[^a-z0-9]/g, '');

/** Vật tư khác (không phải `selfId`) đã có cùng số đăng ký lưu hành; dùng để chặn tạo trùng */
export function findByRegNo(reg: string | null | undefined, mats: { id: string; registration_no?: string | null }[], selfId: string | null = null): string | null {
  const k = regKey(reg);
  if (k.length < 4) return null;
  return mats.find((m) => m.id !== selfId && regKey(m.registration_no) === k)?.id ?? null;
}
