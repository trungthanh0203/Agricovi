import { supabase } from './supabase';
import { t } from '@lingui/core/macro';

/**
 * Hồ sơ nhân sự gọn và hợp đồng lao động (D188, migration 0222). Chỉ LƯU và NHẮC hạn; không soạn hợp đồng, không lưu số CCCD/bảo hiểm.
 * Chỉ làm khi có mạng (chức năng quản lý, D24). Quyền theo mục Tiền công.
 */
export type EmploymentType = 'regular' | 'seasonal';
export const EMPLOYMENT_LABEL: Record<EmploymentType, string> = { get regular() { return t`Thường xuyên`; }, get seasonal() { return t`Thời vụ`; } };
export type ContractKind = 'probation' | 'fixed_term' | 'indefinite' | 'seasonal' | 'service';
export const CONTRACT_KIND_LABEL: Record<ContractKind, string> = {
  get probation() { return t`Thử việc`; }, get fixed_term() { return t`Có thời hạn`; }, get indefinite() { return t`Không thời hạn`; }, get seasonal() { return t`Thời vụ`; }, get service() { return t`Khoán việc, dịch vụ`; },
};

export interface WorkerHr {
  start_date: string; end_date: string; position: string; employment_type: string; emergency_name: string; emergency_phone: string; note: string;
}
export const EMPTY_HR: WorkerHr = { start_date: '', end_date: '', position: '', employment_type: '', emergency_name: '', emergency_phone: '', note: '' };

export interface WorkerContract {
  id: string; organization_id: string; worker_id: string; kind: ContractKind; start_date: string; end_date: string | null;
  pay_note: string | null; file: string | null; note: string | null; status: 'active' | 'cancelled'; version: number;
}
export interface ContractInput { id: string; kind: ContractKind; start: string; end: string; payNote: string; file: string; note: string }

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error(t`Supabase chưa được cấu hình`);
  if (!navigator.onLine) throw new Error(t`OFFLINE: Cần có mạng để thực hiện. Hãy kết nối mạng rồi thử lại.`);
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export async function fetchWorkerHr(workerId: string): Promise<{ hr: WorkerHr; version: number | null }> {
  if (!supabase) return { hr: { ...EMPTY_HR }, version: null };
  const { data, error } = await supabase.from('worker_hr').select('*').eq('worker_id', workerId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { hr: { ...EMPTY_HR }, version: null };
  const row = data as Record<string, unknown>;
  const out = { ...EMPTY_HR };
  for (const k of Object.keys(EMPTY_HR) as (keyof WorkerHr)[]) out[k] = row[k] == null ? '' : String(row[k]);
  return { hr: out, version: Number(row.version) };
}
export const saveWorkerHr = (workerId: string, hr: WorkerHr, version: number | null) => rpc<number>('set_worker_hr', { p_worker: workerId, p_data: hr, p_version: version });

const COLS = 'id,organization_id,worker_id,kind,start_date,end_date,pay_note,file,note,status,version';
export async function fetchContracts(workerId: string): Promise<WorkerContract[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('worker_contracts').select(COLS).eq('worker_id', workerId).order('start_date', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as WorkerContract[];
}
export const createContract = (workerId: string, i: ContractInput) => rpc<WorkerContract>('create_worker_contract', {
  p_id: i.id, p_worker: workerId, p_kind: i.kind, p_start: i.start, p_end: i.end || null, p_pay_note: i.payNote, p_file: i.file || null, p_note: i.note,
});
export const updateContract = (version: number, i: ContractInput) => rpc<WorkerContract>('update_worker_contract', {
  p_id: i.id, p_version: version, p_kind: i.kind, p_start: i.start, p_end: i.end || null, p_pay_note: i.payNote, p_file: i.file || null, p_note: i.note,
});
export const cancelContract = (id: string, version: number) => rpc<WorkerContract>('cancel_worker_contract', { p_id: id, p_version: version });

/** Hợp đồng sắp hết hạn trong `soonDays` ngày hoặc đã hết hạn (chỉ hợp đồng còn hiệu lực trong sổ); dùng cho nhắc ở Trang chủ */
export interface ExpiringContract { id: string; worker_id: string; full_name: string; kind: ContractKind; end_date: string }
export async function fetchExpiringContracts(orgId: string, today: string, soonDays = 30): Promise<ExpiringContract[]> {
  if (!supabase) return [];
  const limit = new Date(Date.parse(`${today}T00:00:00Z`) + soonDays * 86400000).toISOString().slice(0, 10);
  const { data, error } = await supabase.from('worker_contracts')
    .select('id,worker_id,kind,end_date,worker_profiles!inner(full_name,status)')
    .eq('organization_id', orgId).eq('status', 'active').not('end_date', 'is', null).lte('end_date', limit).order('end_date');
  if (error) throw new Error(error.message);
  type Row = { id: string; worker_id: string; kind: ContractKind; end_date: string; worker_profiles: { full_name: string; status: string } | { full_name: string; status: string }[] };
  return ((data ?? []) as unknown as Row[])
    .map((r) => ({ r, w: Array.isArray(r.worker_profiles) ? r.worker_profiles[0] : r.worker_profiles }))
    .filter((x) => x.w && x.w.status === 'active')
    .map(({ r, w }) => ({ id: r.id, worker_id: r.worker_id, full_name: w!.full_name, kind: r.kind, end_date: r.end_date }));
}

/** 'expired' đã hết hạn; 'soon' còn ≤ 30 ngày; 'ok' còn hạn hoặc không thời hạn */
export function contractState(end: string | null, today: string): 'expired' | 'soon' | 'ok' {
  if (!end) return 'ok';
  if (end < today) return 'expired';
  const days = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  return days <= 30 ? 'soon' : 'ok';
}
