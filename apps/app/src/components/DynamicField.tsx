import type { FieldDef } from '../lib/db';
import { joinMulti, splitMulti } from '../lib/fieldsLogic';
import { alertOf } from '../lib/fieldAlerts';
import { NamePicker, PartnerNamePicker, useMaterialNames } from './CatalogPick';

/** Ô chữ nào thực chất là chọn từ danh mục (theo khóa trường): khách hàng, nhà cung cấp, vật tư */
const PICK_KIND: Record<string, 'customer' | 'supplier' | 'material'> = { buyer: 'customer', seed_source: 'supplier', probiotic: 'material', product: 'material', substrate: 'material' };

function MaterialPick({ def, value, onChange }: { def: FieldDef; value: string; onChange: (v: string) => void }) {
  const names = useMaterialNames();
  return <NamePicker label={def.label} value={value} onChange={onChange} names={names} hint={def.hint} emptyHint="Chưa có vật tư trong danh mục. Thêm ở Khai báo → Vật tư, hoặc chọn 'Khác (gõ tên)'." />;
}

/** Một ô của form động (D96), dựng theo kiểu trường; giá trị luôn là chuỗi (xem lib/fieldsLogic.ts) */
export function DynamicField({ def, value, onChange }: { def: FieldDef; value: string; onChange: (v: string) => void }) {
  const label = <>{def.label}{def.required ? ' *' : ''}{def.unit && def.type !== 'number' ? ` (${def.unit})` : ''}</>;
  if (def.type === 'select' && def.options?.length) {
    return (
      <label>{label}
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">— Chọn —</option>
          {def.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
    );
  }
  if (def.type === 'multiselect') {
    const cur = splitMulti(value);
    return (
      <fieldset className="roles">
        <legend>{label}</legend>
        {(def.options ?? []).map((o) => (
          <label className="check" key={o}>
            <input type="checkbox" checked={cur.includes(o)} onChange={() => onChange(joinMulti(cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o]))} />
            <span>{o}</span>
          </label>
        ))}
      </fieldset>
    );
  }
  if (def.type === 'bool') {
    return (
      <label>{label}
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">— Chọn —</option>
          <option value="yes">Có</option>
          <option value="no">Không</option>
        </select>
      </label>
    );
  }
  if (def.type === 'date') {
    return <label>{label}<input type="date" value={value} onChange={(e) => onChange(e.target.value)} /></label>;
  }
  const pick = def.type === 'text' ? PICK_KIND[def.key] : undefined;
  if (pick === 'material') return <MaterialPick def={def} value={value} onChange={onChange} />;
  if (pick === 'customer' || pick === 'supplier') return <PartnerNamePicker kind={pick} label={def.label + (def.required ? ' *' : '')} value={value} onChange={onChange} hint={def.hint} />;
  return (
    <label>
      {def.label}{def.required ? ' *' : ''}{def.unit && def.type === 'number' ? ` (${def.unit})` : ''}
      <input value={value} inputMode={def.type === 'number' ? 'decimal' : undefined} placeholder={def.hint} onChange={(e) => onChange(e.target.value)} />
      {alertOf(def, value) && <small className="alert-text" role="status">⚠ {alertOf(def, value)}</small>}
    </label>
  );
}
