import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { friendlyError } from '../lib/errors';
import { todayLocal, useOnline } from '../lib/hooks';
import { formatQty, ISSUE_KIND_LABEL, parseNumber, recordIssue, transferStock } from '../lib/inventory';
import { useTable } from '../lib/tables';

/** Dữ liệu chung của hai biểu mẫu: vật tư, kho đang dùng và tồn hiện có để nhắc người nhập */
function useStockChoices(orgId: string) {
  const materials = useLiveQuery(() => db.materials.where('organization_id').equals(orgId).toArray(), [orgId], []);
  const locations = useLiveQuery(() => db.locations.where('organization_id').equals(orgId).toArray(), [orgId], []);
  const balances = useLiveQuery(() => db.balances.where('organization_id').equals(orgId).toArray(), [orgId], []);
  const units = useTable('units');
  const mats = materials.filter((m) => m.is_active).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const locs = locations.filter((l) => l.is_active).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const stockAt = (mat: string, loc: string) => balances.find((b) => b.material_id === mat && b.location_id === loc)?.balance ?? 0;
  const unitOf = (mat: string) => units.find((u) => u.id === mats.find((m) => m.id === mat)?.base_unit_id)?.name.toLowerCase() ?? '';
  return { mats, locs, stockAt, unitOf };
}

function Done({ text, onAgain, onClose }: { text: string; onAgain: () => void; onClose: () => void }) {
  return (
    <section>
      <h1>Đã ghi</h1>
      <p className="msg ok" role="status">{text}</p>
      <button className="primary" onClick={onAgain}>Ghi tiếp</button>
      <button className="secondary" onClick={onClose}>Xong</button>
    </section>
  );
}

/** Xuất kho tay: hao hụt/hỏng, xuất bán, dùng chung, khác. Bắt buộc lý do; lô tự gắn theo hạn gần nhất. Cần mạng. */
export function StockIssue({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const online = useOnline();
  const { mats, locs, stockAt, unitOf } = useStockChoices(orgId);
  const [materialId, setMaterialId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [kind, setKind] = useState('loss');
  const [qty, setQty] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draftId, setDraftId] = useState(() => crypto.randomUUID());

  const mat = materialId || mats[0]?.id || '';
  const loc = locationId || locs[0]?.id || '';
  const have = stockAt(mat, loc);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!mat) return setError('Hãy chọn vật tư.');
    if (!loc) return setError('Hãy chọn kho.');
    const q = parseNumber(qty);
    if (q === null || Number.isNaN(q) || q <= 0) return setError('Số lượng phải là số lớn hơn 0.');
    if (reason.trim().length < 3) return setError('Xuất kho cần ghi lý do (ví dụ: chuột cắn, bán cho anh Ba, mượn cho hộ bên cạnh).');
    if (q > have && !window.confirm(`Kho chỉ còn ${formatQty(have)} ${unitOf(mat)}, xuất ${formatQty(q)} sẽ làm tồn âm. Vẫn xuất?`)) return;
    setBusy(true);
    try {
      await recordIssue({ id: draftId, organizationId: orgId, locationId: loc, materialId: mat, quantity: q, kind, date, reason });
      setSaved(true);
    } catch (err) { setError(friendlyError(err)); } finally { setBusy(false); }
  }

  if (saved) return <Done text="Đã xuất kho và lưu lên máy chủ." onAgain={() => { setSaved(false); setDraftId(crypto.randomUUID()); setQty(''); setReason(''); }} onClose={onClose} />;
  if (mats.length === 0 || locs.length === 0) {
    return (
      <section>
        <h1>Xuất kho</h1>
        <p className="msg warn">{mats.length === 0 ? 'Chưa có vật tư nào. ' : ''}{locs.length === 0 ? 'Chưa có kho nào. ' : ''}Hãy tạo ở Khai báo → Vật tư và Kho (cần có mạng).</p>
        <button className="secondary" onClick={onClose}>Quay lại</button>
      </section>
    );
  }
  return (
    <section>
      <h1>Xuất kho</h1>
      <p className="muted">Dùng khi vật tư ra khỏi kho mà không gắn với một việc trong nhật ký (hao hụt, hỏng, bán, cho mượn). Xuất để dùng cho việc đồng áng thì ghi ở Ghi việc.</p>
      <form className="inline-form" onSubmit={onSubmit} noValidate>
        <label>Vật tư
          <select value={mat} onChange={(e) => setMaterialId(e.target.value)}>{mats.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
        </label>
        {locs.length > 1 && (
          <label>Xuất từ kho
            <select value={loc} onChange={(e) => setLocationId(e.target.value)}>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          </label>
        )}
        <label>Lý do xuất
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(ISSUE_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>Số lượng{unitOf(mat) ? ` (${unitOf(mat)})` : ''}
          <input value={qty} inputMode="decimal" onChange={(e) => setQty(e.target.value)} />
          <small>Tồn hiện có ở kho này: {formatQty(have)} {unitOf(mat)}</small>
        </label>
        <label>Ngày<input type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} /></label>
        <label>Ghi rõ lý do (bắt buộc)<input value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        {error && <p className="msg error" role="alert">{error}</p>}
        {!online && <p className="msg warn">Đang offline. Xuất kho cần có mạng; hãy kết nối mạng rồi bấm Lưu.</p>}
        <div className="btnrow">
          <button type="submit" className="primary" disabled={!online || busy}>Lưu</button>
          <button type="button" className="secondary" onClick={onClose}>Hủy</button>
        </div>
      </form>
    </section>
  );
}

/** Chuyển kho giữa hai kho: tổng tồn không đổi, chuyển theo lô (hạn gần nhất trước). Cần mạng. */
export function StockTransfer({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const online = useOnline();
  const { mats, locs, stockAt, unitOf } = useStockChoices(orgId);
  const [materialId, setMaterialId] = useState('');
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [qty, setQty] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const mat = materialId || mats[0]?.id || '';
  const from = fromId || locs[0]?.id || '';
  const to = toId && toId !== from ? toId : locs.find((l) => l.id !== from)?.id ?? '';
  const have = stockAt(mat, from);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!mat) return setError('Hãy chọn vật tư.');
    if (!from || !to || from === to) return setError('Hãy chọn hai kho khác nhau.');
    const q = parseNumber(qty);
    if (q === null || Number.isNaN(q) || q <= 0) return setError('Số lượng phải là số lớn hơn 0.');
    if (q > have && !window.confirm(`Kho đi chỉ còn ${formatQty(have)} ${unitOf(mat)}, chuyển ${formatQty(q)} sẽ làm tồn âm. Vẫn chuyển?`)) return;
    setBusy(true);
    try {
      await transferStock({ organizationId: orgId, materialId: mat, fromId: from, toId: to, quantity: q, date, note });
      setSaved(true);
    } catch (err) { setError(friendlyError(err)); } finally { setBusy(false); }
  }

  if (saved) return <Done text="Đã chuyển kho và lưu lên máy chủ." onAgain={() => { setSaved(false); setQty(''); setNote(''); }} onClose={onClose} />;
  if (mats.length === 0 || locs.length < 2) {
    return (
      <section>
        <h1>Chuyển kho</h1>
        <p className="msg warn">{mats.length === 0 ? 'Chưa có vật tư nào. ' : ''}{locs.length < 2 ? 'Cần có ít nhất hai kho để chuyển. ' : ''}Hãy tạo ở Khai báo → Vật tư và Kho (cần có mạng).</p>
        <button className="secondary" onClick={onClose}>Quay lại</button>
      </section>
    );
  }
  return (
    <section>
      <h1>Chuyển kho</h1>
      <p className="muted">Chuyển vật tư từ kho này sang kho khác trong cơ sở. Tổng tồn không đổi; lô và hạn dùng đi theo vật tư.</p>
      <form className="inline-form" onSubmit={onSubmit} noValidate>
        <label>Vật tư
          <select value={mat} onChange={(e) => setMaterialId(e.target.value)}>{mats.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
        </label>
        <div className="pair">
          <label>Từ kho
            <select value={from} onChange={(e) => setFromId(e.target.value)}>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          </label>
          <label>Đến kho
            <select value={to} onChange={(e) => setToId(e.target.value)}>{locs.filter((l) => l.id !== from).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          </label>
        </div>
        <label>Số lượng{unitOf(mat) ? ` (${unitOf(mat)})` : ''}
          <input value={qty} inputMode="decimal" onChange={(e) => setQty(e.target.value)} />
          <small>Tồn hiện có ở kho đi: {formatQty(have)} {unitOf(mat)}</small>
        </label>
        <label>Ngày<input type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} /></label>
        <label>Ghi chú (không bắt buộc)<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
        {error && <p className="msg error" role="alert">{error}</p>}
        {!online && <p className="msg warn">Đang offline. Chuyển kho cần có mạng; hãy kết nối mạng rồi bấm Lưu.</p>}
        <div className="btnrow">
          <button type="submit" className="primary" disabled={!online || busy}>Lưu</button>
          <button type="button" className="secondary" onClick={onClose}>Hủy</button>
        </div>
      </form>
    </section>
  );
}
