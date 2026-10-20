import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { MemberRole, OrgType } from '@agriconnect/shared';
import { useAuth } from './auth';
import { effectivePerms, type EffectivePerms, type PermOverrides } from './permissions';
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
}

interface PositionRow { id: string; organization_id: string; name: string; perms: PermOverrides; work_type_ids: string[] | null; can_manage_stages: boolean }

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
    try {
      if (!supabase || !navigator.onLine) throw new Error('offline');
      const { data, error } = await supabase
        .from('organization_memberships')
        .select('roles, permissions, position_ids, organizations ( id, type, name )')
        .eq('status', 'active')
        // CHỈ dòng của chính mình: các dòng thành viên khác cùng cơ sở không phải "cơ sở của tôi"
        // và mang vai trò của người khác (lỗi cũ: nhân viên bị hiện giao diện của chủ).
        .eq('user_id', uid);
      if (error) throw error;
      // chức vụ đang hoạt động của các cơ sở tôi thuộc (lỗi/thiếu bảng thì coi như chưa có chức vụ nào)
      const posRes = await supabase.from('org_positions').select('id, organization_id, name, perms, work_type_ids, can_manage_stages').eq('is_active', true);
      const allPos = (posRes.error ? [] : (posRes.data ?? [])) as PositionRow[];
      const list: MyOrg[] = (data ?? []).flatMap((row) => {
        const o = row.organizations as unknown as { id: string; type: OrgType; name: string } | null;
        if (!o) return [];
        const roles = row.roles as MemberRole[];
        const mine = allPos.filter((p) => p.organization_id === o.id && ((row as { position_ids?: string[] }).position_ids ?? []).includes(p.id));
        const restricted = !roles.some((r) => r === 'owner' || r === 'manager') && mine.length > 0 && mine.every((p) => p.work_type_ids !== null);
        return [{
          id: o.id, type: o.type, name: o.name, roles,
          perms: effectivePerms(roles, row.permissions as PermOverrides | null, mine.map((p) => p.perms)),
          positions: mine.map((p) => ({ id: p.id, name: p.name })),
          allowedWorkTypes: restricted ? [...new Set(mine.flatMap((p) => p.work_type_ids ?? []))] : null,
          canManageStages: mine.some((p) => p.can_manage_stages),
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
      const cached = (readJson<Array<Omit<MyOrg, 'perms'> & { role?: MemberRole; perms?: EffectivePerms }>>(cacheKey(uid)) ?? []).map((o) => {
        const roles = o.roles ?? (o.role ? [o.role] : []);
        return { ...o, roles, perms: o.perms ?? effectivePerms(roles, null) };
      });
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
