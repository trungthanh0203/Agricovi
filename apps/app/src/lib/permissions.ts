import type { MemberRole } from '@agriconnect/shared';

/**
 * Quyền theo mục do chủ cơ sở cấp (quyết định D27). Phải khớp hàm `role_default_perm` và `perm_level` ở CSDL
 * (kiểm thử đối chiếu trong supabase/tests/perms.test.mjs). Giao diện chỉ ẩn/hiện; máy chủ luôn kiểm tra lại.
 */
export type PermModule = 'inventory' | 'harvest' | 'expenses' | 'sales' | 'summary';
export type PermLevel = 'none' | 'view' | 'edit';
export type PermOverrides = Partial<Record<PermModule, PermLevel>>;
export type EffectivePerms = Record<PermModule, PermLevel>;

export const PERM_MODULES: PermModule[] = ['inventory', 'harvest', 'expenses', 'sales', 'summary'];

export const PERM_MODULE_LABEL: Record<PermModule, string> = {
  inventory: 'Kho (tồn kho, nhập kho, danh mục vật tư)',
  harvest: 'Thu hoạch',
  expenses: 'Chi phí',
  sales: 'Doanh thu bán hàng',
  summary: 'Tổng kết vụ',
};

export const PERM_LEVEL_LABEL: Record<PermLevel, string> = {
  none: 'Không thấy',
  view: 'Chỉ xem',
  edit: 'Xem và nhập liệu',
};

const RANK: Record<PermLevel, number> = { none: 0, view: 1, edit: 2 };
const has = (roles: readonly MemberRole[], ...want: MemberRole[]) => want.some((r) => roles.includes(r));

/** Mức mặc định theo vai trò (khi chủ chưa cấp riêng) */
export function defaultPerm(roles: readonly MemberRole[], module: PermModule): PermLevel {
  switch (module) {
    case 'inventory':
      return has(roles, 'owner', 'inventory_finance') ? 'edit' : has(roles, 'manager') ? 'view' : 'none';
    case 'expenses':
    case 'sales':
      return has(roles, 'owner', 'inventory_finance') ? 'edit' : has(roles, 'manager', 'cooperative_manager') ? 'view' : 'none';
    case 'summary':
      return has(roles, 'owner', 'manager', 'inventory_finance', 'cooperative_manager') ? 'view' : 'none';
    case 'harvest':
      return has(roles, 'owner', 'manager', 'worker', 'inventory_finance', 'cooperative_manager') ? 'edit' : 'none';
  }
}

/** Mức hiệu lực: chủ luôn đủ; có cấp riêng thì theo cấp riêng; không thì theo vai trò */
export function effectivePerm(roles: readonly MemberRole[], overrides: PermOverrides | null | undefined, module: PermModule): PermLevel {
  if (roles.includes('owner')) return 'edit';
  const o = overrides?.[module];
  return o ?? defaultPerm(roles, module);
}

export function effectivePerms(roles: readonly MemberRole[], overrides: PermOverrides | null | undefined): EffectivePerms {
  return Object.fromEntries(PERM_MODULES.map((m) => [m, effectivePerm(roles, overrides, m)])) as EffectivePerms;
}

/** Có ít nhất mức `need` ở mục đó không (edit gồm view) */
export function canPerm(perms: EffectivePerms | undefined, module: PermModule, need: Exclude<PermLevel, 'none'> = 'view'): boolean {
  return perms ? RANK[perms[module]] >= RANK[need] : false;
}
