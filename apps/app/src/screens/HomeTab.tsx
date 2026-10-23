import { useState } from 'react';
import { addDays, diffDays, fmtDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { setNoteDone } from '../lib/production';
import { useCatalog } from '../lib/catalog';
import { HomeStats } from '../components/HomeStats';
import { WebInboxCard } from '../components/WebInboxCard';
import { SyncBadge } from '../components/SyncBadge';
import { todayLocal, useOnline, useRecordSync } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import type { TabId } from '../lib/tabs';
import { useAuth } from '../lib/auth';
import { authorLabel, canManageProduction, hasRole } from '../lib/roles';
import { retryFailed } from '../lib/outbox';
import { useTable } from '../lib/tables';

export function HomeTab({ onLog, onHistory, onGo }: { onLog: () => void; onHistory: () => void; onGo: (tab: TabId, section?: string) => void }) {
  const { active } = useOrgs();
  const sync = useRecordSync();
  const { session } = useAuth();
  const uid = session?.user.id;
  const logs = useTable('logs');
  const cycles = useTable('cycles');
  const areas = useTable('areas');
  const notes = useTable('notes');
  const online = useOnline();
  const [noteError, setNoteError] = useState<string | null>(null);
  const { workTypes, cropTypes } = useCatalog();
  if (!active) return null;
  const canManage = canManageProduction(active.roles);
  const canClock = hasRole(active.roles, 'manager', 'worker'); // chủ/quản lý/nhân viên tự chấm công

  const mine = cycles.filter(
    (c) => c.owner_org_id === active.id || areas.find((a) => a.id === c.area_id)?.organization_id === active.id,
  );
  // Chỉ vụ ĐANG SẢN XUẤT mới ghi việc được (vụ chuẩn bị hoặc tạm dừng thì chưa)
  const running = mine.filter((c) => c.status === 'active');
  const notStarted = mine.filter((c) => c.status === 'preparing' || c.status === 'paused');
  const mineIds = new Set(mine.map((c) => c.id));
  const today = new Date().toDateString();
  const todayLogs = logs
    .filter((l) => l.cycle_id && mineIds.has(l.cycle_id) && !l.voided_at && new Date(l.performed_at).toDateString() === today)
    .sort((a, b) => b.performed_at.localeCompare(a.performed_at));
  // Nhắc việc: ghi chú chưa xong của vụ trong cơ sở, quá hạn hoặc trong 3 ngày tới
  const todayIso = todayLocal();
  const limit = addDays(todayIso, 3);
  const reminders = notes
    .filter((n) => !n.done && mineIds.has(n.cycle_id) && n.note_date <= limit)
    .sort((a, b) => a.note_date.localeCompare(b.note_date));
  const failed = [...sync.values()].filter((s) => s.state === 'needs_attention').length;

  return (
    <section>
      <h1>Trang chủ</h1>

      <WebInboxCard />

      {running.length === 0 ? (
        <div className="card">
          <p>Chưa có vụ nào đang sản xuất nên chưa ghi việc được.</p>
          {notStarted.length > 0 && (
            <p className="muted">Vụ đang chuẩn bị hoặc tạm dừng chỉ ghi việc được sau khi bấm "Bắt đầu sản xuất" hoặc "Tiếp tục" ở màn Sản xuất.</p>
          )}
          {canManage ? (
            <button className="primary" onClick={() => (mine.length === 0 && areas.every((a) => a.organization_id !== active.id) ? onGo('declare', 'areas') : onGo('production', 'cycles'))}>
              {mine.length === 0 ? (areas.some((a) => a.organization_id === active.id) ? 'Tạo vụ đầu tiên' : 'Thêm trang trại đầu tiên') : 'Mở màn Sản xuất'}
            </button>
          ) : (
            <p className="muted">Hãy nhờ chủ cơ sở hoặc quản lý {mine.length === 0 ? 'tạo vụ trồng' : 'bắt đầu sản xuất'}.</p>
          )}
        </div>
      ) : (
        <div className="pair">
          <button className="primary big" onClick={onLog}>Ghi việc vừa làm</button>
          {canClock && <button className="secondary big" onClick={() => onGo('production', 'attendance')}>⏱ Vào ca / Ra ca</button>}
        </div>
      )}

      {failed > 0 && (
        <div className="card">
          <p className="msg error" role="alert">Có {failed} bản ghi cần xử lý (chưa gửi được lên máy chủ).</p>
          <button className="secondary" onClick={() => void retryFailed()}>Thử gửi lại</button>
        </div>
      )}

      <HomeStats cycleIds={mineIds} onGo={onGo} />

      {reminders.length > 0 && (
        <div className="card">
          <h2>Nhắc việc ({reminders.length})</h2>
          {noteError && <p className="msg error" role="alert">{noteError}</p>}
          {reminders.map((n) => {
            const c = cycles.find((x) => x.id === n.cycle_id);
            const d = diffDays(todayIso, n.note_date);
            const when = d < 0 ? `Quá hạn ${-d} ngày` : d === 0 ? 'Hôm nay' : d === 1 ? 'Ngày mai' : `Còn ${d} ngày`;
            return (
              <div className="note-row" key={n.id}>
                <label className="check">
                  <input type="checkbox" checked={false} disabled={!online} aria-label={`Đánh dấu xong: ${n.content}`}
                    onChange={() => { setNoteError(null); setNoteDone(n.id, true).catch((e) => setNoteError(friendlyError(e))); }} />
                  <span>
                    {n.content}
                    <small className="muted"> — {c?.name || cropTypes.find((t) => t.id === c?.crop_type_id)?.name || 'Vụ'} · {fmtDate(n.note_date)}</small>
                  </span>
                </label>
                <span className={d < 0 ? 'pill err' : d === 0 ? 'pill warn' : 'pill'}>{when}</span>
              </div>
            );
          })}
        </div>
      )}

      {running.length > 0 && (
        <p className="muted">Đang có {running.length} vụ đang sản xuất.</p>
      )}

      <h2 className="sect">Việc đã ghi hôm nay</h2>
      {todayLogs.length === 0 && <p className="muted">Hôm nay chưa ghi việc nào.</p>}
      <button className="secondary" onClick={onHistory}>Xem tất cả nhật ký</button>
      {todayLogs.map((l) => {
        const c = cycles.find((x) => x.id === l.cycle_id);
        return (
          <div className="card slim" key={l.id}>
            <div className="row">
              <strong>
                {workTypes.find((w) => w.id === l.work_type_id)?.name ?? 'Việc'}
                {(authorLabel(l.author_name, l.author_roles) || (uid && l.created_by === uid ? 'Bạn' : '')) ? ` - ${authorLabel(l.author_name, l.author_roles) || 'Bạn'}` : ''}
              </strong>
              <span className="muted">{new Date(l.performed_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <p className="muted">
              {c ? `${cropTypes.find((t) => t.id === c.crop_type_id)?.name ?? ''} · ${areas.find((a) => a.id === c.area_id)?.name ?? ''}` : ''}
              {l.note ? ` — ${l.note}` : ''}
            </p>
            <SyncBadge sync={sync.get(l.id)} />
          </div>
        );
      })}
    </section>
  );
}
