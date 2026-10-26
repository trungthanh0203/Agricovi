import { requireOnline } from './serverWrite';
import { supabase } from './supabase';
import type { ModelId } from './models';

/** Đặt mô hình quản lý của MỘT vụ (chủ hoặc quản lý; cần mạng). model/vietgap null = theo cơ sở. */
export async function setCycleModel(cycleId: string, model: ModelId | null, vietgap: boolean | null): Promise<void> {
  requireOnline('đổi mô hình quản lý của vụ');
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const { error } = await supabase.rpc('set_cycle_model', { p_cycle: cycleId, p_model: model, p_vietgap: vietgap });
  if (error) throw new Error(error.message);
}

/** Đặt mô hình mặc định của cơ sở cho các vụ chưa chọn riêng (chỉ chủ; cần mạng) */
export async function setOrgModel(orgId: string, model: ModelId | null, vietgap: boolean): Promise<void> {
  requireOnline('đổi mô hình quản lý mặc định');
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const { error } = await supabase.rpc('set_org_model', { p_org: orgId, p_model: model, p_vietgap: vietgap });
  if (error) throw new Error(error.message);
}
