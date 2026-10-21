import { supabase } from './supabase';

/** Giấy phép, chứng chỉ của cơ sở (D50). Mọi thành viên xem; chủ/quản lý thêm, sửa, xóa. Cần mạng. */
export interface LicenseRow {
  id: string;
  organization_id: string;
  name: string;
  issuer: string | null;
  number: string | null;
  issued_date: string | null;
  expires_date: string | null;
  image: string | null;
  note: string | null;
}
export type LicenseInput = Omit<LicenseRow, 'id' | 'organization_id'>;

function client() {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  return supabase;
}
function needOnline(what: string) {
  if (!navigator.onLine) throw new Error(`OFFLINE: Cần có mạng để ${what}. Hãy kết nối mạng rồi thử lại.`);
}

const COLUMNS = 'id, organization_id, name, issuer, number, issued_date, expires_date, image, note';

export async function listLicenses(orgId: string): Promise<LicenseRow[]> {
  const { data, error } = await client().from('org_licenses').select(COLUMNS).eq('organization_id', orgId).order('expires_date', { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as LicenseRow[];
}

const clean = (f: LicenseInput) => ({
  name: f.name.trim(), issuer: f.issuer?.trim() || null, number: f.number?.trim() || null,
  issued_date: f.issued_date || null, expires_date: f.expires_date || null, image: f.image || null, note: f.note?.trim() || null,
});

export async function saveLicense(orgId: string, id: string | null, f: LicenseInput): Promise<void> {
  needOnline('lưu giấy phép');
  const row = clean(f);
  const { error } = id
    ? await client().from('org_licenses').update(row).eq('id', id)
    : await client().from('org_licenses').insert({ ...row, organization_id: orgId });
  if (error) throw new Error(error.message);
}

export async function deleteLicense(id: string): Promise<void> {
  needOnline('xóa giấy phép');
  const { error } = await client().from('org_licenses').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Số ngày còn lại tới hạn (âm = đã hết hạn); null nếu không có hạn */
export function daysLeft(expires: string | null, today = new Date()): number | null {
  if (!expires) return null;
  const e = new Date(`${expires}T00:00:00`);
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((e.getTime() - t.getTime()) / 86_400_000);
}
