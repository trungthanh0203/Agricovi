import { useCallback } from 'react';
import { useCatalog } from './catalog';
import { cycleTitle } from './cycles';

/** Hook: hàm trả tên hiển thị của một vụ (tên vụ do người dùng đặt; chưa đặt thì "Sản phẩm dd/mm"). Dùng cho mọi danh sách chọn vụ. */
export function useCycleTitle(): (c: { name?: string | null; crop_type_id?: string | null; start_date?: string | null }) => string {
  const { cropTypes } = useCatalog();
  return useCallback((c) => cycleTitle(c, cropTypes.find((t) => t.id === c.crop_type_id)?.name ?? ''), [cropTypes]);
}
