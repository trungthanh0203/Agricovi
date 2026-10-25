import { useTable } from '../lib/tables';
import { needleMessage } from '../lib/withdrawalLogic';
import { withdrawalMessage } from '../lib/withdrawalLogic';

/**
 * Cảnh báo thời gian cách ly (D96) khi ghi thu hoạch/bán vào ngày `date` (yyyy-mm-dd): hiện lý do còn cách ly và ô bắt buộc
 * ghi lý do nếu vẫn muốn ghi. Không chặn hẳn; lý do được lưu vào phiếu để có dấu vết. Không còn cách ly thì không hiện gì.
 */
export function WithdrawalNotice({ cycleId, date, reason, onReason }: { cycleId: string; date: string; reason: string; onReason: (v: string) => void }) {
  const rows = useTable('withdrawals');
  const incidents = useTable('incidents');
  // cách ly thuốc, hoặc (riêng vật nuôi) còn sự cố kim tiêm gãy chưa xử lý: cùng một ô lý do
  const msg = [withdrawalMessage(rows.find((r) => r.cycle_id === cycleId)?.items, date), needleMessage(incidents, cycleId)].filter(Boolean).join(' ') || null;
  if (!msg) return null;
  return (
    <div className="msg warn" role="status">
      <p style={{ margin: 0 }}>{msg}</p>
      <label>
        Lý do vẫn ghi vào ngày này (bắt buộc)
        <input value={reason} maxLength={300} onChange={(e) => onReason(e.target.value)} placeholder="Ví dụ: đã kiểm tra dư lượng, đạt yêu cầu" />
      </label>
    </div>
  );
}

/** Có đang vướng cách ly vào ngày này không (để chặn nút Lưu khi chưa ghi lý do) */
export function useWithdrawalBlocked(cycleId: string, date: string): boolean {
  const rows = useTable('withdrawals');
  const incidents = useTable('incidents');
  return withdrawalMessage(rows.find((r) => r.cycle_id === cycleId)?.items, date) !== null || needleMessage(incidents, cycleId) !== null;
}
