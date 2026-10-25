import type { AreaRow, CountEventRow, CycleRow, HarvestRow, IncidentActionRow, IncidentRow, LogRow, MaterialRow, MilestoneRow, StageRow, WorkTypeRow } from '../db';

/**
 * Sổ nhật ký in/xuất Excel (P5 gọn, D100). Mỗi loại hình có bộ sổ riêng trong một file (melon.ts, pig.ts…), nhập vào ./index.ts:
 * thêm loại hình = thêm file + một dòng. Sổ chỉ ĐỌC dữ liệu đã ghi, không bắt nhập hai lần; cột app chưa có dữ liệu thì để trống.
 */
export interface Use { material: MaterialRow | undefined; quantity: number; unit: string; lotNo: string | null; expiry: string | null }
export interface LogEntry { log: LogRow; wt: WorkTypeRow | undefined; uses: Use[] }
export interface ReceiptEntry { date: string; material: MaterialRow | undefined; quantity: number; unit: string; lotNo: string | null; expiry: string | null; note: string | null }

export interface LogbookData {
  orgName: string;
  cycle: CycleRow | null;
  areaName: string;
  areaLocation: string | null;
  productName: string;
  productKind: 'crop' | 'livestock' | 'other' | undefined;
  /** đơn vị đếm: cây, con… */
  unit: string;
  from: string; // yyyy-mm-dd
  to: string;
  entries: LogEntry[];
  receipts: ReceiptEntry[];
  harvests: HarvestRow[];
  incidents: IncidentRow[];
  actions: IncidentActionRow[];
  countEvents: CountEventRow[];
  stages: StageRow[];
  milestones: MilestoneRow[];
  areas: AreaRow[];
  audits: { audit_date: string; status: string; voided_at: string | null }[];
  /** false = người xem không có quyền đọc giao dịch kho nên cột vật tư để trống */
  usesAvailable: boolean;
}

export interface Logbook {
  id: string;
  title: string;
  /** chú thích dưới tiêu đề (ví dụ cột chưa có dữ liệu trong app) */
  note?: string;
  headers: string[];
  /** 'cycle' (mặc định) = chỉ việc của vụ đang chọn; 'org' = mọi việc của cơ sở trong khoảng ngày (vệ sinh khu vực, cổng…) */
  scope?: 'cycle' | 'org';
  build: (d: LogbookData) => string[][];
}

export interface LogbookSet { id: string; name: string; books: Logbook[] }
