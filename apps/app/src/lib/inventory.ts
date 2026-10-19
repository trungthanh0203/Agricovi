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

/** Tải danh mục và tồn kho về thiết bị. Lỗi ở đây không được làm hỏng đồng bộ sản xuất nên người gọi tự bắt lỗi. */
export async function syncInventoryDown(): Promise<void> {
  if (!supabase || !navigator.onLine) return;
  const [units, materials, locations, balances] = await Promise.all([
    supabase.from('units_of_measure').select('id, code, name, organization_id'),
    supabase.from('materials').select('id, organization_id, name, category, base_unit_id, reorder_threshold, is_active'),
    supabase.from('inventory_locations').select('id, organization_id, name, is_active'),
    supabase.from('inventory_balances').select('organization_id, location_id, material_id, balance, is_negative, receipts_missing_cost'),
  ]);
  for (const r of [units, materials, locations, balances]) if (r.error) throw r.error;

  await db.transaction('rw', [db.units, db.materials, db.locations, db.balances], async () => {
    await Promise.all([db.units.clear(), db.materials.clear(), db.locations.clear(), db.balances.clear()]);
    await db.units.bulkPut((units.data ?? []) as UnitRow[]);
    await db.materials.bulkPut(
      ((materials.data ?? []) as MaterialRow[]).map((m) => ({ ...m, reorder_threshold: m.reorder_threshold == null ? null : Number(m.reorder_threshold) })),
    );
    await db.locations.bulkPut((locations.data ?? []) as LocationRow[]);
    await db.balances.bulkPut(
      ((balances.data ?? []) as BalanceRow[]).map((b) => ({ ...b, balance: Number(b.balance), receipts_missing_cost: Number(b.receipts_missing_cost) })),
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
}

export async function fetchRecentTransactions(orgId: string, limit = 30): Promise<TxnHistoryRow[]> {
  const { data, error } = await client()
    .from('inventory_transactions')
    .select('id, location_id, material_id, txn_type, quantity_delta, unit_cost, txn_date, reason, activity_log_id, author_name, author_roles, created_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as TxnHistoryRow[]).map((r) => ({ ...r, quantity_delta: Number(r.quantity_delta) }));
}

// --- danh mục (cần mạng) ---

export async function createMaterial(orgId: string, m: { name: string; category: string; unitId: string; threshold: number | null }): Promise<void> {
  needOnline();
  const { error } = await client().from('materials').insert({
    id: crypto.randomUUID(),
    organization_id: orgId,
    name: m.name.trim(),
    category: m.category.trim() || null,
    base_unit_id: m.unitId,
    reorder_threshold: m.threshold,
  });
  if (error) throw error;
  await syncInventoryDown();
}

export async function updateMaterial(id: string, c: { name?: string; category?: string | null; threshold?: number | null; is_active?: boolean }): Promise<void> {
  needOnline();
  const patch: Record<string, unknown> = {};
  if (c.name !== undefined) patch.name = c.name.trim();
  if (c.category !== undefined) patch.category = c.category?.trim() || null;
  if (c.threshold !== undefined) patch.reorder_threshold = c.threshold;
  if (c.is_active !== undefined) patch.is_active = c.is_active;
  const { error } = await client().from('materials').update(patch).eq('id', id);
  if (error) throw error;
  await syncInventoryDown();
}

export async function createLocation(orgId: string, name: string): Promise<string> {
  needOnline();
  const id = crypto.randomUUID();
  const { error } = await client().from('inventory_locations').insert({ id, organization_id: orgId, name: name.trim() });
  if (error) throw error;
  await syncInventoryDown();
  return id;
}

export async function updateLocation(id: string, c: { name?: string; is_active?: boolean }): Promise<void> {
  needOnline();
  const patch: Record<string, unknown> = {};
  if (c.name !== undefined) patch.name = c.name.trim();
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
