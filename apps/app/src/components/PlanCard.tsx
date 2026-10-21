import { useEffect, useState } from 'react';
import { friendlyError } from '../lib/errors';
import { useOrgs, type PlanUsage } from '../lib/orgs';
import { roleSummary } from '../lib/roles';

const TYPE_LABEL = { household: 'Hộ / trang trại', cooperative: 'Hợp tác xã' } as const;
const STATUS_LABEL: Record<PlanUsage['status'], string> = {
  trial: 'Dùng thử', active: 'Đang hoạt động', expired: 'Hết hạn', suspended: 'Tạm khóa',
};
const vnd = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + 'đ';
const date = (iso: string) => new Date(iso).toLocaleDateString('vi-VN');

/** Gói dịch vụ của cơ sở đang chọn: tên gói, trạng thái, số vụ đang dùng, hạn, phí (hiện ở Hồ sơ). */
export function PlanCard() {
  const { active, stale, fetchUsage } = useOrgs();
  const [usage, setUsage] = useState<PlanUsage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    setUsage(null);
    setError(null);
    fetchUsage(active.id)
      .then((u) => alive && setUsage(u))
      .catch((e) => alive && setError(friendlyError(e)));
    return () => { alive = false; };
  }, [active, fetchUsage]);

  if (!active) return null;
  const isTrialOrActive = usage && usage.is_current;

  return (
    <>
      <p><strong>{active.name}</strong></p>
      <p className="muted">{TYPE_LABEL[active.type]} · {roleSummary(active.roles)}</p>
      {stale && <p className="msg warn">Đang hiển thị dữ liệu đã lưu trên thiết bị (chưa cập nhật từ máy chủ).</p>}
      {error && <p className="msg error">{error}</p>}
      {!usage && !error && <p className="muted">Đang tải…</p>}
      {usage && (
        <>
          <p>
            <strong>{usage.plan_name}</strong>{' '}
            <span className={isTrialOrActive ? 'pill ok' : 'pill warn'}>{isTrialOrActive ? STATUS_LABEL[usage.status] : 'Hết hạn'}</span>
          </p>
          <p>Số vụ đang dùng: <strong>{usage.used_cycles}/{usage.max_cycles}</strong></p>
          <p>{isTrialOrActive ? 'Hết hạn' : 'Đã hết hạn'} ngày {date(usage.period_end)}</p>
          {usage.status !== 'trial' && <p className="muted">Phí: {vnd(usage.price_per_quarter)}/quý</p>}
          {!isTrialOrActive && (
            <p className="msg warn">Gói đã hết hạn: bạn vẫn xem và ghi dữ liệu cũ được, nhưng chưa tạo được vụ mới. Hãy liên hệ để gia hạn.</p>
          )}
        </>
      )}
    </>
  );
}
