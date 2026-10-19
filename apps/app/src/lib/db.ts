import Dexie, { type Table } from 'dexie';
import type { CycleStatus, OutboxItem } from '@agriconnect/shared';

export interface AreaRow {
  id: string;
  organization_id: string;
  name: string;
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
}

export interface WorkTypeRow {
  id: string;
  code: string;
  name: string;
  field_schema: FieldDef[];
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
}

export interface LogRow {
  id: string;
  organization_id: string;
  cycle_id: string | null;
  area_id: string | null;
  work_type_id: string;
  performed_at: string;
  data: Record<string, unknown>;
  note: string | null;
  voided_at?: string | null;
  void_reason?: string | null;
  version: number;
  created_by?: string | null;
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
  category: string | null;
  base_unit_id: string;
  reorder_threshold: number | null;
  is_active: boolean;
}

export interface LocationRow {
  id: string;
  organization_id: string;
  name: string;
  is_active: boolean;
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
  }
}

export const db = new LocalDb();
