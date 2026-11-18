import { useEffect, useState } from 'react';
import { fmtDate } from '../lib/dates';
import { fetchExpiringContracts, type ExpiringContract } from '../lib/hr';
import { todayLocal } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import { canPerm } from '../lib/permissions';

/** Trang chủ: hợp đồng lao động sắp hết hạn (≤ 30 ngày) hoặc đã hết hạn (D188). Chỉ người xem được mục Tiền công; không hiện gì nếu không có hoặc đang offline. */
export function HrReminders({ onGo }: { onGo: (tab: 'declare', section: string) => void }) {
  const { active } = useOrgs();
  const [rows, setRows] = useState<ExpiringContract[]>([]);
  const orgId = active?.id;
  const allowed = Boolean(active && canPerm(active.perms, 'payroll', 'view'));
  const today = todayLocal();
  useEffect(() => {
    if (!orgId || !allowed || !navigator.onLine) return;
    let alive = true;
    fetchExpiringContracts(orgId, today).then((r) => { if (alive) setRows(r); }).catch(() => undefined);
    return () => { alive = false; };
  }, [orgId, allowed, today]);
  if (rows.length === 0) return null;
  const expired = rows.filter((r) => r.end_date < today).length;
  return (
    <div className="card slim">
      <p className="msg warn" role="status">📄 {rows.length} hợp đồng lao động {expired > 0 ? `đã hoặc sắp hết hạn (${expired} đã hết)` : 'sắp hết hạn'}: {rows.slice(0, 3).map((r) => `${r.full_name} (${fmtDate(r.end_date)})`).join(', ')}{rows.length > 3 ? '…' : ''}</p>
      <button type="button" className="link" onClick={() => onGo('declare', 'members')}>Mở Nhân sự</button>
    </div>
  );
}
