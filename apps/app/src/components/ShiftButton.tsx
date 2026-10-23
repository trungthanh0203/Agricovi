import { useEffect, useState } from 'react';
import { addDays } from '../lib/dates';
import { todayLocal } from '../lib/hooks';
import { useTable } from '../lib/tables';
import { listAttendance, listWorkers } from '../lib/work';

/** Hình người đi vào cửa (Vào ca) hoặc đi ra khỏi cửa (Ra ca) */
function DoorIcon({ out }: { out: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {out ? (
        <>
          <path d="M8 4H4v16h4" />
          <circle cx="16.5" cy="6" r="2" />
          <path d="M13.5 20v-2.5a3 3 0 0 1 6 0V20" />
          <path d="M8 11h4M10 8.8 12.2 11 10 13.2" transform="translate(-1 1)" />
        </>
      ) : (
        <>
          <path d="M16 4h4v16h-4" />
          <circle cx="7.5" cy="6" r="2" />
          <path d="M4.5 20v-2.5a3 3 0 0 1 6 0V20" />
          <path d="M12 11h4.5M14.3 8.8 16.5 11l-2.2 2.2" transform="translate(-1 1)" />
        </>
      )}
    </svg>
  );
}

/**
 * Nút Vào ca / Ra ca nhỏ ở Trang chủ, cùng dòng với ngày (hiện theo trạng thái của chính mình). Bấm để sang màn Chấm công, nơi thực hiện việc vào/ra ca.
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
    <button className={inShift ? 'shiftbtn out' : 'shiftbtn in'} onClick={onClick} aria-label={inShift ? 'Ra ca: kết thúc ca làm việc' : 'Vào ca: bắt đầu ca làm việc'}>
      <span className="shift-ico"><DoorIcon out={inShift} /></span>
      {inShift ? 'Ra ca' : 'Vào ca'}
    </button>
  );
}
