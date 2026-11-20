import { useCallback, useEffect, useState } from 'react';
import { useOrgs } from './orgs';
import { setExportLocked } from './exportLock';
import { supabase } from './supabase';

/** Tình trạng gói Khởi đầu (miễn phí 12 tháng) của cơ sở đang chọn, lấy từ hàm my_free_plan_state (D219). */
export interface FreePlanState {
  free: boolean;
  scoped?: boolean;          // đang bị giới hạn (không trong lượt nâng cấp thử)
  expired?: boolean;
  period_end?: string;
  days_left?: number;
  full_trial_used?: boolean;
  full_trial_until?: string | null;
  locked_features?: string[];
}

const listeners = new Set<(s: FreePlanState | null) => void>();
let shared: { org: string; state: FreePlanState | null } | null = null;

async function load(orgId: string): Promise<FreePlanState | null> {
  if (!supabase || !navigator.onLine) return shared?.org === orgId ? shared.state : null;
  const { data, error } = await supabase.rpc('my_free_plan_state', { p_org: orgId });
  if (error) return null;   // CSDL chưa cập nhật hoặc lỗi mạng: coi như không có giới hạn trên giao diện (CSDL vẫn ép)
  return data as FreePlanState;
}

export function useFreePlan() {
  const { active } = useOrgs();
  const orgId = active?.id;
  const [state, setState] = useState<FreePlanState | null>(shared && shared.org === orgId ? shared.state : null);

  const reload = useCallback(async () => {
    if (!orgId) return;
    const s = await load(orgId);
    shared = { org: orgId, state: s };
    setExportLocked(!!s?.free && !!s.scoped && (s.locked_features ?? []).includes('export_reports'));
    listeners.forEach((l) => l(s));
  }, [orgId]);

  useEffect(() => {
    listeners.add(setState);
    void reload();
    return () => { listeners.delete(setState); };
  }, [reload]);

  return { state, reload };
}
