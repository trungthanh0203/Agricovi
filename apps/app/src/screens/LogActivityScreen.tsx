import { useMemo, useState, type FormEvent } from 'react';
import { useCatalog } from '../lib/catalog';
import { useLiveQuery } from 'dexie-react-hooks';
import { CYCLE_STATUS_LABEL_VI, SYNC_STATE_LABEL_VI } from '@agriconnect/shared';
import { SyncBadge } from '../components/SyncBadge';
import { db } from '../lib/db';
import { DynamicField } from '../components/DynamicField';
import { fieldsToData, initialValues, validateFields } from '../lib/fieldsLogic';
import { toLocalInput, useRecordSync } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { formatQty, parseNumber } from '../lib/inventory';
import { useOrgs } from '../lib/orgs';
import { logActivity } from '../lib/production';
import { hasRole } from '../lib/roles';
import { useTable } from '../lib/tables';
import { VoiceNote } from '../components/VoiceNote';
import { LotPicker } from '../components/LotPicker';
import { CycleWord } from '../components/CycleWord';

const LAST_CYCLE_KEY = 'agriconnect.lastCycle';
const LAST_LOCATION_KEY = 'agriconnect.lastLocation'; // dùng chung với màn nhập kho

/** Luồng "Ghi việc vừa làm" (v1.1 mục 3.4): chọn loại việc -> xác nhận vụ -> lưu. Dùng được offline. */
export function LogActivityScreen({ onClose, preset }: { onClose: () => void; preset?: { cycleId: string; workTypeId?: string | null; stageId?: string | null } | null }) {
  const { session } = useAuth();
  const { active } = useOrgs();
  const sync = useRecordSync();
  // loại việc dùng chung hoặc của cơ sở đang chọn, đã áp bản chỉnh; việc đã dừng không chọn được cho việc mới
  const { workTypes: effWorkTypes, cropTypes } = useCatalog();
  // chức vụ có thể giới hạn loại việc được ghi (D44); máy chủ cũng ép lại
  const workTypes = effWorkTypes.filter((w) => w.is_active && (!active?.allowedWorkTypes || active.allowedWorkTypes.includes(w.id)));
  const cycles = useTable('cycles');
  const areas = useTable('areas');

  const areaName = (id: string) => areas.find((a) => a.id === id)?.name ?? '—';
  const cropName = (id: string) => cropTypes.find((c) => c.id === id)?.name ?? '—';

  const options = useMemo(
    () =>
      cycles.filter(
        (c) =>
          (c.owner_org_id === active?.id || areas.find((a) => a.id === c.area_id)?.organization_id === active?.id) &&
          c.status === 'active', // chỉ vụ ĐANG SẢN XUẤT; chuẩn bị/tạm dừng thì chưa ghi việc được
      ),
    [cycles, areas, active],
  );
  const notStarted = cycles.filter(
    (c) =>
      (c.owner_org_id === active?.id || areas.find((a) => a.id === c.area_id)?.organization_id === active?.id) &&
      (c.status === 'preparing' || c.status === 'paused'),
  );

  const remembered = (() => {
    try { return localStorage.getItem(LAST_CYCLE_KEY); } catch { return null; }
  })();
  const [cycleId, setCycleId] = useState<string>(preset?.cycleId ?? '');
  const effectiveCycleId = cycleId || (options.find((c) => c.id === remembered)?.id ?? options[0]?.id ?? '');
  const cycle = options.find((c) => c.id === effectiveCycleId) ?? null;

  // Ghi cho khu vực không gắn vụ (cổng, kho, biogas, hố sát trùng...): mọi khu đang dùng của cơ sở
  const siteAreas = areas.filter((a) => a.organization_id === active?.id && a.is_active !== false).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const [forArea, setForArea] = useState<boolean | null>(null); // null = tự chọn: không có vụ nào thì ghi cho khu
  const areaMode = forArea ?? (options.length === 0 && siteAreas.length > 0);
  const [areaPick, setAreaPick] = useState('');
  const siteArea = siteAreas.find((a) => a.id === areaPick) ?? siteAreas[0] ?? null;

  const [workTypeId, setWorkTypeId] = useState<string | null>(preset?.workTypeId ?? null);
  const stages = useLiveQuery(() => db.stages.where('cycle_id').equals(effectiveCycleId).sortBy('seq'), [effectiveCycleId], []);
  // giai đoạn gắn với việc: mặc định theo preset, nếu không thì giai đoạn đang làm có cùng loại việc
  const [stageSel, setStageSel] = useState<string | null | undefined>(preset?.stageId);
  const autoStage = stages.find((s) => s.status === 'in_progress' && s.work_type_id === workTypeId)?.id ?? null;
  const effStage = stageSel === undefined ? autoStage : stageSel;
  const [when, setWhen] = useState(toLocalInput(new Date()));
  const [values, setValues] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [savedItems, setSavedItems] = useState<{ materialId: string; quantity: number }[]>([]);

  // Vật tư đã dùng (FR-INV-003): chỉ vai trò được ghi xuất dùng; chọn từ danh mục đã tải về nên dùng được offline
  const canIssue = hasRole(active?.roles, 'manager', 'worker');
  const materials = useLiveQuery(
    () => (active ? db.materials.where('organization_id').equals(active.id).toArray() : []), [active?.id], [],
  ).filter((m) => m.is_active).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const locations = useLiveQuery(
    () => (active ? db.locations.where('organization_id').equals(active.id).toArray() : []), [active?.id], [],
  ).filter((l) => l.is_active).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const units = useTable('units');
  const [usedOpen, setUsedOpen] = useState(false);
  const [used, setUsed] = useState<{ materialId: string; qty: string; lotId?: string; lotExpired?: boolean; lotReason?: string }[]>([]);
  const [locationId, setLocationId] = useState('');
  const rememberedLoc = (() => { try { return localStorage.getItem(LAST_LOCATION_KEY); } catch { return null; } })();
  const effLocation = locationId || (locations.find((l) => l.id === rememberedLoc)?.id ?? locations[0]?.id ?? '');
  const unitOf = (materialId: string) => {
    const m = materials.find((x) => x.id === materialId);
    return units.find((u) => u.id === m?.base_unit_id)?.name.toLowerCase() ?? '';
  };

  const workType = workTypes.find((w) => w.id === workTypeId) ?? null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!workType || !session || (areaMode ? !siteArea || !active : !cycle)) return;
    if (!note.trim()) return setError('Hãy nhập "Nội dung việc": gõ chữ hoặc bấm Nói để đọc nội dung đã làm.');
    const merged = { ...initialValues(workType.field_schema), ...values };
    const bad = validateFields(workType.field_schema, merged);
    if (bad) return setError(bad);
    const data = fieldsToData(workType.field_schema, merged);
    // dòng vật tư: bỏ dòng trống hoàn toàn; dòng đã nhập dở thì báo để người dùng sửa, không âm thầm bỏ
    const items: { materialId: string; quantity: number; lotId?: string; reason?: string }[] = [];
    for (const row of used) {
      if (!row.materialId && row.qty.trim() === '') continue;
      const q = parseNumber(row.qty);
      if (!row.materialId) return setError('Hãy chọn vật tư cho dòng "Vật tư đã dùng", hoặc xóa dòng đó.');
      if (q === null || Number.isNaN(q) || q <= 0) return setError('Số lượng vật tư đã dùng phải là số lớn hơn 0.');
      if (row.lotId && !(row.lotReason ?? '').trim() && row.lotExpired) return setError('Lô đã chọn đã hết hạn: hãy ghi lý do dùng, hoặc chọn lô khác.');
      items.push({ materialId: row.materialId, quantity: q, lotId: row.lotId || undefined, reason: row.lotReason });
    }
    if (items.length > 0 && !effLocation) return setError('Chưa có kho để trừ vật tư. Hãy nhờ chủ cơ sở thêm kho ở mục "Vật tư & chi phí".');
    setError(null);
    const id = await logActivity({
      cycle: areaMode ? null : cycle,
      areaId: areaMode ? siteArea!.id : undefined,
      organizationId: active?.id,
      workTypeId: workType.id,
      performedAt: new Date(when).toISOString(),
      data,
      note,
      userId: session.user.id,
      stageId: areaMode ? null : effStage,
      used: items.length > 0 && active ? { organizationId: active.id, locationId: effLocation, items } : undefined,
    });
    if (cycle && !areaMode) { try { localStorage.setItem(LAST_CYCLE_KEY, cycle.id); } catch { /* bỏ qua */ } }
    if (items.length > 0) { try { localStorage.setItem(LAST_LOCATION_KEY, effLocation); } catch { /* bỏ qua */ } }
    setSavedItems(items);
    setSavedId(id);
  }

  function again() {
    setSavedId(null);
    setSavedItems([]);
    setUsed([]);
    setUsedOpen(false);
    setWorkTypeId(null);
    setValues({});
    setNote('');
    setError(null);
    setWhen(toLocalInput(new Date()));
  }

  // Màn xác nhận sau khi lưu: nói đúng trạng thái đồng bộ (FR-SYNC-006)
  if (savedId) {
    const s = sync.get(savedId);
    return (
      <div className="auth">
        <h1>Đã ghi</h1>
        <p className="msg ok" role="status">
          {s && s.state !== 'synced' ? SYNC_STATE_LABEL_VI.local_only : SYNC_STATE_LABEL_VI.synced}
        </p>
        <SyncBadge sync={s} />
        {savedItems.length > 0 && (
          <p>
            Vật tư đã dùng:{' '}
            {savedItems.map((it) => `${materials.find((m) => m.id === it.materialId)?.name ?? 'Vật tư'} ${formatQty(it.quantity)} ${unitOf(it.materialId)}`).join('; ')}
          </p>
        )}
        {(!s || s.state !== 'synced') && !navigator.onLine && (
          <p className="muted">Bản ghi đang nằm trên điện thoại và sẽ tự gửi khi có mạng.</p>
        )}
        <button className="primary" onClick={again}>Ghi việc khác</button>
        <button className="secondary" onClick={onClose}>Xong</button>
      </div>
    );
  }

  return (
    <div className="auth">
      <h1>Ghi việc vừa làm</h1>

      {options.length === 0 && siteAreas.length === 0 ? (
        <>
          <p className="msg warn">
            Chưa có vụ nào đang sản xuất nên chưa ghi việc được.{' '}
            {notStarted.length > 0
              ? 'Vụ đang chuẩn bị hoặc tạm dừng chỉ ghi việc được sau khi bấm "Bắt đầu sản xuất" hoặc "Tiếp tục" ở màn Sản xuất.'
              : 'Hãy tạo vụ ở màn hình Sản xuất.'}
          </p>
          <button className="secondary" onClick={onClose}>Quay lại</button>
        </>
      ) : !workType ? (
        <>
          <p className="muted">Bạn vừa làm việc gì?</p>
          <div className="grid2">
            {workTypes.map((w) => (
              <button key={w.id} className="bigchoice" onClick={() => setWorkTypeId(w.id)}>{w.name}</button>
            ))}
          </div>
          {workTypes.length === 0 && <p className="muted">Chưa tải được danh sách loại việc. Hãy kết nối mạng một lần để tải về.</p>}
          <button className="link" onClick={onClose}>Hủy</button>
        </>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          <p><strong>{workType.name}</strong> <button type="button" className="link inline" onClick={() => setWorkTypeId(null)}>Đổi</button></p>

          {siteAreas.length > 0 && options.length > 0 && (
            <label>
              Ghi cho
              <select value={areaMode ? 'area' : 'cycle'} onChange={(e) => setForArea(e.target.value === 'area')}>
                <option value="cycle">Một vụ đang sản xuất</option>
                <option value="area">Khu vực / cơ sở vật chất (không gắn vụ)</option>
              </select>
            </label>
          )}

          {areaMode ? (
            <label>
              Khu vực
              <select value={siteArea?.id ?? ''} onChange={(e) => setAreaPick(e.target.value)}>
                {siteAreas.map((a) => <option key={a.id} value={a.id}>{a.name}{a.code ? ` · ${a.code}` : ''}{a.kind === 'facility' ? ' (cơ sở vật chất)' : ''}</option>)}
              </select>
            </label>
          ) : (
          <label>
            <CycleWord cap />
            <select value={effectiveCycleId} onChange={(e) => { setCycleId(e.target.value); setStageSel(undefined); }}>
              {options.map((c) => (
                <option key={c.id} value={c.id}>
                  {cropName(c.crop_type_id)} · {areaName(c.area_id)} ({CYCLE_STATUS_LABEL_VI[c.status]})
                </option>
              ))}
            </select>
          </label>
          )}

          {!areaMode && stages.length > 0 && (
            <label>
              Thuộc giai đoạn
              <select value={effStage ?? ''} onChange={(e) => setStageSel(e.target.value || null)}>
                <option value="">— Không gắn giai đoạn —</option>
                {stages.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
              </select>
            </label>
          )}

          <label>
            Thời điểm làm
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </label>

          {workType.field_schema.map((f) => (
            <DynamicField key={f.key} def={f} value={values[f.key] ?? initialValues([f])[f.key] ?? ''} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />
          ))}

          {canIssue && (
            <fieldset className="roles">
              <legend>Vật tư đã dùng (không bắt buộc)</legend>
              {!usedOpen ? (
                <button type="button" className="secondary" onClick={() => { setUsedOpen(true); if (used.length === 0) setUsed([{ materialId: '', qty: '' }]); }}>
                  + Thêm vật tư đã dùng
                </button>
              ) : materials.length === 0 ? (
                <p className="muted">Chưa có vật tư trong danh mục. Hãy nhờ chủ cơ sở hoặc người phụ trách Kho & chi phí thêm ở mục "Vật tư & chi phí" (cần có mạng một lần để tải về máy).</p>
              ) : (
                <>
                  {used.map((row, i) => (
                    <div key={i}><div className="row member">
                      <select aria-label="Vật tư" value={row.materialId} className="grow"
                        onChange={(e) => setUsed((s) => s.map((r, j) => (j === i ? { ...r, materialId: e.target.value, lotId: '', lotExpired: false, lotReason: '' } : r)))}>
                        <option value="">— Chọn vật tư —</option>
                        {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                      <input aria-label={`Số lượng${row.materialId ? ` (${unitOf(row.materialId)})` : ''}`} placeholder={unitOf(row.materialId) || 'Số lượng'}
                        inputMode="decimal" size={6} value={row.qty}
                        onChange={(e) => setUsed((s) => s.map((r, j) => (j === i ? { ...r, qty: e.target.value } : r)))} />
                      <button type="button" className="link inline" aria-label="Xóa dòng vật tư"
                        onClick={() => setUsed((s) => s.filter((_, j) => j !== i))}>Xóa</button>
                    </div>
                    {row.materialId && (
                        <LotPicker materialId={row.materialId} lotId={row.lotId ?? ''} reason={row.lotReason ?? ''}
                          onLot={(id, expired) => setUsed((s) => s.map((r, j) => (j === i ? { ...r, lotId: id, lotExpired: expired } : r)))}
                          onReason={(v) => setUsed((s) => s.map((r, j) => (j === i ? { ...r, lotReason: v } : r)))} />
                      )}
                    </div>
                  ))}
                  <button type="button" className="secondary" onClick={() => setUsed((s) => [...s, { materialId: '', qty: '' }])}>+ Thêm dòng</button>
                  {locations.length > 1 && (
                    <label>
                      Lấy từ kho
                      <select value={effLocation} onChange={(e) => setLocationId(e.target.value)}>
                        {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                    </label>
                  )}
                  {locations.length === 0 && <p className="msg warn">Chưa có kho nào nên chưa trừ được vật tư.</p>}
                </>
              )}
            </fieldset>
          )}

          <VoiceNote label="Nội dung việc (bắt buộc)" value={note} onChange={setNote} />

          {error && <p className="msg error" role="alert">{error}</p>}
          {!navigator.onLine && <p className="msg warn">Đang offline. Bản ghi sẽ được lưu trên điện thoại và gửi sau.</p>}
          <div className="btnrow">
            <button type="submit" className="primary">Lưu</button>
            <button type="button" className="secondary" onClick={onClose}>Hủy</button>
          </div>
        </form>
      )}
    </div>
  );
}
