/**
 * Mô hình quản lý THEO VỤ (docs/PLAN_MO_HINH_QUAN_LY.md): 5 mô hình (4 theo quy mô nhân sự + Chuẩn VietGAP). Phần thuần (không phụ thuộc giao diện/CSDL).
 * Mô hình chỉ quyết định HIỆN những chức năng nào và gợi ý việc nhập liệu; quyền và dữ liệu vẫn do CSDL ép.
 */
export type ModelId = 'family' | 'monthly' | 'managed' | 'staffed' | 'vietgap';
/** on = dùng bình thường · optional = có, tùy chọn · off = ẩn */
export type FeatureState = 'on' | 'optional' | 'off';
export type Feature =
  | 'logs' | 'stock' | 'partners' | 'people' | 'payroll' | 'attendance' | 'positions' | 'teams'
  | 'weekly' | 'custom_reports' | 'web' | 'logbook' | 'checklist' | 'licenses' | 'lots';
export type Features = Record<Feature, FeatureState>;

export interface ModelDef {
  id: ModelId;
  name: string;
  /** Ai dùng (một dòng) */
  who: string;
  /** Bạn sẽ dùng */
  uses: string;
  /** Bạn sẽ không thấy */
  hidden: string;
  features: Features;
}

const ALL_FEATURES: Feature[] = [
  'logs', 'stock', 'partners', 'people', 'payroll', 'attendance', 'positions', 'teams', 'weekly', 'custom_reports', 'web', 'logbook', 'checklist', 'licenses', 'lots',
];
const F = (o: Partial<Features>): Features => ({ ...(Object.fromEntries(ALL_FEATURES.map((k) => [k, 'off'])) as Features), ...o });

const STAFFED = F({ logs: 'on', stock: 'on', partners: 'on', people: 'on', payroll: 'on', attendance: 'on', positions: 'on', teams: 'on', weekly: 'on', custom_reports: 'on', web: 'on', licenses: 'optional' });

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
    features: F({ logs: 'on', stock: 'optional', partners: 'optional', people: 'on', payroll: 'on', web: 'on', licenses: 'optional' }),
  },
  {
    id: 'managed', name: 'Có người quản lý điều hành', who: 'Một quản lý có tài khoản, nhập hộ mọi dữ liệu',
    uses: 'Như trên, thêm kho, chấm công hộ người làm, báo cáo tuần, chức vụ',
    hidden: 'vào/ra ca của từng người, tổ nhiều cấp',
    features: F({ logs: 'on', stock: 'on', partners: 'on', people: 'on', payroll: 'on', attendance: 'on', positions: 'on', weekly: 'on', web: 'on', licenses: 'optional' }),
  },
  {
    id: 'staffed', name: 'Có nhiều nhân viên, mỗi người một tài khoản', who: 'Cơ sở lớn, nhân viên tự vào ca và ra ca',
    uses: 'Nhân sự, phòng/tổ, chức vụ và quyền, chấm công GPS, bảng lương, báo cáo theo nhu cầu',
    hidden: 'sổ nhật ký và bảng kiểm (thuộc Chuẩn VietGAP)',
    features: STAFFED,
  },
  {
    id: 'vietgap', name: 'Chuẩn VietGAP', who: 'Cần sổ nhật ký, bảng kiểm và truy xuất đúng chuẩn',
    uses: 'Đầy đủ như mô hình nhiều nhân viên, thêm sổ nhật ký, bảng kiểm, giấy phép, số lô và hạn vật tư; ghi việc luôn bật',
    hidden: 'không ẩn mục nào',
    features: { ...STAFFED, logbook: 'on', checklist: 'on', licenses: 'on', lots: 'on' },
  },
];

export const MODEL_IDS = MODELS.map((m) => m.id);
export const isModelId = (v: unknown): v is ModelId => typeof v === 'string' && (MODEL_IDS as string[]).includes(v);
export const modelDef = (id: ModelId): ModelDef => MODELS.find((m) => m.id === id)!;

/** Mọi chức năng bật: dùng khi chưa chọn mô hình nào (mặc định luôn là đầy đủ) */
export const allFeaturesOn = (): Features => F(Object.fromEntries(ALL_FEATURES.map((k) => [k, 'on'])) as Partial<Features>);

/** Mô hình của một vụ: của vụ, nếu chưa có thì mặc định của cơ sở, nếu chưa có thì null (= hiện đầy đủ) */
export function effectiveModel(cycleModel: unknown, orgModel: unknown): ModelId | null {
  if (isModelId(cycleModel)) return cycleModel;
  if (isModelId(orgModel)) return orgModel;
  return null;
}

/** Chức năng của một mô hình; null (chưa chọn) = đầy đủ */
export const featuresOf = (model: ModelId | null): Features => (model ? { ...modelDef(model).features } : allFeaturesOn());

const RANK: Record<FeatureState, number> = { off: 0, optional: 1, on: 2 };

/** Gộp nhiều vụ: chức năng được bật nếu BẤT KỲ vụ nào cần (lấy mức cao nhất) */
export function mergeFeatures(list: Features[]): Features {
  const out = F({});
  for (const f of list) for (const k of ALL_FEATURES) if (RANK[f[k]] > RANK[out[k]]) out[k] = f[k];
  return out;
}

export const featureShown = (s: FeatureState | undefined) => s !== 'off';

/**
 * Chức năng của CƠ SỞ = hợp các mô hình của các vụ còn chạy (chưa kết thúc/hủy). Vụ chưa chọn mô hình tính là đầy đủ.
 * Cơ sở chưa có vụ nào: theo mô hình mặc định của cơ sở (chưa chọn thì đầy đủ).
 */
export function orgFeatures(cycles: { owner_org_id: string; status: string; mgmt_model?: string | null }[], orgId: string, orgModel: string | null | undefined): Features {
  const live = cycles.filter((c) => c.owner_org_id === orgId && c.status !== 'ended' && c.status !== 'cancelled');
  if (live.length === 0) return featuresOf(effectiveModel(null, orgModel));
  return mergeFeatures(live.map((c) => featuresOf(effectiveModel(c.mgmt_model, orgModel))));
}

/** Mục menu → chức năng cần có (null = luôn hiện) */
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

/** Tên mô hình đang áp dụng cho một vụ, dùng làm dòng tóm tắt */
export function modelName(cycleModel: unknown, orgModel: unknown): string {
  if (isModelId(cycleModel)) return modelDef(cycleModel).name;
  if (isModelId(orgModel)) return `${modelDef(orgModel).name} (theo cơ sở)`;
  return 'Chưa chọn (hiện đầy đủ)';
}
