import { useEffect, useState } from 'react';
import { InvitationsPanel } from '../components/InvitationsPanel';
import { useAuth } from '../lib/auth';
import { useOrgs } from '../lib/orgs';
import { PERM_LEVEL_LABEL, PERM_MODULE_LABEL, PERM_MODULES } from '../lib/permissions';
import { isOwner, roleSummary } from '../lib/roles';
import { fetchStaffStatus } from '../lib/staff';

/**
 * Tab Hồ sơ: thông tin tài khoản đang đăng nhập và các chức năng được phân công.
 * Bản đầu: tài khoản, lời mời, "Tôi được làm gì". Sắp có (kế hoạch P4): tên hiển thị, đổi mật khẩu, việc được giao, tổ phụ trách.
 */
export function ProfileTab({ onAddOrg }: { onAddOrg: () => void }) {
  const { session, signOut } = useAuth();
  const { active, orgs } = useOrgs();
  const [isStaff, setIsStaff] = useState(true); // mặc định ẩn nút cho tới khi biết chắc không phải tài khoản nhân viên
  const uid = session?.user.id;

  useEffect(() => {
    if (uid) void fetchStaffStatus(uid).then((s) => setIsStaff(Boolean(s?.is_staff)));
  }, [uid]);

  const ownsOrg = orgs.some((o) => isOwner(o.roles));

  return (
    <section>
      <h1>Hồ sơ</h1>

      <InvitationsPanel />

      <div className="card">
        <strong>{session?.user.email}</strong>
        <p className="muted">Tài khoản đăng nhập</p>
      </div>

      {active && (
        <div className="card">
          <h2>Tôi được làm gì ở {active.name}</h2>
          <p className="muted">Chức vụ: {roleSummary(active.roles)}</p>
          {PERM_MODULES.map((m) => (
            <div className="row member" key={m}>
              <span>{PERM_MODULE_LABEL[m]}</span>
              <span className={active.perms[m] === 'none' ? 'pill' : active.perms[m] === 'edit' ? 'pill ok' : 'pill warn'}>
                {PERM_LEVEL_LABEL[active.perms[m]]}
              </span>
            </div>
          ))}
          <p className="muted">Chủ cơ sở cấp quyền cho từng người. Thay đổi có hiệu lực khi bạn mở lại app.</p>
        </div>
      )}

      <div className="card">
        <p className="muted">Phiên bản app: {__APP_VERSION__}</p>
        <div className="actions">
          {!ownsOrg && !isStaff && <button className="secondary" onClick={onAddOrg}>Tạo cơ sở của riêng tôi</button>}
          <button className="secondary" onClick={() => void signOut()}>Đăng xuất</button>
        </div>
      </div>
    </section>
  );
}
