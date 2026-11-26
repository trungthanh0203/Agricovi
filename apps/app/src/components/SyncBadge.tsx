import { Trans, useLingui } from '@lingui/react/macro';
import { SYNC_STATE_LABEL } from '../lib/labels';
import { friendlyError } from '../lib/errors';
import type { RecordSync } from '../lib/hooks';

/**
 * Nhãn đồng bộ luôn có chữ (không chỉ màu). Chỉ áp dụng cho bản ghi tạo offline (nhật ký, vật tư đã dùng, thu hoạch).
 * Bản ghi không có trong hàng đợi là đã có trên máy chủ.
 */
export function SyncBadge({ sync }: { sync: RecordSync | undefined }) {
  const { i18n } = useLingui();
  if (!sync || sync.state === 'synced') return <span className="pill ok">{i18n._(SYNC_STATE_LABEL.synced)}</span>;
  const cls = sync.state === 'needs_attention' ? 'pill err' : 'pill warn';
  return (
    <>
      <span className={cls}>{i18n._(SYNC_STATE_LABEL[sync.state])}</span>
      {sync.state === 'needs_attention' && sync.error && (
        <>
          <p className="msg error">{friendlyError(sync.error)}</p>
          <details className="tech">
            <summary><Trans>Chi tiết kỹ thuật (gửi cho người hỗ trợ)</Trans></summary>
            <code>{sync.error}</code>
          </details>
        </>
      )}
    </>
  );
}
