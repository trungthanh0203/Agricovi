import { useState } from 'react';
import { AutoTextarea } from './AutoTextarea';
import { Collapsible } from './Collapsible';
import { infoLabels, type ProductKind } from '../lib/terms';
import { AREA_UNITS, fromM2, getAreaUnit, parseDecimal, setAreaUnit, toM2 } from '../lib/areaUnits';
import type { CropInfo } from '../lib/production';

export interface CropInfoForm {
  area: string; unit: string; plants: string; variety: string; source: string; lot: string; sowing: string; planting: string;
  code: string; countUnit: string; supName: string; supPhone: string;
}

/** Giá trị ban đầu của biểu mẫu từ thông tin đã có của vụ (diện tích hiện theo đơn vị người dùng chọn lần trước) */
export function cropInfoToForm(c: { planted_area_m2?: number | null; plant_count?: number | null; variety_name?: string | null; seed_source?: string | null; seed_lot?: string | null; sowing_date?: string | null; planting_date?: string | null; code?: string | null; count_unit?: string | null; supervisor_name?: string | null; supervisor_phone?: string | null } | null): CropInfoForm {
  const unit = getAreaUnit();
  const a = c?.planted_area_m2 ?? null;
  return {
    area: a !== null ? String(Math.round(fromM2(a, unit) * 100) / 100) : '', unit, plants: c?.plant_count != null ? String(c.plant_count) : '',
    variety: c?.variety_name ?? '', source: c?.seed_source ?? '', lot: c?.seed_lot ?? '', sowing: c?.sowing_date ?? '', planting: c?.planting_date ?? '',
    code: c?.code ?? '', countUnit: c?.count_unit ?? '', supName: c?.supervisor_name ?? '', supPhone: c?.supervisor_phone ?? '',
  };
}

/** Chuyển biểu mẫu thành giá trị gửi máy chủ; trả về lỗi bằng chữ nếu nhập sai */
export function formToCropInfo(f: CropInfoForm): { info: CropInfo } | { error: string } {
  const a = parseDecimal(f.area);
  if (f.area.trim() && (a === null || a <= 0)) return { error: 'Diện tích phải là số lớn hơn 0.' };
  const p = parseDecimal(f.plants);
  if (f.plants.trim() && (p === null || p <= 0 || !Number.isInteger(p))) return { error: 'Số cây phải là số nguyên lớn hơn 0.' };
  if (f.sowing && f.planting && f.planting < f.sowing) return { error: 'Ngày trồng không thể trước ngày gieo.' };
  return { info: { areaM2: a !== null ? Math.round(toM2(a, f.unit) * 100) / 100 : null, plants: p, variety: f.variety, seedSource: f.source, seedLot: f.lot, sowingDate: f.sowing || null, plantingDate: f.planting || null, code: f.code, countUnit: f.countUnit, supervisorName: f.supName, supervisorPhone: f.supPhone } };
}

/** Các ô giống, diện tích, số cây, nguồn giống, ngày gieo/trồng của vụ (không bắt buộc). Dùng khi tạo vụ và sửa vụ. */
export function CycleInfoFields({ value, onChange, defaultUnit = 'cây', kind, parts = 'all' }: { value: CropInfoForm; onChange: (v: CropInfoForm) => void; defaultUnit?: string; kind?: ProductKind; parts?: 'all' | 'scale' | 'area' | 'count' | 'seed' | 'manage' }) {
  const show = (p: 'scale' | 'seed' | 'manage') => parts === 'all' || parts === p;
  const showArea = show('scale') || parts === 'area';
  const showCount = show('scale') || parts === 'count';
  const L = infoLabels(kind);
  const cnt = value.countUnit.trim() || defaultUnit;
  const [, force] = useState(0);
  const set = (patch: Partial<CropInfoForm>) => onChange({ ...value, ...patch });
  const density = (() => {
    const a = parseDecimal(value.area), p = parseDecimal(value.plants);
    return a && p ? Math.round((p / toM2(a, value.unit)) * 1000) : null;
  })();
  return (
    <>
      {showArea && <>
      <div className="pair">
        <label>{L.area}<input value={value.area} inputMode="decimal" onChange={(e) => set({ area: e.target.value })} placeholder="Không bắt buộc" /></label>
        <label>Đơn vị
          <select value={value.unit} onChange={(e) => {
            // đổi đơn vị thì quy đổi lại số đang nhập để diện tích thực không đổi
            const a = parseDecimal(value.area);
            const unit = e.target.value;
            setAreaUnit(unit); force((n) => n + 1);
            set({ unit, area: a !== null ? String(Math.round(fromM2(toM2(a, value.unit), unit) * 100) / 100) : value.area });
          }}>
            {AREA_UNITS.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
          </select>
        </label>
      </div>
      </>}
      {showCount && <>
      <div className="pair">
        <label>Số {cnt}<input value={value.plants} inputMode="numeric" onChange={(e) => set({ plants: e.target.value })} placeholder="Không bắt buộc" /></label>
        <label>Mật độ<input value={density !== null ? `${density.toLocaleString('vi-VN')} ${cnt}/1.000 m²` : ''} readOnly placeholder="Tự tính" /></label>
      </div>
      </>}
      {show('manage') && (
      <Collapsible inline title="＋ Thông tin quản lý (không bắt buộc)" summary={[value.code, value.countUnit, value.supName].filter(Boolean).join(' · ') || undefined}>
      <div className="pair">
        <label>Mã vụ / mã lô<input value={value.code} maxLength={40} onChange={(e) => set({ code: e.target.value })} placeholder="Ví dụ: LO-THIT-10" /></label>
        <label>Đơn vị đếm
          <input value={value.countUnit} maxLength={20} list="count-units" onChange={(e) => set({ countUnit: e.target.value })} placeholder={defaultUnit} />
          <datalist id="count-units"><option value="cây" /><option value="con" /><option value="quả" /><option value="cặp" /></datalist>
        </label>
      </div>
      <div className="pair">
        <label>Cán bộ kỹ thuật / thú y phụ trách<input value={value.supName} maxLength={120} onChange={(e) => set({ supName: e.target.value })} placeholder="Không bắt buộc" /></label>
        <label>Điện thoại<input value={value.supPhone} maxLength={30} inputMode="tel" onChange={(e) => set({ supPhone: e.target.value })} /></label>
      </div>
      </Collapsible>
      )}
      {show('seed') && <>
      <label>{L.variety}<AutoTextarea value={value.variety} maxLength={120} onChange={(v) => set({ variety: v })} placeholder={L.varietyHint} /></label>
      <label>{L.source}<AutoTextarea value={value.source} maxLength={200} onChange={(v) => set({ source: v })} /></label>
      <label>{L.lot}<input value={value.lot} maxLength={80} onChange={(e) => set({ lot: e.target.value })} /></label>
      <div className="pair">
        <label>{L.sowing}<input type="date" value={value.sowing} onChange={(e) => set({ sowing: e.target.value })} /></label>
        <label>{L.planting}<input type="date" value={value.planting} min={value.sowing || undefined} onChange={(e) => set({ planting: e.target.value })} /></label>
      </div>
      </>}
    </>
  );
}
