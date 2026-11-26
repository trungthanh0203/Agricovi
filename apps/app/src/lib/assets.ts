import { supabase } from './supabase';
import { t } from '@lingui/core/macro';

/**
 * Tài sản, khấu hao đường thẳng theo tháng và nhắc bảo dưỡng (H9, D180). Chỉ làm khi có mạng (chức năng quản lý, D24); không lưu offline.
 * Khấu hao chỉ ghi khi chủ bấm "Ghi khấu hao tháng": máy chủ chia vào các vụ theo diện tích × số ngày (D175).
 */
export type AssetKind = 'greenhouse' | 'barn' | 'pump' | 'irrigation' | 'fan' | 'vehicle' | 'machine' | 'other';
export const ASSET_KIND_LABEL: Record<AssetKind, string> = {
  get greenhouse() { return t`Nhà màng`; }, get barn() { return t`Chuồng trại`; }, get pump() { return t`Máy bơm`; }, get irrigation() { return t`Hệ thống tưới`; }, get fan() { return t`Quạt, làm mát`; }, vehicle: 'Xe', get machine() { return t`Máy móc khác`; }, other: 'Khác',
};

export interface Asset {
  id: string; organization_id: string; area_id: string | null; name: string; kind: AssetKind; purchase_date: string; cost: number; life_years: number; salvage: number;
  status: 'active' | 'disposed'; disposed_date: string | null; maintain_every_months: number | null; last_maintained_on: string | null; note: string | null; version: number;
}
export interface AssetInput {
  id: string; name: string; kind: AssetKind; areaId: string | null; date: string; cost: number; lifeYears: number; salvage: number; every: number | null; note: string;
}
export interface DepItem { asset_id: string; name: string; area_id: string | null; area_name: string | null; amount: number; posted: boolean }
export interface DepPreview { month: string; manual_exists: boolean; items: DepItem[] }

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error(t`Supabase chưa được cấu hình`);
  if (!navigator.onLine) throw new Error(t`OFFLINE: Cần có mạng để thực hiện. Hãy kết nối mạng rồi thử lại.`);
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

const COLS = 'id,organization_id,area_id,name,kind,purchase_date,cost,life_years,salvage,status,disposed_date,maintain_every_months,last_maintained_on,note,version';
export async function fetchAssets(orgId: string): Promise<Asset[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('assets').select(COLS).eq('organization_id', orgId).order('status').order('name');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ ...r, cost: Number(r.cost), salvage: Number(r.salvage), life_years: Number(r.life_years) })) as Asset[];
}

export const createAsset = (orgId: string, i: AssetInput) => rpc<Asset>('create_asset', {
  p_id: i.id, p_org: orgId, p_name: i.name, p_kind: i.kind, p_area: i.areaId, p_date: i.date, p_cost: i.cost, p_life: i.lifeYears, p_salvage: i.salvage, p_every: i.every, p_note: i.note,
});
export const updateAsset = (version: number, i: AssetInput) => rpc<Asset>('update_asset', {
  p_id: i.id, p_version: version, p_name: i.name, p_kind: i.kind, p_area: i.areaId, p_date: i.date, p_cost: i.cost, p_life: i.lifeYears, p_salvage: i.salvage, p_every: i.every, p_note: i.note,
});
export const disposeAsset = (id: string, version: number, date: string) => rpc<Asset>('dispose_asset', { p_id: id, p_version: version, p_date: date });
export const deleteAsset = (id: string) => rpc<void>('delete_asset', { p_id: id });
export const recordMaintenance = (id: string, assetId: string, date: string, note: string) => rpc<Asset>('record_asset_maintenance', { p_id: id, p_asset: assetId, p_date: date, p_note: note });
export const previewDepreciation = (orgId: string, month: string) => rpc<DepPreview>('preview_asset_depreciation', { p_org: orgId, p_month: month });
export const postDepreciation = (orgId: string, month: string, op: string) => rpc<{ assets: number; created: number; skipped_groups: number }>('post_asset_depreciation', { p_org: orgId, p_month: month, p_op: op });

/** Khấu hao mỗi tháng (làm tròn xuống, tháng cuối gánh phần dư; máy chủ tính đúng) */
export function monthlyAmount(a: Pick<Asset, 'cost' | 'salvage' | 'life_years'>): number {
  const n = Math.ceil(a.life_years * 12);
  return n > 0 ? Math.floor((a.cost - a.salvage) / n) : 0;
}

const addMonths = (iso: string, m: number): string => {
  const d = new Date(`${iso}T00:00:00`);
  d.setMonth(d.getMonth() + m);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** Ngày bảo dưỡng kế tiếp (null = chưa đặt chu kỳ hoặc đã thanh lý) */
export function nextMaintenance(a: Pick<Asset, 'status' | 'maintain_every_months' | 'last_maintained_on' | 'purchase_date'>): string | null {
  if (a.status !== 'active' || !a.maintain_every_months) return null;
  return addMonths(a.last_maintained_on ?? a.purchase_date, a.maintain_every_months);
}
/** Các tháng đã qua hết gần nhất (mới nhất trước), dạng YYYY-MM-01 */
export function pastMonths(today: string, count = 12): string[] {
  const [y = 2000, m = 1] = today.split('-').map(Number);
  const out: string[] = [];
  for (let i = 1; i <= count; i++) {
    const d = new Date(y, m - 1 - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
  }
  return out;
}
