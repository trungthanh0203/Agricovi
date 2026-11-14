import { useMemo } from 'react';
import { useCatalog } from '../lib/catalog';
import { lossMessages, lossStatus, lossThresholds } from '../lib/countLogic';
import { cycleCountUnit } from '../lib/countUnit';
import { cycleTitle } from '../lib/cycles';
import { todayLocal } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import { useTable } from '../lib/tables';

/**
 * Trang chủ: các vụ/lứa đang chạy có hao hụt vượt ngưỡng của cơ sở (cộng dồn hoặc 7 ngày gần đây; mục 14). Không hiện gì nếu không có cảnh báo,
 * nên cơ sở trồng trọt hay chưa ghi hao hụt không thấy thêm gì. Chỉ là nhắc; ngưỡng đặt ở chi tiết vụ → Số cây/con và hao hụt.
 */
export function LossAlerts({ cycleIds, onOpenCycle }: { cycleIds: Set<string>; onOpenCycle: (id: string) => void }) {
  const { active } = useOrgs();
  const cycles = useTable('cycles');
  const events = useTable('countEvents');
  const harvests = useTable('harvests');
  const limits = useTable('measureLimits');
  const { cropTypes } = useCatalog();
  const today = todayLocal();

  const rows = useMemo(() => {
    if (!active) return [];
    const th = lossThresholds(limits.filter((l) => l.organization_id === active.id));
    const out: { id: string; title: string; msgs: string[] }[] = [];
    for (const c of cycles) {
      if (!cycleIds.has(c.id) || !['active', 'preparing', 'paused'].includes(c.status)) continue;
      const ev = events.filter((e) => e.cycle_id === c.id);
      if (ev.length === 0) continue; // chưa ghi biến động nào thì không cảnh báo
      const kind = cropTypes.find((t) => t.id === c.crop_type_id)?.kind;
      const livestock = kind === 'livestock' || kind === 'aquatic';
      const harvestOut = livestock && c.cycle_mode !== 'herd' ? harvests.filter((h) => h.cycle_id === c.id && !h.voided_at).reduce((n, h) => n + (h.unit_count ?? 0), 0) : 0;
      const msgs = lossMessages(lossStatus(c, ev, harvestOut, th, today), th, cycleCountUnit(c, cropTypes));
      if (msgs.length > 0) out.push({ id: c.id, title: cycleTitle(c, cropTypes.find((t) => t.id === c.crop_type_id)?.name ?? ''), msgs });
    }
    return out;
  }, [active, cycles, events, harvests, limits, cropTypes, cycleIds, today]);

  if (rows.length === 0) return null;
  return (
    <details className="fold">
      <summary>
        <span className="fold-title">Hao hụt vượt ngưỡng</span>
        <span className="fold-sum warn">{rows.length} vụ/lứa</span>
      </summary>
      <div className="fold-body">
        {rows.map((r) => (
          <div key={r.id}>
            <p><strong>{r.title}</strong> <button type="button" className="link inline" onClick={() => onOpenCycle(r.id)}>Mở vụ</button></p>
            {r.msgs.map((m) => <p className="msg warn" role="status" key={m}>{m}</p>)}
          </div>
        ))}
        <p className="muted">Chỉ là nhắc. Hãy kiểm tra chuồng/ao, nước, thức ăn và hỏi cán bộ thú y/kỹ thuật nếu cần. Đổi ngưỡng ở chi tiết vụ → Số cây/con và hao hụt.</p>
      </div>
    </details>
  );
}
