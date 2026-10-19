import { useLiveQuery } from 'dexie-react-hooks';
import { SyncBadge } from '../components/SyncBadge';
import { db } from '../lib/db';
import { useRecordSync } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import { canManageProduction } from '../lib/roles';
import { retryFailed } from '../lib/outbox';

export function HomeTab({ onLog, onHistory, goProduction }: { onLog: () => void; onHistory: () => void; goProduction: () => void }) {
  const { active } = useOrgs();
  const sync = useRecordSync();
  const logs = useLiveQuery(() => db.logs.toArray(), [], []);
  const cycles = useLiveQuery(() => db.cycles.toArray(), [], []);
  const areas = useLiveQuery(() => db.areas.toArray(), [], []);
  const workTypes = useLiveQuery(() => db.workTypes.toArray(), [], []);
  const cropTypes = useLiveQuery(() => db.cropTypes.toArray(), [], []);
  if (!active) return null;
  const canManage = canManageProduction(active.roles);

  const mine = cycles.filter(
    (c) => c.owner_org_id === active.id || areas.find((a) => a.id === c.area_id)?.organization_id === active.id,
  );
  const running = mine.filter((c) => c.status === 'active' || c.status === 'paused');
  const mineIds = new Set(mine.map((c) => c.id));
  const today = new Date().toDateString();
  const todayLogs = logs
    .filter((l) => l.cycle_id && mineIds.has(l.cycle_id) && !l.voided_at && new Date(l.performed_at).toDateString() === today)
    .sort((a, b) => b.performed_at.localeCompare(a.performed_at));
  const failed = [...sync.values()].filter((s) => s.state === 'needs_attention').length;

  return (
    <section>
      <h1>Trang chủ</h1>
      <p className="muted">{active.name}</p>

      {running.length === 0 ? (
        <div className="card">
          <p>Chưa có vụ trồng nào đang hoạt động.</p>
          {canManage ? (
            <button className="primary" onClick={goProduction}>Tạo khu trồng và vụ đầu tiên</button>
          ) : (
            <p className="muted">Hãy nhờ chủ cơ sở hoặc quản lý tạo vụ trồng.</p>
          )}
        </div>
      ) : (
        <button className="primary big" onClick={onLog}>Ghi việc vừa làm</button>
      )}

      {failed > 0 && (
        <div className="card">
          <p className="msg error" role="alert">Có {failed} bản ghi cần xử lý (chưa gửi được lên máy chủ).</p>
          <button className="secondary" onClick={() => void retryFailed()}>Thử gửi lại</button>
        </div>
      )}

      {running.length > 0 && (
        <p className="muted">Đang có {running.length} vụ hoạt động.</p>
      )}

      <h2 className="sect">Việc đã ghi hôm nay</h2>
      {todayLogs.length === 0 && <p className="muted">Hôm nay chưa ghi việc nào.</p>}
      <button className="secondary" onClick={onHistory}>Xem tất cả nhật ký</button>
      {todayLogs.map((l) => {
        const c = cycles.find((x) => x.id === l.cycle_id);
        return (
          <div className="card slim" key={l.id}>
            <div className="row">
              <strong>{workTypes.find((w) => w.id === l.work_type_id)?.name ?? 'Việc'}</strong>
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
