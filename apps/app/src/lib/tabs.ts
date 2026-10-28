import type { MyOrg } from './orgs';
import { canPerm } from './permissions';
import { REPORT_TYPES } from './reports';
import { canManageProduction, hasRole } from './roles';
import { featureShown, SECTION_FEATURE } from './models';

/**
 * Bố cục 6 tab (quyết định D28, D30): Trang chủ · Tổ chức · Khai báo · Sản xuất · Báo cáo · Hồ sơ,
 * mỗi tab có các mục con. Hiện/ẩn theo quyền chỉ là giao diện; máy chủ luôn kiểm tra lại.
 * Khai báo và Tổ chức tạm theo vai trò; sẽ chuyển sang quyền theo mục khi làm chức vụ (kế hoạch P3).
 */
export type TabId = 'home' | 'production' | 'declare' | 'config' | 'reports' | 'guide' | 'profile';

export const TAB_LABEL: Record<TabId, string> = {
  home: 'Trang chủ',
  production: 'Sản xuất',
  declare: 'Khai báo',
  config: 'Cấu hình',
  reports: 'Báo cáo',
  guide: 'Hướng dẫn sử dụng',
  profile: 'Tài khoản',
};

export interface Section<Id extends string = string> {
  id: Id;
  label: string;
}

export type ProductionSection = 'cycles' | 'harvest' | 'stock' | 'expense' | 'attendance' | 'logs';
export type DeclareSection = 'areas' | 'crops' | 'worktypes' | 'templates' | 'materials' | 'places' | 'partners' | 'customers' | 'positions' | 'teams' | 'members' | 'coop' | 'licenses';
export type ReportSection = 'payables' | 'sales' | 'summary' | 'weekly' | 'paybook' | 'custom' | 'website' | 'commerce' | 'checklist' | 'logbook';

/**
 * Chế độ đơn giản (D100): các mục NÂNG CAO bị ẩn khỏi menu cho hộ nhỏ. Chỉ là cách hiển thị: quyền và dữ liệu không đổi, chủ bật lại chế độ đầy đủ bất cứ lúc nào
 * (Tài khoản → Chế độ hiển thị). Quy trình mẫu và Sản phẩm vẫn hiện vì cần để tạo vụ.
 */
export const SIMPLE_HIDDEN: Record<'production' | 'declare' | 'reports', string[]> = {
  production: ['attendance'],
  declare: ['worktypes', 'partners', 'customers', 'positions', 'teams', 'coop'],
  reports: ['custom', 'paybook', 'website', 'commerce', 'checklist', 'logbook'],
};

/**
 * Lọc mục menu: (1) chế độ đơn giản cũ (nay tạm khóa, `org.simple` luôn false); (2) mô hình quản lý theo vụ (D103): mục thuộc chức năng bị ẩn
 * trong MỌI vụ còn chạy thì không hiện (`org.features` = hợp các mô hình; thiếu = hiện đầy đủ).
 */
function simpleFilter<T extends string>(org: MyOrg, tab: keyof typeof SIMPLE_HIDDEN, list: Section<T>[]): Section<T>[] {
  let out = org.simple ? list.filter((s) => !SIMPLE_HIDDEN[tab].includes(s.id)) : list;
  const feat = org.features;
  if (feat) out = out.filter((s) => { const f = SECTION_FEATURE[s.id]; return !f || featureShown(feat[f]); });
  return out;
}

export function productionSections(org: MyOrg | null): Section<ProductionSection>[] {
  if (!org) return [];
  return simpleFilter(org, 'production', [
    { id: 'cycles' as const, label: 'Vụ nuôi trồng' },
    hasRole(org.roles, 'manager', 'worker') ? { id: 'attendance' as const, label: 'Chấm công' } : null,
    canPerm(org.perms, 'harvest') ? { id: 'harvest' as const, label: 'Thu hoạch' } : null,
    canPerm(org.perms, 'inventory') ? { id: 'stock' as const, label: 'Kho' } : null,
    canPerm(org.perms, 'expenses') ? { id: 'expense' as const, label: 'Chi phí' } : null, // ghi chi phí hằng ngày: cùng nhóm với Thu hoạch, Kho (D92)
    { id: 'logs' as const, label: 'Nhật ký việc' }, // luôn để cuối
  ].filter((x): x is Section<ProductionSection> => x !== null));
}

export function declareSections(org: MyOrg | null): Section<DeclareSection>[] {
  if (!org) return [];
  const manager = hasRole(org.roles, 'manager');
  return simpleFilter(org, 'declare', [
    canPerm(org.perms, 'declare') ? { id: 'areas' as const, label: 'Phân khu' } : null,
    canPerm(org.perms, 'declare') ? { id: 'crops' as const, label: 'Sản phẩm' } : null,
    canPerm(org.perms, 'inventory') ? { id: 'places' as const, label: 'Kho' } : null,
    canPerm(org.perms, 'declare') ? { id: 'templates' as const, label: 'Tạo quy trình' } : null,
    canPerm(org.perms, 'declare') ? { id: 'worktypes' as const, label: 'Việc' } : null,
    canPerm(org.perms, 'inventory') ? { id: 'materials' as const, label: 'Vật tư' } : null,
    canPerm(org.perms, 'expenses') ? { id: 'partners' as const, label: 'Nhà cung ứng' } : null,
    canPerm(org.perms, 'sales') ? { id: 'customers' as const, label: 'Khách hàng' } : null,
    manager ? { id: 'licenses' as const, label: 'Giấy phép' } : null, // giấy phép, chứng chỉ của cơ sở (trước đây ở tab Tài khoản)
    // Nhân sự và tổ chức (trước đây ở tab Tổ chức)
    hasRole(org.roles, 'owner') ? { id: 'positions' as const, label: 'Chức vụ' } : null,
    manager ? { id: 'teams' as const, label: 'Tổ chức' } : null,
    manager ? { id: 'members' as const, label: 'Nhân sự' } : null,
    canPerm(org.perms, 'coop') ? { id: 'coop' as const, label: org.type === 'cooperative' ? 'Hộ thành viên' : 'Hợp tác xã' } : null,
  ].filter((x): x is Section<DeclareSection> => x !== null));
}

/** Khung gom các mục của tab Khai báo theo chức năng liên quan (menu Khai báo hiện 4 khung, trong khung là thanh chọn mục) */
export interface DeclareGroup { id: string; label: string; icon: string; items: Section<DeclareSection>[] }
const DECLARE_GROUPS: { id: string; label: string; icon: string; ids: DeclareSection[] }[] = [
  { id: 'base', label: 'Cơ sở & vật tư', icon: '🏡', ids: ['areas', 'crops', 'places', 'materials', 'partners'] },
  { id: 'org', label: 'Nhân sự', icon: '👥', ids: ['positions', 'teams', 'members'] },
  { id: 'process', label: 'Quy trình', icon: '📋', ids: ['worktypes', 'templates'] },
  { id: 'legal', label: 'Giấy phép & đối tác', icon: '🤝', ids: ['licenses', 'coop', 'customers'] },
];
/** Các khung của tab Khai báo mà người dùng có ít nhất một mục (đã lọc theo quyền và chế độ hiển thị); mục nào chưa xếp khung thì vào khung "Khác" */
export function declareGroups(org: MyOrg | null): DeclareGroup[] {
  const all = declareSections(org);
  const used = new Set<string>();
  const groups: DeclareGroup[] = DECLARE_GROUPS.map((g) => {
    const items = g.ids.map((id) => all.find((s) => s.id === id)).filter((x): x is Section<DeclareSection> => !!x);
    items.forEach((i) => used.add(i.id));
    return { id: g.id, label: g.label, icon: g.icon, items };
  }).filter((g) => g.items.length > 0);
  const rest = all.filter((s) => !used.has(s.id));
  if (rest.length > 0) groups.push({ id: 'other', label: 'Khác', icon: '🧰', items: rest });
  return groups;
}

/** Tab Cấu hình (chủ và quản lý): các danh sách mặc định của hệ thống, xem lib/config.ts */
export const canSeeConfig = (org: MyOrg | null) => !!org && hasRole(org.roles, 'manager');

export function reportSections(org: MyOrg | null): Section<ReportSection>[] {
  if (!org) return [];
  return simpleFilter(org, 'reports', [
    hasRole(org.roles, 'manager') ? { id: 'weekly' as const, label: 'Báo cáo tuần' } : null,
    REPORT_TYPES.some((t) => t.allowed(org.perms, org.roles)) ? { id: 'custom' as const, label: 'Theo nhu cầu' } : null,
    canPerm(org.perms, 'expenses') || canPerm(org.perms, 'sales') ? { id: 'payables' as const, label: 'Công nợ' } : null,
    canPerm(org.perms, 'sales') ? { id: 'sales' as const, label: 'Doanh thu' } : null,
    { id: 'paybook' as const, label: 'Bảng lương' }, // mọi người xem của mình; chủ/người có quyền Tiền công xem cả cơ sở
    canPerm(org.perms, 'summary') ? { id: 'summary' as const, label: 'Tổng kết vụ' } : null,
    canPerm(org.perms, 'declare') ? { id: 'logbook' as const, label: 'Sổ nhật ký' } : null,
    canPerm(org.perms, 'declare') ? { id: 'checklist' as const, label: 'Bảng kiểm' } : null,
    canPerm(org.perms, 'website') ? { id: 'website' as const, label: 'Đơn khách từ website' } : null,
    canPerm(org.perms, 'website') ? { id: 'commerce' as const, label: 'Hồ sơ website' } : null, // luôn để cuối
  ].filter((x): x is Section<ReportSection> => x !== null));
}

/** Các tab được hiện với người đang đăng nhập ở cơ sở đang chọn */
export function visibleTabs(org: MyOrg | null): TabId[] {
  // Thứ tự: Trang chủ · Khai báo · Sản xuất · Báo cáo; Cấu hình, Hướng dẫn, Tài khoản nằm ở menu ☰
  const tabs: TabId[] = ['home'];
  if (declareSections(org).length > 0) tabs.push('declare');
  tabs.push('production');
  if (canSeeConfig(org)) tabs.push('config');
  tabs.push('guide');
  if (reportSections(org).length > 0) tabs.push('reports');
  tabs.push('profile');
  return tabs;
}
