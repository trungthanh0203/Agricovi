import type { MyOrg } from './orgs';
import { canPerm } from './permissions';
import { canManageProduction, hasRole } from './roles';

/**
 * Bố cục 6 tab (quyết định D28, D30): Trang chủ · Sản xuất · Kho · Khai báo · Tổ chức · Báo cáo · Hồ sơ,
 * mỗi tab có các mục con. Hiện/ẩn theo quyền chỉ là giao diện; máy chủ luôn kiểm tra lại.
 * Khai báo và Tổ chức tạm theo vai trò; sẽ chuyển sang quyền theo mục khi làm chức vụ (kế hoạch P3).
 */
export type TabId = 'home' | 'production' | 'stock' | 'declare' | 'org' | 'reports' | 'profile';

export const TAB_LABEL: Record<TabId, string> = {
  home: 'Trang chủ',
  production: 'Sản xuất',
  stock: 'Kho',
  declare: 'Khai báo',
  org: 'Tổ chức',
  reports: 'Báo cáo',
  profile: 'Hồ sơ',
};

export interface Section<Id extends string = string> {
  id: Id;
  label: string;
}

export type ProductionSection = 'cycles' | 'harvest';
export type StockSection = 'balance' | 'materials';
export type DeclareSection = 'areas' | 'crops' | 'worktypes' | 'templates';
export type OrgSection = 'info' | 'members' | 'teams' | 'coop';
export type ReportSection = 'expense' | 'sales' | 'summary';

export function productionSections(org: MyOrg | null): Section<ProductionSection>[] {
  if (!org) return [];
  return [
    { id: 'cycles' as const, label: 'Mùa vụ' },
    canPerm(org.perms, 'harvest') ? { id: 'harvest' as const, label: 'Thu hoạch' } : null,
  ].filter((x): x is Section<ProductionSection> => x !== null);
}

/** Tab Kho: tồn kho và danh mục vật tư (người có quyền xem Kho) */
export function stockSections(org: MyOrg | null): Section<StockSection>[] {
  if (!org || !canPerm(org.perms, 'inventory')) return [];
  return [
    { id: 'balance' as const, label: 'Tồn kho' },
    { id: 'materials' as const, label: 'Vật tư' },
  ];
}

export function declareSections(org: MyOrg | null): Section<DeclareSection>[] {
  if (!org) return [];
  return [
    canManageProduction(org.roles) ? { id: 'areas' as const, label: 'Trang trại' } : null,
    canManageProduction(org.roles) ? { id: 'crops' as const, label: 'Sản phẩm' } : null,
    canManageProduction(org.roles) ? { id: 'worktypes' as const, label: 'Danh mục việc' } : null,
    canManageProduction(org.roles) ? { id: 'templates' as const, label: 'Quy trình mẫu' } : null,
  ].filter((x): x is Section<DeclareSection> => x !== null);
}

export function orgSections(org: MyOrg | null): Section<OrgSection>[] {
  if (!org) return [];
  const manager = hasRole(org.roles, 'manager');
  return [
    manager ? { id: 'info' as const, label: 'Cơ sở và gói' } : null,
    manager ? { id: 'members' as const, label: 'Nhân sự' } : null,
    manager ? { id: 'teams' as const, label: 'Tổ lao động' } : null,
    hasRole(org.roles, 'cooperative_manager', 'manager') ? { id: 'coop' as const, label: org.type === 'cooperative' ? 'Hộ thành viên' : 'Hợp tác xã' } : null,
  ].filter((x): x is Section<OrgSection> => x !== null);
}

export function reportSections(org: MyOrg | null): Section<ReportSection>[] {
  if (!org) return [];
  return [
    canPerm(org.perms, 'expenses') ? { id: 'expense' as const, label: 'Chi phí' } : null,
    canPerm(org.perms, 'sales') ? { id: 'sales' as const, label: 'Doanh thu' } : null,
    canPerm(org.perms, 'summary') ? { id: 'summary' as const, label: 'Tổng kết vụ' } : null,
  ].filter((x): x is Section<ReportSection> => x !== null);
}

/** Các tab được hiện với người đang đăng nhập ở cơ sở đang chọn */
export function visibleTabs(org: MyOrg | null): TabId[] {
  const tabs: TabId[] = ['home', 'production'];
  if (stockSections(org).length > 0) tabs.push('stock');
  if (declareSections(org).length > 0) tabs.push('declare');
  if (orgSections(org).length > 0) tabs.push('org');
  if (reportSections(org).length > 0) tabs.push('reports');
  tabs.push('profile');
  return tabs;
}
