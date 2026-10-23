import { useMemo, useState, type FormEvent } from 'react';
import { useCatalog } from '../lib/catalog';
import { CYCLE_STATUS_LABEL_VI } from '@agriconnect/shared';
import { Collapsible } from './Collapsible';
import { useAuth } from '../lib/auth';
import { db, type ExpenseRow } from '../lib/db';
import { friendlyError } from '../lib/errors';
import {
  editExpense, EXPENSE_CATEGORY_LABEL, EXPENSE_KIND_HINT, EXPENSE_KIND_LABEL, NEEDS_ASSUMPTION, recordExpense,
  validateExpense, voidExpense,
} from '../lib/finance';
import { todayLocal, useOnline } from '../lib/hooks';
import { formatMoney, parseNumber } from '../lib/inventory';
import { useOrgs } from '../lib/orgs';
import { canPerm } from '../lib/permissions';
import { useTable } from '../lib/tables';

const LAST_CYCLE_KEY = 'agriconnect.lastCycle';

/** Chi phí: nhóm, loại, số tiền, ngày, vụ (không bắt buộc). Chỉ chủ và Kho & chi phí ghi/sửa/hủy; người khác chỉ xem. */
export function ExpenseSection() {
  const { session } = useAuth();
  const { active } = useOrgs();
  const online = useOnline();
  const expenses = useTable('expenses');
  const cycles = useTable('cycles');
  const areas = useTable('areas');
  const { cropTypes } = useCatalog();

  const [mode, setMode] = useState<{ kind: 'list' } | { kind: 'new' } | { kind: 'edit'; id: string }>({ kind: 'list' });
  const [cycleFilter, setCycleFilter] = useState(''); // '' = tất cả, 'none' = chi phí chung
  const [showVoided, setShowVoided] = useState(false);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const canWrite = canPerm(active?.perms, 'expenses', 'edit');
  // chỉ vụ do chính cơ sở này sở hữu mới ghi được chi phí (quyền ghi theo chủ vụ)
  const ownCycles = useMemo(() => cycles.filter((c) => c.owner_org_id === active?.id), [cycles, active]);
  const cycleLabel = (id: string | null) => {
    if (!id) return 'Chi phí chung của cơ sở';
    const c = cycles.find((x) => x.id === id);
    if (!c) return '';
    return `${cropTypes.find((t) => t.id === c.crop_type_id)?.name ?? ''} · ${areas.find((a) => a.id === c.area_id)?.name ?? ''}`;
  };

  const list = useMemo(
    () => expenses
      .filter((e) => e.organization_id === active?.id)
      .filter((e) => !cycleFilter || (cycleFilter === 'none' ? e.cycle_id === null : e.cycle_id === cycleFilter))
      .filter((e) => (showVoided ? true : !e.voided_at))
      .sort((a, b) => b.expense_date.localeCompare(a.expense_date) || (b.received_at ?? '').localeCompare(a.received_at ?? '')),
    [expenses, active, cycleFilter, showVoided],
  );
  const valid = list.filter((e) => !e.voided_at);
  // Không cộng gộp các loại khác nhau: báo cáo phải phân biệt tiền thực chi, vật tư ghi tay và ước tính/phân bổ (v1.1 mục 4.5)
  const sumKind = (kinds: string[]) => valid.filter((e) => kinds.includes(e.kind)).reduce((s, e) => s + e.amount, 0);

  async function confirmVoid(id: string) {
    if (reason.trim().length < 3) return setMsg('Hãy ghi lý do hủy (ít nhất 3 ký tự).');
    try {
      await voidExpense(id, reason);
      setVoiding(null);
      setReason('');
      setMsg(null);
    } catch (e) {
      setMsg(friendlyError(e));
    }
  }

  if (!active) return null;

  if (mode.kind !== 'list') {
    return (
      <ExpenseForm
        orgId={active.id}
        cycles={ownCycles.filter((c) => c.status !== 'cancelled')}
        cycleLabel={cycleLabel}
        editing={mode.kind === 'edit' ? expenses.find((e) => e.id === mode.id) ?? null : null}
        userId={session?.user.id ?? ''}
        onClose={() => setMode({ kind: 'list' })}
      />
    );
  }

  return (
    <>
      {canWrite ? (
        <button className="primary" onClick={() => setMode({ kind: 'new' })} disabled={!online}>Ghi chi phí</button>
      ) : (
        <p className="muted">Bạn chỉ được xem chi phí. Chủ cơ sở cấp quyền nhập liệu cho từng người.</p>
      )}

      <Collapsible inline title="Bộ lọc" summary={`${cycleFilter === 'none' ? 'Chi phí chung' : cycleFilter ? cycleLabel(cycleFilter) : 'Tất cả'}${showVoided ? ' · cả khoản đã hủy' : ''}`}>
      <div className="filters">
          <label>
            Vụ trồng
            <select value={cycleFilter} onChange={(e) => setCycleFilter(e.target.value)}>
              <option value="">Tất cả</option>
              <option value="none">Chi phí chung (không gắn vụ)</option>
              {ownCycles.map((c) => <option key={c.id} value={c.id}>{cycleLabel(c.id)} ({CYCLE_STATUS_LABEL_VI[c.status]})</option>)}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} />
            Hiện cả khoản đã hủy
          </label>
        </div>
      </Collapsible>

      <div className="card slim">
        <div className="row"><span>Tiền thực chi</span><strong>{formatMoney(sumKind(['cash_paid']))}</strong></div>
        <div className="row"><span>Vật tư đã dùng (ghi tay)</span><strong>{formatMoney(sumKind(['material_used']))}</strong></div>
        <div className="row"><span>Phân bổ / ước tính</span><strong>{formatMoney(sumKind(['allocated', 'estimated']))}</strong></div>
        <p className="muted">{valid.length} khoản chưa hủy. Ba dòng trên tách riêng, không cộng gộp vì bản chất khác nhau.</p>
      </div>

      {!online && <p className="msg warn" role="status">Đang offline: chỉ xem được. Ghi, sửa và hủy cần có mạng.</p>}
      {msg && <p className="msg warn" role="status">{msg}</p>}
      {list.length === 0 && <p className="muted">Chưa có khoản chi nào.</p>}

      {list.map((e) => (
        <div className={e.voided_at ? 'card slim voided' : 'card slim'} key={e.id}>
          <div className="row">
            <strong>{formatMoney(e.amount)}</strong>
            <span className="muted">{new Date(`${e.expense_date}T00:00:00`).toLocaleDateString('vi-VN')}</span>
          </div>
          <p>{EXPENSE_CATEGORY_LABEL[e.category] ?? e.category} · {EXPENSE_KIND_LABEL[e.kind] ?? e.kind}</p>
          <p className="muted">{cycleLabel(e.cycle_id)}</p>
          {e.note && <p>{NEEDS_ASSUMPTION.has(e.kind) ? 'Giả định: ' : ''}{e.note}</p>}
          <div className="badges">
            {e.version > 1 && !e.voided_at && <span className="pill">Đã chỉnh sửa</span>}
            {e.voided_at && <span className="pill err">Đã hủy</span>}
          </div>
          {e.voided_at && e.void_reason && <p className="muted">Lý do hủy: {e.void_reason}</p>}

          {canWrite && online && !e.voided_at && voiding !== e.id && (
            <div className="actions">
              <button className="secondary" onClick={() => setMode({ kind: 'edit', id: e.id })}>Sửa</button>
              <button className="secondary" onClick={() => { setVoiding(e.id); setReason(''); setMsg(null); }}>Hủy khoản chi</button>
            </div>
          )}
          {voiding === e.id && (
            <div className="inline-form">
              <label>
                Lý do hủy
                <input value={reason} onChange={(ev) => setReason(ev.target.value)} placeholder="Ví dụ: nhập nhầm số tiền" />
              </label>
              <p className="muted">Khoản chi không bị xóa, chỉ được đánh dấu đã hủy và không khôi phục được.</p>
              <div className="actions">
                <button className="secondary" onClick={() => void confirmVoid(e.id)}>Xác nhận hủy</button>
                <button className="link" onClick={() => setVoiding(null)}>Không hủy</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </>
  );
}

function ExpenseForm({ orgId, cycles, cycleLabel, editing, userId, onClose }: {
  orgId: string;
  cycles: { id: string; status: keyof typeof CYCLE_STATUS_LABEL_VI }[];
  cycleLabel: (id: string | null) => string;
  editing: ExpenseRow | null;
  userId: string;
  onClose: () => void;
}) {
  const online = useOnline();
  const allCycles = useTable('cycles');
  const remembered = (() => { try { return localStorage.getItem(LAST_CYCLE_KEY); } catch { return null; } })();

  // '' = chưa chọn (dùng vụ đã nhớ), 'none' = chi phí chung
  const [cycleId, setCycleId] = useState(editing ? editing.cycle_id ?? 'none' : '');
  const [category, setCategory] = useState(editing?.category ?? 'other');
  const [kind, setKind] = useState(editing?.kind ?? 'cash_paid');
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '');
  const [date, setDate] = useState(editing?.expense_date ?? todayLocal());
  const [note, setNote] = useState(editing?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [draftId, setDraftId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);

  const effCycle = cycleId || (cycles.find((c) => c.id === remembered)?.id ?? 'none');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const a = parseNumber(amount);
    const bad = validateExpense(a, kind, note);
    if (bad) return setError(bad);
    setError(null);
    setBusy(true);
    try {
      if (editing) {
        await editExpense(editing.id, { category, kind, amount: a!, date, note });
        onClose();
        return;
      }
      const cycle = effCycle === 'none' ? null : allCycles.find((c) => c.id === effCycle) ?? null;
      const id = await recordExpense({ id: draftId, organizationId: orgId, cycle, category, kind, amount: a!, date, note, userId });
      setSavedId(id);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  function again() {
    setSavedId(null);
    setDraftId(crypto.randomUUID());
    setAmount('');
    setNote('');
    setError(null);
  }

  if (savedId) {
    return (
      <section>
        <h1>Đã ghi chi phí</h1>
        <p className="msg ok" role="status">Đã lưu lên máy chủ.</p>
        <button className="primary" onClick={again}>Ghi thêm khoản chi</button>
        <button className="secondary" onClick={onClose}>Xong</button>
      </section>
    );
  }

  return (
    <section>
      <h1>{editing ? 'Sửa khoản chi' : 'Ghi chi phí'}</h1>
      <form className="inline-form" onSubmit={onSubmit} noValidate>
        {editing ? (
          <p className="muted">{cycleLabel(editing.cycle_id)} — không đổi được vụ; muốn đổi hãy hủy khoản chi và ghi lại. Mọi thay đổi được lưu lịch sử.</p>
        ) : (
          <label>
            Thuộc vụ
            <select value={effCycle} onChange={(e) => setCycleId(e.target.value)}>
              <option value="none">Chi phí chung (không gắn vụ)</option>
              {cycles.map((c) => <option key={c.id} value={c.id}>{cycleLabel(c.id)} ({CYCLE_STATUS_LABEL_VI[c.status]})</option>)}
            </select>
            <small>Chi phí gắn vụ mới vào được tổng kết vụ.</small>
          </label>
        )}
        <label>
          Nhóm chi phí
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {Object.entries(EXPENSE_CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>
          Đây là
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(EXPENSE_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <small>{EXPENSE_KIND_HINT[kind]}</small>
        </label>
        <label>
          Số tiền (đồng)
          <input value={amount} inputMode="numeric" onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label>
          Ngày
          <input type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          {NEEDS_ASSUMPTION.has(kind) ? (kind === 'estimated' ? 'Cách ước tính (bắt buộc)' : 'Cách phân bổ (bắt buộc)') : 'Ghi chú (không bắt buộc)'}
          <input value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={NEEDS_ASSUMPTION.has(kind) ? 'Ví dụ: nhà màng 50 triệu chia 10 vụ' : ''} />
        </label>
        {error && <p className="msg error" role="alert">{error}</p>}
        {!online && <p className="msg warn">Đang offline. Cần có mạng để lưu; hãy kết nối mạng rồi bấm Lưu.</p>}
        <div className="btnrow">
          <button type="submit" className="primary" disabled={!online || busy}>{editing ? 'Lưu thay đổi' : 'Lưu'}</button>
          <button type="button" className="secondary" onClick={onClose}>Hủy</button>
        </div>
      </form>
    </section>
  );
}
