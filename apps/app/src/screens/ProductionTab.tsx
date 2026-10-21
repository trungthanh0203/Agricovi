import { useEffect, useMemo, useState } from 'react';
import { useCatalog } from '../lib/catalog';
import { useLiveQuery } from 'dexie-react-hooks';
import { CYCLE_STATUS_LABEL_VI, type CycleStatus } from '@agriconnect/shared';
import { StockPanel } from './StockPanel';
import { AttendanceSection } from '../components/AttendanceSection';
import { HarvestSection } from '../components/HarvestSection';
import { pickSection, SubTabs } from '../components/SubTabs';
import { db } from '../lib/db';
import { friendlyError } from '../lib/errors';
import { todayLocal, useOnline } from '../lib/hooks';
import { cycleProgress } from '../lib/cycles';
import { fmtDate } from '../lib/dates';
import { useOrgs } from '../lib/orgs';
import { canManageProduction } from '../lib/roles';
import { deleteCycle, editCycle, fetchQuotaContexts, setCycleStatus, type QuotaContext } from '../lib/production';
import type { CycleRow } from '../lib/db';
import { productionSections, type ProductionSection, type TabId } from '../lib/tabs';

interface Props {
  section?: string;
  onSection: (s: ProductionSection) => void;
  onCreateCycle: () => void;
  onOpenCycle: (id: string) => void;
  onLog: () => void;
  onHistory: () => void;
  onGo: (tab: TabId, section?: string) => void;
}

/** Tab Sản xuất: Mùa vụ (trạng thái các vụ, ghi việc), Thu hoạch, Kho. Trang trại và danh mục nằm ở tab Khai báo. */
export function ProductionTab({ section, onSection, onCreateCycle, onOpenCycle, onLog, onHistory, onGo }: Props) {
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
      ) : current === 'attendance' ? (
        <AttendanceSection />
      ) : (
        <CyclesPanel onCreateCycle={onCreateCycle} onOpenCycle={onOpenCycle} onLog={onLog} onHistory={onHistory} onGo={onGo} />
      )}
    </section>
  );
}

type CycleGroup = 'active' | 'preparing' | 'paused' | 'ended';
const GROUPS: { id: CycleGroup; label: string; statuses: CycleStatus[] }[] = [
  { id: 'active', label: 'Đang sản xuất', statuses: ['active'] },
  { id: 'preparing', label: 'Chuẩn bị', statuses: ['preparing'] },
  { id: 'paused', label: 'Tạm dừng', statuses: ['paused'] },
  { id: 'ended', label: 'Kết thúc', statuses: ['ended', 'cancelled'] },
];

/** Sửa nhanh thông tin vụ: tên, ngày bắt đầu, ghi chú */
function CycleEditForm({ cycle, busy, onSave, onClose }: {
  cycle: CycleRow; busy: boolean;
  onSave: (v: { name: string; start_date: string | null; note: string }) => Promise<void>; onClose: () => void;
}) {
  const [name, setName] = useState(cycle.name ?? '');
  const [start, setStart] = useState(cycle.start_date ?? '');
  const [note, setNote] = useState(cycle.note ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <div className="inline-form">
      <label>Tên vụ<input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></label>
      <label>Ngày bắt đầu<input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
      <label>Ghi chú<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
      {err && <p className="msg error" role="alert">{err}</p>}
      <div className="btnrow">
        <button className="primary" disabled={busy || saving} onClick={() => {
          setSaving(true);
          setErr(null);
          onSave({ name, start_date: start || null, note }).catch((e) => setErr(friendlyError(e))).finally(() => setSaving(false));
        }}>Lưu thay đổi</button>
        <button type="button" className="secondary" onClick={onClose}>Hủy</button>
      </div>
    </div>
  );
}

function CyclesPanel({ onCreateCycle, onOpenCycle, onLog, onHistory, onGo }: Pick<Props, 'onCreateCycle' | 'onOpenCycle' | 'onLog' | 'onHistory' | 'onGo'>) {
  const { active } = useOrgs();
  const online = useOnline();
  const [actionError, setActionError] = useState<string | null>(null);
  const areas = useLiveQuery(() => db.areas.toArray(), [], []);
  const cycles = useLiveQuery(() => db.cycles.toArray(), [], []);
  const allStages = useLiveQuery(() => db.stages.toArray(), [], []);
  const today = todayLocal();
  const { cropTypes } = useCatalog();
  const [contexts, setContexts] = useState<QuotaContext[]>([]);
  const [group, setGroup] = useState<CycleGroup | null>(null);
  const [editId, setEditId] = useState<string | null>(null);

  const canManage = canManageProduction(active?.roles);

  // Mức dùng hạn mức (cần mạng); offline thì bỏ qua
  useEffect(() => {
    if (!active || active.type !== 'household' || !navigator.onLine || !canManage) return;
    fetchQuotaContexts(active.id).then(setContexts).catch(() => setContexts([]));
  }, [active, canManage]);

  const areaById = useMemo(() => new Map(areas.map((a) => [a.id, a])), [areas]);
  const cropName = (id: string) => cropTypes.find((c) => c.id === id)?.name ?? '—';

  if (!active) return null;

  // Vụ của cơ sở đang chọn: do cơ sở sở hữu, hoặc diễn ra trên trang trại của cơ sở
  const myCycles = cycles
    .filter((c) => c.owner_org_id === active.id || areaById.get(c.area_id)?.organization_id === active.id)
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  const hasAreas = areas.some((a) => a.organization_id === active.id);
  const inGroup = (g: CycleGroup) => myCycles.filter((c) => GROUPS.find((x) => x.id === g)!.statuses.includes(c.status));
  // mặc định mở nhóm đầu tiên có vụ (Đang sản xuất trước)
  const curGroup: CycleGroup = group ?? GROUPS.find((g) => inGroup(g.id).length > 0)?.id ?? 'active';
  const shown = inGroup(curGroup);
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

  async function remove(c: CycleRow) {
    if (!window.confirm(`Xóa vụ "${c.name || cropName(c.crop_type_id)}" cùng các giai đoạn và ghi chú? Không khôi phục được. Vụ đã có nhật ký, thu hoạch, chi phí… thì không xóa được, hãy chọn Kết thúc vụ.`)) return;
    setActionError(null);
    try { await deleteCycle(c.id); } catch (err) { setActionError(friendlyError(err)); }
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
      {myCycles.length > 0 && (
        <div className="chips" role="tablist" aria-label="Nhóm vụ theo trạng thái">
          {GROUPS.map((g) => (
            <button key={g.id} role="tab" aria-selected={curGroup === g.id} className={curGroup === g.id ? 'chip active' : 'chip'} onClick={() => { setGroup(g.id); setEditId(null); }}>
              {g.label} ({inGroup(g.id).length})
            </button>
          ))}
        </div>
      )}
      {myCycles.length > 0 && shown.length === 0 && <p className="muted">Không có vụ nào ở nhóm này.</p>}
      {shown.map((c) => {
        const owner = ownerLabel(c.owner_org_id);
        const prog = cycleProgress(allStages.filter((s) => s.cycle_id === c.id), today);
        return (
          <div className="card slim" key={c.id}>
            <div className="row">
              <strong>{c.name || cropName(c.crop_type_id)}</strong>
              <span className="pill">{CYCLE_STATUS_LABEL_VI[c.status]}</span>
            </div>
            <p className="muted">
              Trang trại: {areaById.get(c.area_id)?.name ?? '—'}
              {c.start_date && ` · Bắt đầu ${new Date(c.start_date).toLocaleDateString('vi-VN')}`}
            </p>
            {c.name && <p className="muted">Sản phẩm: {cropName(c.crop_type_id)}</p>}
            {owner && <p className="muted">Ghi theo: {owner}</p>}
            {prog.total > 0 && (
              <>
                <div className="progress" role="progressbar" aria-valuenow={prog.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Tiến độ vụ"><i style={{ width: `${prog.percent}%` }} /></div>
                <p className="muted">
                  {prog.done}/{prog.total} giai đoạn
                  {prog.current ? ` · Hiện tại: ${prog.current.name} (${fmtDate(prog.current.planned_start)} – ${fmtDate(prog.current.planned_end)})` : ' · Đã hoàn tất'}
                  {c.status === 'active' && prog.delay > 0 && <span className="pill warn"> Trễ {prog.delay} ngày</span>}
                </p>
              </>
            )}
            <div className="actions"><button className="secondary" onClick={() => onOpenCycle(c.id)}>Xem quy trình &amp; lịch</button></div>
            {editId === c.id && (
              <CycleEditForm cycle={c} busy={!online} onClose={() => setEditId(null)}
                onSave={async (v) => { await editCycle(c.id, v); setEditId(null); }} />
            )}
            {canManage && (
              <div className="actions">
                {c.status === 'preparing' && <button className="secondary" disabled={!online} onClick={() => void change(c.id, 'active')}>Bắt đầu sản xuất</button>}
                {c.status === 'active' && <button className="secondary" disabled={!online} onClick={() => void change(c.id, 'paused')}>Tạm dừng</button>}
                {c.status === 'paused' && <button className="secondary" disabled={!online} onClick={() => void change(c.id, 'active')}>Tiếp tục</button>}
                <button className="secondary" disabled={!online} onClick={() => setEditId(editId === c.id ? null : c.id)}>Sửa vụ</button>
                <button className="secondary" disabled={!online} onClick={() => void remove(c)}>Xóa vụ</button>
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
          <p>Chưa có trang trại nên chưa tạo được vụ.</p>
          <button className="secondary" onClick={() => onGo('declare', 'areas')}>Thêm trang trại ở tab Khai báo</button>
        </div>
      )}
      {canManage && hasAreas && (
        <button className="secondary" onClick={onCreateCycle} disabled={!online}>+ Tạo vụ mới</button>
      )}
    </>
  );
}
