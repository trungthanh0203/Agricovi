import { byDate, fv, logDate, lotText, matchWork, names, qtyText, unique, vnDate } from './helpers';
import { incidentRows } from './melon';
import type { LogbookData, LogbookSet } from './types';

/**
 * Bộ sổ heo thịt theo 4 sổ của file "Bảng kiểm và sổ nhật ký nuôi heo VietGAP" (biểu mẫu 2.1–2.14, 3.16–3.26) + sổ sự cố.
 * Phần nái (phối, đẻ) không có trong app (hộ nuôi thịt) nên không in. Cột chưa có dữ liệu để trống.
 */
const COUNT_LABEL: Record<string, string> = { in: 'Nhập thêm', dead: 'Chết', culled: 'Loại thải', out: 'Xuất / chuyển đi' };
const FEED = ['cho ăn', 'phối trộn', 'nước uống'];
const VET = ['vaccine', 'điều trị', 'tẩy giun', 'thú y'];
const HYGIENE = ['sát trùng', 'hố sát trùng', 'chất thải', 'biogas', 'côn trùng', 'chuột', 'vệ sinh'];

const pen = (d: LogbookData) => d.areaName + (d.cycle?.code ? ` / ${d.cycle.code}` : '');

export const PIG_BOOKS: LogbookSet = {
  id: 'pig',
  name: 'Sổ nhật ký heo thịt VietGAP',
  books: [
    {
      id: 'herd', title: 'Nhật ký quản lý đàn và con giống (2.1–2.11)',
      headers: ['Ngày thực hiện', 'Mã chuồng / ô', 'Thẻ tai / Mã lô', 'Loại lợn', 'Số lượng (con)', 'Khối lượng TB (kg)', 'Hoạt động / Biến động', 'Tình trạng sức khỏe', 'Người thực hiện', 'Ghi chú'],
      build: (d) => {
        const rows: { date: string; r: string[] }[] = [];
        for (const c of d.countEvents.filter((x) => !x.voided_at)) {
          rows.push({ date: c.event_date, r: [vnDate(c.event_date), pen(d), d.cycle?.code ?? '', d.productName, String(c.quantity), '', COUNT_LABEL[c.kind] ?? c.kind, '', c.author_name ?? '', c.note ?? ''] });
        }
        for (const h of d.harvests.filter((x) => !x.voided_at)) {
          rows.push({ date: h.harvested_at.slice(0, 10), r: [vnDate(h.harvested_at), pen(d), fv(h.extra, 'ear_tags') || h.lot_code || '', d.productName, h.unit_count ? String(h.unit_count) : '', h.unit_count ? (h.quantity / h.unit_count).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) : fv(h.extra, 'avg_kg'), 'Xuất bán', '', '', [fv(h.extra, 'quarantine_no') && `Kiểm dịch ${fv(h.extra, 'quarantine_no')}`, fv(h.extra, 'buyer')].filter(Boolean).join('; ')] });
        }
        for (const e of d.entries.filter((x) => matchWork(x, ['cân heo']))) {
          rows.push({ date: e.log.performed_at.slice(0, 10), r: [logDate(e), pen(d), d.cycle?.code ?? '', d.productName, fv(e.log.data, 'pigs'), fv(e.log.data, 'avg_kg'), 'Cân heo', e.log.note ?? '', e.log.author_name ?? '', ''] });
        }
        return rows.sort(byDate((x) => x.date)).map((x) => x.r);
      },
    },
    {
      id: 'feed', title: 'Nhật ký thức ăn chăn nuôi và nước uống (2.12–2.14)',
      headers: ['Ngày thực hiện', 'Loại hoạt động', 'Tên thức ăn / Nguyên liệu', 'Mã lô / Hạn sử dụng', 'Nhà cung cấp / Nguồn gốc', 'Số lượng', 'Chuồng / Lứa sử dụng', 'Tình trạng cảm quan', 'Người ghi chép', 'Ghi chú'],
      build: (d) => {
        const rows: { date: string; r: string[] }[] = [];
        for (const x of d.receipts.filter((r) => r.material?.material_group === 'feed')) {
          rows.push({ date: x.date, r: [vnDate(x.date), 'Nhập kho cám', x.material?.name ?? '', [x.lotNo, x.expiry ? `HSD ${vnDate(x.expiry)}` : ''].filter(Boolean).join(' / '), x.material?.manufacturer ?? '', `${x.quantity.toLocaleString('vi-VN')} ${x.unit}`.trim(), '', '', '', x.note ?? ''] });
        }
        for (const e of d.entries.filter((x) => matchWork(x, FEED))) {
          const kind = matchWork(e, ['nước uống']) ? 'Kiểm tra nước' : matchWork(e, ['phối trộn']) ? 'Tự phối trộn' : 'Xuất cám cho ăn';
          const extra = kind === 'Kiểm tra nước' ? [fv(e.log.data, 'ph') && `pH ${fv(e.log.data, 'ph')}`, fv(e.log.data, 'ecoli') && `E.coli: ${fv(e.log.data, 'ecoli')}`, fv(e.log.data, 'result')].filter(Boolean).join('; ') : '';
          rows.push({ date: e.log.performed_at.slice(0, 10), r: [logDate(e), kind, names(e.uses) || fv(e.log.data, 'feed_kind') || fv(e.log.data, 'formula'), e.uses.map(lotText).filter(Boolean).join('; '), unique(e.uses.map((u) => u.material?.manufacturer ?? '')).join('; '), qtyText(e.uses) || (fv(e.log.data, 'feed_kg') || fv(e.log.data, 'batch_kg') ? `${fv(e.log.data, 'feed_kg') || fv(e.log.data, 'batch_kg')} kg` : ''), pen(d), '', e.log.author_name ?? '', [extra, e.log.note].filter(Boolean).join('; ')] });
        }
        return rows.sort(byDate((x) => x.date)).map((x) => x.r);
      },
    },
    {
      id: 'vet', title: 'Nhật ký thú y, vắc xin và điều trị bệnh (3.22–3.26)',
      headers: ['Ngày thực hiện', 'Mã lợn / Ô chuồng', 'Loại vắc xin / Thuốc thú y', 'Nhà sản xuất / Số lô', 'Liều lượng và cách dùng', 'Mục đích / Triệu chứng', 'TG ngừng thuốc (ngày)', 'Sự cố kim gãy', 'Người thực hiện', 'Ghi chú / Kết quả'],
      build: (d) => d.entries.filter((e) => matchWork(e, VET)).map((e) => [
        logDate(e), pen(d), names(e.uses), e.uses.map((u) => [u.material?.manufacturer, u.lotNo && `Lô ${u.lotNo}`].filter(Boolean).join(' / ')).filter(Boolean).join('; '),
        [fv(e.log.data, 'dose'), fv(e.log.data, 'route')].filter(Boolean).join(', '), fv(e.log.data, 'symptom') || fv(e.log.data, 'disease') || e.wt?.name || '',
        String(e.uses.reduce((m, u) => Math.max(m, u.material?.withdrawal_days ?? 0), 0) || 0), fv(e.log.data, 'needle_broken') || 'Không', e.log.author_name ?? '',
        [fv(e.log.data, 'result'), e.log.note].filter(Boolean).join('; '),
      ]),
    },
    {
      id: 'hygiene', scope: 'org', title: 'Nhật ký vệ sinh, sát trùng và quản lý môi trường (3.16–3.21)', note: 'Sổ này lấy cả việc ghi cho khu vực không gắn vụ (cổng, hố sát trùng, biogas…).',
      headers: ['Ngày thực hiện', 'Khu vực / Dãy chuồng', 'Hạng mục công việc', 'Tên hóa chất / Chế phẩm', 'Nồng độ / Liều lượng', 'Số lượng chất thải xử lý', 'Kết quả kiểm tra', 'Người thực hiện', 'Người kiểm tra', 'Ghi chú'],
      build: (d) => d.entries.filter((e) => matchWork(e, HYGIENE)).map((e) => {
        const area = d.areas.find((a) => a.id === e.log.area_id);
        return [
          logDate(e), area ? area.name + (area.code ? ` (${area.code})` : '') : d.areaName, e.wt?.name ?? '', names(e.uses), fv(e.log.data, 'concentration'),
          fv(e.log.data, 'amount') ? `${fv(e.log.data, 'amount')} ${fv(e.log.data, 'unit')}`.trim() : '', fv(e.log.data, 'result'), e.log.author_name ?? '', fv(e.log.data, 'checker'), e.log.note ?? '',
        ];
      }),
    },
    {
      id: 'incidents', title: 'Sự cố và khắc phục',
      headers: ['Ngày phát sinh', 'Mô tả sự cố / Bất thường', 'Mức độ ảnh hưởng', 'Nguyên nhân xác định', 'Biện pháp khắc phục đã xử lý', 'Người phụ trách', 'Trạng thái'],
      build: (d) => incidentRows(d),
    },
  ],
};
