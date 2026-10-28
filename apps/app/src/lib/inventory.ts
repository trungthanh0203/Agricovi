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
const MATERIAL_COLUMNS_D98B = `${MATERIAL_COLUMNS_D98}, group_item`;

/** Tải danh mục và tồn kho về thiết bị. Lỗi ở đây không được làm hỏng đồng bộ sản xuất nên người gọi tự bắt lỗi. */
export async function syncInventoryDown(): Promise<void> {
  if (!supabase || !navigator.onLine) return;
  const [units, materialsFull, locations, balances] = await Promise.all([
    supabase.from('units_of_measure').select('id, code, name, organization_id'),
    supabase.from('materials').select(`${MATERIAL_COLUMNS}, ${MATERIAL_COLUMNS_D98B}`),
    supabase.from('inventory_locations').select('id, organization_id, name, description, is_active, area_ids'),
    supabase.from('inventory_balances').select('organization_id, location_id, material_id, balance, is_negative, receipts_missing_cost, last_receipt_date, last_adjust_date, last_adjust_delta, last_adjust_reason'),
  ]);
  // cột mới (D98) chưa có vì CSDL chưa cập nhật: tải bản cũ để Kho vẫn dùng được
  const locationsFixed = locations.error && /column|schema cache/i.test(locations.error.message ?? '')
    ? await supabase.from('inventory_locations').select('id, organization_id, name, description, is_active') : locations;
  let materials = materialsFull;
  if (materials.error && /column|schema cache/i.test(materials.error.message ?? '')) materials = await supabase.from('materials').select(`${MATERIAL_COLUMNS}, ${MATERIAL_COLUMNS_D98}`) as typeof materials; // chưa db push 0098
  if (materials.error && /column|schema cache/i.test(materials.error.message ?? '')) materials = await supabase.from('materials').select(MATERIAL_COLUMNS) as typeof materials;
  for (const r of [units, materials, locationsFixed, balances]) if (r.error) throw r.error;

  await db.transaction('rw', [db.units, db.materials, db.locations, db.balances], async () => {
    await Promise.all([db.units.clear(), db.materials.clear(), db.locations.clear(), db.balances.clear()]);
    await db.units.bulkPut((units.data ?? []) as UnitRow[]);
    await db.materials.bulkPut(
      ((materials.data ?? []) as MaterialRow[]).map((m) => ({ ...m, reorder_threshold: m.reorder_threshold == null ? null : Number(m.reorder_threshold) })),
    );
    await db.locations.bulkPut((locationsFixed.data ?? []) as LocationRow[]);
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

/** Lý do xuất kho tay */
export const ISSUE_KIND_LABEL: Record<string, string> = { cycle: 'Dùng cho vụ', loss: 'Hao hụt / hỏng', sale: 'Xuất bán', shared: 'Dùng chung', other: 'Khác' };

/** Xuất kho tay: cần mạng, bắt buộc lý do; lô tự gắn theo hạn gần nhất (máy chủ). Chỉ người có quyền sửa Kho. */
export async function recordIssue(t: { id?: string; organizationId: string; locationId: string; materialId: string; quantity: number; kind: string; date: string; reason: string; cycleId?: string }): Promise<string> {
  requireOnline('xuất kho');
  const id = t.id ?? crypto.randomUUID();
  await insertRow('inventory_transactions', {
    id, organization_id: t.organizationId, location_id: t.locationId, material_id: t.materialId, txn_type: 'issue',
    quantity_delta: -t.quantity, unit_cost: null, txn_date: t.date, reason: t.reason.trim(), issue_kind: t.kind, source: 'online', ...(t.kind === 'cycle' && t.cycleId ? { cycle_id: t.cycleId } : {}),
  });
  await syncInventoryDown().catch(() => undefined);
  return id;
}

/**
 * Chia một lượng xuất dùng chung cho nhiều vụ: theo diện tích (m²) khi vụ nào cũng có diện tích, không thì chia đều; làm tròn 3 số lẻ,
 * phần dư dồn vào vụ cuối. Phải khớp hàm issue_shared_to_cycles của máy chủ (dùng để xem trước, máy chủ mới là nơi tính thật).
 */
export function splitShares(total: number, areasM2: (number | null | undefined)[]): { shares: number[]; byArea: boolean } {
  const n = areasM2.length;
  const byArea = n > 0 && areasM2.every((a) => a != null && a > 0);
  const w = byArea ? (areasM2 as number[]) : areasM2.map(() => 1);
  const sum = w.reduce((s, x) => s + x, 0);
  const shares: number[] = [];
  let given = 0;
  for (let i = 0; i < n; i++) {
    const s = i === n - 1 ? Math.round((total - given) * 1000) / 1000 : Math.round((total * w[i]! / sum) * 1000) / 1000;
    shares.push(s);
    given += s;
  }
  return { shares, byArea };
}

/** Xuất dùng chung chia cho các vụ đã chọn (cần mạng; máy chủ chia theo diện tích hoặc đều và tạo mỗi vụ một giao dịch) */
export async function issueSharedToCycles(t: { organizationId: string; locationId: string; materialId: string; quantity: number; date: string; cycleIds: string[]; note: string }): Promise<number> {
  requireOnline('xuất kho');
  const { data, error } = await client().rpc('issue_shared_to_cycles', {
    p_org: t.organizationId, p_material: t.materialId, p_location: t.locationId, p_qty: t.quantity, p_date: t.date, p_cycles: t.cycleIds, p_note: t.note.trim() || null,
  });
  if (error) throw error;
  await syncInventoryDown().catch(() => undefined);
  return Number(data ?? 0);
}

/** Lượng vật tư đang tính cho một vụ (đã xuất trừ đã trả), theo từng vật tư: dùng để chọn vật tư và giới hạn lượng khi trả về kho */
export async function fetchCycleMaterialNet(cycleId: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!supabase || !navigator.onLine) return out;
  const { data, error } = await supabase.from('inventory_issue_costs').select('material_id, quantity').eq('cycle_id', cycleId);
  if (error) return out;
  for (const r of (data ?? []) as { material_id: string; quantity: number | string }[]) out.set(r.material_id, (out.get(r.material_id) ?? 0) + Number(r.quantity));
  return out;
}

/** Trả vật tư về kho từ một vụ (cần mạng; máy chủ tự tính đơn giá và chặn trả quá lượng đã xuất cho vụ) */
export async function returnToStock(t: { id?: string; organizationId: string; locationId: string; materialId: string; cycleId: string; quantity: number; date: string; reason: string }): Promise<string> {
  requireOnline('trả vật tư về kho');
  const id = t.id ?? crypto.randomUUID();
  await insertRow('inventory_transactions', {
    id, organization_id: t.organizationId, location_id: t.locationId, material_id: t.materialId, txn_type: 'adjustment',
    quantity_delta: t.quantity, txn_date: t.date, reason: t.reason.trim() || null, is_return: true, cycle_id: t.cycleId, source: 'online',
  });
  await syncInventoryDown().catch(() => undefined);
  return id;
}

/** Chuyển kho giữa hai kho (theo lô, hạn gần nhất trước): cần mạng; máy chủ tạo hai giao dịch liên kết */
export async function transferStock(t: { organizationId: string; materialId: string; fromId: string; toId: string; quantity: number; date: string; note: string }): Promise<void> {
  requireOnline('chuyển kho');
  const { error } = await client().rpc('transfer_stock', {
    p_org: t.organizationId, p_material: t.materialId, p_from: t.fromId, p_to: t.toId, p_qty: t.quantity, p_date: t.date, p_note: t.note.trim() || null,
  });
  if (error) throw error;
  await syncInventoryDown().catch(() => undefined);
}

export interface TxnHistoryRow {
  id: string;
  /** Loại xuất kho tay (hao hụt/hỏng, xuất bán, dùng chung, khác) và mã cặp chuyển kho */
  issue_kind?: string | null;
  transfer_id?: string | null;
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

/** Bộ lọc xem giao dịch kho (tất cả không bắt buộc) */
export interface TxnFilter { materialId?: string; locationId?: string; txnType?: string; from?: string; to?: string; limit?: number }

/** Giao dịch kho mới nhất trước (theo thứ tự ghi), có lọc theo vật tư, kho, loại, khoảng ngày. Cần mạng. */
export async function fetchTransactions(orgId: string, f: TxnFilter = {}): Promise<TxnHistoryRow[]> {
  const q = (cols: string) => {
    let b = client().from('inventory_transactions').select(cols).eq('organization_id', orgId);
    if (f.materialId) b = b.eq('material_id', f.materialId);
    if (f.locationId) b = b.eq('location_id', f.locationId);
    if (f.txnType) b = b.eq('txn_type', f.txnType);
    if (f.from) b = b.gte('txn_date', f.from);
    if (f.to) b = b.lte('txn_date', f.to);
    return b.order('created_at', { ascending: false }).limit(f.limit ?? 200);
  };
  const base = 'id, location_id, material_id, txn_type, quantity_delta, unit_cost, txn_date, reason, activity_log_id, author_name, author_roles, created_at, purchase_bills(invoice_no, partners(name))';
  let { data, error } = await q(`${base}, issue_kind, transfer_id, material_lots(lot_no, expiry_date)`);
  if (error && /relationship|column|schema cache/i.test(error.message ?? '')) ({ data, error } = await q(`${base}, material_lots(lot_no, expiry_date)`)); // chưa db push 0101
  if (error && /relationship|column|schema cache/i.test(error.message ?? '')) ({ data, error } = await q(base)); // CSDL chưa có bảng lô
  if (error) throw error;
  return ((data ?? []) as unknown as TxnHistoryRow[]).map((r) => ({ ...r, quantity_delta: Number(r.quantity_delta) }));
}

export const fetchRecentTransactions = (orgId: string, limit = 30) => fetchTransactions(orgId, { limit });

// --- danh mục (cần mạng) ---

/** Thông tin mở rộng của vật tư (không bắt buộc) */
export interface MaterialExt {
  material_group: string | null;
  /** Mã mục tự thêm trong cấu hình Nhóm vật tư; null = mục có sẵn */
  group_item?: string | null;
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

export async function createMaterial(orgId: string, m: { name: string; category: string; unitId: string; threshold: number | null; description?: string; ext?: Partial<MaterialExt> }): Promise<void> {
  needOnline();
  const ext: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(m.ext ?? {})) ext[k] = typeof v === 'string' ? v.trim() || null : v ?? null;
  const { error } = await client().from('materials').insert({
    ...ext,
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

export async function createLocation(orgId: string, name: string, description = '', areaIds: string[] | null = null): Promise<string> {
  needOnline();
  const id = crypto.randomUUID();
  const { error } = await client().from('inventory_locations').insert({ id, organization_id: orgId, name: name.trim(), description: description.trim() || null, area_ids: areaIds && areaIds.length > 0 ? areaIds : null });
  if (error) throw error;
  await syncInventoryDown();
  return id;
}

export async function updateLocation(id: string, c: { name?: string; description?: string | null; is_active?: boolean; area_ids?: string[] | null }): Promise<void> {
  needOnline();
  const patch: Record<string, unknown> = {};
  if (c.name !== undefined) patch.name = c.name.trim();
  if (c.description !== undefined) patch.description = c.description?.trim() || null;
  if (c.area_ids !== undefined) patch.area_ids = c.area_ids && c.area_ids.length > 0 ? c.area_ids : null;
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

// Nhóm vật tư (D98: quyết định cách app xử lý, FCR lấy nhóm thức ăn) nay nằm ở lib/config.ts (cấu hình 'material_groups', mã cố định).

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

export interface LotOption { id: string; lot_no: string; expiry_date: string | null }

/** Các lô đã nhập của một vật tư (cần mạng và quyền xem Kho; không được thì trả về rỗng, khi đó máy chủ tự gắn lô theo hạn gần nhất) */
export async function fetchLots(materialId: string): Promise<LotOption[]> {
  if (!supabase || !navigator.onLine || !materialId) return [];
  const { data, error } = await supabase.from('material_lots').select('id, lot_no, expiry_date').eq('material_id', materialId).order('expiry_date', { ascending: true, nullsFirst: false });
  return error ? [] : ((data ?? []) as LotOption[]);
}
