import { supabase } from './supabase';

/**
 * Hồ sơ thương mại của cơ sở (D55): soạn ở đây, chủ đồng ý công khai và gửi duyệt; sau khi kiểm duyệt viên duyệt thì website
 * chỉ đọc BẢN CHỤP công khai (public_*), không đọc dữ liệu vận hành. Mọi thao tác cần mạng.
 */
export type ProfileStatus = 'draft' | 'missing_info' | 'pending_consent' | 'pending_review' | 'published' | 'changes_requested' | 'hidden' | 'withdrawn';

export const PROFILE_STATUS_LABEL: Record<ProfileStatus, string> = {
  draft: 'Bản nháp', missing_info: 'Thiếu thông tin', pending_consent: 'Chờ đồng ý công khai', pending_review: 'Đang chờ duyệt',
  published: 'Đang công khai', changes_requested: 'Cần chỉnh sửa', hidden: 'Đã tạm ẩn', withdrawn: 'Đã rút',
};
export const PROFILE_STATUS_TONE: Record<ProfileStatus, string> = {
  draft: 'pill', missing_info: 'pill warn', pending_consent: 'pill warn', pending_review: 'pill info', published: 'pill ok', changes_requested: 'pill warn', hidden: 'pill', withdrawn: 'pill',
};

export interface BizProfile {
  id: string; organization_id: string; display_name: string; tagline: string | null; description: string | null;
  province: string | null; district: string | null; commune: string | null; location_precision: 'province' | 'district' | 'commune';
  contact_phone: string | null; contact_email: string | null; contact_zalo: string | null; website_url: string | null; facebook_url: string | null;
  established_year: number | null; total_area: number | null; area_unit: 'm2' | 'ha'; practices: string | null; capacity_note: string | null;
  contact_confirmed_at: string | null; status: ProfileStatus; slug: string | null;
}
export type ProfileForm = Omit<BizProfile, 'id' | 'organization_id' | 'contact_confirmed_at' | 'status' | 'slug'>;

export interface Listing {
  id: string; name: string; description: string | null; specification: string | null; unit: string | null; season: string | null;
  price_note: string | null; min_order: string | null; cycle_id: string | null; crop_type_id: string | null; include_in_publication: boolean;
}
export type ListingForm = Omit<Listing, 'id'>;

export interface ImageRow { id: string; listing_id: string | null; image: string | null; caption: string | null; is_public_allowed: boolean; sort_order: number }
export interface CertRow { id: string; license_id: string | null; name: string; issuer: string | null; status: string }
export interface Consent { id: string; scope: string[]; text_version: string; granted_at: string }
export interface SupplyRow { id: string; listing_id: string; status: SupplyStatus; expected_from: string | null; expected_to: string | null; capacity_note: string | null; status_updated_on: string }
export type SupplyStatus = 'producing' | 'expected' | 'available' | 'out_of_stock' | 'paused';

export const SUPPLY_LABEL: Record<SupplyStatus, string> = {
  producing: 'Đang sản xuất', expected: 'Dự kiến có hàng', available: 'Đang có hàng', out_of_stock: 'Hết hàng', paused: 'Tạm ngừng',
};
export const CERT_STATUS_LABEL: Record<string, string> = {
  self_declared: 'Tự khai báo (chưa xác minh)', document_received: 'Đã nhận tài liệu', document_checked: 'Đã kiểm tra tài liệu', verified: 'Đã xác minh', expired_or_unverifiable: 'Hết hạn / không xác minh được',
};
export const SCOPE_LABEL: Record<string, string> = {
  profile: 'Thông tin giới thiệu (tên, mô tả, địa bàn, năng lực, sản phẩm)', contact: 'Thông tin liên hệ (điện thoại, email, Zalo, liên kết)',
  images: 'Hình ảnh đã cho phép', certifications: 'Giấy phép, chứng chỉ đã chọn',
};
export const CONSENT_TEXT_VERSION = 'v1';

function client() {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  return supabase;
}
function needOnline(what: string) {
  if (!navigator.onLine) throw new Error(`OFFLINE: Cần có mạng để ${what}. Hãy kết nối mạng rồi thử lại.`);
}
async function ok<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}
const nul = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

const PROFILE_COLS = 'id, organization_id, display_name, tagline, description, province, district, commune, location_precision, contact_phone, contact_email, contact_zalo, website_url, facebook_url, established_year, total_area, area_unit, practices, capacity_note, contact_confirmed_at, status, slug';

export async function getProfile(orgId: string): Promise<BizProfile | null> {
  const row = await ok(client().from('business_profiles').select(PROFILE_COLS).eq('organization_id', orgId).maybeSingle());
  if (!row) return null;
  const r = row as unknown as BizProfile;
  return { ...r, total_area: r.total_area == null ? null : Number(r.total_area) };
}

export async function createProfile(orgId: string, name: string): Promise<void> {
  needOnline('tạo hồ sơ');
  await ok(client().from('business_profiles').insert({ organization_id: orgId, display_name: name.trim() }));
}

export async function saveProfile(id: string, f: Partial<ProfileForm>): Promise<void> {
  needOnline('lưu hồ sơ');
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) patch[k] = typeof v === 'string' ? nul(v) : v;
  if (f.display_name !== undefined) patch.display_name = f.display_name.trim();
  await ok(client().from('business_profiles').update(patch).eq('id', id));
}

export async function confirmContact(id: string, on: boolean): Promise<void> {
  needOnline('xác nhận liên hệ');
  await ok(client().from('business_profiles').update({ contact_confirmed_at: on ? new Date().toISOString() : null }).eq('id', id));
}

// ------------------------------------------------------------------ sản phẩm cung ứng
const LISTING_COLS = 'id, name, description, specification, unit, season, price_note, min_order, cycle_id, crop_type_id, include_in_publication';
export async function listListings(profileId: string): Promise<Listing[]> {
  return ((await ok(client().from('product_listings').select(LISTING_COLS).eq('business_profile_id', profileId).order('created_at'))) ?? []) as Listing[];
}
export async function saveListing(orgId: string, profileId: string, id: string | null, f: ListingForm): Promise<void> {
  needOnline('lưu sản phẩm');
  const row = { name: f.name.trim(), description: nul(f.description), specification: nul(f.specification), unit: nul(f.unit), season: nul(f.season),
    price_note: nul(f.price_note), min_order: nul(f.min_order), cycle_id: f.cycle_id || null, crop_type_id: f.crop_type_id || null, include_in_publication: f.include_in_publication };
  if (id) await ok(client().from('product_listings').update(row).eq('id', id));
  else await ok(client().from('product_listings').insert({ ...row, organization_id: orgId, business_profile_id: profileId }));
}
export async function deleteListing(id: string): Promise<void> {
  needOnline('xóa sản phẩm');
  await ok(client().from('product_listings').delete().eq('id', id));
}

export async function listSupply(profileId: string): Promise<Map<string, SupplyRow>> {
  const ids = (await listListings(profileId)).map((l) => l.id);
  if (ids.length === 0) return new Map();
  const rows = ((await ok(client().from('supply_offers').select('id, listing_id, status, expected_from, expected_to, capacity_note, status_updated_on')
    .in('listing_id', ids).order('created_at', { ascending: false }))) ?? []) as SupplyRow[];
  const m = new Map<string, SupplyRow>();
  for (const r of rows) if (!m.has(r.listing_id)) m.set(r.listing_id, r); // dòng mới nhất của từng sản phẩm
  return m;
}
export async function addSupply(orgId: string, listingId: string, s: { status: SupplyStatus; from: string; to: string; note: string }): Promise<void> {
  needOnline('cập nhật tình trạng cung ứng');
  await ok(client().from('supply_offers').insert({
    listing_id: listingId, organization_id: orgId, status: s.status, expected_from: s.from || null, expected_to: s.to || null,
    capacity_note: nul(s.note), confirmed_by_org: s.status === 'available',
  }));
}

// ------------------------------------------------------------------ hình ảnh
export async function listImages(profileId: string): Promise<ImageRow[]> {
  return ((await ok(client().from('product_images').select('id, listing_id, image, caption, is_public_allowed, sort_order').eq('business_profile_id', profileId)
    .order('sort_order').order('created_at'))) ?? []) as ImageRow[];
}
export async function addImage(orgId: string, profileId: string, listingId: string | null, image: string, allowed: boolean, order: number): Promise<void> {
  needOnline('thêm hình ảnh');
  await ok(client().from('product_images').insert({ organization_id: orgId, business_profile_id: profileId, listing_id: listingId, image, storage_path: 'inline', is_public_allowed: allowed, sort_order: order }));
}
export async function updateImage(id: string, patch: { caption?: string | null; is_public_allowed?: boolean }): Promise<void> {
  needOnline('sửa hình ảnh');
  await ok(client().from('product_images').update(patch).eq('id', id));
}
export async function deleteImage(id: string): Promise<void> {
  needOnline('xóa hình ảnh');
  await ok(client().from('product_images').delete().eq('id', id));
}

// ------------------------------------------------------------------ chứng chỉ (lấy từ Giấy phép, chứng chỉ của cơ sở)
export async function listCerts(profileId: string): Promise<CertRow[]> {
  return ((await ok(client().from('certification_records').select('id, license_id, name, issuer, status').eq('business_profile_id', profileId).is('listing_id', null))) ?? []) as CertRow[];
}
export async function setCertPublic(orgId: string, profileId: string, lic: { id: string; name: string; issuer: string | null }, on: boolean): Promise<void> {
  needOnline('đổi chứng chỉ công khai');
  if (on) await ok(client().from('certification_records').insert({ organization_id: orgId, business_profile_id: profileId, name: lic.name, issuer: lic.issuer, license_id: lic.id }));
  else await ok(client().from('certification_records').delete().eq('license_id', lic.id).eq('business_profile_id', profileId));
}

// ------------------------------------------------------------------ đồng ý công khai, gửi duyệt, xem trước
export async function latestConsent(profileId: string): Promise<Consent | null> {
  const rows = ((await ok(client().from('publication_consents').select('id, scope, text_version, granted_at').eq('business_profile_id', profileId)
    .is('revoked_at', null).order('granted_at', { ascending: false }).limit(1))) ?? []) as Consent[];
  return rows[0] ?? null;
}
export async function grantConsent(orgId: string, profileId: string, scope: string[]): Promise<void> {
  needOnline('xác nhận đồng ý công khai');
  await ok(client().from('publication_consents').insert({ organization_id: orgId, business_profile_id: profileId, scope, text_version: CONSENT_TEXT_VERSION }));
}
export async function submitForReview(profileId: string): Promise<void> {
  needOnline('gửi duyệt');
  await ok(client().rpc('submit_profile_for_review', { p_profile: profileId }));
}
export async function hideProfile(profileId: string, withdraw: boolean): Promise<void> {
  needOnline('tạm ẩn hồ sơ');
  await ok(client().rpc('hide_profile', { p_profile: profileId, p_withdraw: withdraw }));
}
export async function lastReviewNote(profileId: string): Promise<{ decision: string | null; note: string | null } | null> {
  const rows = ((await ok(client().from('publication_reviews').select('decision, note').eq('business_profile_id', profileId)
    .not('decision', 'is', null).order('submitted_at', { ascending: false }).limit(1))) ?? []) as { decision: string | null; note: string | null }[];
  return rows[0] ?? null;
}

export interface Preview {
  profile: Record<string, unknown> & {
    display_name: string; tagline?: string | null; description?: string | null; province?: string | null; district?: string | null; commune?: string | null;
    established_year?: number | null; total_area?: number | null; area_unit?: string; practices?: string | null; capacity_note?: string | null;
    contact?: { phone?: string; email?: string; zalo?: string; website?: string; facebook?: string };
    images?: { src: string; caption: string | null }[];
    certifications?: { name: string; issuer: string | null; status: string; number: string | null; expires: string | null }[];
  };
  products: { id: string; supply_status: SupplyStatus | null; supply_updated_on: string | null; snapshot: {
    name: string; description: string | null; specification: string | null; crop: string | null; unit: string | null; season: string | null;
    price_note: string | null; min_order: string | null; trace_code: string | null; images?: { src: string; caption: string | null }[];
  } }[];
}
export async function previewProfile(profileId: string, scope: string[]): Promise<Preview> {
  needOnline('xem trước');
  return (await ok(client().rpc('preview_profile', { p_profile: profileId, p_scope: scope }))) as Preview;
}

/** Danh sách thiếu sót trước khi gửi duyệt (khớp kiểm tra của máy chủ) */
export function missingItems(p: BizProfile, consent: Consent | null): string[] {
  const out: string[] = [];
  if (p.display_name.trim().length < 2) out.push('Tên hiển thị');
  if (!p.description || p.description.trim().length < 20) out.push('Mô tả giới thiệu (ít nhất 20 ký tự)');
  if (!p.province) out.push('Tỉnh/thành');
  if (!consent) out.push('Đồng ý công khai của chủ cơ sở');
  else if (consent.scope.includes('contact') && !p.contact_confirmed_at) out.push('Xác nhận thông tin liên hệ (đã chọn công khai liên hệ)');
  return out;
}
