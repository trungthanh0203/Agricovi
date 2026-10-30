import { useMemo, useState, type FormEvent } from 'react';
import { harvestSchemaFor, useCatalog } from '../lib/catalog';
import { CYCLE_STATUS_LABEL_VI, SYNC_STATE_LABEL_VI } from '@agriconnect/shared';
import { Collapsible } from './Collapsible';
import { SafetyReminder } from './SafetyReminder';
import { DynamicField } from './DynamicField';
import { cycleCountUnit } from '../lib/countUnit';
import { fieldsToData, initialValues, summarizeFields, validateFields } from '../lib/fieldsLogic';
import { WithdrawalNotice, useWithdrawalBlocked } from './WithdrawalNotice';
import { validReason } from '../lib/withdrawalLogic';
import { SyncBadge } from './SyncBadge';
import { useAuth } from '../lib/auth';
import { db, type HarvestRow } from '../lib/db';
import { friendlyError } from '../lib/errors';
import {
  editHarvest, GRADE_SUGGESTIONS, recordHarvest, validateHarvest, voidHarvest,
} from '../lib/harvest';
import { isPendingUpload, toLocalInput, useOnline, useRecordSync } from '../lib/hooks';
import { formatQty, parseNumber } from '../lib/inventory';
import { useOrgs } from '../lib/orgs';
import { canPerm } from '../lib/permissions';
import { canManageProduction } from '../lib/roles';
import { useTable } from '../lib/tables';
import { CycleWord } from './CycleWord';
import { areaPath } from '../lib/areas';
import { cycleTitle } from '../lib/cycles';

const OWN_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000; // khớp chính sách harvest_update_own ở máy chủ
const LAST_CYCLE_KEY = 'agriconnect.lastCycle';

/** Thu hoạch: ghi, xem, sửa, hủy. Dùng được offline; sửa/hủy có phát hiện xung đột. */
export function HarvestSection() {
  const { session } = useAuth();
  const { active } = useOrgs();
  const sync = useRecordSync();
  const online = useOnline();
  const harvests = useTable('harvests');
  const cycles = useTable('cycles');
  const areas = useTable('areas');
  const { cropTypes } = useCatalog();
  const workTypeRows = useTable('workTypes');
  // biểu mẫu thu hoạch theo loại của từng vụ (điểm 2)
  const harvestSchemaOf = (cycleId: string) => harvestSchemaFor(workTypeRows, active?.id, cropTypes.find((c) => c.id === cycles.find((x) => x.id === cycleId)?.crop_type_id)?.kind);

  const [mode, setMode] = useState<{ kind: 'list' } | { kind: 'new' } | { kind: 'edit'; id: string }>({ kind: 'list' });
  const [cycleFilter, setCycleFilter] = useState('');
  const [showVoided, setShowVoided] = useState(false);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const uid = session?.user.id;
  const canRecord = canPerm(active?.perms, 'harvest', 'edit'); // chủ cơ sở cấp quyền nhập liệu thu hoạch
  const manager = canManageProduction(active?.roles);

  const myCycles = useMemo(
    () => cycles.filter((c) => c.owner_org_id === active?.id || areas.find((a) => a.id === c.area_id)?.organization_id === active?.id),
    [cycles, areas, active],
  );
  const myCycleIds = useMemo(() => new Set(myCycles.map((c) => c.id)), [myCycles]);
  const cycleLabel = (id: string | null) => {
    const c = cycles.find((x) => x.id === id);
    if (!c) return '';
    return `${cycleTitle(c, cropTypes.find((t) => t.id === c.crop_type_id)?.name ?? '')} · ${(areaPath(c.area_id, areas) || '')}`;
  };

  const list = useMemo(
    () => harvests
      .filter((h) => myCycleIds.has(h.cycle_id))
      .filter((h) => !cycleFilter || h.cycle_id === cycleFilter)
      .filter((h) => (showVoided ? true : !h.voided_at))
      .sort((a, b) => b.harvested_at.localeCompare(a.harvested_at)),
    [harvests, myCycleIds, cycleFilter, showVoided],
  );
  const valid = list.filter((h) => !h.voided_at);
  const gross = valid.reduce((s, h) => s + h.quantity, 0);
  const loss = valid.reduce((s, h) => s + (h.loss_quantity ?? 0), 0);

  function canEdit(h: HarvestRow): boolean {
    if (h.voided_at || !canRecord) return false;
    if (!online) return false; // sửa/hủy cần mạng (D24)
    if (isPendingUpload(sync, h.id)) return false; // chưa lên máy chủ thì chưa sửa/hủy được
    if (manager) return true;
    if (!uid || h.created_by !== uid) return false;
    const base = h.received_at ? new Date(h.received_at).getTime() : Date.now();
    return Date.now() - base < OWN_EDIT_WINDOW_MS;
  }

  async function confirmVoid(id: string) {
    if (reason.trim().length < 3) return setMsg('Hãy ghi lý do hủy (ít nhất 3 ký tự).');
    try {
      await voidHarvest(id, reason);
      setVoiding(null);
      setReason('');
      setMsg(null);
    } catch (e) {
      setMsg(friendlyError(e));
    }
  }

  if (mode.kind === 'new' || mode.kind === 'edit') {
    return (
      <HarvestForm
        cycles={myCycles.filter((c) => c.status !== 'cancelled')}
        cycleLabel={cycleLabel}
        editing={mode.kind === 'edit' ? harvests.find((h) => h.id === mode.id) ?? null : null}
        userId={uid ?? ''}
        onClose={() => setMode({ kind: 'list' })}
      />
    );
  }

  return (
    <>
      {canRecord ? (
        <button className="primary" onClick={() => setMode({ kind: 'new' })} disabled={myCycles.length === 0}>Ghi thu hoạch</button>
      ) : (
        <p className="muted">Bạn chỉ được xem thu hoạch (chủ cơ sở cấp quyền nhập liệu).</p>
      )}
      {myCycles.length === 0 && <p className="msg warn">Chưa có vụ nào. Hãy tạo vụ ở màn hình Sản xuất trước.</p>}

      <Collapsible inline title="Bộ lọc" summary={`${cycleFilter ? cycleLabel(cycleFilter) : 'Tất cả vụ'}${showVoided ? ' · cả phiếu đã hủy' : ''}`}>
      <div className="filters">
          <label>
            <CycleWord cap />
            <select value={cycleFilter} onChange={(e) => setCycleFilter(e.target.value)}>
              <option value="">Tất cả vụ</option>
              {myCycles.map((c) => <option key={c.id} value={c.id}>{cycleLabel(c.id)} ({CYCLE_STATUS_LABEL_VI[c.status]})</option>)}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} />
            Hiện cả phiếu đã hủy
          </label>
        </div>
      </Collapsible>

      <div className="card slim">
        <div className="row"><span>Tổng thu</span><strong>{formatQty(gross)} kg</strong></div>
        <div className="row"><span>Hao hụt</span><strong>{formatQty(loss)} kg</strong></div>
        <div className="row"><span>Còn lại sau hao hụt</span><strong>{formatQty(gross - loss)} kg</strong></div>
        <p className="muted">{valid.length} phiếu{cycleFilter ? ' của vụ đã chọn' : ''}. Chỉ tính phiếu chưa hủy.</p>
      </div>

      {!online && <p className="muted">Đang offline: vẫn ghi được phiếu mới (tự gửi khi có mạng); sửa và hủy cần có mạng.</p>}
      {msg && <p className="msg warn" role="status">{msg}</p>}
      {list.length === 0 && <p className="muted">Chưa có phiếu thu hoạch nào.</p>}

      {list.map((h) => (
        <div className={h.voided_at ? 'card slim voided' : 'card slim'} key={h.id}>
          <div className="row">
            <strong>{formatQty(h.quantity)} kg{h.grade ? ` · ${h.grade}` : ''}</strong>
            <span className="muted">{new Date(h.harvested_at).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}</span>
          </div>
          <p className="muted">{cycleLabel(h.cycle_id)}{h.lot_code ? ` · mã lô ${h.lot_code}` : ''}</p>
          {h.unit_count ? <p>Số lượng: {h.unit_count.toLocaleString('vi-VN')}{h.unit_count && h.quantity ? ` (TB ${formatQty(h.quantity / h.unit_count)} kg)` : ''}</p> : null}
          {h.extra && summarizeFields(harvestSchemaOf(h.cycle_id), h.extra) ? <p>{summarizeFields(harvestSchemaOf(h.cycle_id), h.extra)}</p> : null}
          {h.loss_quantity ? <p>Hao hụt: {formatQty(h.loss_quantity)} kg</p> : null}
          {h.note && <p>{h.note}</p>}
          <div className="badges">
            {h.version > 1 && !h.voided_at && <span className="pill">Đã chỉnh sửa</span>}
            {h.voided_at && <span className="pill err">Đã hủy</span>}
            <SyncBadge sync={sync.get(h.id)} />
          </div>
          {h.voided_at && h.void_reason && <p className="muted">Lý do hủy: {h.void_reason}</p>}

          {canEdit(h) && voiding !== h.id && (
            <div className="actions">
              <button className="secondary" onClick={() => setMode({ kind: 'edit', id: h.id })}>Sửa</button>
              <button className="secondary" onClick={() => { setVoiding(h.id); setReason(''); setMsg(null); }}>Hủy phiếu</button>
            </div>
          )}
          {voiding === h.id && (
            <div className="inline-form">
              <label>
                Lý do hủy
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ví dụ: nhập nhầm số lượng" />
              </label>
              <p className="muted">Phiếu không bị xóa, chỉ được đánh dấu đã hủy và không khôi phục được.</p>
              <div className="actions">
                <button className="secondary" onClick={() => void confirmVoid(h.id)}>Xác nhận hủy</button>
                <button className="link" onClick={() => setVoiding(null)}>Không hủy</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </>
  );
}

function HarvestForm({ cycles, cycleLabel, editing, userId, onClose }: {
  cycles: { id: string; status: keyof typeof CYCLE_STATUS_LABEL_VI; owner_org_id: string; area_id: string; crop_type_id: string }[];
  cycleLabel: (id: string | null) => string;
  editing: HarvestRow | null;
  userId: string;
  onClose: () => void;
}) {
  const sync = useRecordSync();
  const online = useOnline();
  const allCycles = useTable('cycles');
  const { cropTypes } = useCatalog();
  const workTypeRows = useTable('workTypes');
  const { active: activeOrg } = useOrgs();
  const schemaOf = (cycleId: string) => harvestSchemaFor(workTypeRows, activeOrg?.id, cropTypes.find((c) => c.id === allCycles.find((x) => x.id === cycleId)?.crop_type_id)?.kind);
  const remembered = (() => { try { return localStorage.getItem(LAST_CYCLE_KEY); } catch { return null; } })();
  // vụ đang chạy lên đầu danh sách
  const ordered = [...cycles].sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active'));

  const [cycleId, setCycleId] = useState(editing?.cycle_id ?? '');
  const [when, setWhen] = useState(toLocalInput(editing ? new Date(editing.harvested_at) : new Date()));
  const [grade, setGrade] = useState(editing?.grade ?? '');
  const [qty, setQty] = useState(editing ? String(editing.quantity) : '');
  const [loss, setLoss] = useState(editing?.loss_quantity ? String(editing.loss_quantity) : '');
  const [note, setNote] = useState(editing?.note ?? '');
  const [cnt, setCnt] = useState(editing?.unit_count ? String(editing.unit_count) : '');
  const [vals, setVals] = useState<Record<string, string>>(() => initialValues(editing ? schemaOf(editing.cycle_id) : [], editing?.extra ?? undefined));
  const [wReason, setWReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const effCycleId = editing ? editing.cycle_id : cycleId || (ordered.find((c) => c.id === remembered)?.id ?? ordered[0]?.id ?? '');
  const whenDay = toLocalInput(new Date(when)).slice(0, 10);
  const inWithdrawal = useWithdrawalBlocked(effCycleId, whenDay);
  const unitName = cycleCountUnit(allCycles.find((c) => c.id === effCycleId), cropTypes);
  const schema = schemaOf(effCycleId);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const q = parseNumber(qty);
    const l = parseNumber(loss);
    const bad = validateHarvest(q, l);
    if (bad) return setError(bad);
    const cycle = allCycles.find((c) => c.id === effCycleId);
    if (!cycle) return setError('Hãy chọn vụ.');
    const c = cnt.trim() ? Number(cnt.replace(/[.,\s]/g, '')) : null;
    if (c !== null && (!Number.isInteger(c) || c <= 0)) return setError(`Số ${unitName} phải là số nguyên lớn hơn 0.`);
    const merged = { ...initialValues(schema), ...vals };
    const badField = validateFields(schema, merged);
    if (badField) return setError(badField);
    const extra = fieldsToData(schema, merged);
    if (inWithdrawal && !editing && !validReason(wReason)) return setError('Vụ còn trong thời gian cách ly: hãy ghi lý do vẫn thu hoạch vào ngày này (ít nhất 3 ký tự), hoặc đổi sang ngày đã hết cách ly.');
    setError(null);
    try {
      if (editing) {
        await editHarvest(editing.id, { harvestedAt: new Date(when).toISOString(), grade, quantity: q!, lossQuantity: l, note, unitCount: c, extra });
        onClose();
        return;
      }
      const id = await recordHarvest({ cycle, harvestedAt: new Date(when).toISOString(), grade, quantity: q!, lossQuantity: l, note, userId, withdrawalReason: inWithdrawal ? wReason : undefined, unitCount: c, extra });
      try { localStorage.setItem(LAST_CYCLE_KEY, cycle.id); } catch { /* bỏ qua */ }
      setSavedId(id);
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  function again() {
    setSavedId(null);
    setQty('');
    setLoss('');
    setNote('');
    setCnt('');
    setVals(initialValues(schema));
    setWReason('');
    setError(null);
    setWhen(toLocalInput(new Date()));
  }

  if (savedId) {
    const s = sync.get(savedId);
    return (
      <section>
        <h1>Đã ghi thu hoạch</h1>
        <p className="msg ok" role="status">{s && s.state !== 'synced' ? SYNC_STATE_LABEL_VI.local_only : SYNC_STATE_LABEL_VI.synced}</p>
        <SyncBadge sync={s} />
        {(!s || s.state !== 'synced') && !navigator.onLine && <p className="muted">Phiếu đang nằm trên điện thoại và sẽ tự gửi khi có mạng.</p>}
        <button className="primary" onClick={again}>Ghi thêm phiếu</button>
        <button className="secondary" onClick={onClose}>Xong</button>
      </section>
    );
  }

  return (
    <section>
      <h1>{editing ? 'Sửa phiếu thu hoạch' : 'Ghi thu hoạch'}</h1>
      <form className="inline-form" onSubmit={onSubmit} noValidate>
        {editing ? (
          <p className="muted">{cycleLabel(editing.cycle_id)} — không đổi được vụ; muốn đổi hãy hủy phiếu và ghi lại. Mọi thay đổi được lưu lịch sử.</p>
        ) : (
          <label>
            <CycleWord cap />
            <select value={effCycleId} onChange={(e) => setCycleId(e.target.value)}>
              {ordered.map((c) => <option key={c.id} value={c.id}>{cycleLabel(c.id)} ({CYCLE_STATUS_LABEL_VI[c.status]})</option>)}
            </select>
          </label>
        )}
        <label>
          Thời điểm thu
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </label>
        <WithdrawalNotice cycleId={effCycleId} date={whenDay} reason={wReason} onReason={setWReason} />
        <SafetyReminder cycleId={effCycleId} />
        <label>
          Khối lượng thu (kg)
          <input value={qty} inputMode="decimal" onChange={(e) => setQty(e.target.value)} />
        </label>
        <label>
          Số lượng ({unitName}, không bắt buộc)
          <input value={cnt} inputMode="numeric" onChange={(e) => setCnt(e.target.value)} />
          <small>Có số này, app tính khối lượng trung bình mỗi {unitName}; với vật nuôi, thủy sản thì tự trừ vào số còn lại của vụ.</small>
        </label>
        <label>
          Hao hụt (kg, không bắt buộc)
          <input value={loss} inputMode="decimal" onChange={(e) => setLoss(e.target.value)} />
          <small>Phần hỏng, chết, loại bỏ… đã tính trong khối lượng thu ở trên.</small>
        </label>
        <label>
          Loại cỡ (không bắt buộc)
          <input value={grade} list="grade-list" onChange={(e) => setGrade(e.target.value)} placeholder="Loại 1, cỡ lớn…" />
          <datalist id="grade-list">{GRADE_SUGGESTIONS.map((g) => <option key={g} value={g} />)}</datalist>
        </label>
        {schema.length > 0 && (
          <Collapsible inline title="＋ Thông tin thêm theo mẫu của cơ sở" summary="mở để nhập">
            {schema.map((f) => (
              <DynamicField key={f.key} def={f} value={vals[f.key] ?? initialValues([f])[f.key] ?? ''} onChange={(v) => setVals((s) => ({ ...s, [f.key]: v }))} />
            ))}
          </Collapsible>
        )}
        <label>
          Ghi chú (không bắt buộc)
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {error && <p className="msg error" role="alert">{error}</p>}
        {!online && (
          <p className="msg warn">
            {editing ? 'Đang offline. Sửa phiếu cần có mạng; hãy kết nối mạng rồi bấm Lưu thay đổi.' : 'Đang offline. Phiếu sẽ được lưu trên điện thoại và tự gửi khi có mạng.'}
          </p>
        )}
        <div className="btnrow">
          <button type="submit" className="primary" disabled={Boolean(editing) && !online}>{editing ? 'Lưu thay đổi' : 'Lưu'}</button>
          <button type="button" className="secondary" onClick={onClose}>Hủy</button>
        </div>
      </form>
    </section>
  );
}
