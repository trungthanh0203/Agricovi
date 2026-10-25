import { requireOnline } from './serverWrite';
import { supabase } from './supabase';

/** Đổi chế độ hiển thị của cơ sở (chỉ chủ; cần mạng). Chỉ là cách hiển thị, không đổi quyền hay dữ liệu. */
export async function setOrgUiMode(orgId: string, mode: 'simple' | 'full'): Promise<void> {
  requireOnline('đổi chế độ hiển thị');
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const { error } = await supabase.rpc('set_org_ui_mode', { p_org: orgId, p_mode: mode });
  if (error) throw new Error(error.message);
}
