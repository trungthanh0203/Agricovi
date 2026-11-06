/**
 * Đàn nuôi liên tục (migration 0182): các nhóm đàn gợi ý sẵn (người dùng đặt thêm nhóm khác khi ghi), và tên gọi theo kiểu vụ.
 */
export const DEFAULT_HERD_GROUPS = ['Đực giống', 'Cái sinh sản', 'Hậu bị', 'Con non', 'Vỗ béo'];

export type CycleMode = 'batch' | 'perennial' | 'herd';
export const MODE_LABEL: Record<CycleMode, string> = { batch: 'Theo vụ', perennial: 'Vườn cây lâu năm', herd: 'Đàn nuôi liên tục' };
export const modeOf = (c: { cycle_mode?: string | null } | null | undefined): CycleMode => (c?.cycle_mode === 'perennial' || c?.cycle_mode === 'herd' ? c.cycle_mode : 'batch');

/** Từ khóa tên sản phẩm gợi ý sẵn kiểu vụ (người dùng đổi được) */
const PERENNIAL_WORDS = ['na', 'mãng cầu', 'nho', 'sầu riêng', 'cà phê', 'cafe', 'hồ tiêu', 'tiêu', 'xoài', 'bưởi', 'cam', 'quýt', 'chanh', 'nhãn', 'vải', 'chôm chôm', 'măng cụt', 'dừa', 'mít', 'thanh long', 'ổi', 'bơ', 'sapoche', 'hồng', 'mận', 'điều', 'cao su', 'chè', 'ca cao', 'cacao', 'macca', 'dâu da', 'vú sữa', 'lựu', 'táo'];
const HERD_WORDS = ['dê', 'bò', 'trâu', 'cừu', 'ngựa', 'heo nái', 'lợn nái', 'gà đẻ', 'vịt đẻ', 'ong', 'thỏ', 'nai', 'hươu'];
export function suggestMode(productName: string, kind: string | undefined): CycleMode {
  const n = ` ${productName.toLowerCase()} `;
  const has = (words: string[]) => words.some((w) => new RegExp(`(^|[\\s,(])${w}([\\s,)]|$)`).test(n.trim()) || n.includes(` ${w} `));
  if (kind === 'crop' && has(PERENNIAL_WORDS)) return 'perennial';
  if (kind === 'livestock' && has(HERD_WORDS)) return 'herd';
  return 'batch';
}
