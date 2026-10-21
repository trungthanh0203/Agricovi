import { useEffect, useState, type FormEvent } from 'react';
import { Collapsible } from '../components/Collapsible';
import { InvitationsPanel } from '../components/InvitationsPanel';
import { useAuth } from '../lib/auth';
import { friendlyError } from '../lib/errors';
import { useOrgs } from '../lib/orgs';
import { PERM_LEVEL_LABEL, PERM_MODULE_LABEL, PERM_MODULES } from '../lib/permissions';
import { changeMyPassword, fetchDisplayName, fetchMyWork, saveDisplayName, type MyWork } from '../lib/profile';
import { isOwner, roleSummary } from '../lib/roles';
import { fetchMyPay, fmtVnd, type MyPay } from '../lib/work';
import { fmtDate } from '../lib/dates';
import { fetchStaffStatus, WORK_MODE_LABEL, type WorkMode } from '../lib/staff';

/**
 * Tab Hồ sơ (D40): tên hiển thị (sửa được), tài khoản đăng nhập, đổi mật khẩu, chức vụ và "Tôi được làm gì" bằng chữ thường,
 * tổ đang làm/phụ trách, phiên bản app, đăng xuất.
 */
export function ProfileTab({ onAddOrg }: { onAddOrg: () => void }) {
  const { session, signOut } = useAuth();
  const { active, orgs } = useOrgs();
  const [isStaff, setIsStaff] = useState(true); // mặc định ẩn nút cho tới khi biết chắc không phải tài khoản nhân viên
  const [staffName, setStaffName] = useState<string | null>(null);
  const [display, setDisplay] = useState<string | null>(null);
  const [work, setWork] = useState<MyWork | null>(null);
  const [pay, setPay] = useState<MyPay[]>([]);
  const uid = session?.user.id;

  useEffect(() => {
    if (!uid) return;
    void fetchStaffStatus(uid).then((s) => { setIsStaff(Boolean(s?.is_staff)); setStaffName(s?.full_name ?? null); });
    void fetchDisplayName(uid).then(setDisplay).catch(() => undefined);
  }, [uid]);
  useEffect(() => {
    if (uid && active) void fetchMyWork(uid, active.id).then(setWork).catch(() => setWork(null));
  }, [uid, active]);

  useEffect(() => {
    if (work?.workerId) void fetchMyPay(work.workerId).then(setPay).catch(() => setPay([]));
    else setPay([]);
  }, [work?.workerId]);

  const ownsOrg = orgs.some((o) => isOwner(o.roles));
  const email = session?.user.email ?? '';
  const login = email.includes('@sdt.') ? `Số điện thoại ${email.split('@')[0]}` : email; // nhân viên đăng nhập bằng số điện thoại
  const shownName = display ?? staffName ?? email.split('@')[0] ?? '';

  return (
    <section>
      <h1>Hồ sơ</h1>

      <InvitationsPanel />

      <div className="card">
        <strong>{shownName}</strong>
        <p className="muted">{login}</p>
        <Collapsible inline title="Đổi tên hiển thị" summary="tên hiện trong nhật ký">
          <NameForm initial={shownName} onSaved={setDisplay} />
        </Collapsible>
        <Collapsible inline title="Đổi mật khẩu">
          <PasswordForm />
        </Collapsible>
      </div>

      {active && (
        <div className="card">
          <h2>Tôi được làm gì ở {active.name}</h2>
          <p className="muted">Vai trò: {roleSummary(active.roles)}</p>
          {(active.positions ?? []).length > 0 && <p className="muted">Vai trò tự tạo: {(active.positions ?? []).map((p) => p.name).join(', ')}</p>}
          {active.allowedWorkTypes && <p className="muted">Chỉ ghi được {active.allowedWorkTypes.length} loại việc được phân công.</p>}
          {active.canManageStages && <p className="muted">Được bắt đầu/hoàn thành và sửa giai đoạn của vụ.</p>}
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

      {work && (work.teamName || work.leadsTeams.length > 0 || work.mode) && (
        <div className="card">
          <h2>Công việc của tôi</h2>
          {work.teamName && <p>Tổ lao động: <strong>{work.teamName}</strong></p>}
          {work.leadsTeams.length > 0 && <p>Tổ tôi phụ trách (tổ trưởng): <strong>{work.leadsTeams.join(', ')}</strong></p>}
          {work.mode && <p className="muted">Cách tính công: {WORK_MODE_LABEL[work.mode as WorkMode] ?? work.mode}</p>}
        </div>
      )}

      {pay.length > 0 && (
        <div className="card">
          <h2>Tiền công của tôi</h2>
          {pay.slice(0, 6).map((p) => (
            <div className="row member" key={p.periodId}>
              <span>{fmtDate(p.start)} – {fmtDate(p.end)}</span>
              <span><strong>{fmtVnd(p.total)}</strong> <span className={p.approved ? 'pill ok' : 'pill warn'}>{p.approved ? 'Đã chốt' : 'Dự tính'}</span></span>
            </div>
          ))}
          <p className="muted">Số "Dự tính" có thể đổi đến khi chủ cơ sở khóa kỳ.</p>
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

function NameForm({ initial, onSaved }: { initial: string; onSaved: (n: string) => void }) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return setMsg({ ok: false, text: 'Tên cần ít nhất 2 ký tự.' });
    setBusy(true);
    setMsg(null);
    saveDisplayName(name)
      .then((n) => { onSaved(n); setMsg({ ok: true, text: 'Đã lưu. Tên mới hiện ở các nhật ký bạn ghi từ bây giờ.' }); })
      .catch((err) => setMsg({ ok: false, text: friendlyError(err) }))
      .finally(() => setBusy(false));
  }
  return (
    <form className="inline-form" onSubmit={onSubmit} noValidate>
      <label>Tên hiển thị<input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></label>
      {msg && <p className={msg.ok ? 'msg ok' : 'msg error'} role="status">{msg.text}</p>}
      <button type="submit" className="secondary" disabled={busy}>Lưu tên</button>
    </form>
  );
}

function PasswordForm() {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return setMsg({ ok: false, text: 'Mật khẩu mới cần ít nhất 8 ký tự.' });
    if (pw !== pw2) return setMsg({ ok: false, text: 'Hai lần nhập mật khẩu chưa giống nhau.' });
    setBusy(true);
    setMsg(null);
    changeMyPassword(pw)
      .then(() => { setPw(''); setPw2(''); setMsg({ ok: true, text: 'Đã đổi mật khẩu.' }); })
      .catch((err) => setMsg({ ok: false, text: friendlyError(err) }))
      .finally(() => setBusy(false));
  }
  return (
    <form className="inline-form" onSubmit={onSubmit} noValidate>
      <label>Mật khẩu mới<input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
      <label>Nhập lại mật khẩu mới<input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></label>
      {msg && <p className={msg.ok ? 'msg ok' : 'msg error'} role="status">{msg.text}</p>}
      <button type="submit" className="secondary" disabled={busy}>Đổi mật khẩu</button>
    </form>
  );
}
