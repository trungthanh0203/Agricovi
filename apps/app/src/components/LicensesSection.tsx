import { useCallback, useEffect, useState } from 'react';
import { ImagePicker, Thumb } from './ImagePicker';
import { fmtDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';
import { daysLeft, deleteLicense, listLicenses, saveLicense, type LicenseRow } from '../lib/licenses';

/** Trạng thái hạn: chữ + màu (không chỉ dựa vào màu) */
export function licenseStatus(l: Pick<LicenseRow, 'expires_date'>): { text: string; cls: string } {
  const d = daysLeft(l.expires_date);
  if (d === null) return { text: 'Không thời hạn', cls: 'pill' };
  if (d < 0) return { text: `Đã hết hạn ${-d} ngày`, cls: 'pill err' };
  if (d <= 30) return { text: `Sắp hết hạn (còn ${d} ngày)`, cls: 'pill warn' };
  return { text: `Còn ${d} ngày`, cls: 'pill ok' };
}

/** Giấy phép, chứng chỉ của cơ sở: tên giấy, nơi cấp, số, ngày cấp, hạn, hình ảnh. Chủ và quản lý thêm/sửa/xóa. */
export function LicensesSection({ orgId, canEdit, onLoaded }: { orgId: string; canEdit: boolean; onLoaded?: (rows: LicenseRow[]) => void }) {
  const online = useOnline();
  const [rows, setRows] = useState<LicenseRow[]>([]);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!navigator.onLine) return;
    try { const r = await listLicenses(orgId); setRows(r); onLoaded?.(r); } catch (e) { setError(friendlyError(e)); }
  }, [orgId, onLoaded]);
  useEffect(() => { void load(); }, [load]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try { await fn(); await load(); } catch (e) { setError(friendlyError(e)); throw e; } finally { setBusy(false); }
  }
  const editRow = rows.find((r) => r.id === editing) ?? null;

  return (
    <>
      {!online && <p className="msg warn" role="status">Đang offline: chỉ xem được. Thêm và sửa cần có mạng.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}
      {canEdit && !editing && <button className="secondary" disabled={!online} onClick={() => setEditing('new')}>+ Thêm giấy phép, chứng chỉ</button>}
      {canEdit && editing && (
        <LicenseForm key={editing} initial={editRow} busy={busy || !online} onClose={() => setEditing(null)}
          onSave={(f) => run(async () => { await saveLicense(orgId, editRow?.id ?? null, f); setEditing(null); })} />
      )}
      <table className="grid">
        <thead><tr><th>Giấy phép, chứng chỉ ({rows.length})</th><th>Hạn</th>{canEdit && <th></th>}</tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={3} className="muted">Chưa có giấy phép, chứng chỉ nào.{canEdit ? ' Ví dụ: VietGAP, giấy phép kinh doanh, giấy chứng nhận cơ sở đủ điều kiện.' : ''}</td></tr>}
          {rows.map((l) => {
            const st = licenseStatus(l);
            return (
              <tr key={l.id}>
                <td>
                  <Thumb src={l.image} />{l.name}
                  {(l.issuer || l.number) && <span className="sub">{[l.issuer, l.number ? `Số ${l.number}` : null].filter(Boolean).join(' · ')}</span>}
                  <span className="sub">Cấp {fmtDate(l.issued_date)}{l.expires_date ? ` · Hạn ${fmtDate(l.expires_date)}` : ''}</span>
                  {l.note && <span className="sub">{l.note}</span>}
                </td>
                <td><span className={st.cls}>{st.text}</span></td>
                {canEdit && (
                  <td className="act">
                    <button className="icon" aria-label={`Sửa ${l.name}`} onClick={() => setEditing(editing === l.id ? null : l.id)}>✎</button>{' '}
                    <button className="icon" disabled={busy || !online} aria-label={`Xóa ${l.name}`}
                      onClick={() => { if (window.confirm(`Xóa "${l.name}"?`)) void run(() => deleteLicense(l.id)).catch(() => undefined); }}>🗑</button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.some((l) => l.image) && (
        <details className="fold inline"><summary><span className="fold-title">Xem hình ảnh giấy tờ</span></summary>
          <div className="fold-body">{rows.filter((l) => l.image).map((l) => <figure key={l.id} className="licfig"><img src={l.image!} alt={l.name} /><figcaption>{l.name}</figcaption></figure>)}</div>
        </details>
      )}
    </>
  );
}

function LicenseForm({ initial, busy, onSave, onClose }: {
  initial: LicenseRow | null; busy: boolean;
  onSave: (f: { name: string; issuer: string | null; number: string | null; issued_date: string | null; expires_date: string | null; image: string | null; note: string | null }) => Promise<unknown>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [issuer, setIssuer] = useState(initial?.issuer ?? '');
  const [number, setNumber] = useState(initial?.number ?? '');
  const [issued, setIssued] = useState(initial?.issued_date ?? '');
  const [expires, setExpires] = useState(initial?.expires_date ?? '');
  const [image, setImage] = useState(initial?.image ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="card">
      <h2>{initial ? 'Sửa giấy phép, chứng chỉ' : 'Thêm giấy phép, chứng chỉ'}</h2>
      <div className="inline-form">
        <label>Tên giấy<input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Chứng nhận VietGAP" /></label>
        <label>Nơi cấp<input value={issuer} maxLength={160} onChange={(e) => setIssuer(e.target.value)} /></label>
        <label>Số giấy<input value={number} maxLength={80} onChange={(e) => setNumber(e.target.value)} /></label>
        <div className="pair">
          <label>Ngày cấp<input type="date" value={issued} onChange={(e) => setIssued(e.target.value)} /></label>
          <label>Hạn (để trống nếu không thời hạn)<input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></label>
        </div>
        <ImagePicker value={image} onChange={setImage} label="Hình ảnh giấy tờ" />
        <label>Ghi chú<input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} /></label>
        {err && <p className="msg error" role="alert">{err}</p>}
        <div className="btnrow">
          <button className="primary" disabled={busy} onClick={() => {
            if (name.trim().length < 2) return setErr('Hãy nhập tên giấy (ít nhất 2 ký tự).');
            if (issued && expires && expires < issued) return setErr('Hạn không thể trước ngày cấp.');
            setErr(null);
            void onSave({ name, issuer, number, issued_date: issued, expires_date: expires, image, note }).catch(() => undefined);
          }}>Lưu</button>
          <button type="button" className="secondary" onClick={onClose}>Hủy</button>
        </div>
      </div>
    </div>
  );
}
