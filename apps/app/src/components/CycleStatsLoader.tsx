import { useEffect } from 'react';
import { fetchCycleStatsFor, type CycleStats } from '../lib/cycleStats';

/**
 * Tải số liệu tóm tắt cho đúng các vụ đang hiển thị (D173). Không vẽ gì. `refreshKey` đổi (vụ đổi phiên bản/trạng thái, có mạng lại) thì tải lại.
 * Không có vụ nào cần hiển thị hoặc đang mất mạng thì không gọi máy chủ.
 */
export function CycleStatsLoader({ orgId, ids, refreshKey, onData }: { orgId: string; ids: string[]; refreshKey: string; onData: (s: CycleStats) => void }) {
  const key = ids.join(',');
  useEffect(() => {
    if (ids.length === 0 || !navigator.onLine) return;
    let alive = true;
    fetchCycleStatsFor(orgId, ids).then((s) => { if (alive) onData(s); }).catch(() => undefined);
    return () => { alive = false; };
  }, [orgId, key, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
