import { useCallback, useEffect, useState } from 'react';
import { friendlyError } from '../lib/errors';
import {
  acceptCoopInvitation, acceptInvitation, declineCoopInvitation, declineInvitation,
  myCoopInvitations, myInvitations, type CoopInvitation, type OrgInvitation,
} from '../lib/members';
import { isOwner, roleSummary } from '../lib/roles';
import { useOrgs } from '../lib/orgs';

/**
 * Lời mời đang chờ gửi tới email của tài khoản này:
 *  - mời vào một cơ sở với một vai trò;
 *  - HTX mời hộ (chỉ hiện khi đang làm việc ở cơ sở loại Hộ và là chủ hộ).
 */
export function InvitationsPanel({ onChanged }: { onChanged?: () => void }) {
  const { active, refresh } = useOrgs();
  const [orgInv, setOrgInv] = useState<OrgInvitation[]>([]);
  const [coopInv, setCoopInv] = useState<CoopInvitation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shareProd, setShareProd] = useState(true);   // cho HTX xem dữ liệu sản xuất khi tham gia (D148)

  const canAcceptCoop = active?.type === 'household' && isOwner(active.roles);

  const load = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const [a, b] = await Promise.all([myInvitations(), myCoopInvitations()]);
      setOrgInv(a);
      setCoopInv(b);
    } catch {
      /* không có mạng hoặc chưa cấu hình: bỏ qua, lần sau sẽ tải lại */
    }
  }, []);

  useEffect(() => { void load(); }, [load, active?.id]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
      await load();
      onChanged?.();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  if (orgInv.length === 0 && (coopInv.length === 0 || !canAcceptCoop)) return null;

  return (
    <div className="card" role="region" aria-label="Lời mời">
      <h2>Lời mời dành cho bạn</h2>
      {error && <p className="msg error" role="alert">{error}</p>}

      {orgInv.map((i) => (
        <div className="invite" key={i.id}>
          <p>
            <strong>{i.org_name}</strong> ({i.org_type === 'cooperative' ? 'HTX' : 'Hộ / trang trại'}) mời bạn làm{' '}
            <strong>{roleSummary(i.roles)}</strong>.
          </p>
          <div className="actions">
            <button className="primary" disabled={busy} onClick={() => run(() => acceptInvitation(i.id))}>Chấp nhận</button>
            <button className="secondary" disabled={busy} onClick={() => run(() => declineInvitation(i.id))}>Từ chối</button>
          </div>
        </div>
      ))}

      {canAcceptCoop && coopInv.map((i) => (
        <div className="invite" key={i.id}>
          <p>
            <strong>HTX {i.coop_name}</strong> mời hộ <strong>{active!.name}</strong> tham gia.
          </p>
          <p className="muted">Vụ bạn chọn ghi theo HTX thì HTX là bên theo dõi và bao tiêu. Chi phí, doanh thu riêng của hộ vẫn chỉ mình bạn xem.</p>
          <label className="check">
            <input type="checkbox" checked={shareProd} onChange={(e) => setShareProd(e.target.checked)} />
            Cho HTX xem (không sửa) dữ liệu sản xuất của hộ: vụ, nhật ký việc, thu hoạch, sự cố. Có thể đổi sau ở Hợp tác xã. Nếu HTX bao tiêu sản phẩm thì phần này bắt buộc.
          </label>
          <div className="actions">
            <button className="primary" disabled={busy} onClick={() => run(() => acceptCoopInvitation(i.id, active!.id, shareProd))}>Tham gia HTX</button>
            <button className="secondary" disabled={busy} onClick={() => run(() => declineCoopInvitation(i.id))}>Từ chối</button>
          </div>
        </div>
      ))}
    </div>
  );
}
