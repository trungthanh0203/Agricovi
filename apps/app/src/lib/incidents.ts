import { db, type IncidentActionRow, type IncidentRow, type WithdrawalRow } from './db';
import { requireOnline } from './serverWrite';
import { supabase } from './supabase';

/**
 * Sự cố và việc khắc phục của vụ (D95). Cần mạng (như D24): ghi qua hàm máy chủ có kiểm quyền và phiên bản,
 * xong thì cập nhật bản lưu trên máy để vẫn xem được khi mất mạng.
 */

const INCIDENT_COLUMNS =
  'id, cycle_id, organization_id, kind, incident_date, stage_id, severity, description, loss_quantity, loss_amount, image, status, closed_at, close_note, voided_at, void_reason, version, created_by, author_name, created_at';
const ACTION_COLUMNS = 'id, incident_id, cycle_id, organization_id, content, assignee_id, assignee_name, due_date, done, done_at, created_by';

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const fixIncident = (r: Record<string, unknown>) => ({ ...r, loss_quantity: num(r.loss_quantity), loss_amount: num(r.loss_amount) }) as unknown as IncidentRow;

/** Tải sự cố và việc khắc phục về máy. Bảng chưa có (CSDL chưa cập nhật) thì bỏ qua, không làm hỏng đồng bộ chung. */
export async function syncIncidentsDown(): Promise<void> {
  if (!supabase || !navigator.onLine) return;
  const [inc, act] = await Promise.all([
    supabase.from('cycle_incidents').select(INCIDENT_COLUMNS).order('incident_date', { ascending: false }).limit(1000),
    supabase.from('incident_actions').select(ACTION_COLUMNS).limit(3000),
  ]);
  if (!inc.error) { await db.incidents.clear(); await db.incidents.bulkPut(((inc.data ?? []) as Record<string, unknown>[]).map(fixIncident)); }
  if (!act.error) { await db.incidentActions.clear(); await db.incidentActions.bulkPut((act.data ?? []) as IncidentActionRow[]); }
}

/** Tải thời gian cách ly của các vụ (D96); chưa có bảng thì bỏ qua */
export async function syncWithdrawalsDown(): Promise<void> {
  if (!supabase || !navigator.onLine) return;
  const { data, error } = await supabase.from('cycle_withdrawal').select('cycle_id, safe_date, items');
  if (error) return;
  await db.withdrawals.clear();
  await db.withdrawals.bulkPut((data ?? []) as WithdrawalRow[]);
}

async function call<T>(fn: string, args: Record<string, unknown>, what: string): Promise<T> {
  requireOnline(what);
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    // người khác sửa trước: tải lại bản mới rồi báo (không ghi đè âm thầm)
    if (/CONFLICT/.test(error.message)) await syncIncidentsDown().catch(() => undefined);
    throw new Error(error.message);
  }
  return data as T;
}

export interface IncidentInput {
  kind: IncidentRow['kind'];
  date: string;
  stageId: string | null;
  severity: IncidentRow['severity'];
  description: string;
  lossQty: number | null;
  lossAmount: number | null;
  image: string;
}

export async function reportIncident(id: string, cycleId: string, v: IncidentInput): Promise<void> {
  const r = await call<Record<string, unknown>>('report_incident', {
    p_id: id, p_cycle: cycleId, p_kind: v.kind, p_date: v.date, p_stage: v.stageId, p_severity: v.severity, p_desc: v.description,
    p_loss_qty: v.lossQty, p_loss_amount: v.lossAmount, p_image: v.image || null,
  }, 'báo sự cố');
  await db.incidents.put(fixIncident(r));
}

export async function updateIncident(i: IncidentRow, v: IncidentInput): Promise<void> {
  const r = await call<Record<string, unknown>>('update_incident', {
    p_id: i.id, p_expected_version: i.version,
    p_changes: {
      kind: v.kind, incident_date: v.date, stage_id: v.stageId ?? '', severity: v.severity, description: v.description,
      loss_quantity: v.lossQty === null ? '' : String(v.lossQty), loss_amount: v.lossAmount === null ? '' : String(v.lossAmount), image: v.image,
    },
  }, 'sửa sự cố');
  await db.incidents.put(fixIncident(r));
}

const putIncident = async (r: Record<string, unknown>) => { await db.incidents.put(fixIncident(r)); };

export async function closeIncident(id: string, note: string): Promise<void> {
  await putIncident(await call('close_incident', { p_id: id, p_note: note || null }, 'đóng sự cố'));
}
export async function reopenIncident(id: string): Promise<void> {
  await putIncident(await call('reopen_incident', { p_id: id }, 'mở lại sự cố'));
}
export async function voidIncident(id: string, reason: string): Promise<void> {
  await putIncident(await call('void_incident', { p_id: id, p_reason: reason }, 'hủy sự cố'));
}

export async function addIncidentAction(incidentId: string, content: string, assignee: string | null, due: string | null): Promise<void> {
  const r = await call<IncidentActionRow>('add_incident_action', {
    p_id: crypto.randomUUID(), p_incident: incidentId, p_content: content, p_assignee: assignee, p_due: due || null,
  }, 'giao việc khắc phục');
  await db.incidentActions.put(r);
}
export async function setIncidentActionDone(id: string, done: boolean): Promise<void> {
  await db.incidentActions.put(await call<IncidentActionRow>('set_incident_action_done', { p_action: id, p_done: done }, 'đánh dấu việc'));
}
export async function deleteIncidentAction(id: string): Promise<void> {
  await call('delete_incident_action', { p_action: id }, 'xóa việc khắc phục');
  await db.incidentActions.delete(id);
}
