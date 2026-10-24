import type { MyOrg } from './orgs';
import { canPerm } from './permissions';
import { REPORT_TYPES } from './reports';
import { canManageProduction, hasRole } from './roles';

/**
 * Bố cục 6 tab (quyết định D28, D30): Trang chủ · Tổ chức · Khai báo · Sản xuất · Báo cáo · Hồ sơ,
 * mỗi tab có các mục con. Hiện/ẩn theo quyền chỉ là giao diện; máy chủ luôn kiểm tra lại.
 * Khai báo và Tổ chức tạm theo vai trò; sẽ chuyển sang quyền theo mục khi làm chức vụ (kế hoạch P3).
 */
export type TabId = 'home' | 'production' | 'declare' | 'org' | 'reports' | 'guide' | 'profile';

export const TAB_LABEL: Record<TabId, string> = {
  home: 'Trang chủ',
  production: 'Sản xuất',
  declare: 'Khai báo',
  org: 'Tổ chức',
  reports: 'Báo cáo',
  guide: 'Hướng dẫn sử dụng',
  profile: 'Tài khoản',
};

export interface Section<Id extends string = string> {
  id: Id;
  label: string;
}

export type ProductionSection = 'cycles' | 'harvest' | 'stock' | 'attendance' | 'logs';
export type DeclareSection = 'areas' | 'crops' | 'worktypes' | 'templates' | 'materials' | 'places' | 'partners' | 'customers';
export type OrgSection = 'members' | 'positions' | 'teams' | 'coop';
export type ReportSection = 'expense' | 'payables' | 'sales' | 'summary' | 'weekly' | 'payroll' | 'custom' | 'website' | 'commerce';

export function productionSections(org: MyOrg | null): Section<ProductionSection>[] {
  if (!org) return [];
  return [
    { id: 'cycles' as const, label: 'Mùa vụ' },
    hasRole(org.roles, 'manager', 'worker') ? { id: 'attendance' as const, label: 'Chấm công' } : null,
    canPerm(org.perms, 'harvest') ? { id: 'harvest' as const, label: 'Thu hoạch' } : null,
    canPerm(org.perms, 'inventory') ? { id: 'stock' as const, label: 'Kho' } : null,
    { id: 'logs' as const, label: 'Nhật ký việc' }, // luôn để cuối
  ].filter((x): x is Section<ProductionSection> => x !== null);
}

export function declareSections(org: MyOrg | null): Section<DeclareSection>[] {
  if (!org) return [];
  return [
    canPerm(org.perms, 'declare') ? { id: 'areas' as const, label: 'Trang trại' } : null,
    canPerm(org.perms, 'declare') ? { id: 'crops' as const, label: 'Sản phẩm' } : null,
    canPerm(org.perms, 'inventory') ? { id: 'places' as const, label: 'Kho và đơn vị' } : null,
    canPerm(org.perms, 'declare') ? { id: 'templates' as const, label: 'Quy trình mẫu' } : null,
    canPerm(org.perms, 'declare') ? { id: 'worktypes' as const, label: 'Đầu việc' } : null,
    canPerm(org.perms, 'inventory') ? { id: 'materials' as const, label: 'Vật tư' } : null,
    canPerm(org.perms, 'expenses') ? { id: 'partners' as const, label: 'Nhà cung ứng' } : null,
    canPerm(org.perms, 'sales') ? { id: 'customers' as const, label: 'Khách hàng' } : null,
  ].filter((x): x is Section<DeclareSection> => x !== null);
}

export function orgSections(org: MyOrg | null): Section<OrgSection>[] {
  if (!org) return [];
  const manager = hasRole(org.roles, 'manager');
  return [
    manager ? { id: 'teams' as const, label: 'Phòng / Tổ' } : null,
    hasRole(org.roles, 'owner') ? { id: 'positions' as const, label: 'Chức vụ' } : null,
    manager ? { id: 'members' as const, label: 'Nhân sự' } : null,
    canPerm(org.perms, 'coop') ? { id: 'coop' as const, label: org.type === 'cooperative' ? 'Hộ thành viên' : 'Hợp tác xã' } : null,
  ].filter((x): x is Section<OrgSection> => x !== null);
}

export function reportSections(org: MyOrg | null): Section<ReportSection>[] {
  if (!org) return [];
  return [
    canPerm(org.perms, 'expenses') ? { id: 'expense' as const, label: 'Chi phí' } : null,
    canPerm(org.perms, 'expenses') || canPerm(org.perms, 'sales') ? { id: 'payables' as const, label: 'Công nợ' } : null,
    canPerm(org.perms, 'payroll') ? { id: 'payroll' as const, label: 'Tiền công' } : null,
    canPerm(org.perms, 'sales') ? { id: 'sales' as const, label: 'Doanh thu' } : null,
    canPerm(org.perms, 'summary') ? { id: 'summary' as const, label: 'Tổng kết vụ' } : null,
    hasRole(org.roles, 'manager') ? { id: 'weekly' as const, label: 'Báo cáo tuần' } : null,
    REPORT_TYPES.some((t) => t.allowed(org.perms, org.roles)) ? { id: 'custom' as const, label: 'Theo nhu cầu' } : null,
    canPerm(org.perms, 'website') ? { id: 'website' as const, label: 'Đơn khách từ website' } : null,
    canPerm(org.perms, 'website') ? { id: 'commerce' as const, label: 'Hồ sơ website' } : null, // luôn để cuối
  ].filter((x): x is Section<ReportSection> => x !== null);
}

/** Các tab được hiện với người đang đăng nhập ở cơ sở đang chọn */
export function visibleTabs(org: MyOrg | null): TabId[] {
  // Thứ tự: Trang chủ · Tổ chức · Khai báo · Sản xuất · Báo cáo · Tài khoản
  const tabs: TabId[] = ['home'];
  if (orgSections(org).length > 0) tabs.push('org');
  if (declareSections(org).length > 0) tabs.push('declare');
  tabs.push('guide', 'production'); // Hướng dẫn nằm trong menu ☰, ngay sau Khai báo
  if (reportSections(org).length > 0) tabs.push('reports');
  tabs.push('profile');
  return tabs;
}
