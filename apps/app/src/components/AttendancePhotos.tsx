import { useCallback, useEffect, useState } from 'react';
import { addDays } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { todayLocal } from '../lib/hooks';
import { FLAG_LABEL, SOFT_FLAGS, listFaceRefPhotos, listPhotoReview, type PhotoReviewRow } from '../lib/kiosk';

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

/**
 * Ảnh chấm công cần xem (D115): máy chỉ lưu ảnh khi có CỜ ĐỎ (không thấy mặt, không khớp khuôn mặt, phải chụp lại nhiều lần,
 * quên Ra ca, hai người bấm sát nhau). Đúng người thì không có ảnh ở đây. Chủ/quản lý xem theo ngày, ảnh mẫu nằm cạnh để đối chiếu.
 */
export function AttendancePhotos({ orgId, onCount }: { orgId: string; onCount?: (n: number) => void }) {
  const [day, setDay] = useState(todayLocal());
  const [rows, setRows] = useState<PhotoReviewRow[] | null>(null);
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const r = await listPhotoReview(orgId, day, day);
      setRows(r);
      onCount?.(r.length);
      setRefs(await listFaceRefPhotos([...new Set(r.map((x) => x.wk_id))]).catch(() => ({})));
      setError(null);
    } catch (e) { setError(friendlyError(e)); }
  }, [orgId, day, onCount]);
  useEffect(() => { void load(); }, [load]);

  const isToday = day >= todayLocal();
  return (
    <>
      <div className="filters">
        <label>Ngày<input type="date" value={day} max={todayLocal()} onChange={(e) => setDay(e.target.value || todayLocal())} /></label>
        <div className="btnrow">
          <button className="secondary" onClick={() => setDay(addDays(day, -1))}>◀ Hôm trước</button>
          <button className="secondary" disabled={isToday} onClick={() => setDay(addDays(day, 1))}>Hôm sau ▶</button>
        </div>
      </div>
      {error && <p className="msg error" role="alert">{error}</p>}
      {rows && rows.length === 0 && <p className="msg ok">Không có ảnh nào cần xem trong ngày này. Mọi lượt chấm công đều nhận ra đúng người.</p>}
      <div className="photo-grid">
        {(rows ?? []).map((r) => (
          <figure key={r.ph_id} className="photo flag">
            <div className="photo-pair">
              {r.ph_photo && <img loading="lazy" alt={`${r.wk_name} ${r.ph_kind === 'in' ? 'vào ca' : 'ra ca'}`} src={`data:image/jpeg;base64,${r.ph_photo}`} />}
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
      <p className="muted">Ảnh nhỏ góc dưới là ảnh mẫu khi đăng ký. “Cách mẫu” càng nhỏ càng giống (dưới 0,50 là khớp, từ 0,60 có thể khác người). Ảnh được giữ 60 ngày. Thấy ảnh không đúng người: vào mục “Công”, tìm công đó và từ chối kèm lý do.</p>
    </>
  );
}
