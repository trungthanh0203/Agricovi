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
import { areaSizeM2, cellsOf, cellWord, topAreas } from '../lib/areas';

const fmtSize = (a: AreaRow) => (a.area_size != null ? `${a.area_size.toLocaleString('vi-VN')} ${a.area_unit === 'ha' ? 'ha' : 'm²'}` : '');
const fmtM2 = (m2: number) => (m2 >= 10000 ? `${(m2 / 10000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} ha` : `${m2.toLocaleString('vi-VN', { maximumFractionDigits: 0 })} m²`);

/**
 * Phân khu của cơ sở (D125: hai cấp). Cấp 1 là PHÂN KHU (cụm), cấp 2 là NHÀ MÀNG / CHUỒNG / AO nơi chạy vụ. Bảng gom theo phân khu, mỗi phân khu có
 * nút thêm nhà màng (một cái hoặc nhiều cái một lần) và, nếu đang có vụ, nút "Chia thành nhà màng" chuyển vụ sang nhà màng đầu tiên.
 * Thêm bằng biểu mẫu, sửa bằng ✎, dừng/dùng lại bằng ⏸/▶. Cần mạng để thêm/sửa (D24).
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
  const rowCount = tops.reduce((n, t) => n + 1 + cellsOf(mine, t.id).filter(visible).length, 0);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (err) { setError(friendlyError(err)); throw err; } finally { setBusy(false); }
  }

  const renderRow = (a: AreaRow, isCell: boolean) => {
    const kids = isCell ? [] : cellsOf(mine, a.id);
    const m2 = areaSizeM2(a, mine);
    const hasCycles = !isCell && cycles.some((c) => c.area_id === a.id);
    return (
      <tr key={a.id} className={a.is_active === false ? 'off' : ''}>
        <td style={isCell ? { paddingLeft: 24 } : undefined}>
          <Thumb src={a.image} />{isCell ? '↳ ' : ''}{a.name}{a.code ? ` · ${a.code}` : ''}
          {!isCell && kids.length > 0 && <span className="sub">{kids.length} {cellWord(a.kind).toLowerCase()}</span>}
          {(a.kind || a.housing) && <span className="sub">{[!isCell && a.kind ? kindLabel(a.kind, a.kind_item) : '', a.housing ? `Nhà/chuồng ${housingText(a.housing).toLowerCase()}` : ''].filter(Boolean).join(' · ')}</span>}
          {a.location && <span className="sub">📍 {a.location}</span>}
          {a.description && <span className="sub">{a.description}</span>}
          {a.is_active === false && <span className="sub">Đã dừng</span>}
          {canManage && !isCell && a.kind !== 'facility' && a.is_active !== false && (
            <span className="sub">
              <button type="button" className="link" disabled={busy || !online} onClick={() => { setAdding(false); setEditing(null); setCellFor({ parent: a, mode: 'one' }); }}>+ {cellWord(a.kind)}</button>
              {' · '}
              <button type="button" className="link" disabled={busy || !online} onClick={() => { setAdding(false); setEditing(null); setCellFor({ parent: a, mode: 'many' }); }}>+ Nhiều {cellWord(a.kind).toLowerCase()} cùng lúc</button>
              {kids.length === 0 && hasCycles && (
                <>{' · '}<button type="button" className="link" disabled={busy || !online} onClick={() => { setAdding(false); setEditing(null); setCellFor({ parent: a, mode: 'split' }); }}>Chia thành {cellWord(a.kind).toLowerCase()}</button></>
              )}
            </span>
          )}
        </td>
        <td className="num">{!isCell && kids.length > 0 ? (m2 ? `${fmtM2(m2)} (tổng)` : '—') : fmtSize(a) || '—'}</td>
        {canManage && (
          <td className="act">
            <button className="icon" disabled={busy || !online} aria-label={a.is_active === false ? `Dùng lại ${a.name}` : `Dừng ${a.name}`}
              onClick={() => void run(() => updateArea(a.id, { is_active: a.is_active === false })).catch(() => undefined)}>{a.is_active === false ? '▶' : '⏸'}</button>{' '}
            <button className="icon" aria-label={`Sửa ${a.name}`} onClick={() => { setAdding(false); setCellFor(null); setEditing(editing === a.id ? null : a.id); }}>✎</button>
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
        <FarmForm title="Thêm phân khu" busy={busy || !online} onClose={() => setAdding(false)}
          onSave={(f) => run(async () => { await createArea(active.id, f); setAdding(false); })} />
      )}
      {canManage && cellFor && (
        <CellForm parent={cellFor.parent} mode={cellFor.mode} busy={busy || !online} onClose={() => setCellFor(null)}
          onSave={(names, size, unit) => run(async () => {
            const p = cellFor.parent;
            if (cellFor.mode === 'split') await splitAreaIntoCells(p.id, names[0]!);
            else for (const name of names) await createArea(active.id, { name, kind: p.kind as Exclude<AreaKind, 'growing'>, kind_item: p.kind_item ?? undefined, housing: p.housing ?? null, area_size: size, area_unit: unit, parent_id: p.id });
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
      <p className="muted">Khu đã dừng vẫn giữ lịch sử nhưng không chọn được để tạo vụ mới. Phân khu lớn có nhiều nhà màng thì thêm nhà màng bên trong; vụ sẽ gắn vào từng nhà màng.</p>
      <p className="msg" role="note">💡 Sau khi tạo phân khu (và nhà màng nếu có), hãy vào <strong>Khai báo → Sản phẩm</strong> để tạo/chọn loại đối tượng nuôi / trồng, rồi tạo vụ nuôi trồng cho từng nhà màng (hoặc phân khu chưa chia) của bạn.</p>

      {canManage && editRow && (
        <FarmForm key={editRow.id} title={`Sửa: ${editRow.name}`} initial={editRow} busy={busy || !online} onClose={() => setEditing(null)}
          onSave={(f) => run(async () => { await updateArea(editRow.id, f); setEditing(null); })} />
      )}
    </>
  );
}

/** Thêm nhà màng/chuồng/ao vào một phân khu: một cái, nhiều cái cùng lúc (tên + số thứ tự), hoặc chia phân khu đang có vụ */
function CellForm({ parent, mode, busy, onSave, onClose }: {
  parent: AreaRow; mode: 'one' | 'many' | 'split'; busy: boolean; onSave: (names: string[], size: number | null, unit: 'm2' | 'ha') => Promise<unknown>; onClose: () => void;
}) {
  const word = cellWord(parent.kind);
  const [name, setName] = useState(mode === 'split' ? `${word} 1` : '');
  const [prefix, setPrefix] = useState(word);
  const [count, setCount] = useState('10');
  const [start, setStart] = useState('1');
  const [size, setSize] = useState('');
  const [unit, setUnit] = useState<'m2' | 'ha'>('m2');
  const [err, setErr] = useState<string | null>(null);
  const title = mode === 'split' ? `Chia "${parent.name}" thành ${word.toLowerCase()}` : mode === 'many' ? `Thêm nhiều ${word.toLowerCase()} vào "${parent.name}"` : `Thêm ${word.toLowerCase()} vào "${parent.name}"`;
  return (
    <div className="card">
      <h2>{title}</h2>
      <div className="inline-form">
        {mode === 'split' && <p className="muted">Phân khu này đang có vụ. App tạo {word.toLowerCase()} đầu tiên và chuyển các vụ hiện có sang đó; sau đó bạn thêm các {word.toLowerCase()} còn lại.</p>}
        {mode !== 'many' ? (
          <label>Tên {word.toLowerCase()}<input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder={`Ví dụ: ${word} 1`} /></label>
        ) : (
          <>
            <label>Tên chung<input value={prefix} maxLength={100} onChange={(e) => setPrefix(e.target.value)} /></label>
            <div className="pair">
              <label>Số lượng<input value={count} inputMode="numeric" onChange={(e) => setCount(e.target.value)} /></label>
              <label>Bắt đầu từ số<input value={start} inputMode="numeric" onChange={(e) => setStart(e.target.value)} /></label>
            </div>
          </>
        )}
        {mode !== 'split' && (
          <div className="pair">
            <label>Diện tích mỗi cái (không bắt buộc)<input value={size} inputMode="decimal" onChange={(e) => setSize(e.target.value)} /></label>
            <label>Đơn vị
              <select value={unit} onChange={(e) => setUnit(e.target.value as 'm2' | 'ha')}><option value="m2">m²</option><option value="ha">ha</option></select>
            </label>
          </div>
        )}
        {err && <p className="msg error" role="alert">{err}</p>}
        <div className="btnrow">
          <button className="primary" disabled={busy} onClick={() => {
            const n = size.trim() === '' ? null : Number(size.replace(',', '.'));
            if (n !== null && (Number.isNaN(n) || n < 0)) return setErr('Diện tích phải là số không âm.');
            let names: string[];
            if (mode === 'many') {
              const c = Number(count), s = Number(start);
              if (!prefix.trim()) return setErr('Hãy nhập tên chung.');
              if (!Number.isInteger(c) || c < 1 || c > 50) return setErr('Số lượng từ 1 đến 50.');
              if (!Number.isInteger(s) || s < 0) return setErr('Số bắt đầu phải là số nguyên không âm.');
              names = Array.from({ length: c }, (_, i) => `${prefix.trim()} ${s + i}`);
            } else {
              if (!name.trim()) return setErr(`Hãy nhập tên ${word.toLowerCase()}.`);
              names = [name.trim()];
            }
            setErr(null);
            void onSave(names, n, unit).catch(() => undefined);
          }}>{mode === 'split' ? 'Chia và chuyển vụ' : 'Lưu'}</button>
          <button type="button" className="secondary" onClick={onClose}>Hủy</button>
        </div>
      </div>
    </div>
  );
}

function FarmForm({ title, initial, busy, onSave, onClose }: {
  title: string; initial?: AreaRow; busy: boolean; onSave: (f: FarmInput) => Promise<unknown>; onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [size, setSize] = useState(initial?.area_size != null ? String(initial.area_size) : '');
  const [unit, setUnit] = useState<'m2' | 'ha'>(initial?.area_unit ?? 'm2');
  const [code, setCode] = useState(initial?.code ?? '');
  const cfg = useConfig();
  // lựa chọn = mã mục trong Nhóm loại sản phẩm, hoặc 'facility' (cơ sở vật chất: loại riêng của khu, không tạo vụ)
  const [choice, setChoice] = useState(initial?.kind === 'facility' ? 'facility' : cfg.choiceOf('product_groups', initial?.kind ?? 'crop', initial?.kind_item));
  const isFacility = choice === 'facility';
  const [housing, setHousing] = useState<string>(housingText(initial?.housing));
  const housingChoices = cfg.housing().includes(housing) || !housing ? cfg.housing() : [...cfg.housing(), housing]; // giữ giá trị cũ dù đã bỏ khỏi cấu hình
  const [desc, setDesc] = useState(initial?.description ?? '');
  const [image, setImage] = useState(initial?.image ?? '');
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="card">
      <h2>{title}</h2>
      <div className="inline-form">
        <label>Tên phân khu<input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></label>
        <div className="pair">
          {!initial?.parent_id && <label>Loại khu
            <select value={choice} onChange={(e) => setChoice(e.target.value)}>
              {cfg.productGroups(choice).map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
              <option value="facility">Cơ sở vật chất</option>
            </select>
          </label>}
          <label>Mã khu / chuồng<input value={code} maxLength={40} onChange={(e) => setCode(e.target.value)} placeholder="Ví dụ: C-THIT-02" /></label>
        </div>
        {isFacility && <p className="muted">Cơ sở vật chất (cổng, kho, biogas, hố sát trùng…) chỉ để ghi việc, không tạo vụ.</p>}
        {!isFacility && (cfg.animalsOn || !!initial?.housing) && (
          <label>Kiểu Nhà/Chuồng
            <select value={housing} onChange={(e) => setHousing(e.target.value)}>
              <option value="">— Không áp dụng —</option>
              {housingChoices.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </label>
        )}
        <label>Vị trí<input value={location} maxLength={200} onChange={(e) => setLocation(e.target.value)} placeholder="Xã, huyện, tỉnh hoặc mô tả đường đi" /></label>
        <div className="pair">
          <label>Diện tích<input value={size} inputMode="decimal" onChange={(e) => setSize(e.target.value)} /></label>
          <label>Đơn vị
            <select value={unit} onChange={(e) => setUnit(e.target.value as 'm2' | 'ha')}>
              <option value="m2">m²</option>
              <option value="ha">ha</option>
            </select>
          </label>
        </div>
        <label>Đặc điểm<textarea rows={3} maxLength={500} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Loại đất/ao/chuồng, nguồn nước, nhà màng…" /></label>
        <ImagePicker value={image} onChange={setImage} store="areas" />
        {err && <p className="msg error" role="alert">{err}</p>}
        <div className="btnrow">
          <button className="primary" disabled={busy} onClick={() => {
            if (!name.trim()) return setErr('Hãy nhập tên phân khu.');
            const n = size.trim() === '' ? null : Number(size.replace(',', '.'));
            if (n !== null && (Number.isNaN(n) || n < 0)) return setErr('Diện tích phải là số không âm.');
            setErr(null);
            const r = isFacility ? { base: 'facility', item: null } : cfg.resolve('product_groups', choice);
            void onSave({ name, location, area_size: n, area_unit: unit, description: desc, image, code, kind: r.base as Exclude<AreaKind, 'growing'>, kind_item: r.item ?? (initial?.kind_item ? null : undefined), housing: !isFacility && housing ? housing : null }).catch(() => undefined);
          }}>Lưu</button>
          <button type="button" className="secondary" onClick={onClose}>Hủy</button>
        </div>
      </div>
    </div>
  );
}
