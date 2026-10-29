import { useCallback, useEffect, useState } from 'react';
import { Collapsible } from './Collapsible';
import { addDays, fmtDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { todayLocal } from '../lib/hooks';
import {
  FLAG_LABEL, SOFT_FLAGS, deleteWorkerFace, issuePinCode, linkThisDeviceAsKiosk, listFaceRefPhotos, listKiosks, listPhotoReview, listPinStatus, revokeKiosk,
  type KioskRow, type PhotoReviewRow, type PinStatus,
} from '../lib/kiosk';
import { useOrgs } from '../lib/orgs';
import { hasRole } from '../lib/roles';
import { useTable } from '../lib/tables';
import type { WorkerLite } from '../lib/work';

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

/**
 * Máy chấm công (D111) cho chủ/quản lý: liên kết điện thoại cố định ở phân khu, cấp mã đặt PIN cho người làm, xem ảnh chấm công.
 * Chủ liên kết/ngừng máy; quản lý được cấp mã và xem ảnh. Cần mạng.
 */
export function KioskAdmin({ workers }: { workers: WorkerLite[] }) {
  const { active } = useOrgs();
  const orgId = active?.id;
  const isOwner = hasRole(active?.roles, 'owner');
  const areas = useTable('areas').filter((a) => a.organization_id === orgId);
  const [kiosks, setKiosks] = useState<KioskRow[]>([]);
  const [pins, setPins] = useState<PinStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<Record<string, string>>({}); // mã vừa cấp, chỉ hiện một lần trên màn này
  const [name, setName] = useState('');
  const [areaId, setAreaId] = useState('');
  const [consent, setConsent] = useState(false);

  const load = useCallback(async () => {
    if (!orgId || !navigator.onLine) return;
    try {
      const [k, p] = await Promise.all([listKiosks(orgId), listPinStatus(orgId)]);
      setKiosks(k);
      setPins(p);
    } catch (e) { setError(friendlyError(e)); }
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);

  if (!orgId) return null;
  const activeKiosks = kiosks.filter((k) => k.active);
  const areaName = (id: string | null) => areas.find((a) => a.id === id)?.name ?? 'Cả cơ sở';
  const pinOf = (wid: string) => pins.find((p) => p.wid === wid);
  const staff = workers.filter((w) => w.status === 'active');

  async function link() {
    if (busy || !orgId) return;
    if (!name.trim()) return setError('Hãy đặt tên máy, ví dụ "Máy cổng nhà màng".');
    if (!consent) return setError('Hãy xác nhận đã báo và được người làm đồng ý cho chụp ảnh khi chấm công.');
    if (!window.confirm('Điện thoại này sẽ chuyển thành MÁY CHẤM CÔNG và bạn sẽ bị đăng xuất khỏi máy. Muốn thoát chế độ này sau đó phải nhập mật khẩu chủ cơ sở. Tiếp tục?')) return;
    setBusy(true); setError(null);
    try { await linkThisDeviceAsKiosk(orgId, areaId || null, name.trim()); } // thành công: phiên đổi sang tài khoản thiết bị, app tự chuyển sang màn máy chấm công
    catch (e) { setError(friendlyError(e)); setBusy(false); }
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
              </li>
            ))}
          </ul>
        )}
        {isOwner ? (
          <Collapsible inline title="＋ Liên kết điện thoại này làm máy chấm công">
            <div className="inline-form">
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
                Tôi đã báo và được người làm đồng ý cho chụp ảnh khi chấm công (ảnh chỉ chủ và quản lý xem, giữ 60 ngày).
              </label>
              <div className="btnrow">
                <button className="primary" disabled={busy} onClick={() => void link()}>{busy ? 'Đang liên kết…' : 'Liên kết máy này'}</button>
              </div>
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
                  <td>{w.full_name}</td>
                  <td>
                    {code ? <strong>Mã: {code}</strong> : p?.is_locked ? 'Đang bị khóa' : p?.code_pending ? 'Chờ đặt PIN' : p?.has_pin ? (p.has_face ? 'Đã có PIN + khuôn mặt' : 'Đã có PIN, chưa có khuôn mặt') : 'Chưa có PIN'}
                  </td>
                  <td>
                    <button className="secondary" disabled={busy} onClick={() => void giveCode(w)}>Cấp mã</button>
                    {p?.has_face && <button className="link" disabled={busy} onClick={() => void dropFace(w)}>Xóa khuôn mặt</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Collapsible>

      <PhotoReview orgId={orgId} />
    </>
  );
}

function PhotoReview({ orgId }: { orgId: string }) {
  const [day, setDay] = useState(todayLocal());
  const [rows, setRows] = useState<PhotoReviewRow[] | null>(null);
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [onlyFlag, setOnlyFlag] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const r = await listPhotoReview(orgId, day, day);
      setRows(r);
      setRefs(await listFaceRefPhotos([...new Set(r.map((x) => x.wk_id))]).catch(() => ({})));
      setError(null);
    } catch (e) { setError(friendlyError(e)); }
  }, [orgId, day]);
  useEffect(() => { if (open) void load(); }, [open, load]);

  // Cờ nhẹ (chưa kiểm được, chưa có mẫu, khớp chưa chắc) chỉ là ghi chú, không tính là đáng ngờ
  const suspicious = (r: PhotoReviewRow) => r.ph_flags.some((f) => !SOFT_FLAGS.includes(f));
  const shown = (rows ?? []).filter((r) => !onlyFlag || suspicious(r));
  const nFlag = (rows ?? []).filter(suspicious).length;

  return (
    <details className="fold" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>
        <span className="fold-title">Ảnh chấm công</span>
        <span className={nFlag ? 'fold-sum warn' : 'fold-sum'}>{rows ? (nFlag ? `${nFlag} ảnh cần xem` : `${rows.length} ảnh`) : 'đối chiếu người vào/ra ca'}</span>
      </summary>
      <div className="fold-body">
        <div className="filters">
          <label>Ngày<input type="date" value={day} max={todayLocal()} onChange={(e) => setDay(e.target.value || todayLocal())} /></label>
          <div className="btnrow">
            <button className="secondary" onClick={() => setDay(addDays(day, -1))}>◀ Hôm trước</button>
            <button className="secondary" disabled={day >= todayLocal()} onClick={() => setDay(addDays(day, 1))}>Hôm sau ▶</button>
          </div>
          <label className="check"><input type="checkbox" checked={onlyFlag} onChange={(e) => setOnlyFlag(e.target.checked)} />Chỉ ảnh cần xem</label>
        </div>
        {error && <p className="msg error" role="alert">{error}</p>}
        {rows && shown.length === 0 && <p className="muted">Không có ảnh nào{onlyFlag ? ' cần xem' : ''} trong ngày này.</p>}
        <div className="photo-grid">
          {shown.map((r) => (
            <figure key={r.ph_id} className={suspicious(r) ? 'photo flag' : 'photo'}>
              <div className="photo-pair">
                <img loading="lazy" alt={`${r.wk_name} ${r.ph_kind === 'in' ? 'vào ca' : 'ra ca'}`} src={`data:image/jpeg;base64,${r.ph_photo}`} />
                {refs[r.wk_id] && <img className="ref" loading="lazy" alt={`Ảnh mẫu của ${r.wk_name}`} title="Ảnh mẫu" src={`data:image/jpeg;base64,${refs[r.wk_id]}`} />}
              </div>
              <figcaption>
                <strong>{r.wk_name}</strong><br />
                {r.ph_kind === 'in' ? 'Vào ca' : 'Ra ca'} {hhmm(r.ph_at)}
                {r.ph_distance !== null && <span className="muted"> · cách mẫu {r.ph_distance.toFixed(2)}</span>}
                {r.area_name ? <><br /><span className="muted">{r.area_name}</span></> : null}
                {r.ph_flags.map((f) => <span key={f} className={SOFT_FLAGS.includes(f) ? 'pill' : 'pill warn'}>{FLAG_LABEL[f] ?? f}</span>)}
              </figcaption>
            </figure>
          ))}
        </div>
        <p className="muted">Ảnh nhỏ góc dưới là ảnh mẫu khi đăng ký. “Cách mẫu” càng nhỏ càng giống (dưới 0,50 là khớp, từ 0,60 là có thể khác người). Ảnh được giữ 60 ngày. Thấy ảnh không đúng người: tìm công đó ở “Công gần đây” và từ chối kèm lý do.</p>
      </div>
    </details>
  );
}
