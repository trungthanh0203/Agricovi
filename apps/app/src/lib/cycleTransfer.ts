import { supabase } from './supabase';

function client() {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  return supabase;
}
async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().rpc(fn, args);
  if (error) throw error;
  return data as T;
}

/** Chuyển một chiều "vụ theo HTX" → "vụ riêng" của hộ (D156): hộ gửi yêu cầu, HTX duyệt. Cần mạng. */
export interface TransferRequest {
  id: string;
  cycle_id: string;
  cooperative_org_id: string;
  household_org_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  note: string | null;
  decision_reason: string | null;
  created_at: string;
  decided_at: string | null;
  production_cycles: { name: string | null; code: string | null } | null;
}

export const TRANSFER_STATUS_LABEL: Record<TransferRequest['status'], string> = {
  pending: 'Đang chờ HTX duyệt', approved: 'Đã chuyển thành vụ riêng', rejected: 'HTX từ chối', cancelled: 'Đã hủy yêu cầu',
};

/** Yêu cầu của một hộ (hộ xem của mình) hoặc của HTX (HTX xem của mọi hộ) */
export async function listTransferRequests(by: 'household' | 'cooperative', orgId: string): Promise<TransferRequest[]> {
  const { data, error } = await client().from('cycle_transfer_requests')
    .select('id, cycle_id, cooperative_org_id, household_org_id, status, note, decision_reason, created_at, decided_at, production_cycles(name, code)')
    .eq(by === 'household' ? 'household_org_id' : 'cooperative_org_id', orgId).order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []) as unknown as TransferRequest[];
}

export const requestCycleToOwn = (cycleId: string, note: string, id: string = crypto.randomUUID()) =>
  rpc<unknown>('request_cycle_to_own', { p_id: id, p_cycle: cycleId, p_note: note || null });
export const cancelTransferRequest = (requestId: string) => rpc<unknown>('cancel_cycle_transfer_request', { p_request: requestId });
export const decideCycleTransfer = (requestId: string, approve: boolean, reason: string) =>
  rpc<unknown>('decide_cycle_transfer', { p_request: requestId, p_approve: approve, p_reason: reason || null });
