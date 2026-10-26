import { MELON_BOOKS } from './melon';
import { PIG_BOOKS } from './pig';
import type { LogbookSet } from './types';

/** Bộ sổ theo loại sản phẩm của vụ: vật nuôi dùng bộ heo, còn lại dùng bộ dưa lưới/trồng trọt. Thêm loại hình = thêm file + một dòng ở đây. */
export function logbookSetFor(kind: 'crop' | 'livestock' | 'aquatic' | 'other' | undefined): LogbookSet {
  return kind === 'livestock' ? PIG_BOOKS : MELON_BOOKS;
}
export { MELON_BOOKS, PIG_BOOKS };
export type { LogbookData, LogbookSet, Logbook } from './types';

/** Dữ liệu dùng để dựng một sổ: sổ phạm vi vụ chỉ lấy việc của vụ đang chọn */
export function dataForBook(book: { scope?: 'cycle' | 'org' }, d: import('./types').LogbookData): import('./types').LogbookData {
  if (book.scope === 'org' || !d.cycle) return d;
  const id = d.cycle.id;
  return { ...d, entries: d.entries.filter((e) => e.log.cycle_id === id) };
}
