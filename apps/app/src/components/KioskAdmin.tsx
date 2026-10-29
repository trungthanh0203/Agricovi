import { useCallback, useEffect, useState } from 'react';
import { Collapsible } from './Collapsible';
import { fmtDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import {
  deleteWorkerFace, issuePinCode, lastKioskOnDevice, linkThisDeviceAsKiosk, relinkThisDeviceToKiosk, setKioskAskCycle, setWorkerPhone, listKiosks, listPinStatus, revokeKiosk,
  type KioskRow, type PinStatus,
} from '../lib/kiosk';
import { useOrgs } from '../lib/orgs';
import { hasRole } from '../lib/roles';
import { useTable } from '../lib/tables';
import { listWorkers, type WorkerLite } from '../lib/work';


/**
 * Máy chấm công (D111) cho chủ/quản lý: liên kết điện thoại cố định ở phân khu, cấp mã đặt PIN cho người làm, xem ảnh chấm công.
 * Chủ liên kết/ngừng máy; quản lý được cấp mã và xem ảnh. Cần mạng.
 */
export function KioskAdmin({ workers: workersProp, onChanged }: { workers?: WorkerLite[]; onChanged?: () => void }) {
  const { active } = useOrgs();
  const orgId = active?.id;
  const isOwner = hasRole(active?.roles, 'owner');
  const areas = useTable('areas').filter((a) => a.organization_id === orgId);
  const [own, setOwn] = useState<WorkerLite[]>([]);
  const workers = workersProp ?? own;
  const [kiosks, setKiosks] = useState<KioskRow[]>([]);
  const [pins, setPins] = useState<PinStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<Record<string, string>>({}); // mã vừa cấp, chỉ hiện một lần trên màn này
  const [name, setName] = useState('');
  const [areaId, setAreaId] = useState('');
  const [consent, setConsent] = useState(false);
  const [reuse, setReuse] = useState(''); // id máy đã có cần liên kết lại; '' = máy mới
  const [reuseTouched, setReuseTouched] = useState(false);
  const [phones, setPhones] = useState<Record<string, string>>({}); // số điện thoại đang nhập cho người chưa có

  const load = useCallback(async () => {
    if (!orgId || !navigator.onLine) return;
    try {
      const [k, p] = await Promise.all([listKiosks(orgId), listPinStatus(orgId)]);
      setKiosks(k);
      setPins(p);
      if (!workersProp) setOwn(await listWorkers(orgId));
    } catch (e) { setError(friendlyError(e)); }
  }, [orgId, workersProp]);
  useEffect(() => { void load(); }, [load]);
  // Điện thoại này từng làm máy chấm công nào thì chọn sẵn máy đó
  useEffect(() => {
    if (reuseTouched) return;
    const last = lastKioskOnDevice();
    if (last && kiosks.some((k) => k.id === last.id)) setReuse(last.id);
  }, [kiosks, reuseTouched]);

  if (!orgId) return null;
  const activeKiosks = kiosks.filter((k) => k.active);
  const areaName = (id: string | null) => areas.find((a) => a.id === id)?.name ?? 'Cả cơ sở';
  const pinOf = (wid: string) => pins.find((p) => p.wid === wid);
  const staff = workers.filter((w) => w.status === 'active');

  async function link() {
    if (busy || !orgId) return;
    if (!name.trim()) return setError('Hãy đặt tên máy, ví dụ "Máy cổng nhà màng".');
    if (!consent) return setError('Hãy xác nhận đã báo và được người làm đồng ý cho chụp ảnh khi chấm công.');
    if (!window.confirm('Điện thoại này sẽ chuyển thành MÁY CHẤM CÔNG và bạn sẽ bị đăng xuất khỏi máy. Khi chủ cần vào app quản lý: nhập số điện thoại + PIN của chủ ở máy chấm công, chọn “Vào app quản lý” rồi đăng nhập. Tiếp tục?')) return;
    setBusy(true); setError(null);
    try { await linkThisDeviceAsKiosk(orgId, areaId || null, name.trim()); } // thành công: phiên đổi sang tài khoản thiết bị, app tự chuyển sang màn máy chấm công
    catch (e) { setError(friendlyError(e)); setBusy(false); }
  }

  async function relink() {
    if (busy || !orgId || !reuse) return;
    if (!window.confirm('Điện thoại này sẽ chuyển thành MÁY CHẤM CÔNG đã chọn và bạn sẽ bị đăng xuất khỏi máy. Khi chủ cần vào app quản lý: nhập số điện thoại + PIN của chủ ở máy chấm công, chọn “Vào app quản lý” rồi đăng nhập. Tiếp tục?')) return;
    setBusy(true); setError(null);
    try { await relinkThisDeviceToKiosk(orgId, reuse); } // thành công: phiên đổi sang tài khoản thiết bị, app tự chuyển sang màn máy chấm công
    catch (e) { setError(friendlyError(e)); setBusy(false); }
  }

  async function toggleCycle(k: KioskRow) {
    if (busy) return;
    setBusy(true); setError(null);
    try { await setKioskAskCycle(k.id, !k.ask_cycle); await load(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  async function stop(k: KioskRow) {
    if (!orgId || busy || !window.confirm(`Ngừng "${k.name}"? Điện thoại đó sẽ không chấm công được nữa.`)) return;
    setBusy(true); setError(null);
    try { await revokeKiosk(orgId, k.id); await load(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  async function giveCode(w: WorkerLite) {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const c = await issuePinCode(w.id);
      setCodes((cur) => ({ ...cur, [w.id]: c }));
      await load();
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  async function savePhone(w: WorkerLite) {
    if (busy) return;
    setBusy(true); setError(null);
    try { await setWorkerPhone(w.id, phones[w.id] ?? ''); onChanged?.(); await load(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  async function dropFace(w: WorkerLite) {
    if (busy || !window.confirm(`Xóa dữ liệu khuôn mặt của ${w.full_name}? Người này sẽ phải đăng ký lại (chủ cấp mã mới).`)) return;
    setBusy(true); setError(null);
    try { await deleteWorkerFace(w.id); await load(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  return (
    <>
      <Collapsible title="Máy chấm công" summary={activeKiosks.length ? `${activeKiosks.length} máy đang dùng` : 'chưa có máy'}>
        <p className="muted">Một điện thoại để cố định ở phân khu. Người làm nhập số điện thoại + PIN rồi bấm Vào ca / Ra ca, máy chụp ảnh kèm theo. Máy không vào được màn quản lý.</p>
        {error && <p className="msg error" role="alert">{error}</p>}
        {activeKiosks.length > 0 && (
          <ul className="list">
            {activeKiosks.map((k) => (
              <li key={k.id}>
                <strong>{k.name}</strong> · {areaName(k.area_id)} <span className="muted">· từ {fmtDate(k.created_at.slice(0, 10))}</span>
                {isOwner && <button className="link" disabled={busy} onClick={() => void stop(k)}>Ngừng dùng</button>}
                {isOwner && (
                  <label className="check">
                    <input type="checkbox" checked={k.ask_cycle} disabled={busy} onChange={() => void toggleCycle(k)} />
                    Hỏi “làm cho vụ nào” khi Vào ca (để trống nếu người làm không theo một vụ; chi phí nhân công khi đó tính chung cho cơ sở)
                  </label>
                )}
              </li>
            ))}
          </ul>
        )}
        {isOwner ? (
          <Collapsible inline title="＋ Liên kết điện thoại này làm máy chấm công">
            <div className="inline-form">
              {kiosks.length > 0 && (
                <label>
                  Máy chấm công
                  <select value={reuse} onChange={(e) => { setReuse(e.target.value); setReuseTouched(true); }}>
                    <option value="">Máy mới (nhập thông tin bên dưới)</option>
                    {kiosks.map((k) => <option key={k.id} value={k.id}>{k.name} · {areaName(k.area_id)}{k.active ? '' : ' (đã ngừng)'}</option>)}
                  </select>
                  <small>Điện thoại này đã từng làm máy chấm công thì chọn máy đó, bấm một lần là xong. Điện thoại khác thì chọn “Máy mới”.</small>
                </label>
              )}
              {reuse ? (
                <div className="btnrow">
                  <button className="primary" disabled={busy} onClick={() => void relink()}>{busy ? 'Đang liên kết…' : 'Liên kết lại máy này'}</button>
                </div>
              ) : (<>
              <label>Tên máy<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Máy cổng nhà màng" /></label>
              <label>
                Phân khu
                <select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
                  <option value="">Cả cơ sở</option>
                  {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
              <label className="check">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                Tôi đã báo và được người làm đồng ý cho chụp ảnh khi chấm công. Máy chỉ lưu ảnh khi nghi ngờ (không thấy mặt, không khớp, chưa có mẫu…); ảnh chỉ chủ và quản lý xem, giữ 60 ngày.
              </label>
              <div className="btnrow">
                <button className="primary" disabled={busy} onClick={() => void link()}>{busy ? 'Đang liên kết…' : 'Liên kết máy này'}</button>
              </div>
              </>)}
            </div>
          </Collapsible>
        ) : <p className="muted">Chỉ chủ cơ sở được liên kết hoặc ngừng máy chấm công.</p>}
      </Collapsible>

      <Collapsible title="Mã đặt PIN cho người làm" summary={`${pins.filter((p) => p.has_pin).length}/${staff.length} có PIN, ${pins.filter((p) => p.has_face).length} có khuôn mặt`}>
        <p className="muted">Người làm cần số điện thoại trong hồ sơ. Bấm “Cấp mã”, đưa mã 6 số cho họ; họ tự đặt PIN riêng và chụp 3 ảnh khuôn mặt làm mẫu ở máy chấm công (bạn không biết PIN). Mã dùng một lần, hạn 24 giờ. Quên PIN, bị khóa hoặc cần đăng ký lại khuôn mặt: cấp mã mới.</p>
        <table className="grid">
          <thead><tr><th>Người làm</th><th>Trạng thái</th><th></th></tr></thead>
          <tbody>
            {staff.map((w) => {
              const p = pinOf(w.id);
              const code = codes[w.id];
              return (
                <tr key={w.id}>
                  <td>
                    {w.full_name}
                    {w.phone ? <span className="sub">{w.phone}</span> : (
                      <span className="sub">
                        <input inputMode="tel" placeholder="Nhập số điện thoại" value={phones[w.id] ?? ''} onChange={(e) => setPhones((cur) => ({ ...cur, [w.id]: e.target.value }))} />
                        <button className="secondary" disabled={busy} onClick={() => void savePhone(w)}>Lưu số</button>
                      </span>
                    )}
                  </td>
                  <td>
                    {code ? <strong>Mã: {code}</strong> : p?.is_locked ? 'Đang bị khóa' : p?.code_pending ? 'Chờ đặt PIN' : p?.has_pin ? (p.has_face ? 'Đã có PIN + khuôn mặt' : 'Đã có PIN, chưa có khuôn mặt') : 'Chưa có PIN'}
                  </td>
                  <td>
                    <button className="secondary" disabled={busy || !w.phone} onClick={() => void giveCode(w)}>Cấp mã</button>
                    {p?.has_face && <button className="link" disabled={busy} onClick={() => void dropFace(w)}>Xóa khuôn mặt</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Collapsible>

    </>
  );
}
