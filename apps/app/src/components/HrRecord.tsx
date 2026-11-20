import { useCallback, useEffect, useState } from 'react';
import { aggregateYear, fetchYearSummary, fmtDays } from '../lib/absences';
import { fmtDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { todayLocal, useOnline } from '../lib/hooks';
import {
  CONTRACT_KIND_LABEL, EMPLOYMENT_LABEL, EMPTY_HR, cancelContract, contractState, createContract, fetchContracts, fetchWorkerHr, saveWorkerHr, updateContract,
  type ContractKind, type WorkerContract, type WorkerHr,
} from '../lib/hr';
import { listPositions } from '../lib/positions';
import { Collapsible } from './Collapsible';
import { Img, ImagePicker } from './ImagePicker';

/**
 * Hồ sơ nhân sự gọn và hợp đồng (D188), xếp chung vào hồ sơ từng người:
 *  - `useWorkerHr` + `HrFields`: các ô nhân sự (ngày vào làm, loại hình, ngày nghỉ việc, liên hệ khẩn cấp, chức danh) nằm TRONG biểu mẫu chính
 *    của hồ sơ, lưu cùng một nút Lưu.
 *  - `LeaveSummaryLine`: dòng tóm tắt nghỉ năm nay (D190).
 *  - `ContractsFold`: khối thu gọn danh sách hợp đồng.
 * Chỉ lưu thông tin quản lý và bản scan hợp đồng, không lưu số CCCD/bảo hiểm. Người có quyền sửa mục Tiền công mới sửa được.
 */
export function useWorkerHr(workerId: string | null) {
  const [hr, setHr] = useState<WorkerHr>(EMPTY_HR);
  const [version, setVersion] = useState<number | null>(null);
  const [loaded, setLoaded] = useState<WorkerHr>(EMPTY_HR);
  const load = useCallback(async () => {
    if (!workerId || !navigator.onLine) return;
    try { const h = await fetchWorkerHr(workerId); setHr(h.hr); setLoaded(h.hr); setVersion(h.version); } catch { /* chưa tải được: để trống */ }
  }, [workerId]);
  useEffect(() => { setHr(EMPTY_HR); setLoaded(EMPTY_HR); setVersion(null); void load(); }, [load]);
  const dirty = JSON.stringify(hr) !== JSON.stringify(loaded);
  const save = async () => { if (workerId && dirty) { setVersion(await saveWorkerHr(workerId, hr, version)); setLoaded(hr); } };
  const reset = () => setHr(loaded);
  return { hr, setHr, dirty, save, reset, reload: load };
}

/** Ngày vào làm, loại hình, ngày nghỉ việc, liên hệ khẩn cấp (và chức danh khi `withPosition`) */
/** Chức danh của người không tài khoản: chọn từ danh sách Chức vụ của cơ sở (giữ giá trị cũ nếu không còn trong danh sách) */
function TitlePick({ orgId, value, disabled, onChange }: { orgId?: string; value: string; disabled: boolean; onChange: (v: string) => void }) {
  const [names, setNames] = useState<string[] | null>(null);
  useEffect(() => {
    if (!orgId || !navigator.onLine) { setNames([]); return; }
    let alive = true;
    void listPositions(orgId).then((r) => { if (alive) setNames(r.filter((p) => p.is_active).map((p) => p.name)); }).catch(() => { if (alive) setNames([]); });
    return () => { alive = false; };
  }, [orgId]);
  const opts = names ?? [];
  const all = value && !opts.includes(value) ? [value, ...opts] : opts;
  return (
    <label>Chức danh (chọn từ Chức vụ)
      <select value={value} disabled={disabled || names === null} onChange={(e) => onChange(e.target.value)}>
        <option value="">— Chưa chọn —</option>
        {all.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      {names !== null && names.length === 0 && <small>Chưa có chức vụ nào (hoặc đang offline). Tạo ở Khai báo → Chức vụ.</small>}
    </label>
  );
}

export function HrFields({ hr, setHr, disabled, withPosition, hideEnd, orgId }: { hr: WorkerHr; setHr: (fn: (cur: WorkerHr) => WorkerHr) => void; disabled: boolean; withPosition?: boolean; hideEnd?: boolean; orgId?: string }) {
  const set = (k: keyof WorkerHr) => (e: { target: { value: string } }) => setHr((cur) => ({ ...cur, [k]: e.target.value }));
  return (
    <>
      {withPosition && <TitlePick orgId={orgId} value={hr.position} disabled={disabled} onChange={(v) => setHr((cur) => ({ ...cur, position: v }))} />}
      <div className="pair">
        <label>Ngày vào làm<input type="date" value={hr.start_date} disabled={disabled} onChange={set('start_date')} /></label>
        <label>Loại hình
          <select value={hr.employment_type} disabled={disabled} onChange={set('employment_type')}>
            <option value="">— Chưa chọn —</option>
            {Object.entries(EMPLOYMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>
      {!hideEnd && <label>Ngày nghỉ việc (nếu có)<input type="date" value={hr.end_date} disabled={disabled} onChange={set('end_date')} /></label>}
      <div className="pair">
        <label>Liên hệ khẩn cấp (tên)<input value={hr.emergency_name} maxLength={120} disabled={disabled} onChange={set('emergency_name')} /></label>
        <label>Số điện thoại người đó<input type="tel" inputMode="tel" value={hr.emergency_phone} maxLength={30} disabled={disabled} onChange={set('emergency_phone')} /></label>
      </div>
    </>
  );
}

/** Tóm tắt nghỉ năm nay: tổng ngày nghỉ và phép năm còn lại */
export function LeaveSummaryLine({ orgId, workerId }: { orgId: string; workerId: string | null }) {
  const [leave, setLeave] = useState<string | null>(null);
  useEffect(() => {
    setLeave(null);
    if (!workerId || !navigator.onLine) return;
    let alive = true;
    fetchYearSummary(orgId, new Date().getFullYear(), workerId).then((s) => {
      if (!alive) return;
      const w = aggregateYear(s)[0];
      setLeave(w ? `Năm nay nghỉ ${fmtDays(w.total)}; phép năm đã dùng ${fmtDays(w.byKind.annual)} trên ${s.allowance} ngày${w.annualLeft < 0 ? ` (vượt ${fmtDays(-w.annualLeft)})` : `, còn ${fmtDays(w.annualLeft)}`}.` : `Năm nay chưa ghi nghỉ ngày nào (phép năm ${s.allowance} ngày).`);
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [orgId, workerId]);
  return leave ? <p className="muted">{leave}</p> : null;
}

interface CForm { id: string; version: number | null; kind: ContractKind; start: string; end: string; payNote: string; file: string; note: string }
const blank = (): CForm => ({ id: crypto.randomUUID(), version: null, kind: 'fixed_term', start: todayLocal(), end: '', payNote: '', file: '', note: '' });

/** Khối thu gọn "Hợp đồng lao động": danh sách, thêm, sửa, hủy; nhắc sắp hết hạn */
export function ContractsFold({ workerId, canEdit }: { workerId: string | null; canEdit: boolean }) {
  const online = useOnline();
  const [contracts, setContracts] = useState<WorkerContract[] | null>(null);
  const [form, setForm] = useState<CForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const today = todayLocal();

  const load = useCallback(async () => {
    if (!workerId || !navigator.onLine) return;
    try { setContracts(await fetchContracts(workerId)); } catch (e) { setError(friendlyError(e)); }
  }, [workerId]);
  useEffect(() => { setContracts(null); setForm(null); void load(); }, [load]);

  async function run(fn: () => Promise<unknown>, done: string): Promise<boolean> {
    setBusy(true); setError(null); setMsg(null);
    try { await fn(); setMsg(done); await load(); return true; }
    catch (e) {
      if (/CONFLICT/.test(String((e as Error).message))) { await load(); setError('Hợp đồng vừa được người khác sửa. Đã tải lại bản mới, hãy kiểm tra rồi lưu lại.'); }
      else setError(friendlyError(e));
      return false;
    } finally { setBusy(false); }
  }
  async function saveContract() {
    if (!form || !workerId) return;
    if (!form.start) return setError('Hãy nhập ngày bắt đầu.');
    if (form.kind === 'fixed_term' && !form.end) return setError('Hợp đồng có thời hạn cần ngày hết hạn.');
    if (form.end && form.end < form.start) return setError('Ngày hết hạn không được trước ngày bắt đầu.');
    const input = { id: form.id, kind: form.kind, start: form.start, end: form.kind === 'indefinite' ? '' : form.end, payNote: form.payNote.trim(), file: form.file, note: form.note.trim() };
    const ok = await run(() => (form.version === null ? createContract(workerId, input) : updateContract(form.version, input)), form.version === null ? 'Đã thêm hợp đồng.' : 'Đã lưu hợp đồng.');
    if (ok) setForm(null);
  }

  const active = (contracts ?? []).filter((c) => c.status === 'active');
  const worst = active.map((c) => contractState(c.end_date, today)).includes('expired') ? 'expired' : active.map((c) => contractState(c.end_date, today)).includes('soon') ? 'soon' : 'ok';
  const summary = !workerId ? 'chưa có hồ sơ lao động' : contracts === null ? undefined
    : active.length === 0 ? 'chưa có hợp đồng' : `${active.length} hợp đồng${worst === 'expired' ? ', có hợp đồng đã hết hạn' : worst === 'soon' ? ', có hợp đồng sắp hết hạn' : ''}`;

  return (
    <Collapsible title="Hợp đồng lao động" summary={summary} warn={worst !== 'ok'}>
      {!workerId ? <p className="muted">Người này chưa có hồ sơ chấm công nên chưa lưu được hợp đồng. Hồ sơ được tạo khi tạo tài khoản nhân viên hoặc khi người đó chấm công lần đầu.</p> : (
        <div className="inline-form">
          {!online && <p className="msg warn" role="status">Đang offline: chỉ xem được. Lưu cần có mạng.</p>}
          {error && <p className="msg error" role="alert">{error}</p>}
          {msg && <p className="msg ok" role="status">{msg}</p>}
          {!canEdit && <p className="muted">Bạn chỉ được xem. Cần quyền sửa mục Tiền công để thay đổi.</p>}
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
      )}
    </Collapsible>
  );
}
