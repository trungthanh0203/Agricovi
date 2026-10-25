import Dexie, { type Table } from 'dexie';
import type { CycleStatus, OutboxItem } from '@agriconnect/shared';
import type { CycleSummary } from './summaryReport';

export interface AreaRow {
  id: string;
  organization_id: string;
  name: string;
  description?: string | null;
  location?: string | null;
  area_size?: number | null;
  area_unit?: 'm2' | 'ha';
  image?: string | null;
  /** false = trang trại đã dừng: giữ lịch sử, không dùng để tạo vụ mới */
  is_active?: boolean;
  /** Mã khu/chuồng (ví dụ C-THIT-02), duy nhất trong cơ sở (D98) */
  code?: string | null;
  /** growing = khu nuôi/trồng (tạo vụ được); facility = cơ sở vật chất (cổng, kho, biogas...: chỉ ghi việc) */
  kind?: 'growing' | 'facility';
  /** Kiểu chuồng: chỉ lưu và hiển thị ở P1 */
  housing?: 'closed' | 'semi_open' | 'open' | null;
}

export interface CycleRow {
  id: string;
  owner_org_id: string;
  area_id: string;
  crop_type_id: string;
  status: CycleStatus;
  start_date: string | null;
  version: number;
  note?: string | null;
  created_at?: string;
  /** Tên riêng của vụ (không bắt buộc) */
  name?: string | null;
  expected_end_date?: string | null;
  /** Kế hoạch của vụ (D93): sản lượng dự kiến (kg) và ngân sách dự kiến (đồng) */
  target_yield_kg?: number | null;
  budget_amount?: number | null;
  /** Giống và diện tích (D94): diện tích trồng theo m², số cây, giống, nguồn giống, số lô giống, ngày gieo/trồng */
  planted_area_m2?: number | null;
  plant_count?: number | null;
  variety_name?: string | null;
  seed_source?: string | null;
  seed_lot?: string | null;
  sowing_date?: string | null;
  planting_date?: string | null;
  /** Mã vụ/lô (duy nhất trong cơ sở), đơn vị đếm (cây, con...), cán bộ kỹ thuật/thú y phụ trách (D98) */
  code?: string | null;
  count_unit?: string | null;
  supervisor_name?: string | null;
  supervisor_phone?: string | null;
  /** Quy trình mẫu vụ được tạo theo (bản chụp lúc tạo, P2) */
  template_id?: string | null;
  template_name?: string | null;
  template_version?: number | null;
}

/** Ghi chú theo ngày của vụ (nhắc việc ở Trang chủ) */
export interface NoteRow {
  id: string;
  cycle_id: string;
  organization_id: string;
  note_date: string;
  content: string;
  done: boolean;
  created_by: string;
  author_name?: string | null;
  created_at?: string;
}

/** Sự cố của vụ (D95) */
export interface IncidentRow {
  id: string;
  cycle_id: string;
  organization_id: string;
  kind: 'pest' | 'loss' | 'weather' | 'complaint' | 'other';
  incident_date: string;
  stage_id: string | null;
  severity: 'low' | 'medium' | 'high';
  description: string;
  loss_quantity: number | null;
  loss_amount: number | null;
  image: string | null;
  status: 'open' | 'closed';
  closed_at: string | null;
  close_note: string | null;
  voided_at: string | null;
  void_reason: string | null;
  version: number;
  created_by: string;
  author_name?: string | null;
  created_at?: string;
}

/** Việc khắc phục của sự cố */
export interface IncidentActionRow {
  id: string;
  incident_id: string;
  cycle_id: string;
  organization_id: string;
  content: string;
  assignee_id: string | null;
  assignee_name: string | null;
  due_date: string | null;
  done: boolean;
  done_at: string | null;
  created_by: string;
}

/** Thời gian cách ly của vụ do máy chủ tính (D96) */
export interface WithdrawalRow {
  cycle_id: string;
  safe_date: string;
  items: { material: string; used_on: string; days: number; safe_on: string }[];
}

/** Ảnh đã tải từ kho ảnh, giữ trên máy để xem offline (G2-1). key = "<đường dẫn>|t" (ảnh nhỏ) hoặc "|f" (đầy đủ) */
export interface MediaRow { key: string; blob: Blob; at: number }

/** Ca chấm công bắt đầu khi KHÔNG có mạng: giữ trên máy tới khi ra ca rồi gửi một lần qua hàng đợi (D43) */
export interface LocalShift {
  id: string;
  org: string;
  worker_id: string;
  started_at: string;
  cycle_id: string | null;
  lat: number | null;
  lng: number | null;
  acc: number | null;
}

/** Giai đoạn của vụ: bản sao từ quy trình mẫu, có ngày kế hoạch và ngày thực tế */
export interface StageRow {
  id: string;
  cycle_id: string;
  name: string;
  seq: number;
  work_type_id: string | null;
  duration_days: number | null;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  status: 'pending' | 'in_progress' | 'done';
  note: string | null;
}

/** Bản chỉnh của một cơ sở lên mục có sẵn dùng chung (D32) */
export interface CatalogOverride {
  display_name: string | null;
  description?: string | null;
  image?: string | null;
  field_schema: FieldDef[] | null;
  is_active: boolean;
}

export interface WorkTypeRow {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  field_schema: FieldDef[];
  /** null = loại việc dùng chung; có giá trị = loại việc do cơ sở định nghĩa */
  organization_id?: string | null;
  is_active?: boolean;
  /** Bản chỉnh theo mã cơ sở (chỉ có ở mục dùng chung) */
  ov?: Record<string, CatalogOverride>;
}

/** Một trường của form động (D96). Chỉ `key`, `label`, `type` là bắt buộc; nhật ký cũ không có các thuộc tính mới vẫn hiển thị bình thường. */
export interface FieldDef {
  key: string;
  label: string;
  type: 'number' | 'text' | 'select' | 'multiselect' | 'date' | 'bool';
  options?: string[];
  required?: boolean;
  unit?: string;
  min?: number;
  max?: number;
  /** Gợi ý mờ trong ô nhập */
  hint?: string;
  /** Giá trị điền sẵn khi ghi mới */
  default?: string;
}

export interface CropTypeRow {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  /** Loại sản phẩm: cây trồng, vật nuôi hoặc khác */
  kind?: 'crop' | 'livestock' | 'other';
  image?: string | null;
  /** null = cây dùng chung; có giá trị = cây do cơ sở khai báo */
  organization_id?: string | null;
  is_active?: boolean;
  ov?: Record<string, CatalogOverride>;
}

export interface LogRow {
  id: string;
  organization_id: string;
  cycle_id: string | null;
  area_id: string | null;
  work_type_id: string;
  /** Giai đoạn của vụ mà việc này thuộc về (không bắt buộc) */
  stage_id?: string | null;
  performed_at: string;
  data: Record<string, unknown>;
  note: string | null;
  voided_at?: string | null;
  void_reason?: string | null;
  version: number;
  created_by?: string | null;
  performed_by?: string | null;
  /** Bản chụp tên và vai trò người làm, máy chủ điền khi tạo (migration 0018) */
  author_name?: string | null;
  author_roles?: string[] | null;
  received_at?: string;
}

export interface UnitRow {
  id: string;
  code: string;
  name: string;
  organization_id: string | null; // null = đơn vị dùng chung
}

export interface MaterialRow {
  id: string;
  organization_id: string;
  name: string;
  description?: string | null;
  image?: string | null;
  category: string | null;
  /** Thông tin mở rộng (không bắt buộc) */
  brand?: string | null;
  usage_guide?: string | null;
  usage_method?: string | null;
  safety_warning?: string | null;
  quality_specs?: string | null;
  limit_elements?: string | null;
  /** Thời gian cách ly (số ngày) */
  withdrawal_days?: number | null;
  /** Nhóm vật tư, hoạt chất, số đăng ký, nhà sản xuất (D98) */
  material_group?: string | null;
  active_ingredient?: string | null;
  registration_no?: string | null;
  manufacturer?: string | null;
  base_unit_id: string;
  reorder_threshold: number | null;
  is_active: boolean;
}

export interface LocationRow {
  id: string;
  organization_id: string;
  name: string;
  description?: string | null;
  is_active: boolean;
}

export interface HarvestRow {
  id: string;
  organization_id: string;
  cycle_id: string;
  harvested_at: string;
  grade: string | null;
  quantity: number;
  unit: string;
  loss_quantity: number | null;
  note: string | null;
  voided_at?: string | null;
  void_reason?: string | null;
  version: number;
  created_by?: string | null;
  received_at?: string;
}

/** Bản tổng kết vụ đã tải về gần nhất, để xem lại khi mất mạng */
export interface SummaryRow {
  cycle_id: string;
  fetched_at: string;
  data: CycleSummary;
}

export interface ExpenseRow {
  id: string;
  organization_id: string;
  cycle_id: string | null;
  category: string;
  kind: string;
  amount: number;
  expense_date: string;
  note: string | null;
  voided_at?: string | null;
  void_reason?: string | null;
  version: number;
  created_by?: string | null;
  received_at?: string;
}

export interface SaleRow {
  id: string;
  organization_id: string;
  cycle_id: string;
  sold_date: string;
  quantity: number;
  unit: string;
  amount: number;
  buyer_note: string | null;
  voided_at?: string | null;
  void_reason?: string | null;
  version: number;
  created_by?: string | null;
  received_at?: string;
}

/** Tồn theo kho và vật tư (bản chụp từ view inventory_balances; chỉ vai trò được đọc kho mới có) */
export interface BalanceRow {
  organization_id: string;
  location_id: string;
  material_id: string;
  balance: number;
  is_negative: boolean;
  receipts_missing_cost: number;
  /** Ngày nhập kho gần nhất, và lần điều chỉnh tồn gần nhất (số lượng +/-, lý do) */
  last_receipt_date?: string | null;
  last_adjust_date?: string | null;
  last_adjust_delta?: number | null;
  last_adjust_reason?: string | null;
}

/** CSDL cục bộ (IndexedDB). Bản ghi tạo offline có UUID tạo ở thiết bị. */
export class LocalDb extends Dexie {
  outbox!: Table<OutboxItem, string>;
  areas!: Table<AreaRow, string>;
  cycles!: Table<CycleRow, string>;
  logs!: Table<LogRow, string>;
  workTypes!: Table<WorkTypeRow, string>;
  cropTypes!: Table<CropTypeRow, string>;
  units!: Table<UnitRow, string>;
  materials!: Table<MaterialRow, string>;
  locations!: Table<LocationRow, string>;
  balances!: Table<BalanceRow, [string, string]>;
  harvests!: Table<HarvestRow, string>;
  expenses!: Table<ExpenseRow, string>;
  sales!: Table<SaleRow, string>;
  summaries!: Table<SummaryRow, string>;
  stages!: Table<StageRow, string>;
  notes!: Table<NoteRow, string>;
  incidents!: Table<IncidentRow, string>;
  withdrawals!: Table<WithdrawalRow, string>;
  incidentActions!: Table<IncidentActionRow, string>;
  localShifts!: Table<LocalShift, string>;
  media!: Table<MediaRow, string>;

  constructor(name = 'agriconnect') {
    super(name);
    this.version(1).stores({
      outbox: 'id, state, table, createdAt',
    });
    this.version(2).stores({
      outbox: 'id, state, table, createdAt',
      areas: 'id, organization_id',
      cycles: 'id, owner_org_id, area_id',
      logs: 'id, cycle_id, organization_id, performed_at',
      workTypes: 'id',
      cropTypes: 'id',
    });
    this.version(3).stores({
      outbox: 'id, state, table, createdAt',
      areas: 'id, organization_id',
      cycles: 'id, owner_org_id, area_id',
      logs: 'id, cycle_id, organization_id, performed_at',
      workTypes: 'id',
      cropTypes: 'id',
      units: 'id',
      materials: 'id, organization_id',
      locations: 'id, organization_id',
      balances: '[location_id+material_id], organization_id',
    });
    this.version(4).stores({
      outbox: 'id, state, table, createdAt',
      areas: 'id, organization_id',
      cycles: 'id, owner_org_id, area_id',
      logs: 'id, cycle_id, organization_id, performed_at',
      workTypes: 'id',
      cropTypes: 'id',
      units: 'id',
      materials: 'id, organization_id',
      locations: 'id, organization_id',
      balances: '[location_id+material_id], organization_id',
      harvests: 'id, cycle_id, organization_id, harvested_at',
    });
    this.version(5).stores({
      outbox: 'id, state, table, createdAt',
      areas: 'id, organization_id',
      cycles: 'id, owner_org_id, area_id',
      logs: 'id, cycle_id, organization_id, performed_at',
      workTypes: 'id',
      cropTypes: 'id',
      units: 'id',
      materials: 'id, organization_id',
      locations: 'id, organization_id',
      balances: '[location_id+material_id], organization_id',
      harvests: 'id, cycle_id, organization_id, harvested_at',
      expenses: 'id, organization_id, cycle_id, expense_date',
      sales: 'id, organization_id, cycle_id, sold_date',
    });
    this.version(6).stores({
      outbox: 'id, state, table, createdAt',
      areas: 'id, organization_id',
      cycles: 'id, owner_org_id, area_id',
      logs: 'id, cycle_id, organization_id, performed_at',
      workTypes: 'id',
      cropTypes: 'id',
      units: 'id',
      materials: 'id, organization_id',
      locations: 'id, organization_id',
      balances: '[location_id+material_id], organization_id',
      harvests: 'id, cycle_id, organization_id, harvested_at',
      expenses: 'id, organization_id, cycle_id, expense_date',
      sales: 'id, organization_id, cycle_id, sold_date',
      summaries: 'cycle_id',
    });
    // v7 (D24): hàng đợi chỉ còn thêm mới; bỏ các mục "sửa" cũ còn sót (chưa có người dùng thật)
    this.version(7).stores({
      outbox: 'id, state, table, createdAt',
    }).upgrade((tx) => tx.table('outbox').filter((i: { op?: string }) => i.op === 'update').delete());
    // v8 (P2): giai đoạn của vụ
    this.version(8).stores({
      outbox: 'id, state, table, createdAt',
      stages: 'id, cycle_id',
    });
    // v9 (D35): ghi chú theo ngày của vụ
    this.version(9).stores({
      outbox: 'id, state, table, createdAt',
      notes: 'id, cycle_id, note_date',
    });
    // v10 (D43): ca chấm công bắt đầu khi mất mạng, chờ ra ca để gửi
    this.version(10).stores({
      outbox: 'id, state, table, createdAt',
      localShifts: 'id, org',
    });
    // v11 (G2-1): ảnh tải từ kho ảnh giữ trên máy
    this.version(11).stores({
      media: 'key, at',
    });
    // v12 (D95): sự cố và việc khắc phục của vụ
    this.version(12).stores({
      incidents: 'id, cycle_id, status',
      incidentActions: 'id, incident_id, cycle_id',
    });
    // v13 (D96): thời gian cách ly của vụ
    this.version(13).stores({
      withdrawals: 'cycle_id',
    });
  }
}

export const db = new LocalDb();
