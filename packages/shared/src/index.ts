// Kiểu dùng chung giữa app, admin, web. Giá trị khớp enum trong supabase/migrations.

export type OrgType = 'household' | 'cooperative';

export type MemberRole =
  | 'owner'
  | 'manager'
  | 'worker'
  | 'inventory_finance'
  | 'cooperative_manager'
  | 'profile_editor';

export type CycleStatus = 'preparing' | 'active' | 'paused' | 'ended' | 'cancelled';

/** Vụ ở các trạng thái này được tính vào hạn mức gói (v1.2 mục 3.1). */
export const QUOTA_COUNTED_STATUSES: readonly CycleStatus[] = ['active', 'paused'];

export type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'suspended';

/** Trạng thái đồng bộ của bản ghi offline (v1.1 mục 8.2). */
export type SyncState = 'local_only' | 'syncing' | 'synced' | 'needs_attention';

export const SYNC_STATE_LABEL_VI: Record<SyncState, string> = {
  local_only: 'Đã lưu trên thiết bị — chưa đồng bộ',
  syncing: 'Đang đồng bộ',
  synced: 'Đã đồng bộ',
  needs_attention: 'Cần xử lý',
};

export const CYCLE_STATUS_LABEL_VI: Record<CycleStatus, string> = {
  preparing: 'Chuẩn bị',
  active: 'Đang sản xuất',
  paused: 'Tạm dừng',
  ended: 'Đã kết thúc',
  cancelled: 'Đã hủy',
};

/** Hàng đợi gửi lên máy chủ. `id` là UUID tạo ở thiết bị, dùng làm khóa idempotency. */
export interface OutboxItem {
  id: string;
  table: string;
  op: 'insert' | 'update';
  /** Hàng đầy đủ (insert) hoặc chỉ { id } (update). Luôn có `id` của bản ghi. */
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  state: SyncState;
  lastError?: string;
  // --- chỉ cho op = 'update' (phát hiện xung đột, FR-SYNC-004) ---
  /** Các trường thay đổi người dùng muốn áp dụng */
  changes?: Record<string, unknown>;
  /** Phiên bản bản ghi mà người dùng đã thấy khi sửa */
  expectedVersion?: number;
  /** Mã của lần sửa này: gửi lặp không bị coi là xung đột */
  opId?: string;
  /** Có giá trị khi máy chủ báo xung đột: bản ghi hiện tại trên máy chủ, chờ người dùng chọn cách giải quyết */
  conflict?: { server: Record<string, unknown> };
}
