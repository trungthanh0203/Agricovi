import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { friendlyError } from '../lib/errors';
import { useOrgs, type PlanUsage } from '../lib/orgs';
import { Collapsible } from '../components/Collapsible';
import { CooperativeSection } from '../components/CooperativeSection';
import { InvitationsPanel } from '../components/InvitationsPanel';
import { MembersSection } from '../components/MembersSection';
import { hasRole, isOwner, roleSummary } from '../lib/roles';
import { TeamsSection } from '../components/TeamsSection';
import { fetchStaffStatus } from '../lib/staff';

const TYPE_LABEL = { household: 'Hộ / trang trại', cooperative: 'Hợp tác xã' } as const;
const STATUS_LABEL: Record<PlanUsage['status'], string> = {
  trial: 'Dùng thử', active: 'Đang hoạt động', expired: 'Hết hạn', suspended: 'Tạm khóa',
};
const vnd = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + 'đ';
const date = (iso: string) => new Date(iso).toLocaleDateString('vi-VN');

export function OrgTab({ onAddOrg }: { onAddOrg: () => void }) {
  const { session, signOut } = useAuth();
  const { active, orgs, stale, fetchUsage } = useOrgs();
  const [usage, setUsage] = useState<PlanUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStaff, setIsStaff] = useState(true); // mặc định ẩn nút cho tới khi biết chắc không phải tài khoản nhân viên
  const uid = session?.user.id;

  useEffect(() => {
    if (uid) void fetchStaffStatus(uid).then((s) => setIsStaff(Boolean(s?.is_staff)));
  }, [uid]);

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
  const ownsOrg = orgs.some((o) => isOwner(o.roles));
  const canSeePlan = hasRole(active.roles, 'manager');
  const canSeeMembers = hasRole(active.roles, 'manager');
  const canSeeCoop = hasRole(active.roles, 'cooperative_manager', 'manager');

  return (
    <section>
      <h1>Cơ sở của tôi</h1>

      <InvitationsPanel />

      <div className="card">
        <strong>{active.name}</strong>
        <p className="muted">{TYPE_LABEL[active.type]} · {roleSummary(active.roles)}</p>
        {stale && <p className="msg warn">Đang hiển thị dữ liệu đã lưu trên thiết bị (chưa cập nhật từ máy chủ).</p>}
      </div>

      {canSeePlan && <Collapsible title="Gói dịch vụ" warn={Boolean(usage && !isTrialOrActive)}
        summary={usage ? (isTrialOrActive ? `${STATUS_LABEL[usage.status]} · ${usage.used_cycles}/${usage.max_cycles} vụ · đến ${date(usage.period_end)}` : 'Đã hết hạn') : error ? 'Không tải được' : 'Đang tải…'}>
        {error && <p className="msg error">{error}</p>}
        {!usage && !error && <p className="muted">Đang tải…</p>}
        {usage && (
          <>
            <p>
              <strong>{usage.plan_name}</strong>{' '}
              <span className={isTrialOrActive ? 'pill ok' : 'pill warn'}>
                {isTrialOrActive ? STATUS_LABEL[usage.status] : 'Hết hạn'}
              </span>
            </p>
            <p>Số vụ đang dùng: <strong>{usage.used_cycles}/{usage.max_cycles}</strong></p>
            <p>{isTrialOrActive ? 'Hết hạn' : 'Đã hết hạn'} ngày {date(usage.period_end)}</p>
            {usage.status !== 'trial' && <p className="muted">Phí: {vnd(usage.price_per_quarter)}/quý</p>}
            {!isTrialOrActive && (
              <p className="msg warn">
                Gói đã hết hạn: bạn vẫn xem và ghi dữ liệu cũ được, nhưng chưa tạo được vụ mới. Hãy liên hệ để gia hạn.
              </p>
            )}
          </>
        )}
      </Collapsible>}

      {canSeeCoop && <CooperativeSection org={active} />}
      {canSeeMembers && <MembersSection org={active} />}
      {canSeeMembers && <TeamsSection org={active} />}

      <div className="card">
        <p className="muted">Tài khoản: {session?.user.email}</p>
        <p className="muted">Phiên bản app: {__APP_VERSION__}</p>
        <div className="actions">
          {!ownsOrg && !isStaff && <button className="secondary" onClick={onAddOrg}>Tạo cơ sở của riêng tôi</button>}
          <button className="secondary" onClick={() => void signOut()}>Đăng xuất</button>
        </div>
      </div>
    </section>
  );
}
