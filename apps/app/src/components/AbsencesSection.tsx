import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ABSENCE_CHANNEL_LABEL, ABSENCE_KIND_LABEL, ABSENCE_KIND_PAID, ABSENCE_NOTICE_LABEL, absenceDays, cancelAbsence, createAbsence, fetchAbsences, updateAbsence,
  type Absence, type AbsenceChannel, type AbsenceKind, type AbsenceNotice,
} from '../lib/absences';
import { fmtDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { todayLocal } from '../lib/hooks';
import type { WorkerLite } from '../lib/work';
import { AbsenceSummary } from './AbsenceSummary';
import { Img, ImagePicker } from './ImagePicker';
import { RowMenu } from './RowMenu';
import { t as tx } from '@lingui/core/macro';
import { dateLocale } from '../lib/format';

interface Form {
  id: string; version: number | null; workerId: string; from: string; to: string; half: boolean; kind: AbsenceKind; notice: AbsenceNotice; channel: AbsenceChannel | '';
  noticedOn: string; reason: string; paid: boolean; file: string; note: string;
}
const blank = (workerId: string): Form => ({
  id: crypto.randomUUID(), version: null, workerId, from: todayLocal(), to: todayLocal(), half: false, kind: 'sick', notice: 'before', channel: 'zalo',
  noticedOn: todayLocal(), reason: '', paid: ABSENCE_KIND_PAID.sick, file: '', note: '',
});

/**
 * Chấm công → Nghỉ (D189): chủ/quản lý (tổ trưởng với người trong tổ) GHI HỘ việc xin nghỉ của người làm: loại nghỉ, có xin phép hay không,
 * xin qua đâu, lý do, hưởng lương hay không. Chỉ ghi nhận, chưa nối vào phiếu lương. Cần mạng.
 * `workers` là những người mà người dùng được ghi nghỉ cho (máy chủ vẫn kiểm lại quyền).
 */
export function AbsencesSection({ orgId, workers, canWrite, isOwner, online, addSignal = 0 }: { orgId: string; workers: WorkerLite[]; canWrite: boolean; isOwner: boolean; online: boolean; addSignal?: number }) {
  const [month, setMonth] = useState(todayLocal().slice(0, 7));
  const [who, setWho] = useState('');
  const [rows, setRows] = useState<Absence[] | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const names = useMemo(() => new Map(workers.map((w) => [w.id, w.full_name])), [workers]);

  const load = useCallback(async () => {
    if (!navigator.onLine) return;
    const from = `${month}-01`;
    const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
    try { setRows(await fetchAbsences(orgId, from, `${month}-${String(last).padStart(2, '0')}`, true)); setError(null); } catch (e) { setError(friendlyError(e)); }
  }, [orgId, month]);
  useEffect(() => { void load(); }, [load]);
  // Mở sẵn biểu mẫu Ghi nghỉ khi vào từ nút "＋ Ghi nghỉ" ở tab Hôm nay
  useEffect(() => { if (addSignal > 0 && canWrite && workers.length > 0) { setError(null); setMsg(null); setForm(blank(workers[0]!.id)); } }, [addSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!form) return;
    if (!form.workerId) return setError(tx`Hãy chọn người nghỉ.`);
    if (!form.from || !form.to) return setError(tx`Hãy nhập ngày nghỉ.`);
    if (form.to < form.from) return setError(tx`Ngày nghỉ đến không được trước ngày nghỉ từ.`);
    setBusy(true); setError(null); setMsg(null);
    const input = { id: form.id, from: form.from, to: form.half ? form.from : form.to, half: form.half, kind: form.kind, notice: form.notice, channel: form.channel, noticedOn: form.noticedOn,
      reason: form.reason.trim(), paid: form.paid, file: form.file, note: form.note.trim() };
    try {
      if (form.version === null) await createAbsence(form.workerId, input); else await updateAbsence(form.version, input);
      setMsg(form.version === null ? tx`Đã ghi nghỉ.` : tx`Đã lưu thay đổi.`);
      setForm(null); setTick((t) => t + 1); await load();
    } catch (e) {
      if (/CONFLICT/.test(String((e as Error).message))) { await load(); setError(tx`Ghi nghỉ vừa được người khác sửa. Đã tải lại bản mới, hãy kiểm tra rồi lưu lại.`); setForm(null); }
      else setError(friendlyError(e));
    } finally { setBusy(false); }
  }
  async function cancel(a: Absence) {
    if (!window.confirm(tx`Hủy ghi nghỉ này? Ghi nghỉ đã hủy vẫn được giữ trong sổ.`)) return;
    setBusy(true); setError(null); setMsg(null);
    try { await cancelAbsence(a.id, a.version); setMsg(tx`Đã hủy ghi nghỉ.`); setTick((t) => t + 1); await load(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  const shown = (rows ?? []).filter((a) => !who || a.worker_id === who);
  const setKind = (kind: AbsenceKind) => setForm((f) => f && { ...f, kind, paid: ABSENCE_KIND_PAID[kind], notice: kind === 'no_notice' ? 'none' : f.notice === 'none' ? 'before' : f.notice });

  return (
    <>
      {!online && <p className="msg warn" role="status">{tx`Đang offline: ghi nghỉ cần có mạng.`}</p>}
      {error && <p className="msg error" role="alert">{error}</p>}
      {msg && <p className="msg ok" role="status">{msg}</p>}
      {canWrite && !form && workers.length > 0 && <button className="primary" disabled={!online} onClick={() => { setError(null); setMsg(null); setForm(blank(workers[0]!.id)); }}>{tx`＋ Ghi nghỉ`}</button>}

      {form && (
        <div className="card inline-form">
          <p><strong>{form.version === null ? tx`Ghi nghỉ` : tx`Sửa ghi nghỉ`}</strong></p>
          <label>{tx`Người nghỉ`}
            <select value={form.workerId} disabled={form.version !== null} onChange={(e) => setForm({ ...form, workerId: e.target.value })}>
              {workers.map((w) => <option key={w.id} value={w.id}>{w.full_name}</option>)}
            </select>
          </label>
          <div className="pair">
            <label>{tx`Nghỉ từ ngày`}<input type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value, to: form.half || form.to < e.target.value ? e.target.value : form.to })} /></label>
            <label>{tx`Đến ngày`}<input type="date" value={form.half ? form.from : form.to} min={form.from} disabled={form.half} onChange={(e) => setForm({ ...form, to: e.target.value })} /></label>
          </div>
          <label className="check"><input type="checkbox" checked={form.half} onChange={(e) => setForm({ ...form, half: e.target.checked, to: form.from })} />{' '}{tx`Chỉ nghỉ nửa ngày`}</label>
          <div className="pair">
            <label>{tx`Loại nghỉ`}
              <select value={form.kind} onChange={(e) => setKind(e.target.value as AbsenceKind)}>
                {Object.entries(ABSENCE_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label>{tx`Có xin phép không?`}
              <select value={form.notice} onChange={(e) => setForm({ ...form, notice: e.target.value as AbsenceNotice })}>
                {Object.entries(ABSENCE_NOTICE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          </div>
          <div className="pair">
            <label>{tx`Xin qua đâu`}
              <select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value as AbsenceChannel | '' })}>
                <option value="">{tx`— Không rõ —`}</option>
                {Object.entries(ABSENCE_CHANNEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label>{tx`Ngày được báo`}<input type="date" value={form.noticedOn} max={todayLocal()} onChange={(e) => setForm({ ...form, noticedOn: e.target.value })} /></label>
          </div>
          <label>{tx`Lý do`}<input value={form.reason} maxLength={200} placeholder={tx`Ví dụ: con ốm, đám cưới người nhà`} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></label>
          <label className="check"><input type="checkbox" checked={form.paid} onChange={(e) => setForm({ ...form, paid: e.target.checked })} />{' '}{tx`Hưởng lương những ngày này (chỉ ghi nhận)`}</label>
          <ImagePicker value={form.file} onChange={(v) => setForm({ ...form, file: v })} label={tx`Ảnh đính kèm (giấy khám, tin nhắn… không bắt buộc)`} store="licenses" />
          <label>{tx`Ghi chú`}<input value={form.note} maxLength={300} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          <div className="btnrow">
            <button type="button" className="primary" disabled={busy || !online} onClick={() => void save()}>{busy ? tx`Đang lưu…` : form.version === null ? tx`Lưu ghi nghỉ` : tx`Lưu thay đổi`}</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => { setForm(null); setError(null); }}>{tx`Hủy`}</button>
          </div>
        </div>
      )}

      <div className="filters">
        <label>{tx`Tháng`}<input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} /></label>
        <label>{tx`Người`}
          <select value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">{tx`Tất cả`}</option>
            {workers.map((w) => <option key={w.id} value={w.id}>{w.full_name}</option>)}
          </select>
        </label>
      </div>

      {rows === null ? <p className="muted">{online ? tx`Đang tải…` : tx`Cần mạng để xem.`}</p>
        : shown.length === 0 ? <p className="muted">{tx`Không có ghi nghỉ nào trong tháng này.`}</p>
        : (
          <table className="grid">
            <thead><tr><th>{tx`Người · ngày nghỉ`}</th><th>{tx`Loại`}</th><th></th></tr></thead>
            <tbody>
              {shown.map((a) => (
                <tr key={a.id} className={a.status === 'cancelled' ? 'off' : ''}>
                  <td>
                    {names.get(a.worker_id) ?? tx`Người đã ngừng làm`}
                    <span className="sub">{a.half_day ? tx`${fmtDate(a.from_date)} (nửa ngày)` : a.from_date === a.to_date ? fmtDate(a.from_date) : `${fmtDate(a.from_date)} – ${fmtDate(a.to_date)}`} · {absenceDays(a).toLocaleString(dateLocale())}{' '}{tx`ngày`}</span>
                    {a.reason && <span className="sub">{a.reason}</span>}
                    {a.file && <Img value={a.file} size="t" alt={tx`Ảnh đính kèm`} />}
                  </td>
                  <td>
                    {ABSENCE_KIND_LABEL[a.kind]}
                    <span className={a.notice === 'none' ? 'pill err' : a.notice === 'after' ? 'pill warn' : 'pill ok'}>{ABSENCE_NOTICE_LABEL[a.notice]}</span>
                    {a.status === 'cancelled' ? <span className="pill">{tx`Đã hủy`}</span> : a.paid ? <span className="sub">{tx`Hưởng lương`}</span> : <span className="sub">{tx`Không lương`}</span>}
                    {a.channel && <span className="sub">{ABSENCE_CHANNEL_LABEL[a.channel]}{a.noticed_on ? tx` · báo ${fmtDate(a.noticed_on)}` : ''}</span>}
                  </td>
                  <td className="act">
                    {canWrite && a.status === 'active' && (
                      <RowMenu label={tx`Ghi nghỉ ${names.get(a.worker_id) ?? ''} ${fmtDate(a.from_date)}`} items={[
                        { label: tx`Sửa`, icon: '✎', disabled: busy || !online || !names.has(a.worker_id), onClick: () => {
                          setError(null); setMsg(null);
                          setForm({ id: a.id, version: a.version, workerId: a.worker_id, from: a.from_date, to: a.to_date, half: a.half_day, kind: a.kind, notice: a.notice, channel: a.channel ?? '',
                            noticedOn: a.noticed_on ?? '', reason: a.reason ?? '', paid: a.paid, file: a.file ?? '', note: a.note ?? '' });
                        } },
                        { label: tx`Hủy ghi nghỉ`, icon: '✕', danger: true, disabled: busy || !online, onClick: () => void cancel(a) },
                      ]} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

      <AbsenceSummary orgId={orgId} workers={workers} isOwner={isOwner} online={online} refreshKey={tick} />
      <p className="muted">{tx`Ghi lại việc xin nghỉ của người làm (họ nói miệng, nhắn Zalo hay gọi điện). Chỉ để ghi nhận, chưa tính vào bảng lương.`}</p>
    </>
  );
}
