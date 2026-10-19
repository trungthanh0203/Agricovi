import { useMemo, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CYCLE_STATUS_LABEL_VI } from '@agriconnect/shared';
import { Collapsible } from './Collapsible';
import { useAuth } from '../lib/auth';
import { db, type SaleRow } from '../lib/db';
import { friendlyError } from '../lib/errors';
import { editSale, recordSale, validateSale, voidSale } from '../lib/finance';
import { todayLocal, useOnline } from '../lib/hooks';
import { formatMoney, formatQty, parseNumber } from '../lib/inventory';
import { useOrgs } from '../lib/orgs';
import { hasRole } from '../lib/roles';

const LAST_CYCLE_KEY = 'agriconnect.lastCycle';

/** Doanh thu bán hàng theo vụ (kg). Chỉ chủ và Kho & chi phí ghi/sửa/hủy; người khác chỉ xem. */
export function SalesSection() {
  const { session } = useAuth();
  const { active } = useOrgs();
  const online = useOnline();
  const sales = useLiveQuery(() => db.sales.toArray(), [], []);
  const cycles = useLiveQuery(() => db.cycles.toArray(), [], []);
  const areas = useLiveQuery(() => db.areas.toArray(), [], []);
  const cropTypes = useLiveQuery(() => db.cropTypes.toArray(), [], []);

  const [mode, setMode] = useState<{ kind: 'list' } | { kind: 'new' } | { kind: 'edit'; id: string }>({ kind: 'list' });
  const [cycleFilter, setCycleFilter] = useState('');
  const [showVoided, setShowVoided] = useState(false);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const canWrite = hasRole(active?.roles, 'inventory_finance');
  const ownCycles = useMemo(() => cycles.filter((c) => c.owner_org_id === active?.id), [cycles, active]);
  const cycleLabel = (id: string | null) => {
    const c = cycles.find((x) => x.id === id);
    if (!c) return '';
    return `${cropTypes.find((t) => t.id === c.crop_type_id)?.name ?? ''} · ${areas.find((a) => a.id === c.area_id)?.name ?? ''}`;
  };

  const list = useMemo(
    () => sales
      .filter((s) => s.organization_id === active?.id)
      .filter((s) => !cycleFilter || s.cycle_id === cycleFilter)
      .filter((s) => (showVoided ? true : !s.voided_at))
      .sort((a, b) => b.sold_date.localeCompare(a.sold_date) || (b.received_at ?? '').localeCompare(a.received_at ?? '')),
    [sales, active, cycleFilter, showVoided],
  );
  const valid = list.filter((s) => !s.voided_at);
  const qty = valid.reduce((s, r) => s + r.quantity, 0);
  const revenue = valid.reduce((s, r) => s + r.amount, 0);

  async function confirmVoid(id: string) {
    if (reason.trim().length < 3) return setMsg('Hãy ghi lý do hủy (ít nhất 3 ký tự).');
    try {
      await voidSale(id, reason);
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
      <SaleForm
        cycles={ownCycles.filter((c) => c.status !== 'cancelled')}
        cycleLabel={cycleLabel}
        editing={mode.kind === 'edit' ? sales.find((s) => s.id === mode.id) ?? null : null}
        userId={session?.user.id ?? ''}
        onClose={() => setMode({ kind: 'list' })}
      />
    );
  }

  return (
    <>
      {canWrite ? (
        <button className="primary" onClick={() => setMode({ kind: 'new' })} disabled={ownCycles.length === 0 || !online}>Ghi bán hàng</button>
      ) : (
        <p className="muted">Bạn chỉ xem được doanh thu. Chủ cơ sở và người phụ trách Kho & chi phí mới ghi và sửa được.</p>
      )}
      {canWrite && ownCycles.length === 0 && <p className="msg warn">Chưa có vụ trồng nào. Hãy tạo vụ ở màn hình Sản xuất trước.</p>}

      <Collapsible inline title="Bộ lọc" summary={`${cycleFilter ? cycleLabel(cycleFilter) : 'Tất cả vụ'}${showVoided ? ' · cả khoản đã hủy' : ''}`}>
      <div className="filters">
          <label>
            Vụ trồng
            <select value={cycleFilter} onChange={(e) => setCycleFilter(e.target.value)}>
              <option value="">Tất cả vụ</option>
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
        <div className="row"><span>Đã bán</span><strong>{formatQty(qty)} kg</strong></div>
        <div className="row"><span>Doanh thu đã ghi</span><strong>{formatMoney(revenue)}</strong></div>
        {qty > 0 && <div className="row"><span>Giá bán trung bình</span><strong>{formatMoney(Math.round(revenue / qty))}/kg</strong></div>}
        <p className="muted">{valid.length} lần bán chưa hủy. Đây là doanh thu đã ghi nhận, chưa phải lợi nhuận.</p>
      </div>

      {!online && <p className="msg warn" role="status">Đang offline: chỉ xem được. Ghi, sửa và hủy cần có mạng.</p>}
      {msg && <p className="msg warn" role="status">{msg}</p>}
      {list.length === 0 && <p className="muted">Chưa ghi lần bán nào.</p>}

      {list.map((s) => (
        <div className={s.voided_at ? 'card slim voided' : 'card slim'} key={s.id}>
          <div className="row">
            <strong>{formatMoney(s.amount)}</strong>
            <span className="muted">{new Date(`${s.sold_date}T00:00:00`).toLocaleDateString('vi-VN')}</span>
          </div>
          <p>{formatQty(s.quantity)} kg{s.quantity > 0 ? ` · ${formatMoney(Math.round(s.amount / s.quantity))}/kg` : ''}</p>
          <p className="muted">{cycleLabel(s.cycle_id)}</p>
          {s.buyer_note && <p>{s.buyer_note}</p>}
          <div className="badges">
            {s.version > 1 && !s.voided_at && <span className="pill">Đã chỉnh sửa</span>}
            {s.voided_at && <span className="pill err">Đã hủy</span>}
          </div>
          {s.voided_at && s.void_reason && <p className="muted">Lý do hủy: {s.void_reason}</p>}

          {canWrite && online && !s.voided_at && voiding !== s.id && (
            <div className="actions">
              <button className="secondary" onClick={() => setMode({ kind: 'edit', id: s.id })}>Sửa</button>
              <button className="secondary" onClick={() => { setVoiding(s.id); setReason(''); setMsg(null); }}>Hủy khoản bán</button>
            </div>
          )}
          {voiding === s.id && (
            <div className="inline-form">
              <label>
                Lý do hủy
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ví dụ: ghi nhầm vụ" />
              </label>
              <p className="muted">Khoản bán không bị xóa, chỉ được đánh dấu đã hủy và không khôi phục được.</p>
              <div className="actions">
                <button className="secondary" onClick={() => void confirmVoid(s.id)}>Xác nhận hủy</button>
                <button className="link" onClick={() => setVoiding(null)}>Không hủy</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </>
  );
}

function SaleForm({ cycles, cycleLabel, editing, userId, onClose }: {
  cycles: { id: string; status: keyof typeof CYCLE_STATUS_LABEL_VI }[];
  cycleLabel: (id: string | null) => string;
  editing: SaleRow | null;
  userId: string;
  onClose: () => void;
}) {
  const online = useOnline();
  const allCycles = useLiveQuery(() => db.cycles.toArray(), [], []);
  const remembered = (() => { try { return localStorage.getItem(LAST_CYCLE_KEY); } catch { return null; } })();
  const ordered = [...cycles].sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active'));

  const [cycleId, setCycleId] = useState('');
  const [date, setDate] = useState(editing?.sold_date ?? todayLocal());
  const [qty, setQty] = useState(editing ? String(editing.quantity) : '');
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '');
  const [buyer, setBuyer] = useState(editing?.buyer_note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [draftId, setDraftId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);

  const effCycle = editing ? editing.cycle_id : cycleId || (ordered.find((c) => c.id === remembered)?.id ?? ordered[0]?.id ?? '');
  const q = parseNumber(qty);
  const a = parseNumber(amount);
  const perKg = q && q > 0 && a !== null && !Number.isNaN(a) ? Math.round(a / q) : null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const bad = validateSale(q, a);
    if (bad) return setError(bad);
    const cycle = allCycles.find((c) => c.id === effCycle);
    if (!cycle) return setError('Hãy chọn vụ trồng.');
    setError(null);
    setBusy(true);
    try {
      if (editing) {
        await editSale(editing.id, { date, quantity: q!, amount: a!, buyerNote: buyer });
        onClose();
        return;
      }
      setSavedId(await recordSale({ id: draftId, cycle, date, quantity: q!, amount: a!, buyerNote: buyer, userId }));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  function again() {
    setSavedId(null);
    setDraftId(crypto.randomUUID());
    setQty('');
    setAmount('');
    setBuyer('');
    setError(null);
  }

  if (savedId) {
    return (
      <section>
        <h1>Đã ghi bán hàng</h1>
        <p className="msg ok" role="status">Đã lưu lên máy chủ.</p>
        <button className="primary" onClick={again}>Ghi thêm lần bán</button>
        <button className="secondary" onClick={onClose}>Xong</button>
      </section>
    );
  }

  return (
    <section>
      <h1>{editing ? 'Sửa khoản bán' : 'Ghi bán hàng'}</h1>
      <form className="inline-form" onSubmit={onSubmit} noValidate>
        {editing ? (
          <p className="muted">{cycleLabel(editing.cycle_id)} — không đổi được vụ; muốn đổi hãy hủy khoản bán và ghi lại. Mọi thay đổi được lưu lịch sử.</p>
        ) : (
          <label>
            Vụ trồng
            <select value={effCycle} onChange={(e) => setCycleId(e.target.value)}>
              {ordered.map((c) => <option key={c.id} value={c.id}>{cycleLabel(c.id)} ({CYCLE_STATUS_LABEL_VI[c.status]})</option>)}
            </select>
          </label>
        )}
        <label>
          Ngày bán
          <input type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Số lượng bán (kg)
          <input value={qty} inputMode="decimal" onChange={(e) => setQty(e.target.value)} />
        </label>
        <label>
          Số tiền thu được (đồng)
          <input value={amount} inputMode="numeric" onChange={(e) => setAmount(e.target.value)} />
          {perKg !== null && <small>Tương đương {formatMoney(perKg)}/kg.</small>}
        </label>
        <label>
          Người mua, ghi chú (không bắt buộc)
          <input value={buyer} onChange={(e) => setBuyer(e.target.value)} />
        </label>
        {error && <p className="msg error" role="alert">{error}</p>}
        {!online && <p className="msg warn">Đang offline. Cần có mạng để lưu; hãy kết nối mạng rồi bấm Lưu.</p>}
        <button type="submit" className="primary" disabled={!online || busy}>{editing ? 'Lưu thay đổi' : 'Lưu'}</button>
        <button type="button" className="link" onClick={onClose}>Hủy</button>
      </form>
    </section>
  );
}
