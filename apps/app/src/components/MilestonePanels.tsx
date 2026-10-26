import { useEffect, useMemo, useState } from 'react';
import { Collapsible } from './Collapsible';
import { useCatalog } from '../lib/catalog';
import type { CycleRow } from '../lib/db';
import { friendlyError } from '../lib/errors';
import { todayLocal, useOnline } from '../lib/hooks';
import {
  addCycleMilestone, addTemplateMilestone, deleteCycleMilestone, deleteTemplateMilestone, listTemplateMilestones, MILESTONE_SUGGESTIONS,
  setMilestoneDone, type MilestoneInput, type TemplateMilestone,
} from '../lib/milestones';
import { MILESTONE_STATUS_LABEL, milestoneDue, milestoneStatus, milestoneWhen, type MilestoneStatus } from '../lib/milestoneLogic';
import { useOrgs } from '../lib/orgs';
import { useTable } from '../lib/tables';

const vn = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');
const pillClass = (s: MilestoneStatus) => (s === 'overdue' ? 'pill err' : s === 'today' || s === 'soon' ? 'pill warn' : s === 'done' ? 'pill ok' : 'pill');

/** Trang chủ: các mốc nhắc đến hạn trong 3 ngày tới hoặc đã quá hạn, của các vụ chưa kết thúc. Không hiện gì nếu không có. */
export function HomeReminders() {
  const { active } = useOrgs();
  const online = useOnline();
  const milestones = useTable('milestones');
  const cycles = useTable('cycles');
  const { cropTypes } = useCatalog();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const today = todayLocal();
  const rows = useMemo(() => {
    const byId = new Map(cycles.map((c) => [c.id, c]));
    return milestones
      .map((m) => ({ m, c: byId.get(m.cycle_id) }))
      .filter((x): x is { m: typeof x.m; c: CycleRow } => !!x.c && (x.c.owner_org_id === active?.id) && x.c.status !== 'ended' && x.c.status !== 'cancelled')
      .map((x) => ({ ...x, status: milestoneStatus(x.m, x.c, today), due: milestoneDue(x.m, x.c) }))
      .filter((x) => x.status === 'overdue' || x.status === 'today' || x.status === 'soon')
      .sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''));
  }, [milestones, cycles, active, today]);
  if (rows.length === 0) return null;
  const late = rows.filter((r) => r.status === 'overdue').length;
  const label = (c: CycleRow) => `${c.code ?? c.name ?? cropTypes.find((t) => t.id === c.crop_type_id)?.name ?? 'Vụ'}`;
  return (
    <Collapsible title="Việc cần nhớ" summary={`${rows.length} mốc${late > 0 ? ` · ${late} quá hạn` : ''}`} warn={late > 0} defaultOpen={late > 0}>
      {error && <p className="msg error" role="alert">{error}</p>}
      {rows.map(({ m, c, status, due }) => (
        <div className="card slim" key={m.id}>
          <div className="row"><strong className="grow">{m.title}</strong><span className={pillClass(status)}>{MILESTONE_STATUS_LABEL[status]} · {vn(due)}</span></div>
          <p className="muted">{label(c)}{m.note ? ` · ${m.note}` : ''}</p>
          <button className="secondary" disabled={!online || busyId === m.id} onClick={() => {
            setBusyId(m.id); setError(null);
            void setMilestoneDone(m.id, true).catch((e) => setError(friendlyError(e))).finally(() => setBusyId(null));
          }}>Đã làm xong</button>
        </div>
      ))}
      {!online && <p className="muted">Đang offline: xem được, đánh dấu "đã làm" cần có mạng.</p>}
    </Collapsible>
  );
}

/** Chi tiết vụ: mọi mốc của vụ kèm ngày đến hạn; người quản lý vụ thêm/xóa mốc riêng (ví dụ lịch vaccine do thú y chốt) */
export function CycleMilestones({ cycle, canManage, canMark }: { cycle: CycleRow; canManage: boolean; canMark: boolean }) {
  const online = useOnline();
  const all = useTable('milestones');
  const items = useMemo(() => all.filter((m) => m.cycle_id === cycle.id), [all, cycle.id]);
  const today = todayLocal();
  const [form, setForm] = useState(false);
  const [m, setM] = useState<MilestoneInput>({ title: '', anchor: 'start', offset: 0, note: '' });
  const [offset, setOffset] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (items.length === 0 && !canManage) return null;
  const sorted = [...items].sort((a, b) => (milestoneDue(a, cycle) ?? '9999').localeCompare(milestoneDue(b, cycle) ?? '9999'));
  const open = sorted.filter((i) => !i.done_at).length;
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setError(null); try { await fn(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); } };

  return (
    <Collapsible title="Mốc nhắc việc" summary={items.length === 0 ? 'chưa có' : `${open} chưa làm / ${items.length}`}>
      {error && <p className="msg error" role="alert">{error}</p>}
      {sorted.map((i) => {
        const s = milestoneStatus(i, cycle, today);
        return (
          <div className="card slim" key={i.id}>
            <div className="row"><strong className="grow">{i.title}</strong><span className={pillClass(s)}>{MILESTONE_STATUS_LABEL[s]}{s !== 'done' && milestoneDue(i, cycle) ? ` · ${vn(milestoneDue(i, cycle))}` : ''}</span></div>
            <p className="muted">{milestoneWhen(i)}{i.note ? ` · ${i.note}` : ''}{i.done_at ? ` · ${i.done_name ?? ''} ${new Date(i.done_at).toLocaleDateString('vi-VN')}` : ''}</p>
            <div className="btnrow">
              {canMark && <button className="secondary" disabled={busy || !online} onClick={() => void run(() => setMilestoneDone(i.id, !i.done_at))}>{i.done_at ? 'Bỏ đánh dấu' : 'Đã làm xong'}</button>}
              {canManage && <button className="link inline" disabled={busy || !online} onClick={() => { if (window.confirm('Xóa mốc nhắc này khỏi vụ?')) void run(() => deleteCycleMilestone(i.id)); }}>Xóa</button>}
            </div>
          </div>
        );
      })}
      {canManage && !form && <button className="secondary" disabled={!online} onClick={() => setForm(true)}>+ Thêm mốc nhắc</button>}
      {canManage && form && (
        <MilestoneForm m={m} offset={offset} setM={setM} setOffset={setOffset} busy={busy || !online}
          onSave={(v) => run(async () => { await addCycleMilestone(cycle.id, v); setForm(false); setM({ title: '', anchor: 'start', offset: 0, note: '' }); setOffset('0'); })}
          onClose={() => setForm(false)} />
      )}
      {!cycle.expected_end_date && <p className="muted">Mốc tính từ ngày thu dự kiến sẽ có ngày khi vụ có ngày kết thúc dự kiến.</p>}
    </Collapsible>
  );
}

function MilestoneForm({ m, offset, setM, setOffset, busy, onSave, onClose }: {
  m: MilestoneInput; offset: string; setM: (v: MilestoneInput) => void; setOffset: (v: string) => void; busy: boolean; onSave: (v: MilestoneInput) => void; onClose: () => void;
}) {
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="inline-form">
      <label>Nội dung nhắc<input value={m.title} maxLength={160} onChange={(e) => setM({ ...m, title: e.target.value })} placeholder="Ví dụ: Tiêm vaccine lần 1, Ngưng bón phân" /></label>
      <div className="pair">
        <label>Tính từ
          <select value={m.anchor} onChange={(e) => setM({ ...m, anchor: e.target.value as 'start' | 'end' })}>
            <option value="start">Sau ngày bắt đầu vụ</option>
            <option value="end">Trước ngày thu / xuất dự kiến</option>
          </select>
        </label>
        <label>Số ngày<input value={offset} inputMode="numeric" onChange={(e) => setOffset(e.target.value)} /></label>
      </div>
      <label>Ghi chú (không bắt buộc)<input value={m.note} maxLength={300} onChange={(e) => setM({ ...m, note: e.target.value })} /></label>
      {err && <p className="msg error" role="alert">{err}</p>}
      <div className="btnrow">
        <button className="primary" disabled={busy} onClick={() => {
          const n = Number(offset);
          if (m.title.trim().length < 2) return setErr('Hãy nhập nội dung nhắc.');
          if (!Number.isInteger(n) || n < 0) return setErr('Số ngày phải là số nguyên, không âm.');
          setErr(null); onSave({ ...m, offset: n });
        }}>Lưu</button>
        <button type="button" className="secondary" onClick={onClose}>Hủy</button>
      </div>
    </div>
  );
}

/** Quy trình mẫu: danh sách mốc, thêm nhanh theo gợi ý hoặc tự nhập. Mốc được sao vào mỗi vụ tạo sau đó. */
export function TemplateMilestones({ templateId, kind, canEdit }: { templateId: string; kind: 'crop' | 'livestock' | 'aquatic' | 'other' | undefined; canEdit: boolean }) {
  const online = useOnline();
  const [items, setItems] = useState<TemplateMilestone[] | null>(null);
  const [form, setForm] = useState(false);
  const [m, setM] = useState<MilestoneInput>({ title: '', anchor: 'start', offset: 0, note: '' });
  const [offset, setOffset] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => listTemplateMilestones(templateId).then(setItems).catch((e) => setError(friendlyError(e)));
  useEffect(() => { if (online) void load(); }, [templateId, online]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setError(null); try { await fn(); await load(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); } };
  const suggestions = MILESTONE_SUGGESTIONS[kind === 'livestock' ? 'livestock' : 'crop'].filter((s) => !(items ?? []).some((i) => i.title === s.title));

  return (
    <Collapsible title="Mốc nhắc việc an toàn" summary={items ? `${items.length} mốc` : online ? 'Đang tải…' : 'Cần có mạng'}>
      <p className="muted">Mốc tự sinh nhắc ở Trang chủ cho mỗi vụ tạo từ quy trình này. Mốc "trước ngày thu" tự dời khi ngày thu dự kiến đổi. {kind === 'livestock' ? 'Lịch vaccine, tẩy giun do thú y của trại chốt: hãy tự thêm theo lịch đó.' : ''}</p>
      {error && <p className="msg error" role="alert">{error}</p>}
      {(items ?? []).map((i) => (
        <div className="card slim" key={i.id}>
          <div className="row"><strong className="grow">{i.title}</strong>{canEdit && <button className="link inline" disabled={busy || !online} onClick={() => void run(() => deleteTemplateMilestone(i.id))}>Xóa</button>}</div>
          <p className="muted">{milestoneWhen(i)}{i.note ? ` · ${i.note}` : ''}</p>
        </div>
      ))}
      {canEdit && suggestions.length > 0 && (
        <div className="btnrow">
          {suggestions.map((s) => <button key={s.title} className="secondary" disabled={busy || !online} onClick={() => void run(() => addTemplateMilestone(templateId, s))}>+ {s.title} ({s.offset} ngày trước thu)</button>)}
        </div>
      )}
      {canEdit && !form && <button className="secondary" disabled={!online} onClick={() => setForm(true)}>+ Thêm mốc nhắc</button>}
      {canEdit && form && (
        <MilestoneForm m={m} offset={offset} setM={setM} setOffset={setOffset} busy={busy || !online}
          onSave={(v) => run(async () => { await addTemplateMilestone(templateId, v); setForm(false); setM({ title: '', anchor: 'start', offset: 0, note: '' }); setOffset('0'); })}
          onClose={() => setForm(false)} />
      )}
    </Collapsible>
  );
}
