/**
 * Từ ngữ theo loại sản phẩm (D100): trồng trọt nói "vụ trồng, giống, diện tích trồng, ngày gieo/trồng", chăn nuôi nói "lứa nuôi, giống/dòng, diện tích chuồng,
 * ngày nhập chuồng/bắt đầu nuôi". Cơ sở có cả hai loại thì dùng từ chung "vụ". Phần thuần.
 */
import type { ProductKind as Kind } from './config';
import { t } from '@lingui/core/macro';
export type ProductKind = Kind | undefined;

/** Danh từ gọi một vụ/lứa theo các loại sản phẩm đang có của cơ sở */
export function cycleNoun(kinds: ProductKind[]): string {
  const set = new Set(kinds.filter(Boolean));
  if (set.size === 0) return t`vụ nuôi trồng`;
  const animal = set.has('livestock') || set.has('aquatic');
  if (set.has('crop') && !animal) return t`vụ trồng`;
  if (animal && !set.has('crop')) return t`vụ nuôi`;
  return t`vụ nuôi trồng`;
}

export const capFirst = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

export interface InfoLabels {
  area: string; variety: string; varietyHint: string; source: string; lot: string; sowing: string; planting: string; count: string;
}

/** Nhãn các ô thông tin của vụ/lứa theo loại sản phẩm */
export function infoLabels(kind: ProductKind): InfoLabels {
  if (kind === 'aquatic') {
    return {
      area: t`Diện tích ao / bể`, variety: t`Giống / loài`, varietyHint: t`Ví dụ: Cá tra, tôm thẻ chân trắng`, source: t`Nơi mua con giống (trại giống, nhà cung cấp)`,
      lot: t`Mã đàn / số lô con giống`, sowing: t`Ngày thả giống`, planting: t`Ngày bắt đầu nuôi`, count: 'con',
    };
  }
  if (kind === 'livestock') {
    return {
      area: t`Diện tích chuồng`, variety: t`Giống / dòng`, varietyHint: t`Ví dụ: Heo thịt 3 máu (Duroc × Landrace × Yorkshire)`, source: t`Nơi mua con giống (trại giống, nhà cung cấp)`,
      lot: t`Mã đàn / số lô con giống`, sowing: t`Ngày nhập chuồng`, planting: t`Ngày bắt đầu nuôi`, count: 'con',
    };
  }
  return {
    area: t`Diện tích trồng`, variety: t`Giống`, varietyHint: t`Ví dụ: Dưa lưới Kim Cô Nương`, source: t`Nguồn giống (nơi mua, nhà cung cấp)`,
    lot: t`Số lô giống`, sowing: t`Ngày gieo`, planting: t`Ngày trồng`, count: 'cây',
  };
}
