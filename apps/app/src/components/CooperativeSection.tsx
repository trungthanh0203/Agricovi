import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { friendlyError } from '../lib/errors';
import { Collapsible } from './Collapsible';
import {
  createMemberHousehold, inviteHousehold, leaveCooperative, listCoopHouseholds, myCooperative,
  pendingCoopInvites, removeHousehold, revokeCoopInvitation, updateCoopHousehold,
  type CoopHousehold, type HouseholdInfo, type MyCooperative, type PendingInvite,
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

const EMPTY_INFO: HouseholdInfo = { member_code: '', head_name: '', phone: '', address: '', main_products: '', area_ha: null, note: '', activity_status: 'active', certificates: '' };
const infoOf = (h: CoopHousehold): HouseholdInfo => ({
  member_code: h.member_code ?? '', head_name: h.head_name ?? '', phone: h.phone ?? '', address: h.address ?? '',
  main_products: h.main_products ?? '', area_ha: h.area_ha != null ? Number(h.area_ha) : null, note: h.note ?? '',
  activity_status: h.activity_status ?? 'active', certificates: h.certificates ?? '',
});

/**
 * Hộ thành viên của HTX dạng lưới: mã hộ, tên hộ (và chủ hộ), điện thoại, địa chỉ, sản phẩm chính, diện tích, số vụ đang chạy.
 * Thêm/sửa ở một biểu mẫu riêng. Thông tin này do HTX ghi để quản lý; dữ liệu sản xuất của hộ vẫn thuộc hộ.
 */
function ForCooperative({ org }: { org: MyOrg }) {
  const { setActive } = useOrgs();
  const canManage = canPerm(org.perms, 'coop', 'edit');
  const [households, setHouseholds] = useState<CoopHousehold[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [email, setEmail] = useState('');
  const [form, setForm] = useState<string | 'new' | null>(null); // hộ đang sửa hoặc thêm mới
  const [name, setName] = useState('');
  const [f, setF] = useState<HouseholdInfo>(EMPTY_INFO);
  const [areaText, setAreaText] = useState('');

  const load = useCallback(async () => {
    if (!navigator.onLine) return;
    const [h, i] = await Promise.all([listCoopHouseholds(org.id), canManage ? pendingCoopInvites(org.id) : Promise.resolve([])]);
    setHouseholds(h);
    setInvites(i);
  }, [org.id, canManage]);
  const r = useRunner(load);
  useEffect(() => { load().catch((e) => r.setError(friendlyError(e))); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  function openForm(h: CoopHousehold | null) {
    setForm(h ? h.household_org_id : 'new');
    setName(h?.name ?? '');
    const info = h ? infoOf(h) : EMPTY_INFO;
    setF(info);
    setAreaText(info.area_ha != null ? String(info.area_ha) : '');
    r.setError(null);
  }
  const set = (k: keyof HouseholdInfo) => (e: { target: { value: string } }) => setF((cur) => ({ ...cur, [k]: e.target.value }));

  function onSave(e: FormEvent) {
    e.preventDefault();
    const isNew = form === 'new';
    if (isNew && name.trim().length < 2) return r.setError('Tên hộ cần ít nhất 2 ký tự.');
    const n = areaText.trim() === '' ? null : Number(areaText.replace(',', '.'));
    if (n !== null && (Number.isNaN(n) || n < 0)) return r.setError('Diện tích phải là số không âm (đơn vị ha).');
    const info = { ...f, area_ha: n };
    const id = form;
    void r.run(async () => {
      if (isNew) {
        const hid = await createMemberHousehold(org.id, name);
        if (Object.values(info).some((v) => v !== '' && v !== null)) await updateCoopHousehold(org.id, hid, info);
      } else if (id) {
        await updateCoopHousehold(org.id, id, info);
      }
      setForm(null);
    }, isNew ? 'Đã thêm hộ thành viên. Bấm ➜ ở dòng của hộ để ghi dữ liệu cho hộ.' : 'Đã lưu.');
  }
  function onInvite(e: FormEvent) {
    e.preventDefault();
    if (!email.includes('@')) return r.setError('Hãy nhập email của chủ hộ.');
    void r.run(async () => { await inviteHousehold(org.id, email); setEmail(''); },
      'Đã gửi lời mời. Chủ hộ đăng nhập bằng đúng email này sẽ thấy lời mời tham gia HTX.');
  }

  if (form !== null) {
    const isNew = form === 'new';
    return (
      <>
        <div className="menubar">
          <button className="menu-back" onClick={() => setForm(null)} aria-label="Quay lại danh sách hộ thành viên">‹ Danh sách</button>
          <strong className="menu-cur">{isNew ? 'Thêm hộ thành viên' : name}</strong>
        </div>
        {r.error && <p className="msg error" role="alert">{r.error}</p>}
        <form onSubmit={onSave} className="inline-form" noValidate>
          {isNew && <p className="muted">Dành cho hộ chưa có tài khoản hoặc điện thoại. HTX sẽ là bên quản lý dữ liệu của hộ này, và hộ chưa thể rời HTX cho tới khi chuyển quyền chủ hộ. Hộ đã có tài khoản thì mời bằng email ở dưới danh sách.</p>}
          <label>Tên hộ
            <input value={name} maxLength={120} disabled={!isNew} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Hộ ông Nguyễn Văn A" />
          </label>
          <div className="pair">
            <label>Mã hộ / số thẻ thành viên<input value={f.member_code} maxLength={40} onChange={set('member_code')} placeholder="Ví dụ: HV-001" /></label>
            <label>Họ tên chủ hộ<input value={f.head_name} maxLength={120} onChange={set('head_name')} /></label>
          </div>
          <label>Số điện thoại<input type="tel" inputMode="tel" value={f.phone} maxLength={30} onChange={set('phone')} /></label>
          <label>Địa chỉ (thôn/ấp, xã, huyện)<input value={f.address} maxLength={200} onChange={set('address')} /></label>
          <label>Sản phẩm chính<input value={f.main_products} maxLength={200} onChange={set('main_products')} placeholder="Ví dụ: Dưa lưới, heo thịt" /></label>
          <label>Giấy chứng nhận (VietGAP, OCOP…)<input value={f.certificates} maxLength={300} onChange={set('certificates')} placeholder="Ví dụ: VietGAP dưa lưới (hết hạn 06/2027), OCOP 3 sao" /></label>
          <label>Diện tích sản xuất (ha)<input inputMode="decimal" value={areaText} onChange={(e) => setAreaText(e.target.value)} /></label>
          <label>Trạng thái hộ
            <select value={f.activity_status} onChange={(e) => setF((cur) => ({ ...cur, activity_status: e.target.value as 'active' | 'paused' }))}>
              <option value="active">Đang hoạt động</option>
              <option value="paused">Tạm ngưng</option>
            </select>
          </label>
          <label>Ghi chú<textarea rows={2} maxLength={500} value={f.note} onChange={set('note')} /></label>
          <div className="btnrow">
            <button type="submit" className="primary" disabled={r.busy}>Lưu</button>
            <button type="button" className="secondary" onClick={() => setForm(null)}>Hủy</button>
          </div>
        </form>
      </>
    );
  }

  return (
    <>
      <h2 className="sect">Hộ thành viên{households.length > 0 ? ` (${households.length} hộ${invites.length > 0 ? ` · ${invites.length} lời mời chờ` : ''})` : ''}</h2>
      <p className="muted">Số hộ không bị giới hạn; hạn mức chỉ tính theo số vụ đang chạy của HTX.</p>
      {r.error && <p className="msg error" role="alert">{r.error}</p>}
      {r.info && <p className="msg ok" role="status">{r.info}</p>}
      {canManage && <button className="secondary" disabled={!navigator.onLine} onClick={() => openForm(null)}>+ Thêm hộ thành viên</button>}

      <div className="tablewrap">
        <table className="grid">
          <thead><tr><th>Mã hộ</th><th>Hộ</th><th>Điện thoại</th><th>Địa chỉ</th><th>Sản phẩm chính</th><th>Giấy chứng nhận</th><th className="num">Diện tích (ha)</th><th>Ngày vào HTX</th><th className="num">Vụ đang chạy</th><th>Trạng thái</th><th></th></tr></thead>
          <tbody>
            {households.length === 0 && <tr><td colSpan={11} className="muted">Chưa có hộ thành viên.</td></tr>}
            {households.map((h) => (
              <tr key={h.household_org_id} className={h.activity_status === 'paused' ? 'off' : ''}>
                <td>{h.member_code ?? ''}</td>
                <td>
                  <strong>{h.name}</strong>
                  {h.head_name && <span className="sub">Chủ hộ: {h.head_name}</span>}
                  {h.managed && <span className="pill">Do HTX quản lý</span>}
                </td>
                <td>{h.phone ?? ''}</td>
                <td>{h.address ?? ''}</td>
                <td>{h.main_products ?? ''}</td>
                <td>{h.certificates ?? ''}</td>
                <td className="num">{h.area_ha != null ? Number(h.area_ha).toLocaleString('vi-VN') : ''}</td>
                <td>{h.joined_at ? new Date(h.joined_at).toLocaleDateString('vi-VN') : ''}</td>
                <td className="num">{h.active_coop_cycles}</td>
                <td>{h.activity_status === 'paused' ? <span className="pill warn">Tạm ngưng</span> : <span className="pill ok">Đang hoạt động</span>}</td>
                <td className="act">
                  {canManage && <button className="icon" aria-label={`Sửa ${h.name}`} onClick={() => openForm(h)}>✎</button>}{' '}
                  {h.managed && <button className="icon" aria-label={`Làm việc ở hộ ${h.name}`} title="Làm việc ở hộ này" onClick={() => setActive(h.household_org_id)}>➜</button>}{' '}
                  {isOwner(org.roles) && !h.managed && (
                    <button className="icon" disabled={r.busy} aria-label={`Gỡ ${h.name} khỏi HTX`}
                      onClick={() => window.confirm(`Gỡ hộ "${h.name}" khỏi HTX?`) && void r.run(() => removeHousehold(org.id, h.household_org_id))}>🗑</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">✎ sửa thông tin · ➜ làm việc ở hộ do HTX quản lý · 🗑 gỡ hộ khỏi HTX (chỉ hộ tự tham gia).</p>

      {invites.length > 0 && <h3 className="sub">Lời mời đang chờ hộ chấp nhận</h3>}
      {invites.map((i) => (
        <div className="row member" key={i.id}>
          <span className="grow">{i.email}</span>
          <button className="link" disabled={r.busy} onClick={() => void r.run(() => revokeCoopInvitation(i.id))}>Hủy lời mời</button>
        </div>
      ))}

      {canManage && (
        <Collapsible inline title="＋ Mời hộ đã có tài khoản">
          <form onSubmit={onInvite} className="inline-form" noValidate>
            <label>
              Email chủ hộ
              <input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <button type="submit" className="secondary" disabled={r.busy}>Gửi lời mời</button>
          </form>
        </Collapsible>
      )}
    </>
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
