import { useEffect, useState } from 'react';
import { formatQty, fetchLotStatus, type LotStatus } from '../lib/inventory';
import { useOrgs } from '../lib/orgs';
import { canPerm } from '../lib/permissions';

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
        <span className="fold-title">Lô vật tư sắp hết hạn</span>
        <span className="fold-sum warn">{expired > 0 ? `${expired} lô đã hết hạn, ` : ''}{rows.length - expired} lô sắp hết hạn</span>
      </summary>
      <div className="fold-body">
        {rows.map((r) => (
          <p key={r.lot_id}>
            <strong>{r.material_name}</strong> · lô {r.lot_no} · còn {formatQty(r.remaining)} ·{' '}
            {r.days_left < 0 ? <span className="pill err">Hết hạn {-r.days_left} ngày trước</span> : <span className="pill warn">Còn {r.days_left} ngày ({new Date(r.expiry_date).toLocaleDateString('vi-VN')})</span>}
          </p>
        ))}
        <p className="muted">Lô đã hết hạn không được tự gắn khi xuất dùng. Hãy kiểm tra và điều chỉnh tồn (hủy bỏ) nếu không còn dùng được.</p>
      </div>
    </details>
  );
}
