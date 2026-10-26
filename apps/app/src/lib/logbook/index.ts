import { MELON_BOOKS } from './melon';
import { GENERAL_BOOKS } from './general';
import { PIG_BOOKS } from './pig';
import type { LogbookSet } from './types';

/** Bộ sổ theo loại sản phẩm của vụ: vật nuôi dùng bộ heo, trồng trọt dùng bộ dưa lưới, thủy sản và loại khác dùng bộ chung. Thêm loại hình = thêm file + một dòng ở đây. */
export function logbookSetFor(kind: 'crop' | 'livestock' | 'aquatic' | 'other' | undefined): LogbookSet {
  if (kind === 'livestock') return PIG_BOOKS;
  return kind === 'crop' || kind === undefined ? MELON_BOOKS : GENERAL_BOOKS; // thủy sản và loại khác: bộ sổ chung (khung tạm)
}
export { GENERAL_BOOKS, MELON_BOOKS, PIG_BOOKS };
export type { LogbookData, LogbookSet, Logbook } from './types';

/** Dữ liệu dùng để dựng một sổ: sổ phạm vi vụ chỉ lấy việc của vụ đang chọn */
export function dataForBook(book: { scope?: 'cycle' | 'org' }, d: import('./types').LogbookData): import('./types').LogbookData {
  if (book.scope === 'org' || !d.cycle) return d;
  const id = d.cycle.id;
  return { ...d, entries: d.entries.filter((e) => e.log.cycle_id === id) };
}
