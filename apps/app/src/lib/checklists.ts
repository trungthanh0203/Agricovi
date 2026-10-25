import type { ChecklistResult, ChecklistSummary } from './checklistLogic';
import { requireOnline } from './serverWrite';
import { supabase } from './supabase';

/** Bảng kiểm nội bộ (D98, P1B). Cần mạng (như D24): đọc và ghi thẳng qua CSDL, không lưu trên máy. */

export interface ChecklistTemplate {
  id: string; name: string; source_note: string | null; pass_a_pct: number; pass_b_pct: number; verified_at: string | null;
}
export interface ChecklistItem { id: string; seq: number; item_text: string; level: 'A' | 'B'; method: string | null }
export interface ChecklistAudit {
  id: string; template_name: string; audit_date: string; auditor: string | null; pass_a_pct: number; pass_b_pct: number;
  status: 'draft' | 'final'; conclusion: ChecklistSummary | null; finalized_at: string | null; voided_at: string | null; void_reason: string | null;
}
export interface ChecklistAnswer { id: string; seq: number; item_text: string; level: 'A' | 'B'; method: string | null; result: ChecklistResult | null; evidence: string | null }

function client() {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  return supabase;
}
async function rpc<T>(fn: string, args: Record<string, unknown>, action: string): Promise<T> {
  requireOnline(action);
  const { data, error } = await client().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}
function rows<T>(r: { data: unknown; error: { message: string } | null }): T[] {
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? []) as T[];
}

const TEMPLATE_COLUMNS = 'id, name, source_note, pass_a_pct, pass_b_pct, verified_at';
export const SHARED_CODE = 'vietgap_pig';

/** Bản sao bộ bảng kiểm của cơ sở (null nếu chưa lấy về) */
export async function getOrgTemplate(orgId: string): Promise<ChecklistTemplate | null> {
  const r = await client().from('checklist_templates').select(TEMPLATE_COLUMNS).eq('organization_id', orgId).eq('source_code', SHARED_CODE).maybeSingle();
  if (r.error) throw new Error(r.error.message);
  return r.data as ChecklistTemplate | null;
}
export async function adoptTemplate(orgId: string): Promise<string> {
  return rpc<string>('ensure_checklist_template', { p_org: orgId, p_source_code: SHARED_CODE }, 'lấy bộ bảng kiểm');
}
export async function listItems(templateId: string): Promise<ChecklistItem[]> {
  return rows<ChecklistItem>(await client().from('checklist_items').select('id, seq, item_text, level, method').eq('template_id', templateId).order('seq'));
}
export async function updateTemplate(id: string, c: { pass_a_pct?: number; pass_b_pct?: number; verified?: boolean }): Promise<void> {
  requireOnline('sửa bộ bảng kiểm');
  const patch: Record<string, unknown> = {};
  if (c.pass_a_pct !== undefined) patch.pass_a_pct = c.pass_a_pct;
  if (c.pass_b_pct !== undefined) patch.pass_b_pct = c.pass_b_pct;
  if (c.verified !== undefined) patch.verified_at = c.verified ? new Date().toISOString() : null;
  const { error } = await client().from('checklist_templates').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}
export async function updateItem(id: string, c: { item_text?: string; level?: 'A' | 'B'; method?: string | null }): Promise<void> {
  requireOnline('sửa tiêu chí');
  const { error } = await client().from('checklist_items').update(c).eq('id', id);
  if (error) throw new Error(error.message);
}
export async function addItem(templateId: string, seq: number, text: string, level: 'A' | 'B'): Promise<void> {
  requireOnline('thêm tiêu chí');
  const { error } = await client().from('checklist_items').insert({ template_id: templateId, seq, item_text: text.trim(), level });
  if (error) throw new Error(error.message);
}
export async function deleteItem(id: string): Promise<void> {
  requireOnline('xóa tiêu chí');
  const { error } = await client().from('checklist_items').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

const AUDIT_COLUMNS = 'id, template_name, audit_date, auditor, pass_a_pct, pass_b_pct, status, conclusion, finalized_at, voided_at, void_reason';
export async function listAudits(orgId: string): Promise<ChecklistAudit[]> {
  return rows<ChecklistAudit>(await client().from('checklist_audits').select(AUDIT_COLUMNS).eq('organization_id', orgId).order('audit_date', { ascending: false }).limit(200));
}
export async function listAnswers(auditId: string): Promise<ChecklistAnswer[]> {
  return rows<ChecklistAnswer>(await client().from('checklist_answers').select('id, seq, item_text, level, method, result, evidence').eq('audit_id', auditId).order('seq'));
}
export async function startAudit(id: string, orgId: string, templateId: string, date: string, auditor: string): Promise<ChecklistAudit> {
  return rpc<ChecklistAudit>('start_checklist_audit', { p_id: id, p_org: orgId, p_template: templateId, p_date: date, p_auditor: auditor }, 'bắt đầu đánh giá');
}
export async function saveAnswer(answerId: string, result: ChecklistResult | null, evidence: string): Promise<void> {
  await rpc('save_checklist_answer', { p_answer: answerId, p_result: result, p_evidence: evidence }, 'lưu kết quả');
}
export async function finalizeAudit(id: string): Promise<ChecklistAudit> {
  return rpc<ChecklistAudit>('finalize_checklist_audit', { p_audit: id }, 'chốt đánh giá');
}
export async function voidAudit(id: string, reason: string): Promise<ChecklistAudit> {
  return rpc<ChecklistAudit>('void_checklist_audit', { p_audit: id, p_reason: reason }, 'hủy đánh giá');
}
