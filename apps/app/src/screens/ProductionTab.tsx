import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CYCLE_STATUS_LABEL_VI, type CycleStatus } from '@agriconnect/shared';
import { Collapsible } from '../components/Collapsible';
import { db } from '../lib/db';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import { canManageProduction } from '../lib/roles';
import { createArea, fetchQuotaContexts, setCycleStatus, type QuotaContext } from '../lib/production';

interface Props {
  onCreateCycle: () => void;
  onLog: () => void;
  onHistory: () => void;
}

export function ProductionTab({ onCreateCycle, onLog, onHistory }: Props) {
  const { active } = useOrgs();
  const online = useOnline();
  const [actionError, setActionError] = useState<string | null>(null);
  const areas = useLiveQuery(() => db.areas.toArray(), [], []);
  const cycles = useLiveQuery(() => db.cycles.toArray(), [], []);
  const cropTypes = useLiveQuery(() => db.cropTypes.toArray(), [], []);
  const [contexts, setContexts] = useState<QuotaContext[]>([]);
  const [areaName, setAreaName] = useState('');
  const [areaError, setAreaError] = useState<string | null>(null);

  const canManage = canManageProduction(active?.roles);

  // Mức dùng hạn mức (cần mạng); offline thì bỏ qua
  useEffect(() => {
    if (!active || active.type !== 'household' || !navigator.onLine || !canManage) return;
    fetchQuotaContexts(active.id).then(setContexts).catch(() => setContexts([]));
  }, [active, canManage]);

  const areaById = useMemo(() => new Map(areas.map((a) => [a.id, a])), [areas]);
  const cropName = (id: string) => cropTypes.find((c) => c.id === id)?.name ?? '—';

  if (!active) return null;

  // Vụ của cơ sở đang chọn: do cơ sở sở hữu, hoặc diễn ra trên khu trồng của cơ sở
  const myCycles = cycles
    .filter((c) => c.owner_org_id === active.id || areaById.get(c.area_id)?.organization_id === active.id)
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  const myAreas = areas.filter((a) => a.organization_id === active.id);
  const ownerLabel = (ownerId: string) => {
    if (ownerId === active.id) return null;
    return contexts.find((c) => c.org_id === ownerId)?.org_name ?? 'Vụ ghi theo HTX';
  };

  async function onAddArea(e: FormEvent) {
    e.preventDefault();
    if (areaName.trim().length < 1) return setAreaError('Hãy nhập tên khu trồng.');
    setAreaError(null);
    try {
      await createArea(active!.id, areaName);
      setAreaName('');
    } catch (err) {
      setAreaError(friendlyError(err));
    }
  }

  async function change(id: string, status: CycleStatus, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setActionError(null);
    try {
      await setCycleStatus(id, status);
    } catch (err) {
      setActionError(friendlyError(err));
    }
  }

  return (
    <section>
      <h1>Sản xuất</h1>

      <div className="pair">
        <button className="primary" onClick={onLog} disabled={!myCycles.some((c) => c.status === 'active')}>Ghi việc vừa làm</button>
        <button className="secondary" onClick={onHistory}>Lịch sử nhật ký</button>
      </div>
      {myCycles.length === 0 && <p className="muted">Tạo vụ trồng trước để bắt đầu ghi nhật ký.</p>}
      {myCycles.length > 0 && !myCycles.some((c) => c.status === 'active') && (
        <p className="muted">Chỉ vụ đang sản xuất mới ghi việc được. Hãy bấm "Bắt đầu sản xuất" hoặc "Tiếp tục" ở vụ bên dưới.</p>
      )}

      {!online && canManage && <p className="msg warn" role="status">Đang offline: tạo vụ, đổi trạng thái và thêm khu trồng cần có mạng.</p>}
      {actionError && <p className="msg error" role="alert">{actionError}</p>}
      <h2 className="sect">Vụ trồng ({myCycles.length})</h2>
      {myCycles.length === 0 && <p className="muted">Chưa có vụ trồng nào.</p>}
      {myCycles.map((c) => {
        const owner = ownerLabel(c.owner_org_id);
        return (
          <div className="card slim" key={c.id}>
            <div className="row">
              <strong>{cropName(c.crop_type_id)}</strong>
              <span className="pill">{CYCLE_STATUS_LABEL_VI[c.status]}</span>
            </div>
            <p className="muted">
              Khu trồng: {areaById.get(c.area_id)?.name ?? '—'}
              {c.start_date && ` · Bắt đầu ${new Date(c.start_date).toLocaleDateString('vi-VN')}`}
            </p>
            {owner && <p className="muted">Ghi theo: {owner}</p>}
            {canManage && (
              <div className="actions">
                {c.status === 'preparing' && <button className="secondary" disabled={!online} onClick={() => void change(c.id, 'active')}>Bắt đầu sản xuất</button>}
                {c.status === 'active' && <button className="secondary" disabled={!online} onClick={() => void change(c.id, 'paused')}>Tạm dừng</button>}
                {c.status === 'paused' && <button className="secondary" disabled={!online} onClick={() => void change(c.id, 'active')}>Tiếp tục</button>}
                {(c.status === 'active' || c.status === 'paused') && (
                  <button className="secondary" disabled={!online} onClick={() => void change(c.id, 'ended', 'Kết thúc vụ này? Nhật ký và số liệu vẫn được giữ lại.')}>
                    Kết thúc vụ
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
      {canManage && (
        <button className="secondary" onClick={onCreateCycle} disabled={!online}>+ Tạo vụ mới</button>
      )}

      <Collapsible title="Khu trồng" warn={myAreas.length === 0 && canManage}
        summary={myAreas.length > 0 ? `${myAreas.length} khu` : canManage ? 'Chưa có — hãy thêm trước khi tạo vụ' : 'Chưa có'}>
      {myAreas.map((a) => (
        <div className="card slim" key={a.id}>
          <div className="row">
            <span>{a.name}</span>
          </div>
        </div>
      ))}
      {canManage && (
        <Collapsible inline title="＋ Thêm khu trồng">
          <form onSubmit={onAddArea} className="inline-form">
            <label>
              Tên khu trồng
              <input value={areaName} onChange={(e) => setAreaName(e.target.value)} placeholder="Ví dụ: Nhà màng số 1" />
            </label>
            {areaError && <p className="msg error" role="alert">{areaError}</p>}
            <button type="submit" className="secondary" disabled={!online}>Thêm khu trồng</button>
          </form>
        </Collapsible>
      )}
      </Collapsible>
    </section>
  );
}
