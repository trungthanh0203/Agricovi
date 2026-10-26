import { useEffect, useMemo, useState } from 'react';
import { Collapsible } from './Collapsible';
import { ChartCard, HBarList } from './charts';
import { KpiTile } from './HomeStats';
import { addDays, fmtDate } from '../lib/dates';
import { todayLocal } from '../lib/hooks';
import { listOrphans, type AttendanceRow, type WorkerLite } from '../lib/work';

const dayOf = (iso: string) => new Date(iso).toLocaleDateString('en-CA'); // YYYY-MM-DD theo giờ máy

/**
 * Tổng quan chấm công cho tổ trưởng/quản lý/chủ (D47): giờ công tháng, công chờ xác nhận, ca quên ra ca, tiến độ xác nhận,
 * bảng người × ngày và cảnh báo. Tính trên các bản ghi công đã tải (31 ngày gần nhất).
 */
export function AttendanceOverview({ orgId, workers, att, isAdmin }: { orgId: string; workers: WorkerLite[]; att: AttendanceRow[]; isAdmin: boolean }) {
  const today = todayLocal();
  const month = today.slice(0, 7);
  const [orphans, setOrphans] = useState<{ worker_id: string; full_name: string; team_name: string | null }[]>([]);
  useEffect(() => {
    if (isAdmin && navigator.onLine) void listOrphans(orgId).then(setOrphans).catch(() => setOrphans([]));
  }, [orgId, isAdmin]);

  const s = useMemo(() => {
    const live = att.filter((a) => a.status !== 'rejected');
    const inMonth = live.filter((a) => a.work_date.startsWith(month));
    const confirmed = inMonth.filter((a) => a.status === 'confirmed');
    const pending = live.filter((a) => a.ended_at && a.status === 'needs_confirmation');
    const stale = live.filter((a) => !a.ended_at && Date.now() - new Date(a.started_at).getTime() > 12 * 3600_000);
    const minutes = confirmed.reduce((t, a) => t + (a.approved_minutes ?? 0), 0);
    const monthEnded = inMonth.filter((a) => a.ended_at).length;
    return { minutes, pending, stale, percent: monthEnded ? Math.round((confirmed.length / monthEnded) * 100) : 0, monthEnded };
  }, [att, month]);

  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(today, i - 13)), [today]);
  const grid = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of att) {
      if (a.status === 'rejected' || !a.ended_at) continue;
      const k = `${a.worker_id}|${a.work_date || dayOf(a.started_at)}`;
      m.set(k, (m.get(k) ?? 0) + (a.status === 'confirmed' ? a.approved_minutes ?? 0 : a.declared_minutes ?? 0));
    }
    return m;
  }, [att]);
  // giờ công đã xác nhận trong tháng theo từng người (biểu đồ xếp hạng)
  const byPerson = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of att) {
      if (a.status !== 'confirmed' || !a.work_date.startsWith(month)) continue;
      m.set(a.worker_id, (m.get(a.worker_id) ?? 0) + (a.approved_minutes ?? 0));
    }
    return [...m.entries()].map(([id, mins]) => ({ label: workers.find((w) => w.id === id)?.full_name ?? '—', value: Math.round(mins / 6) / 10 })).filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value).slice(0, 8);
  }, [att, month, workers]);
  const people = workers.filter((w) => w.status === 'active' && att.some((a) => a.worker_id === w.id));
  const nameOf = (id: string) => workers.find((w) => w.id === id)?.full_name ?? '—';

  return (
    <>
      <div className="kpis">
        <KpiTile label="Giờ công tháng này" value={`${(s.minutes / 60).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} giờ`} tone="ok" note="đã xác nhận" />
        <KpiTile label="Công chờ xác nhận" value={String(s.pending.length)} tone={s.pending.length > 0 ? 'warn' : 'ok'} note={s.pending.length > 0 ? 'cần xem' : 'đã xong'} />
        <KpiTile label="Ca quên ra ca" value={String(s.stale.length)} tone={s.stale.length > 0 ? 'bad' : 'ok'} note="mở quá 12 giờ" />
        <KpiTile label="Đã xác nhận (tháng)" value={`${s.percent}%`} tone="info" note={`${s.monthEnded} ca đã kết thúc`} />
      </div>
      <div className="progress" role="progressbar" aria-valuenow={s.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Tỉ lệ công đã xác nhận"><i style={{ width: `${s.percent}%` }} /></div>

      {byPerson.length > 0 && (
        <ChartCard title="Giờ công tháng này theo người" subtitle="Chỉ tính công đã xác nhận" footer="Xem theo phòng/tổ: Báo cáo → Theo nhu cầu → Giờ công và tiền công → Theo phòng / tổ."
          table={{ columns: ['Người', 'Giờ công'], rows: byPerson.map((p) => [p.label, `${p.value.toLocaleString('vi-VN')} giờ`]) }}>
          <HBarList items={byPerson} tone="info" format={(n) => `${n.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} giờ`} ariaLabel="Giờ công theo người" />
        </ChartCard>
      )}

      {(s.stale.length > 0 || s.pending.length > 0 || orphans.length > 0) && (
        <div className="card alert-warn">
          <h2>Cần xử lý</h2>
          {s.stale.map((a) => <p key={a.id}><span className="pill err">Quên ra ca</span> {nameOf(a.worker_id)} vào ca {fmtDate(a.work_date)} chưa ra ca. Hãy nhờ họ Ra ca hoặc dùng "Chấm công hộ".</p>)}
          {s.pending.length > 0 && <p><span className="pill warn">Chờ xác nhận</span> {s.pending.length} ca đang chờ tổ trưởng/quản lý xác nhận (bấm ✔ ở bảng bên dưới).</p>}
          {orphans.map((o) => <p key={o.worker_id}><span className="pill warn">Chưa có tổ trưởng</span> {o.full_name}{o.team_name ? ` (${o.team_name})` : ' chưa thuộc tổ nào'}: công của họ do tổ trưởng chấm nhưng chưa có ai. Chọn tổ trưởng ở Khai báo → Phòng / Tổ.</p>)}
        </div>
      )}

      {people.length > 0 && (
        <Collapsible inline title="Bảng công theo ngày" summary="giờ làm của từng người, 14 ngày">
          <div className="scrollx">
            <table className="grid">
              <thead><tr><th>Người</th>{days.map((d) => <th key={d} className="num">{d.slice(8)}</th>)}</tr></thead>
              <tbody>
                {people.map((w) => (
                  <tr key={w.id}>
                    <td>{w.full_name}</td>
                    {days.map((d) => {
                      const m = grid.get(`${w.id}|${d}`);
                      return <td key={d} className="num">{m ? (m / 60).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) : '·'}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">Số là giờ làm trong ngày (ca đã xác nhận tính theo giờ được duyệt, ca chờ xác nhận tính theo giờ khai).</p>
        </Collapsible>
      )}
    </>
  );
}
