/**
 * Mô hình quản lý THEO VỤ (docs/PLAN_MO_HINH_QUAN_LY.md): 4 mô hình + gói Chuẩn VietGAP. Phần thuần (không phụ thuộc giao diện/CSDL).
 * Mô hình chỉ quyết định HIỆN những chức năng nào và gợi ý việc nhập liệu; quyền và dữ liệu vẫn do CSDL ép.
 */
export type ModelId = 'family' | 'monthly' | 'managed' | 'staffed';
/** on = dùng bình thường · optional = có, tùy chọn · off = ẩn */
export type FeatureState = 'on' | 'optional' | 'off';
export type Feature =
  | 'logs' | 'stock' | 'partners' | 'people' | 'payroll' | 'attendance' | 'positions' | 'teams'
  | 'weekly' | 'custom_reports' | 'web' | 'logbook' | 'checklist' | 'licenses' | 'lots';

export interface ModelDef {
  id: ModelId;
  name: string;
  /** Ai dùng (một dòng) */
  who: string;
  /** Bạn sẽ dùng */
  uses: string;
  /** Bạn sẽ không thấy */
  hidden: string;
  features: Record<Feature, FeatureState>;
}

const F = (o: Partial<Record<Feature, FeatureState>>): Record<Feature, FeatureState> => ({
  logs: 'off', stock: 'off', partners: 'off', people: 'off', payroll: 'off', attendance: 'off', positions: 'off', teams: 'off',
  weekly: 'off', custom_reports: 'off', web: 'off', logbook: 'off', checklist: 'off', licenses: 'off', lots: 'off', ...o,
});

export const MODELS: ModelDef[] = [
  {
    id: 'family', name: 'Tự làm trong gia đình', who: 'Chủ và 1–3 người nhà, không cần chấm công',
    uses: 'Ghi chi phí (kể cả tiền công), thu hoạch, doanh thu, xem tổng kết vụ',
    hidden: 'ghi việc (có thể bật nhẹ), chấm công, kho, nhân sự, bảng lương',
    features: F({ logs: 'optional' }),
  },
  {
    id: 'monthly', name: 'Chủ và người làm công tháng', who: 'Thuê 1–2 người lương tháng, chỉ chủ đăng nhập',
    uses: 'Như trên, thêm hồ sơ người làm, lương tháng, ghi việc, kho vật tư (tùy chọn), bán qua website',
    hidden: 'chấm công vào/ra ca, tổ, chức vụ',
    features: F({ logs: 'on', stock: 'optional', partners: 'optional', people: 'on', payroll: 'on', web: 'on' }),
  },
  {
    id: 'managed', name: 'Có người quản lý điều hành', who: 'Một quản lý có tài khoản, nhập hộ mọi dữ liệu',
    uses: 'Như trên, thêm kho, chấm công hộ người làm, báo cáo tuần, chức vụ',
    hidden: 'vào/ra ca của từng người, tổ nhiều cấp',
    features: F({ logs: 'on', stock: 'on', partners: 'on', people: 'on', payroll: 'on', attendance: 'on', positions: 'on', weekly: 'on', web: 'on' }),
  },
  {
    id: 'staffed', name: 'Có nhiều nhân viên, mỗi người một tài khoản', who: 'Cơ sở lớn, nhân viên tự vào ca và ra ca',
    uses: 'Đầy đủ: nhân sự, phòng/tổ, chức vụ và quyền, chấm công GPS, bảng lương, báo cáo theo nhu cầu',
    hidden: 'không ẩn mục nào',
    features: F({ logs: 'on', stock: 'on', partners: 'on', people: 'on', payroll: 'on', attendance: 'on', positions: 'on', teams: 'on', weekly: 'on', custom_reports: 'on', web: 'on' }),
  },
];

/** Gói thêm Chuẩn VietGAP: luôn bật ghi việc, sổ nhật ký, bảng kiểm, giấy phép, lô và hạn vật tư */
export const VIETGAP_PACK: Partial<Record<Feature, FeatureState>> = { logs: 'on', logbook: 'on', checklist: 'on', licenses: 'on', lots: 'on' };

export const MODEL_IDS = MODELS.map((m) => m.id);
export const isModelId = (v: unknown): v is ModelId => typeof v === 'string' && (MODEL_IDS as string[]).includes(v);
export const modelDef = (id: ModelId): ModelDef => MODELS.find((m) => m.id === id)!;

/** Cơ sở và vụ chưa chọn mô hình: giữ cách hiển thị cũ (chế độ đơn giản = Tự làm trong gia đình, đầy đủ = nhiều nhân viên) */
export function effectiveModel(cycleModel: unknown, orgModel: unknown, orgSimple: boolean): ModelId {
  if (isModelId(cycleModel)) return cycleModel;
  if (isModelId(orgModel)) return orgModel;
  return orgSimple ? 'family' : 'staffed';
}

/** Bật/tắt từng chức năng của một vụ theo mô hình và gói VietGAP (vietgap null = theo cơ sở: truyền giá trị đã quyết định) */
export function featuresOf(model: ModelId, vietgap: boolean): Record<Feature, FeatureState> {
  const base = { ...modelDef(model).features };
  if (vietgap) for (const [k, v] of Object.entries(VIETGAP_PACK)) base[k as Feature] = v;
  return base;
}

const RANK: Record<FeatureState, number> = { off: 0, optional: 1, on: 2 };

/** Gộp nhiều vụ: chức năng được bật nếu BẤT KỲ vụ nào cần (lấy mức cao nhất) */
export function mergeFeatures(list: Record<Feature, FeatureState>[]): Record<Feature, FeatureState> {
  const out = F({});
  for (const f of list) for (const k of Object.keys(out) as Feature[]) if (RANK[f[k]] > RANK[out[k]]) out[k] = f[k];
  return out;
}

export const featureShown = (s: FeatureState) => s !== 'off';

/** Mục menu → chức năng cần có (null = luôn hiện). Dùng ở giai đoạn D để lọc menu theo hợp các vụ đang chạy */
export const SECTION_FEATURE: Record<string, Feature | null> = {
  // Khai báo
  areas: null, crops: null, templates: null, materials: 'stock', places: 'stock', worktypes: 'logs', partners: 'partners', customers: 'partners',
  positions: 'positions', teams: 'teams', members: 'people', coop: null, licenses: 'licenses',
  // Sản xuất
  cycles: null, harvest: null, expense: null, logs: 'logs', stock: 'stock', attendance: 'attendance',
  // Báo cáo
  weekly: 'weekly', custom: 'custom_reports', payables: null, sales: null, paybook: 'payroll', summary: null,
  logbook: 'logbook', checklist: 'checklist', website: 'web', commerce: 'web',
};

/** Gợi ý mô hình theo tình hình hiện có của cơ sở (số người có tài khoản, có quản lý hay không, có người làm không tài khoản) */
export function suggestModel(s: { accounts: number; hasManager: boolean; offlineWorkers: number }): ModelId {
  if (s.accounts >= 4) return 'staffed';
  if (s.hasManager) return 'managed';
  if (s.offlineWorkers > 0 || s.accounts > 0) return 'monthly';
  return 'family';
}
