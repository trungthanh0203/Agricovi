import { db, type MilestoneRow } from './db';
import { requireOnline } from './serverWrite';
import { supabase } from './supabase';

/**
 * Mốc nhắc việc an toàn (P4 gọn, D100). Xem được cả khi mất mạng (bản lưu trên máy); thêm/xóa/đánh dấu "đã làm" cần mạng (D24).
 * Ngày đến hạn không lưu mà tính từ ngày của vụ: xem milestoneLogic.ts.
 */
const COLUMNS = 'id, cycle_id, organization_id, title, anchor, offset_days, note, done_at, done_by, done_name';

/** Tải về máy; bảng chưa có (CSDL chưa cập nhật) thì bỏ qua, không làm hỏng đồng bộ chung */
export async function syncMilestonesDown(): Promise<void> {
  if (!supabase || !navigator.onLine) return;
  const { data, error } = await supabase.from('cycle_milestones').select(COLUMNS).limit(5000);
  if (error) return;
  await db.transaction('rw', db.milestones, async () => {
    await db.milestones.clear(); // mốc đã xóa ở nơi khác thì bỏ khỏi máy
    await db.milestones.bulkPut((data ?? []) as MilestoneRow[]);
  });
}

function client() {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  return supabase;
}

export async function setMilestoneDone(id: string, done: boolean): Promise<void> {
  requireOnline('đánh dấu mốc an toàn');
  const { data, error } = await client().rpc('set_milestone_done', { p_id: id, p_done: done });
  if (error) throw new Error(error.message);
  await db.milestones.put(data as MilestoneRow);
}

export interface MilestoneInput { title: string; anchor: 'start' | 'end'; offset: number; note: string }

export async function addCycleMilestone(cycleId: string, m: MilestoneInput): Promise<void> {
  requireOnline('thêm mốc an toàn');
  const { data, error } = await client().rpc('add_cycle_milestone', { p_cycle: cycleId, p_title: m.title, p_anchor: m.anchor, p_offset: m.offset, p_note: m.note || null });
  if (error) throw new Error(error.message);
  await db.milestones.put(data as MilestoneRow);
}

export async function deleteCycleMilestone(id: string): Promise<void> {
  requireOnline('xóa mốc an toàn');
  const { error } = await client().rpc('delete_cycle_milestone', { p_id: id });
  if (error) throw new Error(error.message);
  await db.milestones.delete(id);
}

// --- mốc của quy trình mẫu (mẫu thuộc cơ sở; người được khai báo sửa) ---
export interface TemplateMilestone { id: string; title: string; anchor: 'start' | 'end'; offset_days: number; note: string | null }

export async function listTemplateMilestones(templateId: string): Promise<TemplateMilestone[]> {
  const { data, error } = await client().from('template_milestones').select('id, title, anchor, offset_days, note').eq('template_id', templateId).order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []) as TemplateMilestone[];
}
export async function addTemplateMilestone(templateId: string, m: MilestoneInput): Promise<void> {
  requireOnline('thêm mốc an toàn');
  const { error } = await client().from('template_milestones').insert({ template_id: templateId, title: m.title.trim(), anchor: m.anchor, offset_days: m.offset, note: m.note.trim() || null });
  if (error) throw new Error(error.message);
}
export async function deleteTemplateMilestone(id: string): Promise<void> {
  requireOnline('xóa mốc an toàn');
  const { error } = await client().from('template_milestones').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Gợi ý mốc theo loại sản phẩm, để chủ bấm thêm nhanh vào quy trình (số ngày lấy từ tài liệu quy trình dưa lưới, cần đối chiếu).
 * Vật nuôi: lịch vaccine/tẩy giun do thú y của trại chốt nên KHÔNG có gợi ý cứng; ngưng thuốc trước xuất chuồng đã có cơ chế cách ly.
 */
export const MILESTONE_SUGGESTIONS: Record<'crop' | 'livestock', (MilestoneInput)[]> = {
  crop: [
    { title: 'Ngưng bón phân', anchor: 'end', offset: 7, note: 'Theo quy trình dưa lưới: ngưng phân 7 ngày trước thu' },
    { title: 'Ngưng tưới', anchor: 'end', offset: 5, note: 'Theo quy trình dưa lưới: ngưng tưới 5 ngày trước thu' },
  ],
  livestock: [],
};
