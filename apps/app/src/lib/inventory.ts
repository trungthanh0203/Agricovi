import type { OutboxItem } from '@agriconnect/shared';
import { db, type BalanceRow, type LocationRow, type MaterialRow, type UnitRow } from './db';
import { insertRow, requireOnline } from './serverWrite';
import { supabase } from './supabase';

/**
 * Vật tư & kho (FR-INV-001…004, v1.1 mục 4.4).
 *  - Danh mục (vật tư, kho, đơn vị), nhập kho và điều chỉnh đều cần MẠNG và ghi thẳng lên máy chủ (D22, D24).
 *  - Riêng "xuất dùng" do nhân viên ghi khi ghi việc vẫn offline (xem production.logActivity).
 *  - Giao dịch chỉ thêm; tồn = tổng giao dịch; tồn âm được báo chứ không chặn.
 */

export const TXN_TYPE_LABEL: Record<string, string> = {
  receipt: 'Nhập kho',
  issue: 'Xuất dùng',
  adjustment: 'Điều chỉnh',
};

function client() {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  return supabase;
}

function needOnline() {
  if (!navigator.onLine) throw new Error('OFFLINE: Cần có mạng để thay đổi danh mục vật tư và kho.');
}

const MATERIAL_COLUMNS = 'id, organization_id, name, description, image, category, brand, usage_guide, usage_method, safety_warning, quality_specs, limit_elements, withdrawal_days, base_unit_id, reorder_threshold, is_active';
const MATERIAL_COLUMNS_D98 = 'material_group, active_ingredient, registration_no, manufacturer';

/** Tải danh mục và tồn kho về thiết bị. Lỗi ở đây không được làm hỏng đồng bộ sản xuất nên người gọi tự bắt lỗi. */
export async function syncInventoryDown(): Promise<void> {
  if (!supabase || !navigator.onLine) return;
  const [units, materialsFull, locations, balances] = await Promise.all([
    supabase.from('units_of_measure').select('id, code, name, organization_id'),
    supabase.from('materials').select(`${MATERIAL_COLUMNS}, ${MATERIAL_COLUMNS_D98}`),
    supabase.from('inventory_locations').select('id, organization_id, name, description, is_active'),
    supabase.from('inventory_balances').select('organization_id, location_id, material_id, balance, is_negative, receipts_missing_cost, last_receipt_date, last_adjust_date, last_adjust_delta, last_adjust_reason'),
  ]);
  // cột mới (D98) chưa có vì CSDL chưa cập nhật: tải bản cũ để Kho vẫn dùng được
  const materials = materialsFull.error && /column|schema cache/i.test(materialsFull.error.message ?? '')
    ? await supabase.from('materials').select(MATERIAL_COLUMNS) : materialsFull;
  for (const r of [units, materials, locations, balances]) if (r.error) throw r.error;

  await db.transaction('rw', [db.units, db.materials, db.locations, db.balances], async () => {
    await Promise.all([db.units.clear(), db.materials.clear(), db.locations.clear(), db.balances.clear()]);
    await db.units.bulkPut((units.data ?? []) as UnitRow[]);
    await db.materials.bulkPut(
      ((materials.data ?? []) as MaterialRow[]).map((m) => ({ ...m, reorder_threshold: m.reorder_threshold == null ? null : Number(m.reorder_threshold) })),
    );
    await db.locations.bulkPut((locations.data ?? []) as LocationRow[]);
    await db.balances.bulkPut(
      ((balances.data ?? []) as BalanceRow[]).map((b) => ({ ...b, balance: Number(b.balance), receipts_missing_cost: Number(b.receipts_missing_cost), last_adjust_delta: b.last_adjust_delta == null ? null : Number(b.last_adjust_delta) })),
    );
  });
}

/** Tổng thay đổi tồn của các giao dịch còn chờ gửi, theo khóa "kho|vật tư" */
export function pendingDeltas(items: OutboxItem[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const it of items) {
    if (it.table !== 'inventory_transactions' || it.op !== 'insert' || it.state === 'synced') continue;
    const key = `${it.payload.location_id}|${it.payload.material_id}`;
    map.set(key, (map.get(key) ?? 0) + Number(it.payload.quantity_delta));
  }
  return map;
}

export interface NewTxn {
  id?: string; // mã tạo sẵn cho lần nhập này (chống trùng khi bấm lặp)
  organizationId: string;
  locationId: string;
  materialId: string;
  type: 'receipt' | 'adjustment';
  /** Số lô và hạn dùng của lô (chỉ khi nhập kho, không bắt buộc) */
  lotNo?: string;
  lotExpiry?: string | null;
  /** Số lượng dương; với điều chỉnh, hướng do `direction` quyết định */
  quantity: number;
  direction?: 'increase' | 'decrease';
  unitCost: number | null;
  date: string; // yyyy-mm-dd
  reason: string;
}

/** Ghi giao dịch kho (nhập, điều chỉnh): cần mạng, ghi thẳng lên máy chủ và báo kết quả ngay. */
export async function recordTransaction(t: NewTxn): Promise<string> {
  requireOnline('ghi giao dịch kho');
  const id = t.id ?? crypto.randomUUID();
  const sign = t.type === 'adjustment' && t.direction === 'decrease' ? -1 : 1;
  await insertRow('inventory_transactions', {
    id,
    organization_id: t.organizationId,
    location_id: t.locationId,
    material_id: t.materialId,
    txn_type: t.type,
    quantity_delta: sign * t.quantity,
    unit_cost: t.type === 'receipt' ? t.unitCost : null,
    ...(t.type === 'receipt' && t.lotNo?.trim() ? { lot_no: t.lotNo.trim(), lot_expiry: t.lotExpiry || null } : {}),
    txn_date: t.date,
    reason: t.reason.trim() || null,
    source: 'online',
  });
  // lấy lại tồn mới từ máy chủ để số hiển thị khớp
  await syncInventoryDown().catch(() => undefined);
  return id;
}

export interface TxnHistoryRow {
  id: string;
  location_id: string;
  material_id: string;
  txn_type: string;
  quantity_delta: number;
  unit_cost: number | null;
  txn_date: string;
  reason: string | null;
  activity_log_id: string | null;
  author_name: string | null;
  author_roles: string[] | null;
  created_at: string;
  /** Hóa đơn mua và nhà cung ứng (chỉ có khi người xem có quyền xem Chi phí) */
  purchase_bills?: { invoice_no: string | null; partners: { name: string } | null } | null;
  /** Lô của giao dịch (nhập kèm lô, hoặc xuất được tự gắn lô theo hạn gần nhất) */
  material_lots?: { lot_no: string; expiry_date: string | null } | null;
}

export async function fetchRecentTransactions(orgId: string, limit = 30): Promise<TxnHistoryRow[]> {
  const q = (cols: string) => client().from('inventory_transactions').select(cols)
    .eq('organization_id', orgId).order('created_at', { ascending: false }).limit(limit);
  const base = 'id, location_id, material_id, txn_type, quantity_delta, unit_cost, txn_date, reason, activity_log_id, author_name, author_roles, created_at, purchase_bills(invoice_no, partners(name))';
  let { data, error } = await q(`${base}, material_lots(lot_no, expiry_date)`);
  if (error && /relationship|column|schema cache/i.test(error.message ?? '')) ({ data, error } = await q(base)); // CSDL chưa có bảng lô
  if (error) throw error;
  return ((data ?? []) as unknown as TxnHistoryRow[]).map((r) => ({ ...r, quantity_delta: Number(r.quantity_delta) }));
}

// --- danh mục (cần mạng) ---

/** Thông tin mở rộng của vật tư (không bắt buộc) */
export interface MaterialExt {
  material_group: string | null;
  active_ingredient: string | null;
  registration_no: string | null;
  manufacturer: string | null;
  image: string | null;
  brand: string | null;
  usage_guide: string | null;
  usage_method: string | null;
  safety_warning: string | null;
  quality_specs: string | null;
  limit_elements: string | null;
  withdrawal_days: number | null;
}

/** Thêm các vật tư mẫu còn thiếu (không đụng mục đã có); trả về số mục mới thêm */
export async function addDefaultMaterials(orgId: string): Promise<number> {
  needOnline();
  const { data, error } = await client().rpc('add_default_materials', { p_org: orgId });
  if (error) throw error;
  await syncInventoryDown();
  return Number(data ?? 0);
}

export async function createMaterial(orgId: string, m: { name: string; category: string; unitId: string; threshold: number | null; description?: string }): Promise<void> {
  needOnline();
  const { error } = await client().from('materials').insert({
    id: crypto.randomUUID(),
    organization_id: orgId,
    name: m.name.trim(),
    description: m.description?.trim() || null,
    category: m.category.trim() || null,
    base_unit_id: m.unitId,
    reorder_threshold: m.threshold,
  });
  if (error) throw error;
  await syncInventoryDown();
}

export async function updateMaterial(id: string, c: { name?: string; description?: string | null; category?: string | null; threshold?: number | null; is_active?: boolean; ext?: Partial<MaterialExt> }): Promise<void> {
  needOnline();
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(c.ext ?? {})) patch[k] = typeof v === 'string' ? v.trim() || null : v;
  if (c.name !== undefined) patch.name = c.name.trim();
  if (c.description !== undefined) patch.description = c.description?.trim() || null;
  if (c.category !== undefined) patch.category = c.category?.trim() || null;
  if (c.threshold !== undefined) patch.reorder_threshold = c.threshold;
  if (c.is_active !== undefined) patch.is_active = c.is_active;
  const { error } = await client().from('materials').update(patch).eq('id', id);
  if (error) throw error;
  await syncInventoryDown();
}

export async function createLocation(orgId: string, name: string, description = ''): Promise<string> {
  needOnline();
  const id = crypto.randomUUID();
  const { error } = await client().from('inventory_locations').insert({ id, organization_id: orgId, name: name.trim(), description: description.trim() || null });
  if (error) throw error;
  await syncInventoryDown();
  return id;
}

export async function updateLocation(id: string, c: { name?: string; description?: string | null; is_active?: boolean }): Promise<void> {
  needOnline();
  const patch: Record<string, unknown> = {};
  if (c.name !== undefined) patch.name = c.name.trim();
  if (c.description !== undefined) patch.description = c.description?.trim() || null;
  if (c.is_active !== undefined) patch.is_active = c.is_active;
  const { error } = await client().from('inventory_locations').update(patch).eq('id', id);
  if (error) throw error;
  await syncInventoryDown();
}

export async function createUnit(orgId: string, name: string): Promise<void> {
  needOnline();
  const { error } = await client().from('units_of_measure').insert({
    id: crypto.randomUUID(),
    organization_id: orgId,
    code: `u-${crypto.randomUUID().slice(0, 8)}`,
    name: name.trim(),
  });
  if (error) throw error;
  await syncInventoryDown();
}

/** "12,5" hoặc "12.5" -> 12.5; trống -> null; không phải số -> NaN */
export function parseNumber(raw: string): number | null {
  const s = raw.trim().replace(',', '.');
  if (s === '') return null;
  return Number(s);
}

export const formatQty = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 3 });
export const formatMoney = (n: number) => `${n.toLocaleString('vi-VN')} đ`;

/** Nhóm vật tư (D98): quyết định cách app xử lý sau này (cách ly chỉ với thuốc/vaccine/BVTV, FCR lấy nhóm thức ăn) */
export const MATERIAL_GROUPS: { id: string; label: string }[] = [
  { id: 'feed', label: 'Thức ăn' }, { id: 'vet_drug', label: 'Thuốc thú y' }, { id: 'vaccine', label: 'Vaccine' },
  { id: 'pesticide', label: 'Thuốc bảo vệ thực vật' }, { id: 'fertilizer', label: 'Phân bón' }, { id: 'disinfectant', label: 'Thuốc sát trùng' },
  { id: 'seed', label: 'Giống' }, { id: 'other', label: 'Khác' },
];

export interface LotStatus {
  lot_id: string; material_id: string; material_name: string; lot_no: string; expiry_date: string; remaining: number; days_left: number;
}

/** Lô còn tồn đã hết hạn hoặc sắp hết hạn trong `days` ngày (cần mạng; lỗi/offline thì trả về rỗng, không làm hỏng màn hình) */
export async function fetchLotStatus(orgId: string, days = 30): Promise<LotStatus[]> {
  if (!supabase || !navigator.onLine) return [];
  const { data, error } = await supabase.rpc('get_lot_status', { p_org: orgId, p_days: days });
  if (error) return [];
  return ((data ?? []) as LotStatus[]).map((r) => ({ ...r, remaining: Number(r.remaining) }));
}
