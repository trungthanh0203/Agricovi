import { useEffect, useState, type FormEvent } from 'react';
import { Collapsible } from '../components/Collapsible';
import { InvitationsPanel } from '../components/InvitationsPanel';
import { LicensesSection, licenseStatus } from '../components/LicensesSection';
import { PlanCard } from '../components/PlanCard';
import { QrCard } from '../components/QrCard';
import { useAuth } from '../lib/auth';
import { fmtDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import type { LicenseRow } from '../lib/licenses';
import { useOrgs } from '../lib/orgs';
import { PERM_LEVEL_LABEL, PERM_MODULE_LABEL, PERM_MODULES } from '../lib/permissions';
import { changeMyPassword, fetchDisplayName, fetchMyWork, saveDisplayName, type MyWork } from '../lib/profile';
import { buildAccountQr } from '../lib/qr';
import { hasRole, isOwner, roleSummary } from '../lib/roles';
import { fetchStaffStatus, WORK_MODE_LABEL, type WorkMode } from '../lib/staff';
import { fetchMyPay, fmtVnd, type MyPay } from '../lib/work';

/**
 * Tab Hồ sơ (D40, D50): mọi phần đều THU GỌN được — tài khoản (tên hiển thị, đổi mật khẩu), "Tôi được làm gì", công việc,
 * tiền công, giấy phép/chứng chỉ của cơ sở, mã QR tài khoản, phiên bản app, đăng xuất.
 */
export function ProfileTab({ onAddOrg }: { onAddOrg: () => void }) {
  const { session, signOut } = useAuth();
  const { active, orgs } = useOrgs();
  const [isStaff, setIsStaff] = useState(true); // mặc định ẩn nút cho tới khi biết chắc không phải tài khoản nhân viên
  const [staffName, setStaffName] = useState<string | null>(null);
  const [display, setDisplay] = useState<string | null>(null);
  const [work, setWork] = useState<MyWork | null>(null);
  const [pay, setPay] = useState<MyPay[]>([]);
  const [licenses, setLicenses] = useState<LicenseRow[]>([]);
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
  const soon = licenses.filter((l) => { const s = licenseStatus(l); return s.cls.includes('warn') || s.cls.includes('err'); }).length;

  return (
    <section>
      <h1>Hồ sơ</h1>

      <InvitationsPanel />

      <Collapsible title={shownName || 'Tài khoản'} summary={login} defaultOpen>
        <Collapsible inline title="Đổi tên hiển thị" summary="tên hiện trong nhật ký">
          <NameForm initial={shownName} onSaved={setDisplay} />
        </Collapsible>
        <Collapsible inline title="Đổi mật khẩu">
          <PasswordForm />
        </Collapsible>
      </Collapsible>

      {active && (
        <Collapsible title={`Tôi được làm gì ở ${active.name}`} summary={roleSummary(active.roles)}>
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
        </Collapsible>
      )}

      {work && (work.teamName || work.leadsTeams.length > 0 || work.mode) && (
        <Collapsible title="Công việc của tôi" summary={work.teamName ?? (work.leadsTeams.length > 0 ? `Tổ trưởng ${work.leadsTeams.join(', ')}` : undefined)}>
          {work.teamName && <p>Tổ lao động: <strong>{work.teamName}</strong></p>}
          {work.leadsTeams.length > 0 && <p>Tổ tôi phụ trách (tổ trưởng): <strong>{work.leadsTeams.join(', ')}</strong></p>}
          {work.mode && <p className="muted">Cách tính công: {WORK_MODE_LABEL[work.mode as WorkMode] ?? work.mode}</p>}
        </Collapsible>
      )}

      {pay.length > 0 && (
        <Collapsible title="Tiền công của tôi" summary={`${pay.length} kỳ`}>
          {pay.slice(0, 6).map((p) => (
            <div className="row member" key={p.periodId}>
              <span>{fmtDate(p.start)} – {fmtDate(p.end)}</span>
              <span><strong>{fmtVnd(p.total)}</strong> <span className={p.approved ? 'pill ok' : 'pill warn'}>{p.approved ? 'Đã chốt' : 'Dự tính'}</span></span>
            </div>
          ))}
          <p className="muted">Số "Dự tính" có thể đổi đến khi chủ cơ sở khóa kỳ.</p>
        </Collapsible>
      )}

      {active && hasRole(active.roles, 'manager') && (
        <Collapsible title="Gói dịch vụ" summary={active.name}>
          <PlanCard />
        </Collapsible>
      )}

      {active && (
        <Collapsible title="Giấy phép, chứng chỉ" summary={licenses.length > 0 ? `${licenses.length} giấy${soon > 0 ? ` · ${soon} cần chú ý` : ''}` : 'chưa có'} warn={soon > 0}>
          <LicensesSection orgId={active.id} canEdit={hasRole(active.roles, 'manager')} onLoaded={setLicenses} />
        </Collapsible>
      )}

      {active && (
        <Collapsible title="Mã QR tài khoản" summary="thông tin tài khoản và cơ sở">
          <AccountQr name={shownName} login={login} orgName={active.name} orgType={active.type} orgId={active.id} roles={roleSummary(active.roles)} licenses={licenses} />
        </Collapsible>
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

/** Mã QR tài khoản: tên, cơ sở, vai trò; liên hệ và giấy phép chỉ đưa vào khi người dùng tích chọn */
function AccountQr({ name, login, orgName, orgType, orgId, roles, licenses }: {
  name: string; login: string; orgName: string; orgType: 'household' | 'cooperative'; orgId: string; roles: string; licenses: LicenseRow[];
}) {
  const [withContact, setWithContact] = useState(false);
  const [withLicenses, setWithLicenses] = useState(true);
  const text = buildAccountQr({
    name, orgName, orgType, orgId, roles,
    contact: withContact ? login : null,
    licenses: withLicenses ? licenses.map((l) => ({ name: l.name, expires: l.expires_date })) : [],
  });
  return (
    <>
      <p className="muted">Quét bằng điện thoại để đọc thông tin. Chỉ gồm những gì hiển thị bên dưới.</p>
      <label className="check"><input type="checkbox" checked={withContact} onChange={(e) => setWithContact(e.target.checked)} /> Kèm email/số điện thoại đăng nhập</label>
      <label className="check"><input type="checkbox" checked={withLicenses} onChange={(e) => setWithLicenses(e.target.checked)} /> Kèm danh sách giấy phép, chứng chỉ ({licenses.length})</label>
      <QrCard text={text} filename="qr-tai-khoan.png" />
    </>
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
      <button type="submit" className="primary" disabled={busy}>Lưu</button>
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
      <button type="submit" className="primary" disabled={busy}>Đổi mật khẩu</button>
    </form>
  );
}
