import { useCallback, useEffect, useState } from 'react';
import { fmtDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { useOnline, todayLocal } from '../lib/hooks';
import {
  CONTRACT_KIND_LABEL, EMPLOYMENT_LABEL, EMPTY_HR, cancelContract, contractState, createContract, fetchContracts, fetchWorkerHr, saveWorkerHr, updateContract,
  type ContractKind, type WorkerContract, type WorkerHr,
} from '../lib/hr';
import { Collapsible } from './Collapsible';
import { Img, ImagePicker } from './ImagePicker';

interface CForm { id: string; version: number | null; kind: ContractKind; start: string; end: string; payNote: string; file: string; note: string }
const blank = (): CForm => ({ id: crypto.randomUUID(), version: null, kind: 'fixed_term', start: todayLocal(), end: '', payNote: '', file: '', note: '' });

/**
 * Hồ sơ nhân sự gọn và hợp đồng lao động của MỘT người (D188). Chỉ lưu và nhắc hạn; không lưu số CCCD/bảo hiểm.
 * Người có quyền sửa mục Tiền công mới sửa được; người chỉ xem thì chỉ đọc.
 */
export function HrRecord({ workerId, canEdit }: { workerId: string | null; canEdit: boolean }) {
  const online = useOnline();
  const [hr, setHr] = useState<WorkerHr>(EMPTY_HR);
  const [version, setVersion] = useState<number | null>(null);
  const [contracts, setContracts] = useState<WorkerContract[] | null>(null);
  const [form, setForm] = useState<CForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workerId || !navigator.onLine) return;
    try {
      const [h, c] = await Promise.all([fetchWorkerHr(workerId), fetchContracts(workerId)]);
      setHr(h.hr); setVersion(h.version); setContracts(c);
    } catch (e) { setError(friendlyError(e)); }
  }, [workerId]);
  useEffect(() => { setContracts(null); setForm(null); void load(); }, [load]);

  if (!workerId) return <p className="muted">Người này chưa có hồ sơ chấm công nên chưa lưu được hồ sơ nhân sự. Hồ sơ được tạo khi tạo tài khoản nhân viên hoặc khi người đó chấm công lần đầu.</p>;

  async function run(fn: () => Promise<unknown>, done: string): Promise<boolean> {
    setBusy(true); setError(null); setMsg(null);
    try { await fn(); setMsg(done); await load(); return true; }
    catch (e) {
      if (/CONFLICT/.test(String((e as Error).message))) { await load(); setError('Hồ sơ vừa được người khác sửa. Đã tải lại bản mới, hãy kiểm tra rồi lưu lại.'); }
      else setError(friendlyError(e));
      return false;
    } finally { setBusy(false); }
  }
  const set = (k: keyof WorkerHr) => (e: { target: { value: string } }) => setHr((cur) => ({ ...cur, [k]: e.target.value }));
  const today = todayLocal();

  async function saveContract() {
    if (!form) return;
    if (!form.start) return setError('Hãy nhập ngày bắt đầu.');
    if (form.kind === 'fixed_term' && !form.end) return setError('Hợp đồng có thời hạn cần ngày hết hạn.');
    if (form.end && form.end < form.start) return setError('Ngày hết hạn không được trước ngày bắt đầu.');
    const input = { id: form.id, kind: form.kind, start: form.start, end: form.kind === 'indefinite' ? '' : form.end, payNote: form.payNote.trim(), file: form.file, note: form.note.trim() };
    const ok = await run(() => (form.version === null ? createContract(workerId!, input) : updateContract(form.version, input)), form.version === null ? 'Đã thêm hợp đồng.' : 'Đã lưu hợp đồng.');
    if (ok) setForm(null);
  }

  return (
    <div className="inline-form">
      {!online && <p className="msg warn" role="status">Đang offline: chỉ xem được. Lưu cần có mạng.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}
      {msg && <p className="msg ok" role="status">{msg}</p>}
      {!canEdit && <p className="muted">Bạn chỉ được xem. Cần quyền sửa mục Tiền công để thay đổi.</p>}
      <p className="muted">Chỉ lưu thông tin quản lý và bản scan hợp đồng. Không nhập số CCCD hay bảo hiểm vào đây.</p>

      <fieldset className="plain" disabled={!canEdit || busy}>
        <div className="pair">
          <label>Ngày vào làm<input type="date" value={hr.start_date} onChange={set('start_date')} /></label>
          <label>Ngày nghỉ việc (nếu có)<input type="date" value={hr.end_date} onChange={set('end_date')} /></label>
        </div>
        <div className="pair">
          <label>Chức danh<input value={hr.position} maxLength={80} placeholder="Công nhân, tổ trưởng…" onChange={set('position')} /></label>
          <label>Loại hình
            <select value={hr.employment_type} onChange={set('employment_type')}>
              <option value="">— Chưa chọn —</option>
              {Object.entries(EMPLOYMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        </div>
        <div className="pair">
          <label>Người liên hệ khi khẩn cấp<input value={hr.emergency_name} maxLength={120} onChange={set('emergency_name')} /></label>
          <label>Số điện thoại người đó<input type="tel" inputMode="tel" value={hr.emergency_phone} maxLength={30} onChange={set('emergency_phone')} /></label>
        </div>
        <label>Ghi chú<textarea rows={2} maxLength={500} value={hr.note} onChange={set('note')} /></label>
      </fieldset>
      {canEdit && (
        <div className="btnrow">
          <button type="button" className="primary" disabled={busy || !online} onClick={() => void run(() => saveWorkerHr(workerId, hr, version), 'Đã lưu hồ sơ.')}>Lưu hồ sơ</button>
          <button type="button" className="secondary" disabled={busy} onClick={() => { setMsg(null); setError(null); void load(); }}>Hủy</button>
        </div>
      )}

      <h3 className="sect">Hợp đồng{contracts && contracts.length > 0 ? ` (${contracts.filter((c) => c.status === 'active').length})` : ''}</h3>
      {canEdit && !form && <button type="button" className="secondary" disabled={!online} onClick={() => { setError(null); setMsg(null); setForm(blank()); }}>＋ Thêm hợp đồng</button>}
      {form && (
        <div className="card inline-form">
          <p><strong>{form.version === null ? 'Thêm hợp đồng' : 'Sửa hợp đồng'}</strong></p>
          <label>Loại hợp đồng
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as ContractKind })}>
              {Object.entries(CONTRACT_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <div className="pair">
            <label>Từ ngày<input type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></label>
            {form.kind !== 'indefinite' && <label>Đến ngày{form.kind === 'fixed_term' ? '' : ' (nếu có)'}<input type="date" value={form.end} min={form.start} onChange={(e) => setForm({ ...form, end: e.target.value })} /></label>}
          </div>
          <label>Lương hoặc đơn giá thỏa thuận<input value={form.payNote} maxLength={200} placeholder="Ví dụ: 6 triệu/tháng" onChange={(e) => setForm({ ...form, payNote: e.target.value })} /></label>
          <ImagePicker value={form.file} onChange={(v) => setForm({ ...form, file: v })} label="Ảnh scan hợp đồng (không bắt buộc)" store="licenses" />
          <label>Ghi chú<input value={form.note} maxLength={300} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          <p className="muted">Ghi ở đây chỉ để lưu và nhắc hạn, không thay đổi lương trong bảng lương.</p>
          <div className="btnrow">
            <button type="button" className="primary" disabled={busy || !online} onClick={() => void saveContract()}>{form.version === null ? 'Lưu hợp đồng' : 'Lưu thay đổi'}</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => { setForm(null); setError(null); }}>Hủy</button>
          </div>
        </div>
      )}
      {contracts === null ? <p className="muted">{online ? 'Đang tải…' : 'Cần mạng để xem hợp đồng.'}</p>
        : contracts.length === 0 ? <p className="muted">Chưa có hợp đồng nào.</p>
        : contracts.map((c) => {
          const st = c.status === 'active' ? contractState(c.end_date, today) : 'ok';
          return (
            <div key={c.id} className="card slim">
              <p><strong>{CONTRACT_KIND_LABEL[c.kind]}</strong>{c.status === 'cancelled' && <span className="muted"> · đã hủy</span>}</p>
              <p>{fmtDate(c.start_date)} → {c.end_date ? fmtDate(c.end_date) : 'không thời hạn'}</p>
              {c.status === 'active' && st === 'expired' && <p className="msg warn" role="status">Đã hết hạn.</p>}
              {c.status === 'active' && st === 'soon' && <p className="msg warn" role="status">Sắp hết hạn.</p>}
              {c.pay_note && <p className="muted">{c.pay_note}</p>}
              {c.note && <p className="muted">{c.note}</p>}
              {c.file && <Img value={c.file} size="f" alt="Bản scan hợp đồng" />}
              {canEdit && c.status === 'active' && (
                <div className="btnrow">
                  <button type="button" className="secondary" disabled={busy || !online} onClick={() => { setError(null); setMsg(null); setForm({ id: c.id, version: c.version, kind: c.kind, start: c.start_date, end: c.end_date ?? '', payNote: c.pay_note ?? '', file: c.file ?? '', note: c.note ?? '' }); }}>Sửa</button>
                  <button type="button" className="secondary" disabled={busy || !online} onClick={() => { if (window.confirm('Hủy hợp đồng này? Hợp đồng đã hủy vẫn được giữ trong sổ.')) void run(() => cancelContract(c.id, c.version), 'Đã hủy hợp đồng.'); }}>Hủy hợp đồng</button>
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}

/** Khối thu gọn dùng trong hồ sơ nhân sự */
export function HrRecordFold({ workerId, canEdit }: { workerId: string | null; canEdit: boolean }) {
  return <Collapsible title="Hồ sơ nhân sự và hợp đồng" summary="vào làm, chức danh, hợp đồng"><HrRecord workerId={workerId} canEdit={canEdit} /></Collapsible>;
}
