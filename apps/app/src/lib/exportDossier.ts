import { toCsv } from './logbook/csv';
import { auditGaps, type Gap } from './logbook/gaps';
import { GENERAL_BOOKS } from './logbook/general';
import { byDate, logDate, logDay, lotText, vnDate } from './logbook/helpers';
import type { LogbookData } from './logbook/types';
import { polygonAreaM2, toGeoJson, type LatLng } from './geo';

/**
 * Gói hồ sơ xuất khẩu của một vụ/lô (mục 10 báo cáo đối thủ). CHỈ ĐỌC dữ liệu đã ghi (nhật ký, kho, thu hoạch, giấy phép, ranh thửa), không bắt nhập lại.
 * Là bộ dữ liệu theo MẪU CHUNG để gửi bên mua / doanh nghiệp xuất khẩu; KHÔNG phải tờ khai chính thức (EUDR hay nước nhập khẩu): mẫu riêng của bên mua luôn được ưu tiên.
 * Phần thuần (không gọi mạng) để kiểm thử.
 */
export interface DossierLicense { name: string; issuer: string | null; number: string | null; issued_date: string | null; expires_date: string | null }
export interface DossierGeo { ring: LatLng[]; area_m2: number; center_lat: number; center_lng: number; source: string; areaName: string }

export interface DossierInput { data: LogbookData; licenses: DossierLicense[]; geo: DossierGeo | null; today: string }
export interface DossierTable { id: string; title: string; headers: string[]; rows: string[][] }
export interface Dossier {
  title: string;
  /** Các cặp nhãn - giá trị: cơ sở, sản phẩm, thửa */
  facts: { title: string; items: [string, string][] }[];
  tables: DossierTable[];
  gaps: Gap[];
  geoJson: ReturnType<typeof toGeoJson> | null;
}

/** EUDR: thửa trên 4 ha cần ranh đa giác; thửa nhỏ hơn có thể dùng một điểm tọa độ (khai ở bước nộp, ngoài app) */
export const POLYGON_REQUIRED_HA = 4;

const num = (n: number, d = 1) => n.toLocaleString('vi-VN', { maximumFractionDigits: d });
const fmtArea = (m2: number) => (m2 >= 10000 ? `${num(m2 / 10000, 2)} ha` : `${num(m2, 0)} m²`);

export function dossierGaps(i: DossierInput): Gap[] {
  const { data: d, geo } = i;
  const gaps: Gap[] = [];
  const warn = (text: string) => gaps.push({ level: 'warn', text });
  const info = (text: string) => gaps.push({ level: 'info', text });
  const c = d.cycle;

  if (!geo) warn('Chưa có tọa độ thửa. Bên mua và EUDR cần vị trí thửa: bật "Bản đồ thửa" (Cấu hình → Tính năng nâng cao) rồi vẽ ranh khu ở Khai báo → Phân khu.');
  else {
    if (geo.ring.length < 3) warn('Ranh thửa chưa đủ 3 góc.');
    const declared = c?.planted_area_m2 ?? null;
    if (declared && geo.area_m2 > 0 && Math.abs(declared - geo.area_m2) / geo.area_m2 > 0.2) {
      info(`Diện tích trồng đã khai (${fmtArea(declared)}) lệch hơn 20% so với diện tích theo ranh (${fmtArea(geo.area_m2)}): hãy kiểm tra lại cho khớp.`);
    }
    if (geo.area_m2 > POLYGON_REQUIRED_HA * 10000 && geo.ring.length < 3) warn(`Thửa lớn hơn ${POLYGON_REQUIRED_HA} ha cần ranh đa giác đầy đủ.`);
  }
  if (i.licenses.length === 0) info('Chưa khai giấy phép, chứng chỉ (Khai báo → Giấy phép). Bên mua thường hỏi VietGAP/GlobalGAP, mã số vùng trồng, mã cơ sở đóng gói.');
  const live = d.harvests.filter((h) => !h.voided_at);
  if (live.length === 0) warn('Chưa có phiếu thu hoạch nào trong khoảng ngày đã chọn nên chưa có sản lượng và mã lô.');
  else if (live.some((h) => !h.lot_code)) info('Có phiếu thu hoạch chưa có mã lô.');
  if (d.usesAvailable) {
    const mats = new Map<string, { name: string; ai: boolean; reg: boolean }>();
    for (const e of d.entries) for (const u of e.uses) {
      if (!u.material) continue;
      if (!['pesticide', 'fertilizer', 'vet_drug', 'vaccine', 'disinfectant'].includes(u.material.material_group ?? '')) continue; // chỉ nhóm cần hoạt chất
      mats.set(u.material.id, { name: u.material.name, ai: Boolean(u.material.active_ingredient), reg: Boolean(u.material.registration_no) });
    }
    const missing = [...mats.values()].filter((m) => !m.ai && !m.reg).map((m) => m.name);
    if (missing.length > 0) info(`Vật tư chưa ghi hoạt chất / số đăng ký (bên mua có thể kiểm tra dư lượng): ${missing.join(', ')}.`);
  } else info('Bạn không có quyền xem kho nên bảng vật tư, thuốc đã dùng để trống.');
  // các kiểm tra của Sổ nhật ký (thiếu ghi thuốc, vi phạm cách ly...): chỉ lấy mức "nên bổ sung"
  for (const g of auditGaps(d, i.today)) if (g.level === 'warn') gaps.push(g);
  return gaps;
}

export function buildDossier(i: DossierInput): Dossier {
  const { data: d, geo } = i;
  const c = d.cycle;
  const live = d.harvests.filter((h) => !h.voided_at);
  const net = live.reduce((s, h) => s + h.quantity - (h.loss_quantity ?? 0), 0);
  const unitOf = live[0]?.unit ?? 'kg';

  const facts: Dossier['facts'] = [
    { title: '1. Cơ sở sản xuất', items: [['Tên cơ sở', d.orgName]] },
    {
      title: '2. Sản phẩm và vụ',
      items: [
        ['Sản phẩm', d.productName || '—'],
        ['Mã vụ / lô', c?.code ?? c?.name ?? '—'],
        ...(c?.variety_name ? [['Giống', c.variety_name] as [string, string]] : []),
        ['Thời gian sản xuất', `${vnDate(d.from)} – ${vnDate(d.to)}`],
        ['Sản lượng thu hoạch (sau hao hụt)', live.length > 0 ? `${num(net)} ${unitOf}` : 'chưa ghi'],
        ...(c?.supervisor_name ? [['Cán bộ kỹ thuật phụ trách', c.supervisor_name] as [string, string]] : []),
      ],
    },
    {
      title: '3. Thửa đất',
      items: [
        ['Khu / thửa', d.areaName || '—'],
        ...(d.areaLocation ? [['Địa chỉ', d.areaLocation] as [string, string]] : []),
        ...(c?.planted_area_m2 ? [['Diện tích trồng đã khai', fmtArea(c.planted_area_m2)] as [string, string]] : []),
        ...(geo
          ? [
            ['Diện tích theo ranh trên bản đồ', fmtArea(geo.area_m2)] as [string, string],
            ['Tọa độ tâm thửa (vĩ độ, kinh độ)', `${geo.center_lat.toFixed(6)}, ${geo.center_lng.toFixed(6)}`] as [string, string],
            ['Số góc của ranh', String(geo.ring.length)] as [string, string],
            ['Nguồn tọa độ', geo.source === 'gps' ? 'GPS tại góc ruộng' : geo.source === 'mixed' ? 'GPS và chấm trên ảnh vệ tinh' : 'Chấm trên ảnh vệ tinh'] as [string, string],
          ]
          : [['Tọa độ thửa', 'chưa có'] as [string, string]]),
      ],
    },
  ];

  const tables: DossierTable[] = [];
  tables.push({
    id: 'licenses', title: '4. Giấy phép, chứng chỉ',
    headers: ['Tên', 'Nơi cấp', 'Số', 'Ngày cấp', 'Hết hạn'],
    rows: i.licenses.map((l) => [l.name, l.issuer ?? '', l.number ?? '', vnDate(l.issued_date), vnDate(l.expires_date)]),
  });
  if (geo) {
    tables.push({
      id: 'coords', title: '5. Tọa độ các góc của ranh thửa',
      headers: ['Góc', 'Vĩ độ', 'Kinh độ'],
      rows: geo.ring.map((p, k) => [String(k + 1), p[0].toFixed(6), p[1].toFixed(6)]),
    });
  }
  tables.push({
    id: 'harvest', title: '6. Thu hoạch và mã lô',
    headers: ['Ngày thu hoạch', 'Mã lô', 'Khối lượng', 'Hao hụt', 'Loại cỡ', 'Ghi chú'],
    rows: [...live].sort(byDate((h) => h.harvested_at)).map((h) => [vnDate(h.harvested_at), h.lot_code ?? '', `${num(h.quantity)} ${h.unit}`, h.loss_quantity ? `${num(h.loss_quantity)} ${h.unit}` : '', h.grade ?? '', h.note ?? '']),
  });
  if (d.usesAvailable) {
    const rows: string[][] = [];
    for (const e of [...d.entries].sort(byDate(logDay))) {
      for (const u of e.uses) {
        rows.push([
          logDate(e), e.wt?.name ?? '', u.material?.name ?? 'Vật tư', u.material?.active_ingredient ?? '', u.material?.registration_no ?? '', u.material?.manufacturer ?? '',
          `${num(u.quantity, 2)} ${u.unit}`.trim(), lotText(u), u.material?.withdrawal_days != null ? String(u.material.withdrawal_days) : '',
        ]);
      }
    }
    tables.push({
      id: 'inputs', title: '7. Phân bón, thuốc, vật tư đã sử dụng',
      headers: ['Ngày', 'Công việc', 'Tên vật tư', 'Hoạt chất', 'Số đăng ký', 'Nhà sản xuất', 'Số lượng', 'Lô / hạn dùng', 'Cách ly (ngày)'],
      rows,
    });
  }
  const activity = GENERAL_BOOKS.books.find((b) => b.id === 'activity')!;
  tables.push({ id: 'activity', title: '8. Nhật ký công việc', headers: activity.headers, rows: activity.build(d) });

  return { title: 'HỒ SƠ NGUỒN GỐC SẢN XUẤT', facts, tables, gaps: dossierGaps(i), geoJson: geo ? toGeoJson(geo.ring, { co_so: d.orgName, san_pham: d.productName, ma_vu: c?.code ?? c?.name ?? '', khu: geo.areaName, dien_tich_m2: geo.area_m2 }) : null };
}

/** Một tệp CSV gồm nhiều khối (mỗi khối: dòng tên mục, dòng tiêu đề cột, các dòng, một dòng trống) để mở bằng Excel */
export function dossierCsv(dos: Dossier): string {
  const blocks: { title: string; headers: string[]; rows: string[][] }[] = [
    { title: dos.title, headers: ['Mục', 'Thông tin', 'Giá trị'], rows: dos.facts.flatMap((f) => f.items.map(([k, v]) => [f.title, k, v])) },
    ...dos.tables,
  ];
  const parts = blocks.map((b) => `${b.title}\r\n${toCsv(b.headers, b.rows).replace(/^﻿/, '')}`);
  return '﻿' + parts.join('\r\n\r\n');
}

/** Số ha theo ranh, dùng để hiển thị mức yêu cầu của EUDR */
export const polygonHa = (ring: LatLng[]) => polygonAreaM2(ring) / 10000;
