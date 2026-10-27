import { requireOnline } from './serverWrite';
import { supabase } from './supabase';
import { db } from './db';
import type { ModelId } from './models';

/** Đặt mô hình quản lý của MỘT vụ (chủ hoặc quản lý; cần mạng). null = theo mô hình mặc định của cơ sở. */
export async function setCycleModel(cycleId: string, model: ModelId | null, options?: string[]): Promise<void> {
  requireOnline('đổi mô hình quản lý của vụ');
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const { error } = await supabase.rpc('set_cycle_model', { p_cycle: cycleId, p_model: model });
  if (error) throw new Error(error.message);
  if (options) {
    const r = await supabase.rpc('set_cycle_options', { p_cycle: cycleId, p_options: options });
    if (r.error) throw new Error(r.error.message);
  }
  await db.cycles.update(cycleId, { mgmt_model: model, ...(options ? { mgmt_options: options } : {}) }); // cập nhật bản trên máy để menu đổi ngay
}

/** Đặt mô hình mặc định của cơ sở cho các vụ chưa chọn riêng (chỉ chủ; cần mạng) */
export async function setOrgModel(orgId: string, model: ModelId | null): Promise<void> {
  requireOnline('đổi mô hình quản lý mặc định');
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const { error } = await supabase.rpc('set_org_model', { p_org: orgId, p_model: model });
  if (error) throw new Error(error.message);
}
