import { useEffect, useMemo, useState } from 'react';
import { useCatalog } from '../lib/catalog';
import { CYCLE_STATUS_LABEL_VI, type CycleStatus } from '@agriconnect/shared';
import { StockPanel } from './StockPanel';
import { LogsScreen } from './LogsScreen';
import { AttendanceSection } from '../components/AttendanceSection';
import { ExpenseSection } from '../components/ExpenseSection';
import { HarvestSection } from '../components/HarvestSection';
import { pickSection, SubTabs } from '../components/SubTabs';
import { HelpButton } from '../components/HelpButton';
import { friendlyError } from '../lib/errors';
import { todayLocal, useOnline } from '../lib/hooks';
import { cycleProgress, cycleTitle } from '../lib/cycles';
import { cycleCode } from '../lib/qr';
import { CycleQr } from '../components/CycleQr';
import { CycleStatsStrip } from '../components/CycleStatsStrip';
import { CycleInfoFields, cropInfoToForm, formToCropInfo, type CropInfoForm } from '../components/CycleInfoFields';
import { fmtArea, getAreaUnit } from '../lib/areaUnits';
import { cachedCycleStats, fetchCycleStats, type CycleStats } from '../lib/cycleStats';
import { hasAnyStat } from '../lib/cycleStatsLogic';
import { PublishCycle } from '../components/PublishCycle';
import { fmtDate } from '../lib/dates';
import { useOrgs } from '../lib/orgs';
import { canManageProduction, isOwner } from '../lib/roles';
import { deleteCycle, editCycle, fetchQuotaContexts, setCycleInfo, setCyclePlan, setCycleStatus, type CropInfo, type QuotaContext } from '../lib/production';
import type { CycleRow } from '../lib/db';
import { cycleCountUnit } from '../lib/countUnit';
import { CycleWord } from '../components/CycleWord';
import { infoLabels } from '../lib/terms';
import { productionSections, type ProductionSection, type TabId } from '../lib/tabs';
import { useTable } from '../lib/tables';
import { prepLoggable, predecessorOf } from '../lib/prep';
import { areaPath } from '../lib/areas';

interface Props {
  section?: string;
  onSection: (s: ProductionSection) => void;
  onCreateCycle: () => void;
  onOpenCycle: (id: string, opts?: { calendar?: boolean; notice?: string }) => void;
  /** Nhân bản một bản ghi việc: mở Ghi việc điền sẵn nội dung, chỉ cần chọn lại ngày */
  onClone?: (logId: string) => void;
  onLogFor: (cycleId: string | null) => void;
  onLog: () => void;
  onHistory: () => void;
  onGo: (tab: TabId, section?: string) => void;
}

/** Tab Sản xuất: Mùa vụ (trạng thái các vụ, ghi việc), Thu hoạch, Kho. Phân khu và danh mục nằm ở tab Khai báo. */
export function ProductionTab({ section, onSection, onCreateCycle, onOpenCycle, onLogFor, onLog, onHistory, onGo, onClone }: Props) {
  const { active } = useOrgs();
  const items = productionSections(active);
  const current = pickSection(items, section);

  return (
    <section>
      <div className="row"><h1 className="grow">Sản xuất</h1>{current === null && <HelpButton topic="tab-production" />}</div>
      <SubTabs items={items} value={current} onChange={(id) => (id === 'log' ? onLog() : onSection(id))} onBack={() => onSection('' as ProductionSection)} label="Sản xuất" />
      {current === 'harvest' ? (
        <HarvestSection />
      ) : current === 'stock' ? (
        <StockPanel />
      ) : current === 'expense' ? (
        <ExpenseSection />
      ) : current === 'attendance' ? (
        <AttendanceSection onOpenCycle={onOpenCycle} onLogFor={onLogFor} />
      ) : current === 'logs' ? (
        <LogsScreen embedded onClose={() => onSection('' as ProductionSection)} onClone={onClone} />
      ) : current === 'cycles' ? (
        <CyclesPanel onCreateCycle={onCreateCycle} onOpenCycle={(id) => onOpenCycle(id)} onLog={onLog} onHistory={onHistory} onGo={onGo} />
      ) : null}
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
function CycleEditForm({ cycle, busy, defaultUnit, kind, onSave, onClose }: {
  cycle: CycleRow; busy: boolean; defaultUnit: string; kind?: 'crop' | 'livestock' | 'aquatic' | 'other';
  onSave: (v: { name: string; start_date: string | null; note: string; targetYield: number | null; budget: number | null; info: CropInfo }) => Promise<void>; onClose: () => void;
}) {
  const [name, setName] = useState(cycle.name ?? '');
  const [start, setStart] = useState(cycle.start_date ?? '');
  const [note, setNote] = useState(cycle.note ?? '');
  const [target, setTarget] = useState(cycle.target_yield_kg != null ? String(cycle.target_yield_kg) : '');
  const [budget, setBudget] = useState(cycle.budget_amount != null ? String(cycle.budget_amount) : '');
  const [info, setInfo] = useState<CropInfoForm>(() => cropInfoToForm(cycle));
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <div className="inline-form">
      <label>Tên vụ<input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></label>
      <label>Ngày bắt đầu<input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
      <label>Ghi chú<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <CycleInfoFields value={info} onChange={setInfo} defaultUnit={defaultUnit} kind={kind} />
      <div className="pair">
        <label>Sản lượng dự kiến (kg)<input value={target} inputMode="numeric" onChange={(e) => setTarget(e.target.value)} placeholder="Không bắt buộc" /></label>
        <label>Ngân sách dự kiến (đồng)<input value={budget} inputMode="numeric" onChange={(e) => setBudget(e.target.value)} placeholder="Không bắt buộc" /></label>
      </div>
      {err && <p className="msg error" role="alert">{err}</p>}
      <div className="btnrow">
        <button className="primary" disabled={busy || saving} onClick={() => {
          setSaving(true);
          setErr(null);
          const num = (v: string) => (v.trim() ? Number(v.replace(/[.,\s]/g, '')) : null);
          const t = num(target), b = num(budget);
          if ((t !== null && Number.isNaN(t)) || (b !== null && Number.isNaN(b))) { setSaving(false); return setErr('Sản lượng và ngân sách dự kiến phải là số.'); }
          const ci = formToCropInfo(info);
          if ('error' in ci) { setSaving(false); return setErr(ci.error); }
          onSave({ name, start_date: start || null, note, targetYield: t, budget: b, info: ci.info }).catch((e) => setErr(friendlyError(e))).finally(() => setSaving(false));
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
  const areas = useTable('areas');
  const cycles = useTable('cycles');
  const allStages = useTable('stages');
  const today = todayLocal();
  const { cropTypes } = useCatalog();
  const [contexts, setContexts] = useState<QuotaContext[]>([]);
  const [group, setGroup] = useState<CycleGroup | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [qrId, setQrId] = useState<string | null>(null);
  const [pubId, setPubId] = useState<string | null>(null);
  const [stats, setStats] = useState<CycleStats | null>(() => (active ? cachedCycleStats(active.id) : null));

  const canManage = canManageProduction(active?.roles);

  // Mức dùng hạn mức (cần mạng); offline thì bỏ qua
  useEffect(() => {
    if (!active || active.type !== 'household' || !navigator.onLine || !canManage) return;
    fetchQuotaContexts(active.id).then(setContexts).catch(() => setContexts([]));
  }, [active, canManage]);

  // số liệu tóm tắt của các vụ (máy chủ tính, theo quyền); mất mạng thì dùng bản đã lưu
  const cyclesKey = cycles.map((c) => `${c.id}:${c.version}:${c.status}`).join(',');
  useEffect(() => {
    if (!active) return;
    setStats(cachedCycleStats(active.id));
    if (!navigator.onLine) return;
    let alive = true;
    fetchCycleStats(active.id).then((s) => { if (alive) setStats(s); }).catch(() => undefined);
    return () => { alive = false; };
  }, [active?.id, cyclesKey, online]); // eslint-disable-line react-hooks/exhaustive-deps

  const statById = useMemo(() => new Map((stats?.cycles ?? []).map((s) => [s.cycle_id, s])), [stats]);
  const areaById = useMemo(() => new Map(areas.map((a) => [a.id, a])), [areas]);
  const cropName = (id: string) => cropTypes.find((c) => c.id === id)?.name ?? '—';

  if (!active) return null;

  // Vụ của cơ sở đang chọn: do cơ sở sở hữu, hoặc diễn ra trên phân khu của cơ sở
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
    if (!window.confirm(`Xóa vụ "${cycleTitle(c, cropName(c.crop_type_id))}" cùng các việc và ghi chú? Không khôi phục được. Vụ đã có nhật ký, thu hoạch, chi phí… thì không xóa được, hãy chọn Kết thúc vụ.`)) return;
    setActionError(null);
    try { await deleteCycle(c.id); } catch (err) { setActionError(friendlyError(err)); }
  }

  return (
    <>
      {myCycles.length === 0 && <p className="muted">Tạo vụ trước để bắt đầu ghi nhật ký.</p>}
      {myCycles.length > 0 && !myCycles.some((c) => c.status === 'active') && (
        <p className="muted">Chỉ vụ đang sản xuất mới ghi việc được. Hãy bấm "Bắt đầu sản xuất" hoặc "Tiếp tục" ở vụ bên dưới.</p>
      )}

      {!online && canManage && <p className="msg warn" role="status">Đang offline: tạo vụ và đổi trạng thái cần có mạng.</p>}
      {actionError && <p className="msg error" role="alert">{actionError}</p>}
      <div className="sect-row">
        <h2 className="sect"><CycleWord cap /> ({myCycles.length})</h2>
        {canManage && hasAreas && <button className="chip add" onClick={onCreateCycle} disabled={!online}>+ Tạo vụ mới</button>}
      </div>
      {myCycles.length === 0 && <p className="muted">Chưa có vụ nào.</p>}
      {(myCycles.length > 0 || (canManage && hasAreas)) && (
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
              <strong>{cycleTitle(c, cropName(c.crop_type_id))} - <span className="mono-code">{cycleCode(c.id)}</span></strong>
              <span className="pill">{CYCLE_STATUS_LABEL_VI[c.status]}{prepLoggable(c) ? ' · chuẩn bị trước' : ''}</span>
            </div>
            {(() => {
              const pre = c.status === 'preparing' ? predecessorOf(c, cycles) : null;
              if (!pre) return null;
              const label = cycleTitle(pre.pred, cropName(pre.pred.crop_type_id));
              return pre.ended
                ? <p className="msg ok" role="status">Vụ trước ({label}) đã kết thúc. Bấm "Bắt đầu sản xuất" để chuyển vụ này sang sản xuất.</p>
                : <p className="muted">Nối tiếp sau vụ {label} (đang {CYCLE_STATUS_LABEL_VI[pre.pred.status].toLowerCase()}).</p>;
            })()}
            <p className="muted">
              Khu: {areaPath(c.area_id, areas) || '—'}
              {c.start_date && ` · Bắt đầu ${new Date(c.start_date).toLocaleDateString('vi-VN')}`}
            </p>
            {c.name && <p className="muted">Sản phẩm: {cropName(c.crop_type_id)}</p>}
            {(c.planted_area_m2 || c.variety_name || c.plant_count) && (
              <p className="muted">{[c.planted_area_m2 ? `Diện tích ${fmtArea(c.planted_area_m2, getAreaUnit())}` : '', c.plant_count ? `${c.plant_count.toLocaleString('vi-VN')} cây` : '', c.variety_name ? `Giống: ${c.variety_name}` : ''].filter(Boolean).join(' · ')}</p>
            )}
            {owner && <p className="muted">Ghi theo: {owner}</p>}
            {prog.total > 0 && (
              <>
                <div className="progress" role="progressbar" aria-valuenow={prog.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Tiến độ vụ"><i style={{ width: `${prog.percent}%` }} /></div>
                <p className="muted">
                  {prog.done}/{prog.total} việc
                  {prog.current ? ` · Hiện tại: ${prog.current.name} (${fmtDate(prog.current.planned_start)} – ${fmtDate(prog.current.planned_end)})` : ' · Đã hoàn tất'}
                  {c.status === 'active' && prog.delay > 0 && <span className="pill warn"> Trễ {prog.delay} ngày</span>}
                </p>
              </>
            )}
            {hasAnyStat(statById.get(c.id)) && <CycleStatsStrip s={statById.get(c.id)!} countUnit={cycleCountUnit(c, cropTypes)} areaLabel={infoLabels(cropTypes.find((t) => t.id === c.crop_type_id)?.kind).area} />}
            <div className="actions">
              <button className="secondary" onClick={() => onOpenCycle(c.id)}>Quản lý vụ</button>
              <button className="secondary" aria-expanded={qrId === c.id} onClick={() => setQrId(qrId === c.id ? null : c.id)}>{qrId === c.id ? 'Ẩn mã QR' : 'Mã QR của vụ'}</button>
              {isOwner(active.roles) && c.owner_org_id === active.id && !active.simple && (
                <button className="secondary" aria-expanded={pubId === c.id} onClick={() => setPubId(pubId === c.id ? null : c.id)}>{pubId === c.id ? 'Ẩn mục công khai' : '🌐 Mở công khai website'}</button>
              )}
            </div>
            {pubId === c.id && <PublishCycle cycleId={c.id} />}
            {qrId === c.id && <CycleQr cycleId={c.id} label={cycleTitle(c, cropName(c.crop_type_id))} />}
            {editId === c.id && (
              <CycleEditForm cycle={c} busy={!online} defaultUnit={cycleCountUnit({ crop_type_id: c.crop_type_id, count_unit: null }, cropTypes)} kind={cropTypes.find((t) => t.id === c.crop_type_id)?.kind} onClose={() => setEditId(null)}
                onSave={async (v) => {
                  await editCycle(c.id, { name: v.name, start_date: v.start_date, note: v.note });
                  if (v.targetYield !== (c.target_yield_kg ?? null) || v.budget !== (c.budget_amount ?? null)) await setCyclePlan(c.id, v.targetYield, v.budget);
                  await setCycleInfo(c.id, v.info);
                  setEditId(null);
                }} />
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
          <p>Chưa có phân khu nên chưa tạo được vụ.</p>
          <button className="secondary" onClick={() => onGo('declare', 'areas')}>Thêm phân khu ở tab Khai báo</button>
        </div>
      )}
    </>
  );
}
