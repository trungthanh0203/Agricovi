import { addDays, byDate, fv, logDate, logDay, lotText, matchWork, maxPhi, names, qtyText, unique, vnDate } from './helpers';
import type { LogbookData, LogbookSet } from './types';

/**
 * Bộ sổ dưa lưới theo "Sổ nhật ký sản xuất dưa lưới VietGAP" của chủ sản phẩm: gieo trồng · bón phân · phun thuốc (có PHI) · tưới nước · thu hoạch · sự cố.
 * Cột file mẫu có mà app chưa ghi (tỉ lệ nảy mầm, số lần tưới/ngày, nhiệt độ, độ ẩm) để trống, ghi rõ ở chú thích.
 */
const SOW = ['ngâm ủ', 'gieo hạt', 'ra vườn', 'trồng cây con', 'dặm cây', 'treo dây', 'gieo'];

const phiAlert = (d: LogbookData, date: string, phi: number): string => {
  if (phi <= 0) return '';
  const safe = addDays(date, phi);
  const hit = d.harvests.find((h) => !h.voided_at && h.harvested_at.slice(0, 10) >= date && h.harvested_at.slice(0, 10) < safe);
  return hit ? `CẢNH BÁO: thu hoạch ${vnDate(hit.harvested_at)} khi chưa hết cách ly (${vnDate(safe)})` : 'An toàn';
};

export const MELON_BOOKS: LogbookSet = {
  id: 'melon',
  name: 'Sổ nhật ký dưa lưới VietGAP',
  books: [
    {
      id: 'sowing', title: 'Nhật ký gieo trồng', note: 'Tỉ lệ nảy mầm chưa có trong app nên để trống.',
      headers: ['Ngày thực hiện', 'Hạng mục / Công việc', 'Lô hạt / Cây con', 'Số lượng', 'Tỉ lệ nảy mầm (%)', 'Tình trạng sinh trưởng', 'Người thực hiện', 'Ghi chú'],
      build: (d) => d.entries.filter((e) => matchWork(e, SOW)).map((e) => [
        logDate(e), e.wt?.name ?? '', e.uses.map(lotText).filter(Boolean).join('; ') || d.cycle?.seed_lot || '',
        [fv(e.log.data, 'seeds') && `${fv(e.log.data, 'seeds')} hạt`, fv(e.log.data, 'trays') && `${fv(e.log.data, 'trays')} khay`, fv(e.log.data, 'plants') && `${fv(e.log.data, 'plants')} cây`].filter(Boolean).join(', '),
        '', e.log.note ?? '', e.log.author_name ?? '', [fv(e.log.data, 'method'), fv(e.log.data, 'spacing')].filter(Boolean).join('; '),
      ]),
    },
    {
      id: 'fertilizing', title: 'Nhật ký bón phân',
      headers: ['Ngày bón', 'Giai đoạn sinh trưởng', 'Tên phân bón', 'Nhà sản xuất / Nguồn gốc', 'Phương thức bón', 'Khối lượng', 'EC (mS/cm)', 'pH', 'Người thực hiện'],
      build: (d) => d.entries.filter((e) => matchWork(e, ['bón phân'], ['fertilizing'])).map((e) => [
        logDate(e), fv(e.log.data, 'stage'), names(e.uses), unique(e.uses.map((u) => u.material?.manufacturer ?? '')).join('; '),
        fv(e.log.data, 'method'), qtyText(e.uses) || fv(e.log.data, 'dose'), fv(e.log.data, 'ec'), fv(e.log.data, 'ph'), e.log.author_name ?? '',
      ]),
    },
    {
      id: 'spraying', title: 'Nhật ký sử dụng thuốc BVTV và kiểm soát thời gian cách ly (PHI)',
      headers: ['Ngày phun', 'Dịch hại mục tiêu', 'Tên thuốc BVTV', 'Hoạt chất', 'Liều lượng / Nồng độ', 'Diện tích phun (m²)', 'PHI (ngày)', 'Ngày hết cách ly', 'Cảnh báo PHI', 'Người phun'],
      build: (d) => d.entries.filter((e) => matchWork(e, ['phun thuốc'], ['spraying'])).map((e) => {
        const phi = maxPhi(e.uses);
        return [
          logDate(e), fv(e.log.data, 'target'), names(e.uses), unique(e.uses.map((u) => u.material?.active_ingredient ?? '')).join('; '),
          fv(e.log.data, 'dose'), fv(e.log.data, 'sprayed_m2'), phi > 0 ? String(phi) : '', phi > 0 ? vnDate(addDays(logDay(e), phi)) : '',
          phiAlert(d, logDay(e), phi), e.log.author_name ?? '',
        ];
      }),
    },
    {
      id: 'irrigation', title: 'Nhật ký tưới nước', note: 'Số lần tưới mỗi ngày, lượng nước mỗi bầu, nhiệt độ và độ ẩm nhà màng sẽ có khi làm phiếu đo (P3); hiện để trống.',
      headers: ['Ngày tưới', 'Giai đoạn cây', 'Thời gian tưới (phút)', 'Số lần tưới / ngày', 'Lượng nước (lít/bầu/ngày)', 'Nhiệt độ nhà màng (°C)', 'Độ ẩm (%)', 'EC', 'pH', 'Người vận hành'],
      build: (d) => d.entries.filter((e) => matchWork(e, ['tưới'], ['irrigation'])).map((e) => [
        logDate(e), stageName(d, e.log.stage_id), fv(e.log.data, 'duration_min'), '', '', '', '', fv(e.log.data, 'ec'), fv(e.log.data, 'ph'), e.log.author_name ?? '',
      ]),
    },
    {
      id: 'harvest', title: 'Nhật ký thu hoạch và đánh giá chất lượng',
      headers: ['Ngày thu hoạch', 'Mã lô thu hoạch', 'Số lượng (quả)', 'Sản lượng (kg)', 'Trọng lượng TB (kg/quả)', 'Độ ngọt (°Brix)', 'Phân loại', 'Đơn vị thu mua / tiêu thụ'],
      build: (d) => [...d.harvests].filter((h) => !h.voided_at).sort(byDate((h) => h.harvested_at)).map((h) => [
        vnDate(h.harvested_at), h.lot_code ?? '', h.unit_count ? String(h.unit_count) : '', String(h.quantity),
        h.unit_count ? (h.quantity / h.unit_count).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) : '',
        fv(h.extra, 'brix'), h.grade ?? fv(h.extra, 'grade_note'), fv(h.extra, 'buyer'),
      ]),
    },
    {
      id: 'incidents', title: 'Sự cố và khắc phục',
      headers: ['Ngày phát sinh', 'Mô tả sự cố / Bất thường', 'Mức độ ảnh hưởng', 'Nguyên nhân xác định', 'Biện pháp khắc phục đã xử lý', 'Người phụ trách', 'Trạng thái'],
      build: (d) => incidentRows(d),
    },
  ],
};

export function stageName(d: LogbookData, stageId: string | null | undefined): string {
  return d.stages.find((s) => s.id === stageId)?.name ?? '';
}

/** Hàng sổ sự cố: dùng chung cho mọi loại hình */
export function incidentRows(d: LogbookData): string[][] {
  const sev = { low: 'Nhẹ', medium: 'Trung bình', high: 'Nặng' } as const;
  return [...d.incidents].filter((i) => !i.voided_at).sort(byDate((i) => i.incident_date)).map((i) => {
    const acts = d.actions.filter((a) => a.incident_id === i.id);
    return [
      vnDate(i.incident_date), i.description, sev[i.severity] ?? '', i.cause ?? '', acts.map((a) => a.content).join('; ') || i.close_note || '',
      unique(acts.map((a) => a.assignee_name ?? '')).join(', ') || i.author_name || '', i.status === 'closed' ? 'Đã hoàn thành' : 'Đang xử lý',
    ];
  });
}
