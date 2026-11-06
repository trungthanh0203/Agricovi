import { useMemo, useState } from 'react';
import { Collapsible } from './Collapsible';
import { useAuth } from '../lib/auth';
import { useCatalog } from '../lib/catalog';
import { COUNT_KIND_LABEL, countSummary, groupHeads } from '../lib/countLogic';
import { DEFAULT_HERD_GROUPS } from '../lib/herd';
import { cycleCountUnit } from '../lib/countUnit';
import { recordCountEvent, voidCountEvent } from '../lib/counts';
import type { CountEventRow } from '../lib/db';
import { friendlyError } from '../lib/errors';
import { useTable } from '../lib/tables';

const fmt = (n: number) => n.toLocaleString('vi-VN');
const vnDate = (iso: string) => iso.split('-').reverse().join('/');
const KINDS: CountEventRow['kind'][] = ['dead', 'culled', 'in', 'out'];
const HERD_KINDS: CountEventRow['kind'][] = ['born', 'move', 'dead', 'culled', 'in', 'out'];
const NEW_GROUP = '__new';

/**
 * Số lượng của vụ/lứa (P2 gọn): còn lại, tỉ lệ hao, m² mỗi cây/con, và ghi nhanh chết / loại / nhập thêm / xuất.
 * Ghi mới dùng được khi mất mạng (nằm trong hàng đợi, tự gửi sau); hủy cần mạng.
 */
export function CycleCounts({ cycleId, canManage, userId, online, today }: { cycleId: string; canManage: boolean; userId: string | undefined; online: boolean; today: string }) {
  const { session } = useAuth();
  const cycles = useTable('cycles');
  const allEvents = useTable('countEvents');
  const harvests = useTable('harvests');
  const { cropTypes } = useCatalog();
  const cycle = cycles.find((c) => c.id === cycleId);
  const events = useMemo(() => allEvents.filter((e) => e.cycle_id === cycleId).sort((a, b) => b.event_date.localeCompare(a.event_date) || (b.created_at ?? '').localeCompare(a.created_at ?? '')), [allEvents, cycleId]);
  const kindOf = cropTypes.find((c) => c.id === cycle?.crop_type_id)?.kind;
  const livestock = kindOf === 'livestock' || kindOf === 'aquatic';
  // vật nuôi: số con ghi ở phiếu thu hoạch/xuất cũng được trừ, để không phải nhập hai lần
  const harvestOut = livestock && cycle?.cycle_mode !== 'herd' ? harvests.filter((h) => h.cycle_id === cycleId && !h.voided_at).reduce((n, h) => n + (h.unit_count ?? 0), 0) : 0;
  const s = useMemo(() => countSummary(cycle ?? {}, events, harvestOut), [cycle, events, harvestOut]);
  const unit = cycleCountUnit(cycle, cropTypes);

  const [kind, setKind] = useState<CountEventRow['kind'] | null>(null);
  const [qty, setQty] = useState('1');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [group, setGroup] = useState('');            // nhóm đàn của sự kiện (đàn nuôi liên tục)
  const [toGroup, setToGroup] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const me = userId ?? session?.user.id;
  const herd = cycle?.cycle_mode === 'herd';
  const heads = useMemo(() => groupHeads(events), [events]);
  const groupNames = useMemo(() => [...new Set([...[...heads.keys()].filter(Boolean), ...DEFAULT_HERD_GROUPS])], [heads]);
  if (!cycle) return null;
  const closed = cycle.status === 'ended' || cycle.status === 'cancelled';

  const summary = s.remaining === null ? 'chưa có số liệu' : `còn ${fmt(s.remaining)} ${unit}${s.lossPct !== null && s.dead + s.culled > 0 ? ` · hao ${String(s.lossPct).replace('.', ',')}%` : ''}`;

  async function save() {
    const n = Number(qty.replace(/[.,\s]/g, ''));
    if (!Number.isInteger(n) || n <= 0) return setError(`Số ${unit} phải là số nguyên lớn hơn 0.`);
    if (date > today) return setError('Ngày ghi không được ở tương lai.');
    if (kind && kind !== 'in' && kind !== 'born' && kind !== 'move' && s.remaining !== null && n > s.remaining) return setError(`Số ${unit} (${fmt(n)}) lớn hơn số còn lại (${fmt(s.remaining)}). Hãy kiểm tra lại.`);
    if (!me || !kind || !cycle) return;
    const g = group === NEW_GROUP ? newGroup.trim() : group;
    const tg = toGroup === NEW_GROUP ? newGroup.trim() : toGroup;
    if (herd) {
      if (!g) return setError('Hãy chọn nhóm đàn.');
      if (kind === 'move' && (!tg || tg === g)) return setError('Hãy chọn nhóm đến khác với nhóm đi.');
      const have = heads.get(g) ?? 0;
      if (kind !== 'in' && kind !== 'born' && n > have) return setError(`Nhóm "${g}" chỉ có ${fmt(have)} ${unit}, không ghi ${fmt(n)} được.`);
    }
    setBusy(true); setError(null);
    try {
      await recordCountEvent({ cycle, kind, quantity: n, date, note, userId: me, ...(herd ? { group: g, toGroup: kind === 'move' ? tg : null } : {}) });
      setKind(null); setQty('1'); setNote(''); setNewGroup('');
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  async function doVoid(id: string) {
    setBusy(true); setError(null);
    try { await voidCountEvent(id, reason); setVoiding(null); setReason(''); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  return (
    <Collapsible title={herd ? `Số ${unit} theo nhóm` : `Số ${unit} và hao hụt`} summary={summary} warn={s.lossPct !== null && s.lossPct >= 10}>
      {error && <p className="msg error" role="alert">{error}</p>}
      {s.initial === null && s.remaining === null && <p className="muted">Chưa có số {unit} ban đầu. Nhập "Số {unit}" ở Sửa vụ, hoặc ghi "Nhập thêm" bên dưới.</p>}
      {herd && heads.size > 0 && (
        <div className="card slim">
          {[...heads.entries()].sort((a, b) => a[0].localeCompare(b[0], 'vi')).map(([g, n]) => <div className="row" key={g || '_'}><span>{g || 'Chưa chia nhóm'}</span><strong>{fmt(n)} {unit}</strong></div>)}
        </div>
      )}
      {s.remaining !== null && (
        <div className="card slim">
          {s.initial !== null && <div className="row"><span>Ban đầu</span><strong>{fmt(s.initial)}</strong></div>}
          {s.added > 0 && <div className="row"><span>{herd ? 'Nhập thêm và mới sinh' : 'Nhập thêm / dặm'}</span><strong>+{fmt(s.added)}</strong></div>}
          {s.dead > 0 && <div className="row"><span>Chết</span><strong>−{fmt(s.dead)}</strong></div>}
          {s.culled > 0 && <div className="row"><span>Loại thải</span><strong>−{fmt(s.culled)}</strong></div>}
          {s.out > 0 && <div className="row"><span>Xuất / chuyển đi{harvestOut > 0 ? ' (gồm phiếu thu hoạch)' : ''}</span><strong>−{fmt(s.out)}</strong></div>}
          <div className="row"><span>Còn lại</span><strong>{fmt(s.remaining)} {unit}</strong></div>
          {s.lossPct !== null && <div className="row"><span>Tỉ lệ hao (chết + loại)</span><strong>{String(s.lossPct).replace('.', ',')}%</strong></div>}
          {s.m2PerUnit !== null && <div className="row"><span>Diện tích mỗi {unit}</span><strong>{String(s.m2PerUnit).replace('.', ',')} m²</strong></div>}
        </div>
      )}

      {!closed && !kind && (
        <div className="btnrow">
          {(herd ? HERD_KINDS : KINDS).map((k) => <button key={k} className="secondary" onClick={() => { setKind(k); setQty('1'); setError(null); setGroup(''); setToGroup(''); }}>{k === 'in' ? '+ Nhập thêm' : k === 'born' ? '+ Mới sinh' : k === 'move' ? '⇄ Chuyển nhóm' : k === 'out' ? '− Xuất' : `− ${COUNT_KIND_LABEL[k]}`}</button>)}
        </div>
      )}
      {kind && (
        <div className="inline-form">
          <p><strong>{COUNT_KIND_LABEL[kind]}</strong></p>
          {herd && (
            <div className="pair">
              <label>{kind === 'move' ? 'Từ nhóm' : 'Nhóm'}
                <select value={group} onChange={(e) => setGroup(e.target.value)}>
                  <option value="">— Chọn nhóm —</option>
                  {groupNames.map((g) => <option key={g} value={g}>{g}{heads.has(g) ? ` (${fmt(heads.get(g) ?? 0)})` : ''}</option>)}
                  <option value={NEW_GROUP}>Nhóm khác…</option>
                </select>
              </label>
              {kind === 'move' && (
                <label>Sang nhóm
                  <select value={toGroup} onChange={(e) => setToGroup(e.target.value)}>
                    <option value="">— Chọn nhóm —</option>
                    {groupNames.filter((g) => g !== group).map((g) => <option key={g} value={g}>{g}</option>)}
                    <option value={NEW_GROUP}>Nhóm khác…</option>
                  </select>
                </label>
              )}
            </div>
          )}
          {herd && (group === NEW_GROUP || toGroup === NEW_GROUP) && <label>Tên nhóm mới<input value={newGroup} maxLength={40} onChange={(e) => setNewGroup(e.target.value)} placeholder="Ví dụ: Dê đực giống nhập" /></label>}
          <div className="pair">
            <label>Số {unit}<input value={qty} inputMode="numeric" onChange={(e) => setQty(e.target.value)} /></label>
            <label>Ngày<input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></label>
          </div>
          <label>Ghi chú (không bắt buộc)<input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder={kind === 'dead' ? 'Ví dụ: bệnh tiêu chảy, ô số 3' : ''} /></label>
          {!online && <p className="msg warn">Đang offline: bản ghi nằm trên điện thoại và tự gửi khi có mạng.</p>}
          <div className="btnrow">
            <button className="primary" disabled={busy} onClick={() => void save()}>Lưu</button>
            <button className="secondary" onClick={() => setKind(null)}>Hủy</button>
          </div>
        </div>
      )}

      {events.slice(0, 8).map((e) => (
        <div className={e.voided_at ? 'card slim voided' : 'card slim'} key={e.id}>
          <div className="row">
            <strong className="grow">{COUNT_KIND_LABEL[e.kind] ?? e.kind}: {e.kind === 'in' || e.kind === 'born' || e.kind === 'open' ? '+' : e.kind === 'move' ? '' : '−'}{fmt(e.quantity)}{e.animal_group ? ` · ${e.animal_group}` : ''}{e.to_group ? ` → ${e.to_group}` : ''}</strong>
            <span className="muted">{vnDate(e.event_date)}</span>
          </div>
          {(e.note || e.author_name) && <p className="muted">{[e.author_name, e.note].filter(Boolean).join(' · ')}</p>}
          {e.voided_at ? <span className="pill err">Đã hủy{e.void_reason ? `: ${e.void_reason}` : ''}</span>
            : (canManage || e.created_by === me) && voiding !== e.id && <button className="link inline" disabled={!online} onClick={() => { setVoiding(e.id); setReason(''); }}>Hủy bản ghi</button>}
          {voiding === e.id && (
            <div className="inline-form">
              <label>Lý do hủy<input value={reason} maxLength={300} onChange={(ev) => setReason(ev.target.value)} placeholder="Ví dụ: ghi nhầm số lượng" /></label>
              <div className="btnrow">
                <button className="primary" disabled={busy || reason.trim().length < 3} onClick={() => void doVoid(e.id)}>Xác nhận hủy</button>
                <button className="secondary" onClick={() => setVoiding(null)}>Không hủy</button>
              </div>
            </div>
          )}
        </div>
      ))}
      {events.length > 8 && <p className="muted">Hiện 8 bản ghi gần nhất trong {events.length}.</p>}
    </Collapsible>
  );
}
