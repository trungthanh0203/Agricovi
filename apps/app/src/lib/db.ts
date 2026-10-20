import Dexie, { type Table } from 'dexie';
import type { CycleStatus, OutboxItem } from '@agriconnect/shared';
import type { CycleSummary } from './summaryReport';

export interface AreaRow {
  id: string;
  organization_id: string;
  name: string;
  description?: string | null;
  /** false = khu trồng đã dừng: giữ lịch sử, không dùng để tạo vụ mới */
  is_active?: boolean;
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

export interface FieldDef {
  key: string;
  label: string;
  type: 'number' | 'text' | 'select';
  options?: string[];
}

export interface CropTypeRow {
  id: string;
  code: string;
  name: string;
  description?: string | null;
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
  }
}

export const db = new LocalDb();
