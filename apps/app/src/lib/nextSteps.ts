import type { Features, ModelId } from './models';

/**
 * "Việc cần làm tiếp" của một vụ theo mô hình quản lý (phần thuần): vài dòng ngắn dẫn người dùng đi đúng bước kế tiếp,
 * chỉ gợi ý bước thuộc chức năng mà mô hình/quyền của họ có. Tối đa 3 dòng.
 */
export interface NextStepInput {
  /** mô hình đang áp dụng cho vụ (null = chưa chọn) và đã có lựa chọn của vụ/cơ sở hay chưa */
  model: ModelId | null;
  features: Features;
  kind?: 'crop' | 'livestock' | 'aquatic' | 'other';
  status: string;
  expenses: number;
  harvests: number;
  sales: number;
  logs: number;
  plantCount: number | null;
  stagesTotal: number;
  stagesDone: number;
  /** quyền của người xem */
  can: { expense: boolean; harvest: boolean; sales: boolean; summary: boolean; logs: boolean };
}

export interface NextStep { id: string; text: string; go?: { tab: 'production' | 'reports' | 'declare'; section: string } }

export function nextSteps(i: NextStepInput): NextStep[] {
  if (i.status === 'ended' || i.status === 'cancelled') return [];
  const out: NextStep[] = [];
  const animal = i.kind === 'livestock' || i.kind === 'aquatic';
  const allStagesDone = i.stagesTotal > 0 && i.stagesDone >= i.stagesTotal;

  if (i.model === null) out.push({ id: 'model', text: 'Chọn cách quản lý vụ này ở khối "Cách quản lý vụ này" bên dưới để app chỉ hiện các mục bạn cần.' });
  if (animal && i.plantCount === null) out.push({ id: 'count', text: 'Nhập số con nhập chuồng/thả giống (Sửa vụ) để app tính hao hụt, mật độ và FCR.' });
  if (i.can.expense && i.expenses === 0) out.push({ id: 'expense', text: 'Ghi khoản chi đầu tiên của vụ (vật tư, tiền công…).', go: { tab: 'production', section: 'expense' } });
  // gợi ý ghi việc đầu tiên cho các mô hình có người làm; mô hình tự làm trong gia đình thì ghi việc là tùy ý nên không nhắc
  if (i.model !== 'family' && i.features.logs === 'on' && i.can.logs && i.logs === 0 && i.status === 'active') out.push({ id: 'log', text: 'Ghi việc đầu tiên (bấm nút ＋ Ghi việc) để có nhật ký và thời gian cách ly.' });
  if (i.can.harvest && i.harvests === 0 && allStagesDone) out.push({ id: 'harvest', text: 'Các giai đoạn đã xong: ghi thu hoạch.', go: { tab: 'production', section: 'harvest' } });
  if (i.can.sales && i.harvests > 0 && i.sales === 0) out.push({ id: 'sales', text: 'Đã có thu hoạch: ghi doanh thu (bán hàng).', go: { tab: 'reports', section: 'sales' } });
  if (i.can.summary && i.sales > 0 && i.harvests > 0) out.push({ id: 'summary', text: 'Xem Tổng kết vụ, rồi kết thúc vụ khi đã xong.', go: { tab: 'reports', section: 'summary' } });
  if (i.features.logbook === 'on') out.push({ id: 'logbook', text: 'Chuẩn VietGAP: xem "Còn thiếu gì trước khi nộp" ở Sổ nhật ký.', go: { tab: 'reports', section: 'logbook' } });
  return out.slice(0, 3);
}
