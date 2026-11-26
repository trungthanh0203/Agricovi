import { useEffect, useState } from 'react';
import { formatQty, fetchLotStatus, type LotStatus } from '../lib/inventory';
import { useOrgs } from '../lib/orgs';
import { canPerm } from '../lib/permissions';
import { t } from '@lingui/core/macro';
import { dateLocale } from '../lib/format';

/** Cảnh báo lô vật tư đã hết hạn hoặc sắp hết hạn (30 ngày) mà còn tồn. Không hiện gì nếu không có lô nào hoặc đang offline. */
export function ExpiringLots() {
  const { active } = useOrgs();
  const [rows, setRows] = useState<LotStatus[]>([]);
  const allowed = !!active && canPerm(active.perms, 'inventory', 'view');
  useEffect(() => {
    if (!active || !allowed) return;
    let live = true;
    void fetchLotStatus(active.id, 30).then((r) => { if (live) setRows(r); });
    return () => { live = false; };
  }, [active, allowed]);
  if (rows.length === 0) return null;
  const expired = rows.filter((r) => r.days_left < 0).length;
  return (
    <details className="fold">
      <summary>
        <span className="fold-title">{t`Lô vật tư sắp hết hạn`}</span>
        <span className="fold-sum warn">{expired > 0 ? t`${expired} lô đã hết hạn, ` : ''}{rows.length - expired}{' '}{t`lô sắp hết hạn`}</span>
      </summary>
      <div className="fold-body">
        {rows.map((r) => (
          <p key={r.lot_id}>
            <strong>{r.material_name}</strong>{' '}{t`· lô`}{' '}{r.lot_no}{' '}{t`· còn`}{' '}{formatQty(r.remaining)} ·{' '}
            {r.days_left < 0 ? <span className="pill err">{t`Hết hạn`}{' '}{-r.days_left}{' '}{t`ngày trước`}</span> : <span className="pill warn">{t`Còn`}{' '}{r.days_left}{' '}{t`ngày (`}{new Date(r.expiry_date).toLocaleDateString(dateLocale())})</span>}
          </p>
        ))}
        <p className="muted">{t`Lô đã hết hạn không được tự gắn khi xuất dùng. Hãy kiểm tra và điều chỉnh tồn (hủy bỏ) nếu không còn dùng được.`}</p>
      </div>
    </details>
  );
}
