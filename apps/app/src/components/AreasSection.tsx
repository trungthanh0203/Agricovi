import { useState } from 'react';
import { ImagePicker, Thumb } from './ImagePicker';
import { type AreaKind, type AreaRow } from '../lib/db';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import { createArea, splitAreaIntoCells, updateArea, type FarmInput } from '../lib/production';
import { canPerm } from '../lib/permissions';
import { useTable } from '../lib/tables';
import { housingText, useConfig } from '../lib/config';
import { areaSizeM2, cellDefaultName, cellsOf, topAreas } from '../lib/areas';

const fmtSize = (a: AreaRow) => (a.area_size != null ? `${a.area_size.toLocaleString('vi-VN')} ${a.area_unit === 'ha' ? 'ha' : 'm²'}` : '');
const fmtM2 = (m2: number) => (m2 >= 10000 ? `${(m2 / 10000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} ha` : `${m2.toLocaleString('vi-VN', { maximumFractionDigits: 0 })} m²`);
const parseSize = (s: string): number | null | 'bad' => {
  if (s.trim() === '') return null;
  const n = Number(s.replace(',', '.'));
  return Number.isNaN(n) || n < 0 ? 'bad' : n;
};

/** Loại ô đã chọn: nhóm gốc (kind), mã mục tự thêm (kind_item) và kiểu ô */
interface CellKind { kind: Exclude<AreaKind, 'growing'>; kind_item: string | null; housing: string | null }

/** Chọn Loại ô (Nhóm loại sản phẩm đang dùng + Cơ sở vật chất) và Kiểu ô trên cùng một dòng; trả về mã chọn và hàm đổi */
function KindRow({ choice, onChoice, housing, onHousing, currentHousing }: {
  choice: string; onChoice: (v: string) => void; housing: string; onHousing: (v: string) => void; currentHousing?: string | null;
}) {
  const cfg = useConfig();
  const isFacility = choice === 'facility';
  const choices = cfg.housing().includes(housing) || !housing ? cfg.housing() : [...cfg.housing(), housing];
  return (
    <div className="pair">
      <label>Loại ô
        <select value={choice} onChange={(e) => onChoice(e.target.value)}>
          {cfg.productGroups(choice).map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
          <option value="facility">Cơ sở vật chất</option>
        </select>
      </label>
      {!isFacility
        ? (
          <label>Kiểu ô
            <select value={housing || (currentHousing ? housingText(currentHousing) : '')} onChange={(e) => onHousing(e.target.value)}>
              <option value="">— Không áp dụng —</option>
              {choices.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </label>
        )
        : <p className="muted">Cơ sở vật chất (cổng, kho, biogas, hố sát trùng…) chỉ để ghi việc, không tạo vụ.</p>}
    </div>
  );
}

/**
 * Phân khu của cơ sở (D125, D127, D128: hai cấp). Cấp 1 là PHÂN KHU (cụm: tên, mã khu, vị trí, mô tả, ảnh); cấp 2 là Ô SẢN XUẤT (nhà màng, chuồng, ao…)
 * nơi chạy vụ, có đủ thông tin: tên, mã ô, loại ô, kiểu ô, diện tích, mô tả, ảnh. Một phân khu có thể có các ô khác loại. Diện tích phân khu tự cộng từ các ô.
 * Mỗi phân khu có nút thêm ô (một cái, nhiều cái một lần) và, nếu đang có vụ, nút "Chia thành ô sản xuất". Cần mạng để thêm/sửa (D24).
 */
export function AreasSection() {
  const { active } = useOrgs();
  const cfg = useConfig();
  const kindLabel = (k: string, item?: string | null) => (k === 'facility' ? 'Cơ sở vật chất' : cfg.groupLabel(k, item));
  const online = useOnline();
  const areas = useTable('areas');
  const cycles = useTable('cycles');
  const [showOff, setShowOff] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [cellFor, setCellFor] = useState<{ parent: AreaRow; mode: 'one' | 'many' | 'split' } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!active) return null;

  const canManage = canPerm(active.perms, 'declare', 'edit');
  const mine = areas.filter((a) => a.organization_id === active.id);
  const visible = (a: AreaRow) => showOff || a.is_active !== false;
  const tops = topAreas(mine).filter(visible);
  const editRow = areas.find((a) => a.id === editing) ?? null;
  const editParent = editRow?.parent_id ? mine.find((a) => a.id === editRow.parent_id) ?? null : null;
  const rowCount = tops.reduce((n, t) => n + 1 + cellsOf(mine, t.id).filter(visible).length, 0);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (err) { setError(friendlyError(err)); throw err; } finally { setBusy(false); }
  }
  const closeAll = () => { setAdding(false); setEditing(null); setCellFor(null); };
  const newCell = (parentId: string, name: string, k: CellKind, size?: number | null, unit?: 'm2' | 'ha'): FarmInput =>
    ({ name, kind: k.kind, kind_item: k.kind_item ?? undefined, housing: k.housing, area_size: size ?? null, area_unit: unit ?? 'm2', parent_id: parentId });

  const renderRow = (a: AreaRow, isCell: boolean) => {
    const kids = isCell ? [] : cellsOf(mine, a.id);
    const m2 = areaSizeM2(a, mine);
    const hasCycles = !isCell && cycles.some((c) => c.area_id === a.id);
    const showKind = isCell || kids.length === 0; // phân khu đã chia ô thì không có loại riêng
    return (
      <tr key={a.id} className={a.is_active === false ? 'off' : ''}>
        <td style={isCell ? { paddingLeft: 24 } : undefined}>
          <Thumb src={a.image} />{isCell ? '↳ ' : ''}{a.name}{a.code ? ` · ${a.code}` : ''}
          {!isCell && kids.length > 0 && <span className="sub">{kids.length} ô sản xuất</span>}
          {(showKind && a.kind) || a.housing ? <span className="sub">{[showKind && a.kind ? kindLabel(a.kind, a.kind_item) : '', a.housing ? `Kiểu ô: ${housingText(a.housing).toLowerCase()}` : ''].filter(Boolean).join(' · ')}</span> : null}
          {a.location && <span className="sub">📍 {a.location}</span>}
          {a.description && <span className="sub">{a.description}</span>}
          {a.is_active === false && <span className="sub">Đã dừng</span>}
          {canManage && !isCell && a.is_active !== false && (
            <span className="sub">
              <button type="button" className="link" disabled={busy || !online} onClick={() => { closeAll(); setCellFor({ parent: a, mode: 'one' }); }}>+ Ô sản xuất</button>
              {' · '}
              <button type="button" className="link" disabled={busy || !online} onClick={() => { closeAll(); setCellFor({ parent: a, mode: 'many' }); }}>+ Nhiều ô cùng lúc</button>
              {kids.length === 0 && hasCycles && (
                <>{' · '}<button type="button" className="link" disabled={busy || !online} onClick={() => { closeAll(); setCellFor({ parent: a, mode: 'split' }); }}>Chia thành ô sản xuất</button></>
              )}
            </span>
          )}
        </td>
        <td className="num">{!isCell && kids.length > 0 ? (m2 ? `${fmtM2(m2)} (tổng)` : '—') : fmtSize(a) || '—'}</td>
        {canManage && (
          <td className="act">
            <button className="icon" disabled={busy || !online} aria-label={a.is_active === false ? `Dùng lại ${a.name}` : `Dừng ${a.name}`}
              onClick={() => void run(() => updateArea(a.id, { is_active: a.is_active === false })).catch(() => undefined)}>{a.is_active === false ? '▶' : '⏸'}</button>{' '}
            <button className="icon" aria-label={`Sửa ${a.name}`} onClick={() => { const same = editing === a.id; closeAll(); setEditing(same ? null : a.id); }}>✎</button>
          </td>
        )}
      </tr>
    );
  };

  return (
    <>
      {!online && canManage && <p className="msg warn" role="status">Đang offline: thêm và sửa phân khu cần có mạng.</p>}
      {error && <p className="msg error" role="alert">{error}</p>}

      {canManage && !adding && !editRow && !cellFor && (
        <button className="secondary" disabled={!online} onClick={() => setAdding(true)}>+ Thêm phân khu</button>
      )}
      {canManage && adding && (
        <ZoneForm title="Thêm phân khu" busy={busy || !online} onClose={() => setAdding(false)}
          onSave={(f, cells) => run(async () => {
            const id = await createArea(active.id, f);
            for (const name of cells.names) await createArea(active.id, newCell(id, name, cells.kind));
            setAdding(false);
          })} />
      )}
      {canManage && cellFor && cellFor.mode === 'one' && (
        <CellFullForm title={`Thêm ô sản xuất vào "${cellFor.parent.name}"`} parent={cellFor.parent} busy={busy || !online} onClose={() => setCellFor(null)}
          onSave={(f) => run(async () => { await createArea(active.id, f); setCellFor(null); })} />
      )}
      {canManage && cellFor && cellFor.mode !== 'one' && (
        <CellBulkForm parent={cellFor.parent} mode={cellFor.mode} busy={busy || !online} onClose={() => setCellFor(null)}
          onSave={(names, k, size, unit) => run(async () => {
            const p = cellFor.parent;
            if (cellFor.mode === 'split') await splitAreaIntoCells(p.id, names[0]!);
            else for (const name of names) await createArea(active.id, newCell(p.id, name, k, size, unit));
            setCellFor(null);
          })} />
      )}

      <table className="grid">
        <thead><tr><th>Phân khu ({tops.length})</th><th className="num">Diện tích</th>{canManage && <th></th>}</tr></thead>
        <tbody>
          {rowCount === 0 && <tr><td colSpan={3} className="muted">Chưa có phân khu nào.{canManage ? ' Hãy thêm phân khu đầu tiên ở nút trên.' : ''}</td></tr>}
          {tops.flatMap((t) => [renderRow(t, false), ...cellsOf(mine, t.id).filter(visible).map((c) => renderRow(c, true))])}
        </tbody>
      </table>
      <label className="check"><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} /> Hiện cả khu đã dừng</label>
      <p className="muted">Khu đã dừng vẫn giữ lịch sử nhưng không chọn được để tạo vụ mới. Phân khu là cụm (ví dụ vườn); bên trong là các ô sản xuất (nhà màng, chuồng, ao…), mỗi ô có loại riêng và vụ gắn vào từng ô.</p>
      <p className="msg" role="note">💡 Sau khi tạo phân khu và ô sản xuất, hãy vào <strong>Khai báo → Sản phẩm</strong> để tạo/chọn loại đối tượng nuôi / trồng, rồi tạo vụ nuôi trồng cho từng ô.</p>

      {canManage && editRow && !editParent && (
        <ZoneForm key={editRow.id} title={`Sửa phân khu: ${editRow.name}`} initial={editRow} hasCells={cellsOf(mine, editRow.id).length > 0} hasCycles={cycles.some((c) => c.area_id === editRow.id)}
          busy={busy || !online} onClose={() => setEditing(null)}
          onSave={(f) => run(async () => { await updateArea(editRow.id, f); setEditing(null); })} />
      )}
      {canManage && editRow && editParent && (
        <CellFullForm key={editRow.id} title={`Sửa ô sản xuất: ${editRow.name}`} parent={editParent} initial={editRow} busy={busy || !online} onClose={() => setEditing(null)}
          onSave={(f) => run(async () => { await updateArea(editRow.id, f); setEditing(null); })} />
      )}
    </>
  );
}

/** Mã chọn Loại ô → loại gốc + mã mục tự thêm */
function useKindResolver() {
  const cfg = useConfig();
  const first = cfg.productGroups()[0]?.id ?? 'crop';
  const resolve = (choice: string, initialItem?: string | null): { kind: Exclude<AreaKind, 'growing'>; kind_item: string | null } => {
    if (choice === 'facility') return { kind: 'facility', kind_item: initialItem ? null : null };
    const r = cfg.resolve('product_groups', choice);
    return { kind: r.base as Exclude<AreaKind, 'growing'>, kind_item: r.item };
  };
  return { first, resolve, choiceOf: (a?: AreaRow) => (a ? (a.kind === 'facility' ? 'facility' : cfg.choiceOf('product_groups', a.kind ?? 'crop', a.kind_item)) : first) };
}

/**
 * Phân khu (cấp 1): chỉ tên, mã khu, vị trí, mô tả, ảnh; không có loại, diện tích, kiểu ô (D128). Thêm mới có thể tạo sẵn các ô sản xuất (chọn loại ô, kiểu ô cho chúng).
 * Phân khu cũ chưa chia ô mà đang là nơi chạy vụ trực tiếp vẫn thấy loại ô, kiểu ô, diện tích để không mất dữ liệu.
 */
function ZoneForm({ title, initial, hasCells, hasCycles, busy, onSave, onClose }: {
  title: string; initial?: AreaRow; hasCells?: boolean; hasCycles?: boolean; busy: boolean;
  onSave: (f: FarmInput, cells: { names: string[]; kind: CellKind }) => Promise<unknown>; onClose: () => void;
}) {
  const { first, resolve, choiceOf } = useKindResolver();
  const [name, setName] = useState(initial?.name ?? '');
  const [code, setCode] = useState(initial?.code ?? '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [desc, setDesc] = useState(initial?.description ?? '');
  const [image, setImage] = useState(initial?.image ?? '');
  // phân khu cũ chưa chia ô nhưng còn là nơi chạy vụ trực tiếp (có diện tích, kiểu ô hoặc vụ)
  const legacyLeaf = !!initial && !hasCells && (initial.area_size != null || !!initial.housing || !!hasCycles);
  const [legacyChoice, setLegacyChoice] = useState(choiceOf(initial));
  const [legacyHousing, setLegacyHousing] = useState<string>(housingText(initial?.housing));
  const [size, setSize] = useState(initial?.area_size != null ? String(initial.area_size) : '');
  const [unit, setUnit] = useState<'m2' | 'ha'>(initial?.area_unit ?? 'm2');
  // chỉ khi thêm mới: tạo sẵn ô sản xuất
  const [cellCount, setCellCount] = useState('1');
  const [cellPrefix, setCellPrefix] = useState('');
  const [cellChoice, setCellChoice] = useState(first);
  const [cellHousing, setCellHousing] = useState('');
  const cellKind = resolve(cellChoice);
  const prefix = cellPrefix || cellDefaultName(cellKind.kind);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="card">
      <h2>{title}</h2>
      <div className="inline-form">
        <div className="pair">
          <label>Tên phân khu<input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Vườn Đông" /></label>
          <label>Mã khu<input value={code} maxLength={40} onChange={(e) => setCode(e.target.value)} placeholder="Ví dụ: VD" /></label>
        </div>
        <label>Vị trí<input value={location} maxLength={200} onChange={(e) => setLocation(e.target.value)} placeholder="Xã, huyện, tỉnh hoặc mô tả đường đi" /></label>
        {legacyLeaf && (
          <>
            <p className="muted">Phân khu này chưa chia ô sản xuất nên vẫn là nơi chạy vụ trực tiếp. Bạn có thể giữ thông tin dưới đây, hoặc bấm "Chia thành ô sản xuất" ở danh sách.</p>
            <KindRow choice={legacyChoice} onChoice={setLegacyChoice} housing={legacyHousing} onHousing={setLegacyHousing} />
            <div className="pair">
              <label>Diện tích<input value={size} inputMode="decimal" onChange={(e) => setSize(e.target.value)} /></label>
              <label>Đơn vị
                <select value={unit} onChange={(e) => setUnit(e.target.value as 'm2' | 'ha')}><option value="m2">m²</option><option value="ha">ha</option></select>
              </label>
            </div>
          </>
        )}
        <label>Mô tả<textarea rows={3} maxLength={500} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Đặc điểm chung của phân khu: nguồn nước, loại đất…" /></label>
        <ImagePicker value={image} onChange={setImage} store="areas" />
        {!initial && (
          <>
            <p className="muted">Nơi chạy vụ là các ô sản xuất (nhà màng, chuồng, ao…) bên trong phân khu. Tạo sẵn để dùng ngay; thêm hoặc sửa ô sau cũng được, mỗi ô có loại riêng.</p>
            <div className="pair">
              <label>Số ô sản xuất tạo sẵn (0 đến 50)<input value={cellCount} inputMode="numeric" onChange={(e) => setCellCount(e.target.value)} /></label>
              <label>Tên chung của ô<input value={cellPrefix} maxLength={100} onChange={(e) => setCellPrefix(e.target.value)} placeholder={cellDefaultName(cellKind.kind)} /></label>
            </div>
            <KindRow choice={cellChoice} onChoice={setCellChoice} housing={cellHousing} onHousing={setCellHousing} />
          </>
        )}
        {err && <p className="msg error" role="alert">{err}</p>}
        <div className="btnrow">
          <button className="primary" disabled={busy} onClick={() => {
            if (!name.trim()) return setErr('Hãy nhập tên phân khu.');
            const n = legacyLeaf ? parseSize(size) : undefined;
            if (n === 'bad') return setErr('Diện tích phải là số không âm.');
            const count = !initial ? Number(cellCount.trim() === '' ? '0' : cellCount) : 0;
            if (!Number.isInteger(count) || count < 0 || count > 50) return setErr('Số ô sản xuất tạo sẵn từ 0 đến 50.');
            setErr(null);
            const lk = resolve(legacyChoice);
            const f: FarmInput = {
              name, location, description: desc, image, code,
              ...(legacyLeaf ? { kind: lk.kind, kind_item: lk.kind_item ?? (initial?.kind_item ? null : undefined), area_size: n as number | null, area_unit: unit, housing: lk.kind === 'facility' ? null : legacyHousing || null } : {}),
            };
            const names = Array.from({ length: count }, (_, i) => `${prefix.trim()} ${i + 1}`);
            void onSave(f, { names, kind: { ...cellKind, housing: cellKind.kind === 'facility' ? null : cellHousing || null } }).catch(() => undefined);
          }}>Lưu</button>
          <button type="button" className="secondary" onClick={onClose}>Hủy</button>
        </div>
      </div>
    </div>
  );
}

/** Ô sản xuất (cấp 2: nhà màng, chuồng, ao…): đủ thông tin. Dòng 1: tên và mã ô; dòng 2: loại ô và kiểu ô; dòng 3: diện tích và đơn vị */
function CellFullForm({ title, parent, initial, busy, onSave, onClose }: {
  title: string; parent: AreaRow; initial?: AreaRow; busy: boolean; onSave: (f: FarmInput) => Promise<unknown>; onClose: () => void;
}) {
  const { resolve, choiceOf } = useKindResolver();
  const [name, setName] = useState(initial?.name ?? '');
  const [code, setCode] = useState(initial?.code ?? '');
  const [choice, setChoice] = useState(choiceOf(initial));
  const [housing, setHousing] = useState<string>(housingText(initial?.housing));
  const [size, setSize] = useState(initial?.area_size != null ? String(initial.area_size) : '');
  const [unit, setUnit] = useState<'m2' | 'ha'>(initial?.area_unit ?? 'm2');
  const [desc, setDesc] = useState(initial?.description ?? '');
  const [image, setImage] = useState(initial?.image ?? '');
  const [err, setErr] = useState<string | null>(null);
  const k = resolve(choice);
  return (
    <div className="card">
      <h2>{title}</h2>
      <p className="muted">Thuộc phân khu: <strong>{parent.name}</strong></p>
      <div className="inline-form">
        <div className="pair">
          <label>Tên ô<input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder={`Ví dụ: ${cellDefaultName(k.kind)} 1`} /></label>
          <label>Mã ô<input value={code} maxLength={40} onChange={(e) => setCode(e.target.value)} placeholder="Ví dụ: NM-01" /></label>
        </div>
        <KindRow choice={choice} onChoice={setChoice} housing={housing} onHousing={setHousing} />
        <div className="pair">
          <label>Diện tích<input value={size} inputMode="decimal" onChange={(e) => setSize(e.target.value)} /></label>
          <label>Đơn vị
            <select value={unit} onChange={(e) => setUnit(e.target.value as 'm2' | 'ha')}><option value="m2">m²</option><option value="ha">ha</option></select>
          </label>
        </div>
        <label>Mô tả<textarea rows={3} maxLength={500} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Đặc điểm của ô: loại giá thể, hệ thống tưới, loại chuồng…" /></label>
        <ImagePicker value={image} onChange={setImage} store="areas" />
        {err && <p className="msg error" role="alert">{err}</p>}
        <div className="btnrow">
          <button className="primary" disabled={busy} onClick={() => {
            if (!name.trim()) return setErr('Hãy nhập tên ô sản xuất.');
            const n = parseSize(size);
            if (n === 'bad') return setErr('Diện tích phải là số không âm.');
            setErr(null);
            void onSave({
              name, code, description: desc, image, area_size: n, area_unit: unit, housing: k.kind === 'facility' ? null : housing || null,
              kind: k.kind, kind_item: k.kind_item ?? (initial?.kind_item ? null : undefined),
              ...(initial ? {} : { parent_id: parent.id }),
            }).catch(() => undefined);
          }}>Lưu</button>
          <button type="button" className="secondary" onClick={onClose}>Hủy</button>
        </div>
      </div>
    </div>
  );
}

/** Thêm nhiều ô sản xuất cùng lúc (tên chung + số thứ tự + loại ô, kiểu ô), hoặc chia phân khu đang có vụ thành ô sản xuất (tạo ô đầu tiên và chuyển vụ sang đó) */
function CellBulkForm({ parent, mode, busy, onSave, onClose }: {
  parent: AreaRow; mode: 'many' | 'split'; busy: boolean; onSave: (names: string[], kind: CellKind, size: number | null, unit: 'm2' | 'ha') => Promise<unknown>; onClose: () => void;
}) {
  const { first, resolve } = useKindResolver();
  const [choice, setChoice] = useState(first);
  const [housing, setHousing] = useState('');
  const k = resolve(choice);
  const [name, setName] = useState('');
  const [prefix, setPrefix] = useState('');
  const [count, setCount] = useState('10');
  const [start, setStart] = useState('1');
  const [size, setSize] = useState('');
  const [unit, setUnit] = useState<'m2' | 'ha'>('m2');
  const [err, setErr] = useState<string | null>(null);
  const def = cellDefaultName(mode === 'split' ? parent.kind : k.kind);
  return (
    <div className="card">
      <h2>{mode === 'split' ? `Chia "${parent.name}" thành ô sản xuất` : `Thêm nhiều ô sản xuất vào "${parent.name}"`}</h2>
      <div className="inline-form">
        {mode === 'split' ? (
          <>
            <p className="muted">Phân khu này đang có vụ. App tạo ô sản xuất đầu tiên (kế thừa loại, diện tích và kiểu ô của phân khu) và chuyển các vụ hiện có sang đó; sau đó bạn thêm các ô còn lại.</p>
            <label>Tên ô sản xuất đầu tiên<input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder={`${def} 1`} /></label>
          </>
        ) : (
          <>
            <div className="pair">
              <label>Tên chung<input value={prefix} maxLength={100} onChange={(e) => setPrefix(e.target.value)} placeholder={def} /></label>
              <label>Số lượng<input value={count} inputMode="numeric" onChange={(e) => setCount(e.target.value)} /></label>
            </div>
            <KindRow choice={choice} onChoice={setChoice} housing={housing} onHousing={setHousing} />
            <div className="pair">
              <label>Bắt đầu từ số<input value={start} inputMode="numeric" onChange={(e) => setStart(e.target.value)} /></label>
              <label>Diện tích mỗi ô (không bắt buộc)<input value={size} inputMode="decimal" onChange={(e) => setSize(e.target.value)} /></label>
            </div>
            <label>Đơn vị diện tích
              <select value={unit} onChange={(e) => setUnit(e.target.value as 'm2' | 'ha')}><option value="m2">m²</option><option value="ha">ha</option></select>
            </label>
          </>
        )}
        {err && <p className="msg error" role="alert">{err}</p>}
        <div className="btnrow">
          <button className="primary" disabled={busy} onClick={() => {
            let names: string[];
            let n: number | null = null;
            if (mode === 'many') {
              const p = parseSize(size);
              if (p === 'bad') return setErr('Diện tích phải là số không âm.');
              n = p;
              const c = Number(count), s = Number(start);
              const base = (prefix || def).trim();
              if (!Number.isInteger(c) || c < 1 || c > 50) return setErr('Số lượng từ 1 đến 50.');
              if (!Number.isInteger(s) || s < 0) return setErr('Số bắt đầu phải là số nguyên không âm.');
              names = Array.from({ length: c }, (_, i) => `${base} ${s + i}`);
            } else {
              names = [(name || `${def} 1`).trim()];
            }
            setErr(null);
            void onSave(names, { ...k, housing: k.kind === 'facility' ? null : housing || null }, n, unit).catch(() => undefined);
          }}>{mode === 'split' ? 'Chia và chuyển vụ' : 'Lưu'}</button>
          <button type="button" className="secondary" onClick={onClose}>Hủy</button>
        </div>
      </div>
    </div>
  );
}
