import { useEffect, useMemo, useState } from 'react';
import { useCatalog } from '../lib/catalog';
import { useLiveQuery } from 'dexie-react-hooks';
import { CYCLE_STATUS_LABEL_VI, type CycleStatus } from '@agriconnect/shared';
import { HarvestSection } from '../components/HarvestSection';
import { pickSection, SubTabs } from '../components/SubTabs';
import { db } from '../lib/db';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import { canManageProduction } from '../lib/roles';
import { fetchQuotaContexts, setCycleStatus, type QuotaContext } from '../lib/production';
import { productionSections, type ProductionSection, type TabId } from '../lib/tabs';
import { StockPanel } from './StockPanel';

interface Props {
  section?: string;
  onSection: (s: ProductionSection) => void;
  onCreateCycle: () => void;
  onLog: () => void;
  onHistory: () => void;
  onGo: (tab: TabId, section?: string) => void;
}

/** Tab Sản xuất: Mùa vụ (trạng thái các vụ, ghi việc), Thu hoạch, Kho. Khu trồng và danh mục nằm ở tab Khai báo. */
export function ProductionTab({ section, onSection, onCreateCycle, onLog, onHistory, onGo }: Props) {
  const { active } = useOrgs();
  const items = productionSections(active);
  const current = pickSection(items, section);

  return (
    <section>
      <h1>Sản xuất</h1>
      <SubTabs items={items} value={current ?? 'cycles'} onChange={onSection} label="Mục sản xuất" />
      {current === 'harvest' ? (
        <HarvestSection />
      ) : current === 'stock' ? (
        <StockPanel />
      ) : (
        <CyclesPanel onCreateCycle={onCreateCycle} onLog={onLog} onHistory={onHistory} onGo={onGo} />
      )}
    </section>
  );
}

function CyclesPanel({ onCreateCycle, onLog, onHistory, onGo }: Pick<Props, 'onCreateCycle' | 'onLog' | 'onHistory' | 'onGo'>) {
  const { active } = useOrgs();
  const online = useOnline();
  const [actionError, setActionError] = useState<string | null>(null);
  const areas = useLiveQuery(() => db.areas.toArray(), [], []);
  const cycles = useLiveQuery(() => db.cycles.toArray(), [], []);
  const { cropTypes } = useCatalog();
  const [contexts, setContexts] = useState<QuotaContext[]>([]);

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
  const hasAreas = areas.some((a) => a.organization_id === active.id);
  const ownerLabel = (ownerId: string) => {
    if (ownerId === active.id) return null;
    return contexts.find((c) => c.org_id === ownerId)?.org_name ?? 'Vụ ghi theo HTX';
  };

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
    <>
      <div className="pair">
        <button className="primary" onClick={onLog} disabled={!myCycles.some((c) => c.status === 'active')}>Ghi việc vừa làm</button>
        <button className="secondary" onClick={onHistory}>Lịch sử nhật ký</button>
      </div>
      {myCycles.length === 0 && <p className="muted">Tạo vụ trồng trước để bắt đầu ghi nhật ký.</p>}
      {myCycles.length > 0 && !myCycles.some((c) => c.status === 'active') && (
        <p className="muted">Chỉ vụ đang sản xuất mới ghi việc được. Hãy bấm "Bắt đầu sản xuất" hoặc "Tiếp tục" ở vụ bên dưới.</p>
      )}

      {!online && canManage && <p className="msg warn" role="status">Đang offline: tạo vụ và đổi trạng thái cần có mạng.</p>}
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
      {canManage && !hasAreas && (
        <div className="card">
          <p>Chưa có khu trồng nên chưa tạo được vụ.</p>
          <button className="secondary" onClick={() => onGo('declare', 'areas')}>Thêm khu trồng ở tab Khai báo</button>
        </div>
      )}
      {canManage && hasAreas && (
        <button className="secondary" onClick={onCreateCycle} disabled={!online}>+ Tạo vụ mới</button>
      )}
    </>
  );
}
