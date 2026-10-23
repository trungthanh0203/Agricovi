import { useEffect, useState } from 'react';
import { addDays } from '../lib/dates';
import { todayLocal } from '../lib/hooks';
import { useTable } from '../lib/tables';
import { listAttendance, listWorkers } from '../lib/work';

/**
 * Nút Vào ca / Ra ca ở Trang chủ (hiện theo trạng thái của chính mình). Bấm để sang màn Chấm công, nơi thực hiện việc vào/ra ca.
 * Ca đang mở lấy từ máy chủ khi có mạng; ca bắt đầu lúc mất mạng được giữ trên máy nên vẫn nhận ra.
 */
export function ShiftButton({ orgId, uid, onClick }: { orgId: string; uid: string | undefined; onClick: () => void }) {
  const localShifts = useTable('localShifts');
  const [serverOpen, setServerOpen] = useState<boolean | null>(null); // null = chưa biết
  useEffect(() => {
    if (!uid || !navigator.onLine) return;
    let alive = true;
    void (async () => {
      try {
        const [att, workers] = await Promise.all([listAttendance(orgId, addDays(todayLocal(), -31)), listWorkers(orgId)]);
        const me = workers.find((w) => w.user_id === uid);
        if (alive) setServerOpen(att.some((a) => !a.ended_at && a.worker_id === me?.id && a.status !== 'rejected'));
      } catch { /* giữ trạng thái cũ */ }
    })();
    return () => { alive = false; };
  }, [orgId, uid]);

  const inShift = serverOpen === true || localShifts.some((s) => s.org === orgId);
  return (
    <button className={inShift ? 'shiftbtn out' : 'shiftbtn in'} onClick={onClick}>
      <span className="shift-ico" aria-hidden>{inShift ? '⏹' : '▶'}</span>
      {inShift ? 'Ra ca' : 'Vào ca'}
    </button>
  );
}
