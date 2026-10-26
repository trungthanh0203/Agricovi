import type { MemberRole } from '@agriconnect/shared';

/**
 * Kiểm tra quyền phía giao diện (chỉ để ẩn/hiện nút; máy chủ vẫn là nơi quyết định).
 * Một người có thể có nhiều vai trò; CHỦ bao gồm mọi vai trò (khớp has_org_role ở CSDL).
 */
export function hasRole(roles: readonly MemberRole[] | undefined, ...wanted: MemberRole[]): boolean {
  if (!roles || roles.length === 0) return false;
  return roles.includes('owner') || wanted.some((r) => roles.includes(r));
}

export const isOwner = (roles: readonly MemberRole[] | undefined) => !!roles?.includes('owner');

/** Chủ, quản lý (và quản lý HTX) tạo phân khu/vụ, sửa mọi nhật ký */
export const canManageProduction = (roles: readonly MemberRole[] | undefined) =>
  hasRole(roles, 'manager');

export const ROLE_LABEL: Record<string, string> = {
  owner: 'Chủ cơ sở',
  manager: 'Quản lý',
  worker: 'Nhân viên',
  // vai trò cũ (D83), chỉ còn để đọc bản ghi cũ
  inventory_finance: 'Kho & chi phí',
  cooperative_manager: 'Quản lý HTX',
  profile_editor: 'Biên tập hồ sơ',
};

/** "Quản lý, Kho & chi phí" - owner hiển thị kèm ghi chú đã bao gồm mọi vai trò */
export function roleSummary(roles: readonly MemberRole[] | undefined): string {
  if (!roles || roles.length === 0) return '—';
  if (roles.includes('owner')) return `${ROLE_LABEL.owner} (gồm mọi vai trò)`;
  return roles.map((r) => ROLE_LABEL[r] ?? r).join(', ');
}

/** Vai trò có thể gán, tùy loại cơ sở. Chủ cơ sở không gán được. */
export function assignableRoles(orgType: 'household' | 'cooperative'): MemberRole[] {
  void orgType;
  return ['manager', 'worker']; // chỉ 3 vai trò (D83); quyền thêm cấp riêng hoặc qua chức vụ
}

/**
 * "Công (Nhân viên sản xuất)": tên người làm và vai trò tại thời điểm ghi (bản chụp do máy chủ điền).
 * Chủ cơ sở chỉ hiện "Chủ cơ sở". Trả chuỗi rỗng nếu bản ghi cũ chưa có thông tin này.
 */
export function authorLabel(name?: string | null, roles?: readonly string[] | null): string {
  const r = roles && roles.length > 0 ? (roles.includes('owner') ? ROLE_LABEL.owner : roles.map((x) => ROLE_LABEL[x] ?? x).join(', ')) : '';
  if (name && r) return `${name} (${r})`;
  return name ?? (r ? `(${r})` : '');
}

const LABEL_KEY = 'agriconnect.roleLabels';
/** Ghi đè tên vai trò theo tên do quản trị nền tảng đặt (D82). Gọi lúc mở app (bản đã lưu) và mỗi lần tải cơ sở từ máy chủ. */
export function applyRoleLabels(labels: Record<string, string>): void {
  for (const [k, v] of Object.entries(labels)) if (v && v.trim()) ROLE_LABEL[k] = v.trim();
}
export function loadCachedRoleLabels(): void {
  try { const raw = localStorage.getItem(LABEL_KEY); if (raw) applyRoleLabels(JSON.parse(raw) as Record<string, string>); } catch { /* bỏ qua */ }
}
export function saveRoleLabels(labels: Record<string, string>): void {
  applyRoleLabels(labels);
  try { localStorage.setItem(LABEL_KEY, JSON.stringify(labels)); } catch { /* bỏ qua */ }
}
loadCachedRoleLabels();
