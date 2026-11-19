import { MAX_PHOTOS, getScanUsage, prepareImage, type ScanUsage } from './invoiceScan';
import { callFunction } from './staff';
import { DOW, listDays, type Sheet } from './timesheets';
import type { ScanResult } from './timesheetScanMap';

/**
 * Đọc ảnh bảng chấm công giấy bằng AI (D201, lớp B): đường đọc ảnh hóa đơn có sẵn (Edge Function `scan-invoice`, loại `timesheet`, dùng chung hạn mức
 * tháng theo gói). Ảnh được thu nhỏ trên máy rồi gửi kèm NGỮ CẢNH của bảng (người ở các hàng, các cột ngày, kiểu ghi); ảnh KHÔNG được lưu.
 * Kết quả chỉ là bản nháp điền vào lưới nhập, người dùng phải xem và bấm Lưu. Cần mạng; chỉ chủ, quản lý, tổ trưởng.
 */
export { MAX_PHOTOS, getScanUsage, prepareImage };
export type { ScanUsage };
export const SCAN_MAX_ROWS = 60;

export async function scanTimesheet(sheet: Sheet, images: string[]): Promise<{ result: ScanResult; usage: ScanUsage }> {
  if (!navigator.onLine) throw new Error('OFFLINE: Đọc ảnh cần có mạng. Bạn vẫn nhập tay được.');
  if (sheet.workers.length > SCAN_MAX_ROWS) throw new Error(`BAD_REQUEST: Bảng có quá nhiều người để đọc một lần (tối đa ${SCAN_MAX_ROWS}). Hãy lập bảng riêng cho từng tổ.`);
  const days = listDays(sheet.from_date, sheet.to_date);
  const res = await callFunction<{ ok: boolean; timesheet: ScanResult; usage: ScanUsage }>({
    organization_id: sheet.organization_id,
    scan_id: crypto.randomUUID(),
    kind: 'timesheet',
    images,
    context: { code: sheet.code, mode: sheet.mode, workers: sheet.workers.map((w) => w.name), days: days.map((d) => `${d.day} (${DOW[d.dow]})`) },
  }, 'scan-invoice');
  return { result: res.timesheet, usage: res.usage };
}
