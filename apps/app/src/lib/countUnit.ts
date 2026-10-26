import type { CropTypeRow, CycleRow } from './db';

/** Đơn vị đếm mặc định theo loại sản phẩm: vật nuôi đếm "con", còn lại "cây" (D98) */
export const defaultCountUnit = (kind?: CropTypeRow['kind']) => (kind === 'livestock' || kind === 'aquatic' ? 'con' : 'cây');

/** Đơn vị đếm của vụ: đơn vị vụ tự đặt, nếu trống thì theo loại sản phẩm */
export function cycleCountUnit(cycle: Pick<CycleRow, 'count_unit' | 'crop_type_id'> | null | undefined, cropTypes: CropTypeRow[]): string {
  if (cycle?.count_unit) return cycle.count_unit;
  return defaultCountUnit(cropTypes.find((c) => c.id === cycle?.crop_type_id)?.kind);
}
