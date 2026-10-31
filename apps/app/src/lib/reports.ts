import { canPerm, type EffectivePerms } from './permissions';
import { hasRole } from './roles';
import { supabase } from './supabase';
import type { MemberRole } from '@agriconnect/shared';

/**
 * Báo cáo theo nhu cầu (D48). Số liệu do máy chủ tính và kiểm quyền (`run_report`); điện thoại chỉ chọn loại, bộ lọc và vẽ bảng.
 * Báo cáo đã lưu chỉ lưu loại + bộ lọc, mở lại luôn chạy mới.
 */

export type ReportType = 'expenses' | 'sales' | 'harvest' | 'stock' | 'labor' | 'cycles' | 'purchases' | 'customers' | 'procurement';

export interface ReportTypeInfo {
  id: ReportType;
  label: string;
  hint: string;
  groups: { id: string; label: string }[];
  allowed: (perms: EffectivePerms | undefined, roles: readonly MemberRole[] | undefined) => boolean;
}

export const REPORT_TYPES: ReportTypeInfo[] = [
  { id: 'expenses', label: 'Chi phí', hint: 'Chi phí đã ghi (không cộng tiền mua vật tư vì đã tính khi dùng)',
    groups: [{ id: 'category', label: 'Theo nhóm chi phí' }, { id: 'month', label: 'Theo tháng' }, { id: 'day', label: 'Theo ngày' }, { id: 'cycle', label: 'Theo vụ' }, { id: 'kind', label: 'Theo loại khoản (thực chi, ước tính…)' }],
    allowed: (p) => canPerm(p, 'expenses') },
  { id: 'purchases', label: 'Mua hàng theo nhà cung ứng', hint: 'Số hóa đơn, tổng tiền, đã trả, còn nợ (không tính hóa đơn đã hủy)',
    groups: [{ id: 'partner', label: 'Theo nhà cung ứng' }, { id: 'month', label: 'Theo tháng' }, { id: 'material', label: 'Theo vật tư' }],
    allowed: (p) => canPerm(p, 'expenses') },
  { id: 'customers', label: 'Doanh thu theo khách hàng', hint: 'Số lần bán, số lượng, doanh thu, đã thu, còn phải thu (bán không ghi khách tính là thu đủ)',
    groups: [{ id: 'partner', label: 'Theo khách hàng' }, { id: 'month', label: 'Theo tháng' }],
    allowed: (p) => canPerm(p, 'sales') },
  { id: 'sales', label: 'Doanh thu bán hàng', hint: 'Số lượng và tiền bán',
    groups: [{ id: 'month', label: 'Theo tháng' }, { id: 'day', label: 'Theo ngày' }, { id: 'cycle', label: 'Theo vụ' }],
    allowed: (p) => canPerm(p, 'sales') },
  { id: 'harvest', label: 'Thu hoạch', hint: 'Sản lượng thu, hao hụt, sau hao hụt',
    groups: [{ id: 'day', label: 'Theo ngày' }, { id: 'month', label: 'Theo tháng' }, { id: 'cycle', label: 'Theo vụ' }, { id: 'grade', label: 'Theo phân loại' }],
    allowed: (p) => canPerm(p, 'harvest') },
  { id: 'stock', label: 'Nhập, xuất, điều chỉnh vật tư', hint: 'Số lượng nhập kho, xuất dùng, điều chỉnh',
    groups: [{ id: 'material', label: 'Theo vật tư' }, { id: 'month', label: 'Theo tháng' }, { id: 'location', label: 'Theo kho' }],
    allowed: (p) => canPerm(p, 'inventory') },
  { id: 'labor', label: 'Giờ công và tiền công', hint: 'Giờ công đã xác nhận và tiền công đã tính',
    groups: [{ id: 'worker', label: 'Theo người' }, { id: 'team', label: 'Theo phòng / tổ' }, { id: 'month', label: 'Theo tháng' }, { id: 'cycle', label: 'Theo vụ' }],
    allowed: (_p, r) => hasRole(r, 'manager') },
  { id: 'procurement', label: 'Thu mua / bán cho HTX', hint: 'HTX: thu mua từ hộ (số phiếu, khối lượng, thành tiền, đã trả, còn phải trả). Hộ thuộc HTX: bán cho HTX (đã nhận, còn phải thu)',
    groups: [{ id: 'partner', label: 'Theo hộ / HTX' }, { id: 'crop', label: 'Theo sản phẩm' }, { id: 'month', label: 'Theo tháng' }],
    allowed: (p) => canPerm(p, 'coop') || canPerm(p, 'sales') },
  { id: 'cycles', label: 'Tổng hợp theo vụ', hint: 'Mỗi vụ một dòng: chi phí, thu hoạch, doanh thu, giá thành',
    groups: [], allowed: (p) => canPerm(p, 'summary') },
];

export interface ReportParams { from?: string; to?: string; cycle_id?: string; group?: string }
export interface ReportColumn { key: string; label: string; kind: 'text' | 'int' | 'num' | 'money'; sum?: boolean }
export interface ReportResult {
  type: ReportType; title: string; from: string; to: string; group: string; columns: ReportColumn[];
  rows: Record<string, string | number | null>[]; generated_at: string;
}
export interface SavedReport { id: string; name: string; report_type: ReportType; params: ReportParams; shared: boolean; owner_id: string }

function client() {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  return supabase;
}
function needOnline(what: string) {
  if (!navigator.onLine) throw new Error(`OFFLINE: Cần có mạng để ${what}. Hãy kết nối mạng rồi thử lại.`);
}

export async function runReport(orgId: string, type: ReportType, params: ReportParams): Promise<ReportResult> {
  needOnline('xem báo cáo');
  const { data, error } = type === 'procurement'
    ? await client().rpc('get_procurement_report', {
      p_org: orgId, p_from: params.from ?? new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10), p_to: params.to ?? new Date().toISOString().slice(0, 10), p_group: params.group || 'partner',
    })
    : await client().rpc('run_report', { p_org: orgId, p_type: type, p_params: params });
  if (error) throw new Error(error.message);
  return data as ReportResult;
}

export async function listSavedReports(orgId: string): Promise<SavedReport[]> {
  needOnline('xem báo cáo đã lưu');
  const { data, error } = await client().from('saved_reports').select('id, name, report_type, params, shared, owner_id')
    .eq('organization_id', orgId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SavedReport[];
}

export async function saveReport(orgId: string, name: string, type: ReportType, params: ReportParams, shared: boolean): Promise<void> {
  needOnline('lưu báo cáo');
  const { error } = await client().from('saved_reports').insert({ organization_id: orgId, name: name.trim(), report_type: type, params, shared });
  if (error) throw new Error(error.message);
}

export async function deleteSavedReport(id: string): Promise<void> {
  needOnline('xóa báo cáo');
  const { error } = await client().from('saved_reports').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export const fmtCell = (v: string | number | null | undefined, kind: ReportColumn['kind']): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (kind === 'text') return String(v);
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return kind === 'money' ? `${Math.round(n).toLocaleString('vi-VN')} đ` : n.toLocaleString('vi-VN', { maximumFractionDigits: kind === 'int' ? 0 : 2 });
};

/** Tổng các cột đánh dấu `sum` */
export function reportTotals(r: ReportResult): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of r.columns) if (c.sum) out[c.key] = r.rows.reduce((s, row) => s + Number(row[c.key] ?? 0), 0);
  return out;
}

/** CSV mở được bằng Excel: BOM UTF-8, số ghi nguyên (không dấu phân cách nghìn) */
export function buildReportCsv(r: ReportResult, orgName: string): string {
  const cell = (v: string | number | null | undefined) => {
    const t = v === null || v === undefined ? '' : String(v);
    return /[,"\n]/.test(t) ? '"' + t.split('"').join('""') + '"' : t;
  };
  const NL = String.fromCharCode(13, 10);
  const head = [`${r.title} - ${orgName}`, `Từ ${r.from} đến ${r.to}`, `Tính lúc ${new Date(r.generated_at).toLocaleString('vi-VN')}`];
  const lines = [...head.map(cell), r.columns.map((c) => cell(c.label)).join(',')];
  for (const row of r.rows) lines.push(r.columns.map((c) => cell(row[c.key])).join(','));
  const tot = reportTotals(r);
  if (Object.keys(tot).length > 0) lines.push(r.columns.map((c, i) => (i === 0 ? 'Tổng' : c.sum ? String(tot[c.key]) : '')).join(','));
  return String.fromCharCode(0xfeff) + lines.join(NL) + NL;
}
