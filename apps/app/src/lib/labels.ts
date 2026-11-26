/** Nhãn dùng chung cần dịch, khai báo ngoài thành phần: dịch lúc hiển thị bằng t(nhãn). Không import tệp này từ test Node. */
import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import type { CycleStatus, SyncState } from '@agriconnect/shared';
import type { TabId } from './tabs';

export const SYNC_STATE_LABEL: Record<SyncState, MessageDescriptor> = {
  local_only: msg`Đã lưu trên thiết bị — chưa đồng bộ`,
  syncing: msg`Đang đồng bộ`,
  synced: msg`Đã đồng bộ`,
  needs_attention: msg`Cần xử lý`,
};

export const CYCLE_STATUS_LABEL: Record<CycleStatus, MessageDescriptor> = {
  preparing: msg`Chuẩn bị`,
  active: msg`Đang sản xuất`,
  paused: msg`Tạm dừng`,
  ended: msg`Đã kết thúc`,
  cancelled: msg`Đã hủy`,
};

/** Tên mục ở thanh dưới và menu (bản tiếng Việt khớp TAB_LABEL trong lib/tabs.ts) */
export const TAB_NAME: Record<TabId, MessageDescriptor> = {
  home: msg`Trang chủ`,
  production: msg`Sản xuất`,
  declare: msg`Khai báo`,
  config: msg`Cấu hình`,
  reports: msg`Báo cáo`,
  guide: msg`Hướng dẫn sử dụng`,
  support: msg`Hỗ trợ & Chia sẻ`,
  profile: msg`Tài khoản`,
};

/** Theo `kind` của KIND_GROUP (lib/logGroups.ts) */
export const KIND_GROUP_LABEL: Record<string, MessageDescriptor> = {
  crop: msg`🌱 Trồng trọt`,
  livestock: msg`🐖 Vật nuôi`,
  aquatic: msg`🐟 Thủy sản`,
  other: msg`📦 Khác`,
};

/** Theo `id` của nhóm việc (lib/logGroups.ts) */
export const WORK_GROUP_LABEL: Record<string, MessageDescriptor> = {
  prep: msg`Chuẩn bị & gieo trồng / thả giống`,
  nutrition: msg`Cho ăn, bón phân, tưới`,
  care: msg`Chăm sóc cây`,
  health: msg`Sức khỏe & phòng bệnh`,
  monitor: msg`Theo dõi & đo đạc`,
  env: msg`Vệ sinh & môi trường`,
  harvest: msg`Thu hoạch / xuất bán`,
  mine: msg`Việc của cơ sở`,
  other: msg`Khác`,
};
