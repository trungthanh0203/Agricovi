import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { MemberRole, OrgType } from '@agriconnect/shared';
import { useAuth } from './auth';
import { effectivePerms, type EffectivePerms, type PermOverrides } from './permissions';
import { saveRoleLabels } from './roles';
import { supabase } from './supabase';

export interface MyOrg {
  id: string;
  type: OrgType;
  name: string;
  roles: MemberRole[];
  /** Quyền hiệu lực theo mục (vai trò + phần chủ cấp riêng), D27 */
  perms: EffectivePerms;
  /** Chức vụ đang giữ (D44) */
  positions?: { id: string; name: string }[];
  /** Loại việc được làm: null = mọi loại */
  allowedWorkTypes?: string[] | null;
  /** Được bắt đầu/hoàn thành/sửa giai đoạn nhờ chức vụ */
  canManageStages?: boolean;
  /** Chế độ đơn giản (D100): ẩn các mục nâng cao cho hộ nhỏ; chỉ là cách hiển thị, quyền và dữ liệu không đổi */
  simple?: boolean;
  /** Mô hình quản lý mặc định của cơ sở và gói VietGAP (docs/PLAN_MO_HINH_QUAN_LY.md); null = chưa chọn */
  mgmtModel?: string | null;
  mgmtVietgap?: boolean;
}

interface PositionRow {
  id: string; organization_id: string; name: string; perms: PermOverrides; work_type_ids: string[] | null; can_manage_stages: boolean;
  base_role: MemberRole; is_builtin: boolean;
}

export interface PlanUsage {
  plan_name: string;
  status: 'trial' | 'active' | 'expired' | 'suspended';
  max_cycles: number;
  used_cycles: number;
  period_end: string;
  price_per_quarter: number;
  is_current: boolean;
}

interface OrgState {
  orgs: MyOrg[];
  active: MyOrg | null;
  loading: boolean;
  /** true khi danh sách lấy từ bộ nhớ thiết bị vì không tải được từ máy chủ */
  stale: boolean;
  setActive: (id: string) => void;
  refresh: () => Promise<void>;
  createOrg: (type: OrgType, name: string) => Promise<string>;
  fetchUsage: (orgId: string) => Promise<PlanUsage | null>;
}

const Ctx = createContext<OrgState | null>(null);

// Lưu theo người dùng để đổi tài khoản trên cùng thiết bị không lẫn dữ liệu
const cacheKey = (uid: string) => `agriconnect.orgs.${uid}`;
const activeKey = (uid: string) => `agriconnect.activeOrg.${uid}`;

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
/** Danh sách cơ sở đã lưu trên máy lần trước (có đọc được cả bản lưu kiểu cũ) */
function readCachedOrgs(uid: string): MyOrg[] {
  return (readJson<Array<Omit<MyOrg, 'perms'> & { role?: MemberRole; perms?: EffectivePerms }>>(cacheKey(uid)) ?? []).map((o) => {
    const roles = o.roles ?? (o.role ? [o.role] : []);
    return { ...o, roles, perms: o.perms ?? effectivePerms(roles, null) };
  });
}
function writeStore(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* bộ nhớ bị chặn: app vẫn chạy, chỉ không nhớ lựa chọn */
  }
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const [orgs, setOrgs] = useState<MyOrg[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stale, setStale] = useState(false);

  const load = useCallback(async () => {
    if (!uid) {
      setOrgs([]);
      setActiveId(null);
      return;
    }
    setLoading(true);
    const saved = readJson<string>(activeKey(uid));
    // Vào app ngay bằng danh sách đã lưu lần trước, bản mới từ máy chủ sẽ thay vào khi tải xong (không bắt người dùng chờ mạng)
    const cachedFirst = readCachedOrgs(uid);
    if (cachedFirst.length > 0) {
      setOrgs((cur) => (cur.length > 0 ? cur : cachedFirst));
      setActiveId((cur) => pickActive(cachedFirst, cur ?? saved));
    }
    try {
      if (!supabase || !navigator.onLine) throw new Error('offline');
      // hai truy vấn không phụ thuộc nhau nên gửi cùng lúc
      const [memRes, posRes, labelRes, modeRes] = await Promise.all([
        supabase
          .from('organization_memberships')
          .select('roles, permissions, position_ids, organizations ( id, type, name )')
          .eq('status', 'active')
          // CHỈ dòng của chính mình: các dòng thành viên khác cùng cơ sở không phải "cơ sở của tôi"
          // và mang vai trò của người khác (lỗi cũ: nhân viên bị hiện giao diện của chủ).
          .eq('user_id', uid),
        // chức vụ đang hoạt động của các cơ sở tôi thuộc (lỗi/thiếu bảng thì coi như chưa có chức vụ nào)
        supabase.from('org_positions').select('id, organization_id, name, perms, work_type_ids, can_manage_stages, base_role, is_builtin').eq('is_active', true),
        // tên vai trò do quản trị nền tảng đặt (D82)
        supabase.from('platform_role_labels').select('role, name'),
        // chế độ hiển thị của cơ sở (cột mới; lỗi/thiếu cột thì coi như đầy đủ)
        (async () => {
          const r = await supabase.from('organizations').select('id, ui_mode, mgmt_model, mgmt_vietgap');
          return r.error ? supabase.from('organizations').select('id, ui_mode') : r; // chưa db push 0102
        })(),
      ]);
      const modeRows = (modeRes.error ? [] : (modeRes.data ?? [])) as unknown as { id: string; ui_mode: string; mgmt_model?: string | null; mgmt_vietgap?: boolean }[];
      const simpleOrgs = new Set(modeRows.filter((r) => r.ui_mode === 'simple').map((r) => r.id));
      const modelOf = new Map(modeRows.map((r) => [r.id, r]));
      const { data, error } = memRes;
      if (error) throw error;
      if (!labelRes.error && labelRes.data) saveRoleLabels(Object.fromEntries((labelRes.data as { role: string; name: string }[]).map((r) => [r.role, r.name])));
      const allPos = (posRes.error ? [] : (posRes.data ?? [])) as PositionRow[];
      const list: MyOrg[] = (data ?? []).flatMap((row) => {
        const o = row.organizations as unknown as { id: string; type: OrgType; name: string } | null;
        if (!o) return [];
        const roles = row.roles as MemberRole[];
        const orgPos = allPos.filter((p) => p.organization_id === o.id);
        const held = ((row as { position_ids?: string[] }).position_ids ?? []);
        const mine = orgPos.filter((p) => !p.is_builtin && held.includes(p.id)); // vai trò tự tạo đang giữ
        const builtinHeld = orgPos.filter((p) => p.is_builtin && roles.includes(p.base_role)); // vai trò có sẵn đang giữ
        const builtin = Object.fromEntries(orgPos.filter((p) => p.is_builtin).map((p) => [p.base_role, p.perms]));
        // loại việc: có vai trò tự tạo thì tính các vai trò tự tạo, không thì tính vai trò có sẵn (khớp work_type_allowed ở CSDL)
        const rule = mine.length > 0 ? mine : builtinHeld;
        const restricted = !roles.some((r) => r === 'owner' || r === 'manager') && rule.length > 0 && rule.every((p) => p.work_type_ids !== null);
        return [{
          id: o.id, type: o.type, name: o.name, roles,
          perms: effectivePerms(roles, row.permissions as PermOverrides | null, mine.map((p) => p.perms), builtin),
          positions: mine.map((p) => ({ id: p.id, name: p.name })),
          allowedWorkTypes: restricted ? [...new Set(rule.flatMap((p) => p.work_type_ids ?? []))] : null,
          canManageStages: [...mine, ...builtinHeld].some((p) => p.can_manage_stages),
          simple: simpleOrgs.has(o.id),
          mgmtModel: modelOf.get(o.id)?.mgmt_model ?? null,
          mgmtVietgap: Boolean(modelOf.get(o.id)?.mgmt_vietgap),
        }];
      });
      list.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
      setOrgs(list);
      // Danh sách lưu trên máy từ bản cũ có thể bị trùng; ghi đè bằng danh sách đúng ngay bên dưới
      setStale(false);
      writeStore(cacheKey(uid), JSON.stringify(list));
      setActiveId((cur) => pickActive(list, cur ?? saved));
    } catch {
      // Offline hoặc lỗi mạng: dùng danh sách đã lưu lần trước để vẫn làm việc được
      const cached = readCachedOrgs(uid);
      setOrgs(cached);
      setStale(true);
      setActiveId((cur) => pickActive(cached, cur ?? saved));
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    void load();
  }, [load]);

  // Tự tải lại khi có mạng trở lại
  useEffect(() => {
    const on = () => void load();
    // và khi mở lại app, để quyền chủ vừa đổi có hiệu lực sớm
    const visible = () => { if (document.visibilityState === 'visible') on(); };
    window.addEventListener('online', on);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('online', on);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [load]);

  const setActive = useCallback(
    (id: string) => {
      setActiveId(id);
      if (uid) writeStore(activeKey(uid), JSON.stringify(id));
    },
    [uid],
  );

  const createOrg = useCallback(
    async (type: OrgType, name: string) => {
      if (!supabase) throw new Error('Supabase chưa được cấu hình');
      const { data, error } = await supabase.rpc('create_organization', { p_type: type, p_name: name });
      if (error) throw error;
      const id = data as string;
      await load();
      setActive(id);
      return id;
    },
    [load, setActive],
  );

  const fetchUsage = useCallback(async (orgId: string) => {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('org_plan_usage', { p_org: orgId });
    if (error) throw error;
    const row = (data as PlanUsage[] | null)?.[0];
    return row ?? null;
  }, []);

  const active = orgs.find((o) => o.id === activeId) ?? null;
  const value = useMemo(
    () => ({ orgs, active, loading, stale, setActive, refresh: load, createOrg, fetchUsage }),
    [orgs, active, loading, stale, setActive, load, createOrg, fetchUsage],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function pickActive(list: MyOrg[], preferred: string | null): string | null {
  if (preferred && list.some((o) => o.id === preferred)) return preferred;
  return list[0]?.id ?? null;
}

export function useOrgs(): OrgState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useOrgs phải nằm trong OrgProvider');
  return v;
}
