import { useState } from 'react';
import { AutoTextarea } from './AutoTextarea';
import { AREA_UNITS, fromM2, getAreaUnit, parseDecimal, setAreaUnit, toM2 } from '../lib/areaUnits';
import type { CropInfo } from '../lib/production';

export interface CropInfoForm { area: string; unit: string; plants: string; variety: string; source: string; lot: string; sowing: string; planting: string }

/** Giá trị ban đầu của biểu mẫu từ thông tin đã có của vụ (diện tích hiện theo đơn vị người dùng chọn lần trước) */
export function cropInfoToForm(c: { planted_area_m2?: number | null; plant_count?: number | null; variety_name?: string | null; seed_source?: string | null; seed_lot?: string | null; sowing_date?: string | null; planting_date?: string | null } | null): CropInfoForm {
  const unit = getAreaUnit();
  const a = c?.planted_area_m2 ?? null;
  return {
    area: a !== null ? String(Math.round(fromM2(a, unit) * 100) / 100) : '', unit, plants: c?.plant_count != null ? String(c.plant_count) : '',
    variety: c?.variety_name ?? '', source: c?.seed_source ?? '', lot: c?.seed_lot ?? '', sowing: c?.sowing_date ?? '', planting: c?.planting_date ?? '',
  };
}

/** Chuyển biểu mẫu thành giá trị gửi máy chủ; trả về lỗi bằng chữ nếu nhập sai */
export function formToCropInfo(f: CropInfoForm): { info: CropInfo } | { error: string } {
  const a = parseDecimal(f.area);
  if (f.area.trim() && (a === null || a <= 0)) return { error: 'Diện tích phải là số lớn hơn 0.' };
  const p = parseDecimal(f.plants);
  if (f.plants.trim() && (p === null || p <= 0 || !Number.isInteger(p))) return { error: 'Số cây phải là số nguyên lớn hơn 0.' };
  if (f.sowing && f.planting && f.planting < f.sowing) return { error: 'Ngày trồng không thể trước ngày gieo.' };
  return { info: { areaM2: a !== null ? Math.round(toM2(a, f.unit) * 100) / 100 : null, plants: p, variety: f.variety, seedSource: f.source, seedLot: f.lot, sowingDate: f.sowing || null, plantingDate: f.planting || null } };
}

/** Các ô giống, diện tích, số cây, nguồn giống, ngày gieo/trồng của vụ (không bắt buộc). Dùng khi tạo vụ và sửa vụ. */
export function CycleInfoFields({ value, onChange }: { value: CropInfoForm; onChange: (v: CropInfoForm) => void }) {
  const [, force] = useState(0);
  const set = (patch: Partial<CropInfoForm>) => onChange({ ...value, ...patch });
  const density = (() => {
    const a = parseDecimal(value.area), p = parseDecimal(value.plants);
    return a && p ? Math.round((p / toM2(a, value.unit)) * 1000) : null;
  })();
  return (
    <>
      <div className="pair">
        <label>Diện tích trồng<input value={value.area} inputMode="decimal" onChange={(e) => set({ area: e.target.value })} placeholder="Không bắt buộc" /></label>
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
      <div className="pair">
        <label>Số cây<input value={value.plants} inputMode="numeric" onChange={(e) => set({ plants: e.target.value })} placeholder="Không bắt buộc" /></label>
        <label>Mật độ<input value={density !== null ? `${density.toLocaleString('vi-VN')} cây/1.000 m²` : ''} readOnly placeholder="Tự tính" /></label>
      </div>
      <label>Giống<AutoTextarea value={value.variety} maxLength={120} onChange={(v) => set({ variety: v })} placeholder="Ví dụ: Dưa lưới Kim Cô Nương" /></label>
      <label>Nguồn giống (nơi mua, nhà cung cấp)<AutoTextarea value={value.source} maxLength={200} onChange={(v) => set({ source: v })} /></label>
      <label>Số lô giống<input value={value.lot} maxLength={80} onChange={(e) => set({ lot: e.target.value })} /></label>
      <div className="pair">
        <label>Ngày gieo<input type="date" value={value.sowing} onChange={(e) => set({ sowing: e.target.value })} /></label>
        <label>Ngày trồng<input type="date" value={value.planting} min={value.sowing || undefined} onChange={(e) => set({ planting: e.target.value })} /></label>
      </div>
    </>
  );
}
