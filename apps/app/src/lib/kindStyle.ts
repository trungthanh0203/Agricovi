import type { CropTypeRow } from './db';
import { t } from '@lingui/core/macro';

/**
 * Cách phân biệt việc theo loại sản phẩm ở Trang chủ: biểu tượng + chữ + vạch màu bên trái (class `kind-*` ở styles.css).
 * Không dùng đỏ/cam vì hai màu đó dành cho mức trễ; luôn có biểu tượng và chữ để người khó phân biệt màu vẫn đọc được.
 */
export type KindKey = 'crop' | 'livestock' | 'aquatic' | 'other';
export const KIND_ORDER: KindKey[] = ['crop', 'livestock', 'aquatic', 'other'];
export const KIND_STYLE: Record<KindKey, { icon: string; label: string }> = {
  crop: { icon: '🌱', get label() { return t`Cây trồng`; } },
  livestock: { icon: '🐖', get label() { return t`Vật nuôi`; } },
  aquatic: { icon: '🐟', get label() { return t`Thủy sản`; } },
  other: { icon: '📋', label: 'Khác' },
};

/** Loại của một vụ theo sản phẩm của vụ; chưa rõ thì coi là cây trồng (giống cách đặt đơn vị đếm, D98) */
export function cycleKind(cropTypeId: string | null | undefined, cropTypes: CropTypeRow[]): KindKey {
  const k = cropTypes.find((c) => c.id === cropTypeId)?.kind;
  return k === 'livestock' || k === 'aquatic' || k === 'other' ? k : 'crop';
}
