import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { friendlyError } from '../lib/errors';
import { todayLocal, useOnline } from '../lib/hooks';
import { useEffect } from 'react';
import { fetchCycleMaterialNet, formatQty, ISSUE_KIND_LABEL, issueSharedToCycles, parseNumber, recordIssue, returnToStock, splitShares, transferStock } from '../lib/inventory';
import { useTable } from '../lib/tables';
import { useCatalog } from '../lib/catalog';
import { areaPath, areaName } from '../lib/areas';
import { cycleTitle } from '../lib/cycles';
import { canLogCycle } from '../lib/prep';

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
  const cycles = useTable('cycles');
  const areas = useTable('areas');
  const { cropTypes } = useCatalog();
  // vụ của cơ sở chưa kết thúc: chọn để xuất vật tư cho vụ (không cần nhật ký)
  const openCycles = cycles.filter((c) => c.owner_org_id === orgId && canLogCycle(c)); // chỉ vụ đang sản xuất (và vụ chuẩn bị trước ghi việc được)
  const cycleLabel = (c: (typeof cycles)[number]) => `${cycleTitle(c, cropTypes.find((t) => t.id === c.crop_type_id)?.name ?? '')} · ${areaName(c.area_id, areas) || '—'}`;
  const [kind, setKind] = useState('cycle');
  const [cycleId, setCycleId] = useState('');
  const cyc = cycleId || openCycles[0]?.id || '';
  const [shareIds, setShareIds] = useState<string[]>([]); // Dùng chung: chia cho các vụ đã chọn (để trống = không gắn vụ)
  const areaM2 = (c: (typeof cycles)[number]) => {
    const own = c.planted_area_m2 ?? null;
    if (own && own > 0) return own;
    const a = areas.find((x) => x.id === c.area_id);
    return a?.area_size ? a.area_size * (a.area_unit === 'ha' ? 10000 : 1) : null;
  };
  const picked = openCycles.filter((c) => shareIds.includes(c.id));
  const splitFor = (total: number) => splitShares(total, picked.map(areaM2));
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
    if (kind === 'cycle' && !cyc) return setError('Chưa có vụ nào đang chạy để xuất vật tư. Chọn lý do khác hoặc tạo vụ trước.');
    if (kind !== 'cycle' && !(kind === 'shared' && shareIds.length > 0) && reason.trim().length < 3) return setError('Xuất kho cần ghi lý do (ví dụ: chuột cắn, bán cho anh Ba, mượn cho hộ bên cạnh).');
    if (q > have && !window.confirm(`Kho chỉ còn ${formatQty(have)} ${unitOf(mat)}, xuất ${formatQty(q)} sẽ làm tồn âm. Vẫn xuất?`)) return;
    setBusy(true);
    try {
      const rsn = kind === 'cycle' ? (reason.trim().length >= 3 ? reason : `Xuất cho vụ ${cycleLabel(openCycles.find((c) => c.id === cyc)!)}`) : reason;
      if (kind === 'shared' && shareIds.length > 0) {
        await issueSharedToCycles({ organizationId: orgId, locationId: loc, materialId: mat, quantity: q, date, cycleIds: picked.map((c) => c.id), note: reason });
        setSaved(true);
        return;
      }
      await recordIssue({ id: draftId, organizationId: orgId, locationId: loc, materialId: mat, quantity: q, kind, date, reason: rsn, ...(kind === 'cycle' ? { cycleId: cyc } : {}) });
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
      <p className="muted">Dùng khi vật tư ra khỏi kho mà không đi kèm một việc trong nhật ký: phát vật tư cho một vụ, hao hụt, hỏng, bán, dùng chung. Vật tư xuất cho vụ được tính vào giá thành của vụ (và cám vào FCR). Nếu đang làm việc ngoài đồng thì ghi ở Ghi việc.</p>
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
        {kind === 'cycle' && (
          <label>Vụ
            <select value={cyc} onChange={(e) => setCycleId(e.target.value)}>
              {openCycles.length === 0 && <option value="">Chưa có vụ nào</option>}
              {openCycles.map((c) => <option key={c.id} value={c.id}>{cycleLabel(c)}</option>)}
            </select>
          </label>
        )}
        {kind === 'shared' && openCycles.length > 0 && (
          <fieldset className="roles">
            <legend>Chia cho các vụ (không chọn vụ nào thì không tính vào vụ)</legend>
            {openCycles.map((c) => (
              <label className="check" key={c.id}>
                <input type="checkbox" checked={shareIds.includes(c.id)} onChange={(e) => setShareIds((cur) => (e.target.checked ? [...cur, c.id] : cur.filter((x) => x !== c.id)))} />
                <span>{cycleLabel(c)}{areaM2(c) ? ` · ${formatQty(areaM2(c)!)} m²` : ' · chưa có diện tích'}</span>
              </label>
            ))}
            {picked.length > 0 && (parseNumber(qty) ?? 0) > 0 && (
              <p className="muted">{splitFor(parseNumber(qty) ?? 0).byArea ? 'Chia theo diện tích' : 'Chia đều (có vụ chưa có diện tích)'}: {picked.map((c, i) => `${cycleLabel(c)} ${formatQty(splitFor(parseNumber(qty) ?? 0).shares[i]!)} ${unitOf(mat)}`).join('; ')}</p>
            )}
          </fieldset>
        )}
        <label>Số lượng{unitOf(mat) ? ` (${unitOf(mat)})` : ''}
          <input value={qty} inputMode="decimal" onChange={(e) => setQty(e.target.value)} />
          <small>Tồn hiện có ở kho này: {formatQty(have)} {unitOf(mat)}</small>
        </label>
        <label>Ngày<input type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} /></label>
        <label>{kind === 'cycle' || (kind === 'shared' && shareIds.length > 0) ? 'Ghi chú (không bắt buộc)' : 'Ghi rõ lý do (bắt buộc)'}<input value={reason} onChange={(e) => setReason(e.target.value)} /></label>
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

/** Trả vật tư về kho từ một vụ (dùng không hết): tăng tồn kho nhận, trừ giá vốn vật tư của vụ theo đơn giá bình quân đã xuất cho vụ. Cần mạng. */
export function StockReturn({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const online = useOnline();
  const { mats, locs, unitOf } = useStockChoices(orgId);
  const cycles = useTable('cycles');
  const areas = useTable('areas');
  const { cropTypes } = useCatalog();
  const open = cycles.filter((c) => c.owner_org_id === orgId && c.status !== 'ended' && c.status !== 'cancelled');
  const label = (c: (typeof cycles)[number]) => `${cycleTitle(c, cropTypes.find((t) => t.id === c.crop_type_id)?.name ?? '')} · ${areaName(c.area_id, areas) || '—'}`;
  const [cycleId, setCycleId] = useState('');
  const cyc = cycleId || open[0]?.id || '';
  const [net, setNet] = useState<Map<string, number>>(new Map());
  const [materialId, setMaterialId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [qty, setQty] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draftId, setDraftId] = useState(() => crypto.randomUUID());
  useEffect(() => { if (cyc) void fetchCycleMaterialNet(cyc).then(setNet); else setNet(new Map()); }, [cyc, saved]);
  const usable = mats.filter((m) => (net.get(m.id) ?? 0) > 0);
  const mat = usable.some((m) => m.id === materialId) ? materialId : usable[0]?.id ?? '';
  const loc = locationId || locs[0]?.id || '';
  const max = net.get(mat) ?? 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!cyc) return setError('Hãy chọn vụ.');
    if (!mat) return setError('Vụ này chưa có vật tư nào đã xuất để trả về kho.');
    if (!loc) return setError('Hãy chọn kho nhận.');
    const q = parseNumber(qty);
    if (q === null || Number.isNaN(q) || q <= 0) return setError('Số lượng phải là số lớn hơn 0.');
    if (q > max) return setError(`Chỉ trả được tối đa ${formatQty(max)} ${unitOf(mat)} (đã xuất cho vụ trừ đã trả).`);
    setBusy(true);
    try {
      await returnToStock({ id: draftId, organizationId: orgId, locationId: loc, materialId: mat, cycleId: cyc, quantity: q, date, reason });
      setSaved(true);
    } catch (err) { setError(friendlyError(err)); } finally { setBusy(false); }
  }

  if (saved) return <Done text="Đã trả vật tư về kho và trừ khỏi giá vốn của vụ." onAgain={() => { setSaved(false); setDraftId(crypto.randomUUID()); setQty(''); setReason(''); }} onClose={onClose} />;
  return (
    <section>
      <h1>Trả vật tư về kho</h1>
      <p className="muted">Dùng khi vật tư đã xuất cho một vụ nhưng dùng không hết. Vật tư quay lại kho và được trừ khỏi giá vốn của vụ đó.</p>
      <form className="inline-form" onSubmit={onSubmit} noValidate>
        <label>Từ vụ
          <select value={cyc} onChange={(e) => setCycleId(e.target.value)}>
            {open.length === 0 && <option value="">Chưa có vụ nào</option>}
            {open.map((c) => <option key={c.id} value={c.id}>{label(c)}</option>)}
          </select>
        </label>
        <label>Vật tư
          <select value={mat} onChange={(e) => setMaterialId(e.target.value)}>
            {usable.length === 0 && <option value="">Vụ này chưa có vật tư đã xuất</option>}
            {usable.map((m) => <option key={m.id} value={m.id}>{m.name} (đã dùng {formatQty(net.get(m.id) ?? 0)} {unitOf(m.id)})</option>)}
          </select>
        </label>
        {locs.length > 1 && (
          <label>Trả vào kho
            <select value={loc} onChange={(e) => setLocationId(e.target.value)}>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          </label>
        )}
        <label>Số lượng trả{unitOf(mat) ? ` (${unitOf(mat)})` : ''}
          <input value={qty} inputMode="decimal" onChange={(e) => setQty(e.target.value)} />
          <small>Tối đa {formatQty(max)} {unitOf(mat)}</small>
        </label>
        <label>Ngày<input type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} /></label>
        <label>Ghi chú (không bắt buộc)<input value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        {error && <p className="msg error" role="alert">{error}</p>}
        {!online && <p className="msg warn">Đang offline. Trả vật tư cần có mạng; hãy kết nối mạng rồi bấm Lưu.</p>}
        <div className="btnrow">
          <button type="submit" className="primary" disabled={!online || busy}>Lưu</button>
          <button type="button" className="secondary" onClick={onClose}>Hủy</button>
        </div>
      </form>
    </section>
  );
}
