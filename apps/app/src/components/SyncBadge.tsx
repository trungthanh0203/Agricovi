import { useState } from 'react';
import { CYCLE_STATUS_LABEL_VI, SYNC_STATE_LABEL_VI, type CycleStatus } from '@agriconnect/shared';
import { friendlyError } from '../lib/errors';
import type { RecordSync } from '../lib/hooks';
import { resolveKeepMine, resolveUseServer } from '../lib/outbox';

const FIELD_LABEL: Record<string, string> = {
  note: 'Ghi chú',
  performed_at: 'Thời điểm làm',
  data: 'Chi tiết',
  voided_at: 'Hủy bản ghi',
  void_reason: 'Lý do hủy',
  status: 'Trạng thái',
  start_date: 'Ngày bắt đầu',
  work_type_id: 'Loại việc',
  harvested_at: 'Thời điểm thu',
  grade: 'Phân loại',
  quantity: 'Số lượng (kg)',
  loss_quantity: 'Hao hụt (kg)',
};

function show(key: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '(trống)';
  if (key === 'performed_at' || key === 'voided_at' || key === 'harvested_at') return new Date(String(v)).toLocaleString('vi-VN');
  if (key === 'status') return CYCLE_STATUS_LABEL_VI[v as CycleStatus] ?? String(v);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Nhãn đồng bộ luôn có chữ (không chỉ màu). Bản ghi không có trong hàng đợi là đã đồng bộ. */
export function SyncBadge({ sync }: { sync: RecordSync | undefined }) {
  if (!sync || sync.state === 'synced') return <span className="pill ok">{SYNC_STATE_LABEL_VI.synced}</span>;
  if (sync.conflict) return <ConflictPanel sync={sync} />;
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

/** Xung đột: người khác đã sửa bản ghi này trên máy chủ. Không ghi đè âm thầm; người dùng chọn (v1.1 mục 8.3). */
function ConflictPanel({ sync }: { sync: RecordSync }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const server = sync.conflict!.server;
  const changes = sync.changes ?? {};
  const keys = Object.keys(changes);

  async function run(fn: (id: string) => Promise<void>) {
    if (!sync.itemId) return;
    setBusy(true);
    setError(null);
    try {
      await fn(sync.itemId);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="conflict" role="alert">
      <span className="pill err">Xung đột — cần bạn chọn</span>
      <p>Bản ghi này đã được người khác thay đổi trước khi thay đổi của bạn được gửi lên. Chưa có gì bị ghi đè.</p>
      <table className="diff">
        <thead>
          <tr><th>Mục</th><th>Trên máy chủ hiện có</th><th>Bạn muốn đổi thành</th></tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k}>
              <td>{FIELD_LABEL[k] ?? k}</td>
              <td>{show(k, server[k])}</td>
              <td>{show(k, changes[k])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && <p className="msg error">{error}</p>}
      <div className="actions">
        <button className="secondary" disabled={busy} onClick={() => void run(resolveKeepMine)}>Giữ thay đổi của tôi</button>
        <button className="secondary" disabled={busy} onClick={() => void run(resolveUseServer)}>Dùng bản trên máy chủ</button>
      </div>
    </div>
  );
}
