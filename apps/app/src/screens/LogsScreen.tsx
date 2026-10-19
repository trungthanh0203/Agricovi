import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CYCLE_STATUS_LABEL_VI } from '@agriconnect/shared';
import { SyncBadge } from '../components/SyncBadge';
import { useAuth } from '../lib/auth';
import { db, type LogRow, type WorkTypeRow } from '../lib/db';
import { friendlyError } from '../lib/errors';
import { isPendingUpload, useOnline, useRecordSync } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import { canManageProduction } from '../lib/roles';
import { loadOlderLogs, voidLog } from '../lib/production';
import { EditLogScreen } from './EditLogScreen';

const PAGE = 30;
const OWN_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000; // khớp chính sách logs_update_own ở máy chủ

function summarize(wt: WorkTypeRow | undefined, data: Record<string, unknown>): string {
  if (!wt) return '';
  return wt.field_schema
    .filter((f) => data[f.key] !== undefined && data[f.key] !== '')
    .map((f) => `${f.label}: ${String(data[f.key])}`)
    .join(' · ');
}

/** Lịch sử nhật ký có lọc theo vụ / loại việc / ngày; sửa và hủy theo quyền (FR-LOG-004/005). */
export function LogsScreen({ onClose }: { onClose: () => void }) {
  const { session } = useAuth();
  const { active } = useOrgs();
  const sync = useRecordSync();
  const online = useOnline();
  const logs = useLiveQuery(() => db.logs.toArray(), [], []);
  const cycles = useLiveQuery(() => db.cycles.toArray(), [], []);
  const areas = useLiveQuery(() => db.areas.toArray(), [], []);
  const workTypes = useLiveQuery(() => db.workTypes.toArray(), [], []);
  const cropTypes = useLiveQuery(() => db.cropTypes.toArray(), [], []);

  const [cycleId, setCycleId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [showVoided, setShowVoided] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [editing, setEditing] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [loadingOld, setLoadingOld] = useState(false);

  const uid = session?.user.id;
  const manager = canManageProduction(active?.roles);

  const myCycles = useMemo(
    () => cycles.filter((c) => c.owner_org_id === active?.id || areas.find((a) => a.id === c.area_id)?.organization_id === active?.id),
    [cycles, areas, active],
  );
  const myCycleIds = useMemo(() => new Set(myCycles.map((c) => c.id)), [myCycles]);

  const cycleLabel = (id: string | null) => {
    const c = cycles.find((x) => x.id === id);
    if (!c) return '';
    return `${cropTypes.find((t) => t.id === c.crop_type_id)?.name ?? ''} · ${areas.find((a) => a.id === c.area_id)?.name ?? ''}`;
  };

  const filtered = useMemo(() => {
    const fromT = from ? new Date(`${from}T00:00:00`).getTime() : null;
    const toT = to ? new Date(`${to}T23:59:59`).getTime() : null;
    return logs
      .filter((l) => l.cycle_id && myCycleIds.has(l.cycle_id))
      .filter((l) => !cycleId || l.cycle_id === cycleId)
      .filter((l) => !typeId || l.work_type_id === typeId)
      .filter((l) => (showVoided ? true : !l.voided_at))
      .filter((l) => {
        const t = new Date(l.performed_at).getTime();
        return (fromT === null || t >= fromT) && (toT === null || t <= toT);
      })
      .sort((a, b) => b.performed_at.localeCompare(a.performed_at));
  }, [logs, myCycleIds, cycleId, typeId, from, to, showVoided]);

  const visible = filtered.slice(0, limit);

  function canEdit(l: LogRow): boolean {
    if (l.voided_at) return false;
    if (!online) return false; // sửa/hủy cần mạng (D24)
    if (isPendingUpload(sync, l.id)) return false; // chưa lên máy chủ thì chưa sửa/hủy được
    if (manager) return true;
    if (!uid || l.created_by !== uid) return false;
    const base = l.received_at ? new Date(l.received_at).getTime() : Date.now();
    return Date.now() - base < OWN_EDIT_WINDOW_MS;
  }

  async function loadMore() {
    setMsg(null);
    if (limit < filtered.length) return setLimit((n) => n + PAGE);
    const oldest = logs.map((l) => l.performed_at).sort()[0];
    if (!oldest) return;
    setLoadingOld(true);
    try {
      const n = await loadOlderLogs(oldest);
      if (n === 0) setMsg('Đã tải hết nhật ký.');
      else setLimit((x) => x + PAGE);
    } catch (e) {
      setMsg(friendlyError(e));
    } finally {
      setLoadingOld(false);
    }
  }

  async function confirmVoid(id: string) {
    if (reason.trim().length < 3) return setMsg('Hãy ghi lý do hủy (ít nhất 3 ký tự).');
    try {
      await voidLog(id, reason);
      setVoiding(null);
      setReason('');
      setMsg(null);
    } catch (e) {
      setMsg(friendlyError(e));
    }
  }

  if (editing) return <EditLogScreen logId={editing} onClose={() => setEditing(null)} />;

  return (
    <main className="auth wide">
      <div className="row">
        <h1>Nhật ký</h1>
        <button className="link" onClick={onClose}>Đóng</button>
      </div>

      <div className="filters">
        <label>
          Vụ trồng
          <select value={cycleId} onChange={(e) => { setCycleId(e.target.value); setLimit(PAGE); }}>
            <option value="">Tất cả vụ</option>
            {myCycles.map((c) => (
              <option key={c.id} value={c.id}>{cycleLabel(c.id)} ({CYCLE_STATUS_LABEL_VI[c.status]})</option>
            ))}
          </select>
        </label>
        <label>
          Loại việc
          <select value={typeId} onChange={(e) => { setTypeId(e.target.value); setLimit(PAGE); }}>
            <option value="">Tất cả loại việc</option>
            {workTypes.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </label>
        <div className="two">
          <label>Từ ngày<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>Đến ngày<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        <label className="check">
          <input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} />
          Hiện cả bản ghi đã hủy
        </label>
      </div>

      {!online && <p className="muted">Đang offline: vẫn ghi được việc mới (tự gửi khi có mạng); sửa và hủy cần có mạng.</p>}
      {msg && <p className="msg warn" role="status">{msg}</p>}
      <p className="muted">{filtered.length} bản ghi</p>
      {filtered.length === 0 && <p className="muted">Không có nhật ký nào khớp bộ lọc.</p>}

      {visible.map((l) => {
        const wt = workTypes.find((w) => w.id === l.work_type_id);
        const s = sync.get(l.id);
        return (
          <div className={l.voided_at ? 'card slim voided' : 'card slim'} key={l.id}>
            <div className="row">
              <strong>{wt?.name ?? 'Việc'}</strong>
              <span className="muted">{new Date(l.performed_at).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}</span>
            </div>
            <p className="muted">{cycleLabel(l.cycle_id)}</p>
            {summarize(wt, l.data) && <p>{summarize(wt, l.data)}</p>}
            {l.note && <p>{l.note}</p>}
            <div className="badges">
              {l.version > 1 && !l.voided_at && <span className="pill">Đã chỉnh sửa</span>}
              {l.voided_at && <span className="pill err">Đã hủy</span>}
              <SyncBadge sync={s} />
            </div>
            {l.voided_at && l.void_reason && <p className="muted">Lý do hủy: {l.void_reason}</p>}

            {canEdit(l) && voiding !== l.id && (
              <div className="actions">
                <button className="secondary" onClick={() => setEditing(l.id)}>Sửa</button>
                <button className="secondary" onClick={() => { setVoiding(l.id); setReason(''); setMsg(null); }}>Hủy bản ghi</button>
              </div>
            )}
            {voiding === l.id && (
              <div className="inline-form">
                <label>
                  Lý do hủy
                  <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ví dụ: ghi nhầm vụ" />
                </label>
                <p className="muted">Bản ghi không bị xóa, chỉ được đánh dấu đã hủy và không khôi phục được.</p>
                <div className="actions">
                  <button className="secondary" onClick={() => void confirmVoid(l.id)}>Xác nhận hủy</button>
                  <button className="link" onClick={() => setVoiding(null)}>Không hủy</button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {filtered.length > 0 && (
        <button className="secondary" disabled={loadingOld} onClick={() => void loadMore()}>
          {limit < filtered.length ? 'Xem thêm' : loadingOld ? 'Đang tải…' : 'Tải nhật ký cũ hơn từ máy chủ'}
        </button>
      )}
    </main>
  );
}
