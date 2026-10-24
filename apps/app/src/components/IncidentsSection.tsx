import { useEffect, useMemo, useState } from 'react';
import { AutoTextarea } from './AutoTextarea';
import { Collapsible } from './Collapsible';
import { Img, ImagePicker } from './ImagePicker';
import { db, type IncidentActionRow, type IncidentRow, type StageRow } from '../lib/db';
import { fmtDate, diffDays } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import {
  addIncidentAction, closeIncident, deleteIncidentAction, reopenIncident, reportIncident, setIncidentActionDone, updateIncident, voidIncident,
  type IncidentInput,
} from '../lib/incidents';
import {
  INCIDENT_KINDS, INCIDENT_SEVERITIES, kindLabel, liveIncidents, openCount, overdueActions, severityLabel, sortIncidents,
} from '../lib/incidentsLogic';
import { listMembers, type Member } from '../lib/members';
import { parseDecimal } from '../lib/areaUnits';
import { useTable } from '../lib/tables';

/**
 * Sự cố và xử lý của một vụ (D95): mọi người của vụ báo sự cố (loại, mức độ, mô tả, thiệt hại ước tính, ảnh);
 * người quản lý giao việc khắc phục (người phụ trách, hạn) và chỉ đóng sự cố khi mọi việc đã xong. Cần mạng.
 */
export function IncidentsSection({ cycleId, orgId, stages, canManage, userId, online, today }: {
  cycleId: string; orgId: string; stages: StageRow[]; canManage: boolean; userId: string | undefined; online: boolean; today: string;
}) {
  const allIncidents = useTable('incidents');
  const allActions = useTable('incidentActions');
  const incidents = useMemo(() => sortIncidents(allIncidents.filter((i) => i.cycle_id === cycleId)), [allIncidents, cycleId]);
  const actions = useMemo(() => allActions.filter((a) => a.cycle_id === cycleId), [allActions, cycleId]);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<{ edit?: IncidentRow } | null>(null);

  // danh sách người phụ trách chỉ tải cho người quản lý (hàm máy chủ chỉ cho chủ/quản lý xem)
  useEffect(() => {
    if (!canManage || !online) return;
    let live = true;
    listMembers(orgId).then((m) => { if (live) setMembers(m.filter((x) => x.status !== 'suspended')); }).catch(() => undefined);
    return () => { live = false; };
  }, [canManage, online, orgId]);

  async function run(fn: () => Promise<unknown>): Promise<boolean> {
    setBusy(true); setError(null);
    try { await fn(); return true; } catch (e) { setError(friendlyError(e)); return false; } finally { setBusy(false); }
  }

  const open = openCount(incidents);
  const late = overdueActions(actions, incidents, today).length;
  const live = liveIncidents(incidents);
  const summary = live.length === 0 ? 'chưa có sự cố' : `${open} đang mở${late > 0 ? ` · ${late} việc quá hạn` : ''} · ${live.length} tất cả`;

  return (
    <Collapsible title="Sự cố và xử lý" summary={summary} warn={late > 0 || open > 0} defaultOpen={open > 0}>
      {error && <p className="msg error" role="alert">{error}</p>}
      {!online && <p className="msg warn" role="status">Đang offline: báo sự cố và xử lý cần có mạng.</p>}

      {form ? (
        <IncidentForm
          key={form.edit?.id ?? 'new'} edit={form.edit} stages={stages} today={today} busy={busy || !online}
          onClose={() => setForm(null)}
          onSave={(v) => run(async () => {
            if (form.edit) await updateIncident(form.edit, v); else await reportIncident(crypto.randomUUID(), cycleId, v);
            setForm(null);
          })}
        />
      ) : (
        <button className="secondary" disabled={!online} onClick={() => setForm({})}>+ Báo sự cố</button>
      )}

      {incidents.filter((i) => !i.voided_at).map((i) => (
        <IncidentCard
          key={i.id} inc={i} actions={actions.filter((a) => a.incident_id === i.id)} stage={stages.find((s) => s.id === i.stage_id)}
          canManage={canManage} isMine={i.created_by === userId} userId={userId} members={members} online={online} busy={busy} today={today}
          run={run} onEdit={() => setForm({ edit: i })}
        />
      ))}
      {live.length === 0 && !form && <p className="muted">Chưa ghi sự cố nào. Khi có sâu bệnh, hao hụt, thời tiết xấu hay khách phản ánh, hãy bấm "Báo sự cố" để có hồ sơ xử lý.</p>}
    </Collapsible>
  );
}

function IncidentCard({ inc, actions, stage, canManage, isMine, userId, members, online, busy, today, run, onEdit }: {
  inc: IncidentRow; actions: IncidentActionRow[]; stage: StageRow | undefined; canManage: boolean; isMine: boolean; userId: string | undefined; members: Member[];
  online: boolean; busy: boolean; today: string; run: (fn: () => Promise<unknown>) => Promise<boolean>; onEdit: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [closing, setClosing] = useState(false);
  const [note, setNote] = useState('');
  const isOpen = inc.status === 'open';
  const left = actions.filter((a) => !a.done).length;
  const canEdit = isOpen && (canManage || isMine);
  const off = busy || !online;
  return (
    <div className="card slim">
      <div className="row">
        <strong className="grow">{kindLabel(inc.kind)} · {fmtDate(inc.incident_date)}</strong>
        <span className={inc.severity === 'high' ? 'pill err' : inc.severity === 'medium' ? 'pill warn' : 'pill'}>{severityLabel(inc.severity)}</span>
        <span className={isOpen ? 'pill warn' : 'pill ok'}>{isOpen ? 'Đang mở' : 'Đã đóng'}</span>
      </div>
      <p>{inc.description}</p>
      <p className="muted">
        {inc.author_name ? `Người báo: ${inc.author_name}` : ''}{stage ? ` · Giai đoạn: ${stage.name}` : ''}
        {inc.loss_quantity !== null ? ` · Hao hụt ước tính ${inc.loss_quantity.toLocaleString('vi-VN')}` : ''}
        {inc.loss_amount !== null ? ` · Thiệt hại ước tính ${inc.loss_amount.toLocaleString('vi-VN')} đ` : ''}
      </p>
      {inc.image && <Img value={inc.image} alt="Ảnh sự cố" className="thumb" size="f" />}
      {!isOpen && inc.close_note && <p className="muted">Kết quả: {inc.close_note}{inc.closed_at ? ` (${fmtDate(inc.closed_at)})` : ''}</p>}

      <h3 className="muted" style={{ margin: '8px 0 2px' }}>Việc khắc phục{actions.length > 0 ? ` (${actions.length - left}/${actions.length} xong)` : ''}</h3>
      {actions.length === 0 && <p className="muted">Chưa giao việc nào.</p>}
      {actions.map((a) => {
        const d = a.due_date ? diffDays(today, a.due_date) : null;
        const canTick = isOpen && (canManage || (a.assignee_id !== null && a.assignee_id === userId));
        return (
          <div className="note-row" key={a.id}>
            <label className="check">
              <input type="checkbox" checked={a.done} disabled={off || !canTick} aria-label={`Đã xong: ${a.content}`}
                onChange={() => void run(() => setIncidentActionDone(a.id, !a.done))} />
              <span className={a.done ? 'done' : ''}>
                {a.content}
                <small className="muted"> — {a.assignee_name ?? 'chưa giao ai'}{a.due_date ? ` · hạn ${fmtDate(a.due_date)}` : ''}</small>
              </span>
            </label>
            {!a.done && d !== null && isOpen && <span className={d < 0 ? 'pill err' : d === 0 ? 'pill warn' : 'pill'}>{d < 0 ? `Quá hạn ${-d} ngày` : d === 0 ? 'Hôm nay' : `Còn ${d} ngày`}</span>}
            {canManage && isOpen && !a.done && (
              <button className="icon" aria-label={`Xóa việc: ${a.content}`} disabled={off}
                onClick={() => { if (window.confirm('Xóa việc khắc phục này?')) void run(() => deleteIncidentAction(a.id)); }}>✕</button>
            )}
          </div>
        );
      })}

      {canManage && isOpen && (adding
        ? <ActionForm members={members} busy={off} today={today} onClose={() => setAdding(false)}
            onSave={(c, who, due) => run(async () => { await addIncidentAction(inc.id, c, who, due); setAdding(false); })} />
        : <button className="secondary" disabled={off} onClick={() => setAdding(true)}>+ Giao việc khắc phục</button>)}

      <div className="btnrow">
        {canEdit && <button className="secondary" disabled={off} onClick={onEdit}>Sửa</button>}
        {canManage && isOpen && !closing && (
          <button className="primary" disabled={off || left > 0} title={left > 0 ? `Còn ${left} việc chưa xong` : undefined} onClick={() => setClosing(true)}>
            {left > 0 ? `Còn ${left} việc chưa xong` : 'Đóng sự cố'}
          </button>
        )}
        {canManage && !isOpen && <button className="secondary" disabled={off} onClick={() => void run(() => reopenIncident(inc.id))}>Mở lại</button>}
        {(canManage || (isMine && isOpen)) && (
          <button className="secondary" disabled={off} onClick={() => {
            const reason = window.prompt('Lý do hủy sự cố này (ví dụ: báo nhầm)?');
            if (reason && reason.trim()) void run(() => voidIncident(inc.id, reason.trim()));
          }}>Hủy sự cố</button>
        )}
      </div>
      {closing && (
        <div className="inline-form">
          <label>Kết quả xử lý (không bắt buộc)<AutoTextarea value={note} maxLength={500} onChange={setNote} placeholder="Ví dụ: Đã phun thuốc, dưa phục hồi sau 3 ngày" /></label>
          <div className="btnrow">
            <button className="primary" disabled={off} onClick={() => void run(async () => { await closeIncident(inc.id, note); setClosing(false); })}>Đóng sự cố</button>
            <button className="secondary" onClick={() => setClosing(false)}>Hủy</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionForm({ members, busy, today, onSave, onClose }: {
  members: Member[]; busy: boolean; today: string; onSave: (content: string, assignee: string | null, due: string | null) => Promise<unknown>; onClose: () => void;
}) {
  const [content, setContent] = useState('');
  const [who, setWho] = useState('');
  const [due, setDue] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="inline-form">
      <label>Việc cần làm<AutoTextarea value={content} maxLength={300} onChange={setContent} placeholder="Ví dụ: Phun thuốc xử lý nấm luống 3" /></label>
      <div className="pair">
        <label>Người phụ trách
          <select value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">— Chưa giao —</option>
            {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}{m.is_self ? ' (bạn)' : ''}</option>)}
          </select>
        </label>
        <label>Hạn xong<input type="date" value={due} min={today} onChange={(e) => setDue(e.target.value)} /></label>
      </div>
      {err && <p className="msg error" role="alert">{err}</p>}
      <div className="btnrow">
        <button className="primary" disabled={busy} onClick={() => {
          if (!content.trim()) return setErr('Hãy ghi việc cần làm.');
          setErr(null);
          void onSave(content.trim(), who || null, due || null);
        }}>Lưu</button>
        <button type="button" className="secondary" onClick={onClose}>Hủy</button>
      </div>
    </div>
  );
}

function IncidentForm({ edit, stages, today, busy, onSave, onClose }: {
  edit?: IncidentRow; stages: StageRow[]; today: string; busy: boolean; onSave: (v: IncidentInput) => Promise<unknown>; onClose: () => void;
}) {
  const [kind, setKind] = useState<IncidentRow['kind']>(edit?.kind ?? 'pest');
  const [severity, setSeverity] = useState<IncidentRow['severity']>(edit?.severity ?? 'medium');
  const [date, setDate] = useState(edit?.incident_date ?? today);
  const [stageId, setStageId] = useState(edit?.stage_id ?? '');
  const [desc, setDesc] = useState(edit?.description ?? '');
  const [qty, setQty] = useState(edit?.loss_quantity != null ? String(edit.loss_quantity) : '');
  const [amount, setAmount] = useState(edit?.loss_amount != null ? String(edit.loss_amount) : '');
  const [image, setImage] = useState(edit?.image ?? '');
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="card">
      <h2>{edit ? 'Sửa sự cố' : 'Báo sự cố'}</h2>
      <div className="inline-form">
        <div className="pair">
          <label>Loại sự cố
            <select value={kind} onChange={(e) => setKind(e.target.value as IncidentRow['kind'])}>
              {INCIDENT_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          </label>
          <label>Mức độ
            <select value={severity} onChange={(e) => setSeverity(e.target.value as IncidentRow['severity'])}>
              {INCIDENT_SEVERITIES.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          </label>
        </div>
        <div className="pair">
          <label>Ngày xảy ra<input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></label>
          <label>Giai đoạn (nếu biết)
            <select value={stageId} onChange={(e) => setStageId(e.target.value)}>
              <option value="">— Không chọn —</option>
              {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        </div>
        <label>Mô tả<AutoTextarea value={desc} maxLength={1000} onChange={setDesc} placeholder="Ví dụ: Dưa ở luống 3 héo rũ, lá vàng, khoảng 20 cây" /></label>
        <div className="pair">
          <label>Hao hụt ước tính (kg hoặc cây)<input value={qty} inputMode="decimal" onChange={(e) => setQty(e.target.value)} placeholder="Không bắt buộc" /></label>
          <label>Thiệt hại ước tính (đồng)<input value={amount} inputMode="numeric" onChange={(e) => setAmount(e.target.value)} placeholder="Không bắt buộc" /></label>
        </div>
        <ImagePicker value={image} onChange={setImage} label="Ảnh sự cố (không bắt buộc)" />
        {err && <p className="msg error" role="alert">{err}</p>}
        <div className="btnrow">
          <button className="primary" disabled={busy} onClick={() => {
            if (!desc.trim()) return setErr('Hãy mô tả ngắn sự cố.');
            const q = qty.trim() ? parseDecimal(qty) : null;
            const m = amount.trim() ? parseDecimal(amount) : null;
            if ((qty.trim() && (q === null || q < 0)) || (amount.trim() && (m === null || m < 0))) return setErr('Thiệt hại phải là số, không âm.');
            setErr(null);
            void onSave({ kind, date, stageId: stageId || null, severity, description: desc.trim(), lossQty: q, lossAmount: m, image }).catch(() => undefined);
          }}>Lưu</button>
          <button type="button" className="secondary" onClick={onClose}>Hủy</button>
        </div>
      </div>
    </div>
  );
}
