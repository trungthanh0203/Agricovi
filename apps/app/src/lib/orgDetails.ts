import { supabase } from './supabase';

/** Thông tin bổ sung của cơ sở (D187, migration 0221): riêng tư, chủ ghi, chủ/quản lý đọc. */
export interface OrgDetails {
  rep_name: string; rep_position: string; phone: string; province: string; ward: string; address: string;
  tax_code: string; registration_no: string; started_year: string; main_products: string; certificates: string;
  total_area_m2: string; note: string;
}
export const EMPTY_DETAILS: OrgDetails = {
  rep_name: '', rep_position: '', phone: '', province: '', ward: '', address: '', tax_code: '', registration_no: '',
  started_year: '', main_products: '', certificates: '', total_area_m2: '', note: '',
};

/** Các ô nên có để coi là đủ thông tin cơ bản (HTX cần thêm chức danh và số đăng ký) */
export function requiredKeys(orgType: string): (keyof OrgDetails)[] {
  const base: (keyof OrgDetails)[] = ['rep_name', 'phone', 'province', 'address', 'main_products'];
  return orgType === 'cooperative' ? [...base, 'rep_position', 'registration_no'] : base;
}
export function missingCount(d: OrgDetails, orgType: string): number {
  return requiredKeys(orgType).filter((k) => !d[k].trim()).length;
}

function client() {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  return supabase;
}

export async function fetchOrgDetails(orgId: string): Promise<{ details: OrgDetails; version: number | null }> {
  const { data, error } = await client().from('org_details').select('*').eq('organization_id', orgId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { details: { ...EMPTY_DETAILS }, version: null };
  const row = data as Record<string, unknown>;
  const out = { ...EMPTY_DETAILS };
  for (const k of Object.keys(EMPTY_DETAILS) as (keyof OrgDetails)[]) out[k] = row[k] == null ? '' : String(row[k]);
  return { details: out, version: Number(row.version) };
}

export async function saveOrgDetails(orgId: string, d: OrgDetails, version: number | null): Promise<number> {
  if (!navigator.onLine) throw new Error('OFFLINE: Cần có mạng để lưu thông tin cơ sở. Hãy kết nối mạng rồi thử lại.');
  const { data, error } = await client().rpc('set_org_details', { p_org: orgId, p_data: d, p_version: version });
  if (error) throw new Error(error.message);
  return data as number;
}
