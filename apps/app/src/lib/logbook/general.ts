import { byDate, fv, logDate, lotText, names, qtyText, vnDate } from './helpers';
import { incidentRows } from './melon';
import { COUNT_KIND_LABEL } from '../countLogic';
import type { LogbookSet } from './types';

/**
 * Bộ sổ CHUNG (khung tạm) cho thủy sản và các loại chưa có bộ riêng: nhật ký công việc kèm vật tư dùng, biến động số lượng, thu hoạch, sự cố.
 * Chưa theo mẫu chứng nhận nào; khi có tài liệu của loại hình đó thì thêm file riêng (như melon.ts, pig.ts) và nhập ở index.ts.
 */
export const GENERAL_BOOKS: LogbookSet = {
  id: 'general',
  name: 'Sổ nhật ký chung (khung tạm)',
  books: [
    {
      id: 'activity', title: 'Nhật ký công việc',
      headers: ['Ngày thực hiện', 'Công việc', 'Vật tư / thuốc đã dùng', 'Số lượng', 'Lô / hạn dùng', 'Nội dung', 'Người thực hiện'],
      build: (d) => d.entries.map((e) => [
        logDate(e), e.wt?.name ?? '', names(e.uses), qtyText(e.uses), e.uses.map(lotText).filter(Boolean).join('; '),
        [e.log.note, fv(e.log.data, 'result')].filter(Boolean).join('; '), e.log.author_name ?? '',
      ]),
    },
    {
      id: 'counts', title: 'Biến động số lượng (nhập, chết, loại, xuất)',
      headers: ['Ngày', 'Loại biến động', 'Số lượng', 'Ghi chú', 'Người ghi'],
      build: (d) => [...d.countEvents].filter((c) => !c.voided_at).sort(byDate((c) => c.event_date)).map((c) => [
        vnDate(c.event_date), COUNT_KIND_LABEL[c.kind] ?? c.kind, String(c.quantity), c.note ?? '', c.author_name ?? '',
      ]),
    },
    {
      id: 'harvest', title: 'Nhật ký thu hoạch',
      headers: ['Ngày thu hoạch', 'Mã lô', 'Số lượng', 'Khối lượng (kg)', 'Hao hụt (kg)', 'Loại cỡ', 'Ghi chú'],
      build: (d) => [...d.harvests].filter((h) => !h.voided_at).sort(byDate((h) => h.harvested_at)).map((h) => [
        vnDate(h.harvested_at), h.lot_code ?? '', h.unit_count ? String(h.unit_count) : '', String(h.quantity), h.loss_quantity ? String(h.loss_quantity) : '', h.grade ?? '', h.note ?? '',
      ]),
    },
    {
      id: 'incidents', title: 'Sự cố và khắc phục',
      headers: ['Ngày phát sinh', 'Mô tả sự cố / Bất thường', 'Mức độ ảnh hưởng', 'Nguyên nhân xác định', 'Biện pháp khắc phục đã xử lý', 'Người phụ trách', 'Trạng thái'],
      build: (d) => incidentRows(d),
    },
  ],
};
