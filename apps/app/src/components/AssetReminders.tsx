import { useEffect, useState } from 'react';
import { fetchAssets, nextMaintenance, type Asset } from '../lib/assets';
import { fmtDate } from '../lib/dates';
import { todayLocal } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import { canPerm } from '../lib/permissions';

/** Trang chủ: tài sản đến hạn bảo dưỡng (H9). Chỉ người xem được Chi phí; không hiện gì nếu không có tài sản đến hạn hoặc đang offline. */
export function AssetReminders({ onGo }: { onGo: (tab: 'declare', section: string) => void }) {
  const { active } = useOrgs();
  const [rows, setRows] = useState<Asset[]>([]);
  const orgId = active?.id;
  const allowed = Boolean(active && canPerm(active.perms, 'expenses', 'view'));
  useEffect(() => {
    if (!orgId || !allowed || !navigator.onLine) return;
    let alive = true;
    fetchAssets(orgId).then((r) => { if (alive) setRows(r); }).catch(() => undefined);
    return () => { alive = false; };
  }, [orgId, allowed]);
  const today = todayLocal();
  const due = rows.filter((a) => { const n = nextMaintenance(a); return n !== null && n <= today; });
  if (due.length === 0) return null;
  return (
    <div className="card slim">
      <p className="msg warn" role="status">🛠️ {due.length} tài sản đến hạn bảo dưỡng: {due.slice(0, 3).map((a) => `${a.name} (từ ${fmtDate(nextMaintenance(a)!)})`).join(', ')}{due.length > 3 ? '…' : ''}</p>
      <button type="button" className="link" onClick={() => onGo('declare', 'assets')}>Mở Tài sản</button>
    </div>
  );
}
