import { SYNC_STATE_LABEL_VI } from '@agriconnect/shared';
import { friendlyError } from '../lib/errors';
import type { RecordSync } from '../lib/hooks';

/**
 * Nhãn đồng bộ luôn có chữ (không chỉ màu). Chỉ áp dụng cho bản ghi tạo offline (nhật ký, vật tư đã dùng, thu hoạch).
 * Bản ghi không có trong hàng đợi là đã có trên máy chủ.
 */
export function SyncBadge({ sync }: { sync: RecordSync | undefined }) {
  if (!sync || sync.state === 'synced') return <span className="pill ok">{SYNC_STATE_LABEL_VI.synced}</span>;
  const cls = sync.state === 'needs_attention' ? 'pill err' : 'pill warn';
  return (
    <>
      <span className={cls}>{SYNC_STATE_LABEL_VI[sync.state]}</span>
      {sync.state === 'needs_attention' && sync.error && (
        <>
          <p className="msg error">{friendlyError(sync.error)}</p>
          <details className="tech">
            <summary>Chi tiết kỹ thuật (gửi cho người hỗ trợ)</summary>
            <code>{sync.error}</code>
          </details>
        </>
      )}
    </>
  );
}
