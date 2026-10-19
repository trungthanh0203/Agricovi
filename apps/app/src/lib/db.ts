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

/** CSDL cục bộ (IndexedDB). Bản ghi tạo offline có UUID tạo ở thiết bị. */
export class LocalDb extends Dexie {
  outbox!: Table<OutboxItem, string>;
  areas!: Table<AreaRow, string>;
  cycles!: Table<CycleRow, string>;
  logs!: Table<LogRow, string>;
  workTypes!: Table<WorkTypeRow, string>;
  cropTypes!: Table<CropTypeRow, string>;

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
  }
}

export const db = new LocalDb();
