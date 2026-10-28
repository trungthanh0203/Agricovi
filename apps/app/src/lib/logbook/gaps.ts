import { addDays, matchWork, maxPhi, vnDate } from './helpers';
import type { LogbookData } from './types';

/**
 * "Còn thiếu gì trước khi nộp" (P5 gọn): các thiếu sót hồ sơ mà người đánh giá hay hỏi. Phần thuần, chỉ đọc dữ liệu đã ghi.
 * warn = nên bổ sung trước khi nộp; info = nhắc thêm.
 */
export interface Gap { level: 'warn' | 'info'; text: string }

const SPRAY = (e: Parameters<typeof matchWork>[0]) => matchWork(e, ['phun thuốc'], ['spraying']);
const VET = (e: Parameters<typeof matchWork>[0]) => matchWork(e, ['vaccine', 'điều trị', 'tẩy giun']);

export function auditGaps(d: LogbookData, today: string): Gap[] {
  const gaps: Gap[] = [];
  const warn = (text: string) => gaps.push({ level: 'warn', text });
  const info = (text: string) => gaps.push({ level: 'info', text });
  const c = d.cycle;

  if (c) {
    if (!c.code) warn('Vụ chưa có mã vụ / mã lô (Sửa vụ → Thông tin quản lý).');
    if (!c.supervisor_name) warn('Vụ chưa ghi cán bộ kỹ thuật / thú y phụ trách.');
    if (d.productKind === 'livestock') { if (!c.plant_count) warn(`Vụ chưa ghi số ${d.unit} ban đầu.`); }
    else {
      if (!c.variety_name) warn('Vụ chưa ghi giống.');
      if (!c.planted_area_m2) warn('Vụ chưa ghi diện tích trồng.');
      if (!c.seed_lot && !d.entries.some((e) => e.uses.some((u) => u.material?.material_group === 'seed' && u.lotNo))) info('Chưa có số lô giống (ghi ở Sửa vụ hoặc nhập kho giống kèm số lô).');
    }
  }

  const risky = d.entries.filter((e) => SPRAY(e) || VET(e));
  if (d.usesAvailable) {
    const noUse = risky.filter((e) => e.uses.length === 0);
    if (noUse.length > 0) warn(`${noUse.length} lần phun thuốc / dùng thuốc thú y chưa ghi tên thuốc ở ô "Vật tư đã dùng".`);
    const mats = new Map<string, NonNullable<(typeof risky)[number]['uses'][number]['material']>>();
    for (const e of risky) for (const u of e.uses) if (u.material) mats.set(u.material.id, u.material);
    const noIng = [...mats.values()].filter((m) => !m.active_ingredient).map((m) => m.name);
    if (noIng.length > 0) warn(`Thuốc chưa ghi hoạt chất: ${noIng.join(', ')}.`);
    const noPhi = [...mats.values()].filter((m) => m.withdrawal_days == null).map((m) => m.name);
    if (noPhi.length > 0) warn(`Thuốc chưa ghi thời gian cách ly / ngưng thuốc: ${noPhi.join(', ')}.`);
    const noReg = [...mats.values()].filter((m) => !m.registration_no).map((m) => m.name);
    if (noReg.length > 0) info(`Thuốc chưa ghi số đăng ký lưu hành: ${noReg.join(', ')}.`);
  } else if (risky.length > 0) info('Bạn không có quyền xem giao dịch kho nên chưa kiểm được tên thuốc, hoạt chất đã dùng.');

  // thu hoạch / xuất trong thời gian cách ly mà chưa có lý do
  for (const h of d.harvests.filter((x) => !x.voided_at)) {
    const day = h.harvested_at.slice(0, 10);
    const hit = risky.find((e) => { const phi = maxPhi(e.uses); const used = e.log.performed_at.slice(0, 10); return phi > 0 && day >= used && day < addDays(used, phi); });
    if (hit) warn(`Thu hoạch / xuất ngày ${vnDate(day)} khi còn trong thời gian cách ly của lần dùng thuốc ngày ${vnDate(hit.log.performed_at)}.`);
  }

  const hv = d.harvests.filter((h) => !h.voided_at);
  if (d.productKind !== 'livestock') {
    const noBrix = hv.filter((h) => !h.extra || h.extra.brix === undefined || h.extra.brix === '');
    if (noBrix.length > 0) warn(`${noBrix.length} phiếu thu hoạch chưa ghi độ ngọt Brix.`);
  }
  const noCount = hv.filter((h) => !h.unit_count);
  if (noCount.length > 0) info(`${noCount.length} phiếu thu hoạch / xuất chưa ghi số ${d.unit === 'cây' ? 'quả' : d.unit}.`);

  const openInc = d.incidents.filter((i) => !i.voided_at && i.status === 'open');
  if (openInc.length > 0) warn(`${openInc.length} sự cố đang mở, chưa xử lý xong.`);
  if (openInc.some((i) => i.kind === 'broken_needle')) warn('Còn sự cố kim tiêm gãy chưa xử lý.');
  const late = d.actions.filter((a) => !a.done && a.due_date && a.due_date < today && d.incidents.some((i) => i.id === a.incident_id && !i.voided_at && i.status === 'open'));
  if (late.length > 0) warn(`${late.length} việc khắc phục sự cố đã quá hạn.`);

  const lateMs = d.milestones.filter((m) => !m.done_at && c && ((m.anchor === 'end' ? c.expected_end_date : c.start_date) ?? '9999') !== '9999'
    && addDays((m.anchor === 'end' ? c.expected_end_date : c.start_date) as string, m.anchor === 'end' ? -m.offset_days : m.offset_days) < today);
  if (lateMs.length > 0) warn(`${lateMs.length} mốc an toàn (ngưng phân, vaccine…) đã quá hạn mà chưa đánh dấu đã làm.`);

  const yearAgo = addDays(today, -365);
  if (!d.audits.some((a) => a.status === 'final' && !a.voided_at && a.audit_date >= yearAgo)) info('Chưa có lần tự đánh giá bảng kiểm nào được chốt trong 12 tháng qua (Báo cáo → Bảng kiểm).');

  return gaps;
}
