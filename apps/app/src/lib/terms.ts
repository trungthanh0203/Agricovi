/**
 * Từ ngữ theo loại sản phẩm (D100): trồng trọt nói "vụ trồng, giống, diện tích trồng, ngày gieo/trồng", chăn nuôi nói "lứa nuôi, giống/dòng, diện tích chuồng,
 * ngày nhập chuồng/bắt đầu nuôi". Cơ sở có cả hai loại thì dùng từ chung "vụ". Phần thuần.
 */
import type { ProductKind as Kind } from './config';
export type ProductKind = Kind | undefined;

/** Danh từ gọi một vụ/lứa theo các loại sản phẩm đang có của cơ sở */
export function cycleNoun(kinds: ProductKind[]): string {
  const set = new Set(kinds.filter(Boolean));
  if (set.size > 0 && [...set].every((k) => k === 'livestock' || k === 'aquatic')) return 'lứa nuôi';
  if (set.size === 1 && set.has('crop')) return 'vụ trồng';
  return 'vụ';
}

export const capFirst = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

export interface InfoLabels {
  area: string; variety: string; varietyHint: string; source: string; lot: string; sowing: string; planting: string; count: string;
}

/** Nhãn các ô thông tin của vụ/lứa theo loại sản phẩm */
export function infoLabels(kind: ProductKind): InfoLabels {
  if (kind === 'aquatic') {
    return {
      area: 'Diện tích ao / bể', variety: 'Giống / loài', varietyHint: 'Ví dụ: Cá tra, tôm thẻ chân trắng', source: 'Nơi mua con giống (trại giống, nhà cung cấp)',
      lot: 'Mã đàn / số lô con giống', sowing: 'Ngày thả giống', planting: 'Ngày bắt đầu nuôi', count: 'con',
    };
  }
  if (kind === 'livestock') {
    return {
      area: 'Diện tích chuồng', variety: 'Giống / dòng', varietyHint: 'Ví dụ: Heo thịt 3 máu (Duroc × Landrace × Yorkshire)', source: 'Nơi mua con giống (trại giống, nhà cung cấp)',
      lot: 'Mã đàn / số lô con giống', sowing: 'Ngày nhập chuồng', planting: 'Ngày bắt đầu nuôi', count: 'con',
    };
  }
  return {
    area: 'Diện tích trồng', variety: 'Giống', varietyHint: 'Ví dụ: Dưa lưới Kim Cô Nương', source: 'Nguồn giống (nơi mua, nhà cung cấp)',
    lot: 'Số lô giống', sowing: 'Ngày gieo', planting: 'Ngày trồng', count: 'cây',
  };
}
