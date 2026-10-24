import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { friendlyError } from '../lib/errors';
import { Collapsible } from './Collapsible';
import {
  createMemberHousehold, inviteHousehold, leaveCooperative, listCoopHouseholds, myCooperative,
  pendingCoopInvites, removeHousehold, revokeCoopInvitation,
  type CoopHousehold, type MyCooperative, type PendingInvite,
} from '../lib/members';
import { useOrgs, type MyOrg } from '../lib/orgs';
import { canPerm } from '../lib/permissions';
import { isOwner } from '../lib/roles';

/** HTX: quản lý các hộ thành viên. Cùng một khối dùng cho HTX (danh sách hộ) và cho Hộ (HTX mình thuộc). */
export function CooperativeSection({ org }: { org: MyOrg }) {
  return org.type === 'cooperative' ? <ForCooperative org={org} /> : <ForHousehold org={org} />;
}

function useRunner(reload: () => Promise<void>) {
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<unknown>, done?: string) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await fn();
      if (done) setInfo(done);
      await reload();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  return { error, info, busy, run, setError };
}

function ForCooperative({ org }: { org: MyOrg }) {
  const { refresh, setActive } = useOrgs();
  const canManage = canPerm(org.perms, 'coop', 'edit');
  const [households, setHouseholds] = useState<CoopHousehold[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');

  const load = useCallback(async () => {
    if (!navigator.onLine) return;
    const [h, i] = await Promise.all([listCoopHouseholds(org.id), canManage ? pendingCoopInvites(org.id) : Promise.resolve([])]);
    setHouseholds(h);
    setInvites(i);
  }, [org.id, canManage]);
  const r = useRunner(load);
  useEffect(() => { load().catch((e) => r.setError(friendlyError(e))); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  function onInvite(e: FormEvent) {
    e.preventDefault();
    if (!email.includes('@')) return r.setError('Hãy nhập email của chủ hộ.');
    void r.run(async () => { await inviteHousehold(org.id, email); setEmail(''); },
      'Đã gửi lời mời. Chủ hộ đăng nhập bằng đúng email này sẽ thấy lời mời tham gia HTX.');
  }
  function onCreate(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return r.setError('Tên hộ cần ít nhất 2 ký tự.');
    void r.run(async () => {
      const id = await createMemberHousehold(org.id, name);
      setName('');
      await refresh();
      setActive(id); // chuyển sang làm việc ở hộ vừa tạo
    });
  }

  return (
    <Collapsible title="Hộ thành viên" summary={households.length > 0 ? `${households.length} hộ${invites.length > 0 ? ` · ${invites.length} lời mời chờ` : ''}` : 'Chưa có hộ'}>
      <p className="muted">Số hộ không bị giới hạn; hạn mức chỉ tính theo số vụ đang chạy của HTX.</p>
      {r.error && <p className="msg error" role="alert">{r.error}</p>}
      {r.info && <p className="msg ok" role="status">{r.info}</p>}
      {households.length === 0 && <p className="muted">Chưa có hộ thành viên.</p>}

      {households.map((h) => (
        <div className="member" key={h.household_org_id}>
          <div className="row">
            <strong className="grow">{h.name}</strong>
            {h.managed && <span className="pill">Do HTX quản lý</span>}
          </div>
          <p className="muted">Vụ ghi theo HTX đang chạy: {h.active_coop_cycles}</p>
          <div className="actions">
            {h.managed && <button className="secondary" onClick={() => setActive(h.household_org_id)}>Làm việc ở hộ này</button>}
            {isOwner(org.roles) && !h.managed && (
              <button className="link" disabled={r.busy}
                onClick={() => window.confirm(`Gỡ hộ "${h.name}" khỏi HTX?`) && void r.run(() => removeHousehold(org.id, h.household_org_id))}>
                Gỡ khỏi HTX
              </button>
            )}
          </div>
        </div>
      ))}

      {invites.length > 0 && <h3 className="sub">Lời mời đang chờ hộ chấp nhận</h3>}
      {invites.map((i) => (
        <div className="row member" key={i.id}>
          <span className="grow">{i.email}</span>
          <button className="link" disabled={r.busy} onClick={() => void r.run(() => revokeCoopInvitation(i.id))}>Hủy lời mời</button>
        </div>
      ))}

      {canManage && (
        <>
          <Collapsible inline title="＋ Mời hộ đã có tài khoản">
          <form onSubmit={onInvite} className="inline-form" noValidate>
            <label>
              Email chủ hộ
              <input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <button type="submit" className="secondary" disabled={r.busy}>Gửi lời mời</button>
          </form>
          </Collapsible>

          <Collapsible inline title="＋ Tạo hộ thành viên">
          <form onSubmit={onCreate} className="inline-form" noValidate>
            <p className="muted">Dành cho hộ chưa có tài khoản hoặc điện thoại. HTX sẽ là bên quản lý dữ liệu của hộ này, và hộ chưa thể rời HTX cho tới khi chuyển quyền chủ hộ.</p>
            <label>
              Tên hộ
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Hộ ông Nguyễn Văn A" />
            </label>
            <button type="submit" className="secondary" disabled={r.busy}>Tạo hộ thành viên</button>
          </form>
          </Collapsible>
        </>
      )}
    </Collapsible>
  );
}

function ForHousehold({ org }: { org: MyOrg }) {
  const [coop, setCoop] = useState<MyCooperative | null | undefined>(undefined);
  const load = useCallback(async () => {
    if (!navigator.onLine) return;
    const rows = await myCooperative(org.id);
    setCoop(rows[0] ?? null);
  }, [org.id]);
  const r = useRunner(load);
  useEffect(() => { load().catch((e) => r.setError(friendlyError(e))); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Collapsible title="Hợp tác xã" summary={coop === undefined ? 'Đang tải…' : coop ? coop.name : 'Chưa tham gia'}>
      {r.error && <p className="msg error" role="alert">{r.error}</p>}
      {coop === undefined && <p className="muted">Đang tải…</p>}
      {coop === null && <p className="muted">Hộ chưa tham gia HTX nào. Khi HTX mời bằng email của bạn, lời mời sẽ hiện ở đầu trang này.</p>}
      {coop && (
        <>
          <p>Đang tham gia: <strong>{coop.name}</strong>{coop.managed && ' (HTX quản lý hộ này)'}</p>
          <p className="muted">Mỗi hộ chỉ thuộc một HTX.</p>
          {isOwner(org.roles) && !coop.managed && (
            <button className="secondary" disabled={r.busy}
              onClick={() => window.confirm(`Rời HTX ${coop.name}?`) && void r.run(() => leaveCooperative(org.id))}>
              Rời HTX
            </button>
          )}
        </>
      )}
    </Collapsible>
  );
}
