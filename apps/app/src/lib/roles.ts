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

/** Chủ, quản lý (và quản lý HTX) tạo khu trồng/vụ, sửa mọi nhật ký */
export const canManageProduction = (roles: readonly MemberRole[] | undefined) =>
  hasRole(roles, 'manager', 'cooperative_manager');

export const ROLE_LABEL: Record<string, string> = {
  owner: 'Chủ cơ sở',
  manager: 'Quản lý',
  worker: 'Nhân viên sản xuất',
  inventory_finance: 'Kho & chi phí',
  cooperative_manager: 'Quản lý HTX',
  profile_editor: 'Biên tập hồ sơ',
};

/** "Quản lý, Kho & chi phí" - owner hiển thị kèm ghi chú đã bao gồm mọi vai trò */
export function roleSummary(roles: readonly MemberRole[] | undefined): string {
  if (!roles || roles.length === 0) return '—';
  if (roles.includes('owner')) return 'Chủ cơ sở (gồm mọi vai trò)';
  return roles.map((r) => ROLE_LABEL[r] ?? r).join(', ');
}

/** Vai trò có thể gán, tùy loại cơ sở. Chủ cơ sở không gán được. */
export function assignableRoles(orgType: 'household' | 'cooperative'): MemberRole[] {
  const base: MemberRole[] = ['manager', 'worker', 'inventory_finance', 'profile_editor'];
  return orgType === 'cooperative' ? ['cooperative_manager', ...base] : base;
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
