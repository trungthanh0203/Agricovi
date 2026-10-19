import { useMemo, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CYCLE_STATUS_LABEL_VI, SYNC_STATE_LABEL_VI } from '@agriconnect/shared';
import { SyncBadge } from '../components/SyncBadge';
import { db, type FieldDef } from '../lib/db';
import { toLocalInput, useRecordSync } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { formatQty, parseNumber } from '../lib/inventory';
import { useOrgs } from '../lib/orgs';
import { logActivity } from '../lib/production';
import { hasRole } from '../lib/roles';

const LAST_CYCLE_KEY = 'agriconnect.lastCycle';
const LAST_LOCATION_KEY = 'agriconnect.lastLocation'; // dùng chung với màn nhập kho

/** Luồng "Ghi việc vừa làm" (v1.1 mục 3.4): chọn loại việc -> xác nhận vụ -> lưu. Dùng được offline. */
export function LogActivityScreen({ onClose }: { onClose: () => void }) {
  const { session } = useAuth();
  const { active } = useOrgs();
  const sync = useRecordSync();
  const workTypes = useLiveQuery(() => db.workTypes.toArray(), [], []);
  const cycles = useLiveQuery(() => db.cycles.toArray(), [], []);
  const areas = useLiveQuery(() => db.areas.toArray(), [], []);
  const cropTypes = useLiveQuery(() => db.cropTypes.toArray(), [], []);

  const areaName = (id: string) => areas.find((a) => a.id === id)?.name ?? '—';
  const cropName = (id: string) => cropTypes.find((c) => c.id === id)?.name ?? '—';

  const options = useMemo(
    () =>
      cycles.filter(
        (c) =>
          (c.owner_org_id === active?.id || areas.find((a) => a.id === c.area_id)?.organization_id === active?.id) &&
          c.status !== 'ended' && c.status !== 'cancelled',
      ),
    [cycles, areas, active],
  );

  const remembered = (() => {
    try { return localStorage.getItem(LAST_CYCLE_KEY); } catch { return null; }
  })();
  const [cycleId, setCycleId] = useState<string>('');
  const effectiveCycleId = cycleId || (options.find((c) => c.id === remembered)?.id ?? options[0]?.id ?? '');
  const cycle = options.find((c) => c.id === effectiveCycleId) ?? null;

  const [workTypeId, setWorkTypeId] = useState<string | null>(null);
  const [when, setWhen] = useState(toLocalInput(new Date()));
  const [values, setValues] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [savedItems, setSavedItems] = useState<{ materialId: string; quantity: number }[]>([]);

  // Vật tư đã dùng (FR-INV-003): chỉ vai trò được ghi xuất dùng; chọn từ danh mục đã tải về nên dùng được offline
  const canIssue = hasRole(active?.roles, 'manager', 'worker', 'inventory_finance');
  const materials = useLiveQuery(
    () => (active ? db.materials.where('organization_id').equals(active.id).toArray() : []), [active?.id], [],
  ).filter((m) => m.is_active).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const locations = useLiveQuery(
    () => (active ? db.locations.where('organization_id').equals(active.id).toArray() : []), [active?.id], [],
  ).filter((l) => l.is_active).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const units = useLiveQuery(() => db.units.toArray(), [], []);
  const [usedOpen, setUsedOpen] = useState(false);
  const [used, setUsed] = useState<{ materialId: string; qty: string }[]>([]);
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
    if (!workType || !cycle || !session) return;
    for (const f of workType.field_schema) {
      const raw = values[f.key];
      if (f.type === 'number' && raw && Number.isNaN(Number(raw))) return setError(`"${f.label}" phải là số.`);
    }
    const data: Record<string, unknown> = {};
    for (const f of workType.field_schema) {
      const raw = values[f.key];
      if (raw !== undefined && raw !== '') data[f.key] = f.type === 'number' ? Number(raw) : raw;
    }
    // dòng vật tư: bỏ dòng trống hoàn toàn; dòng đã nhập dở thì báo để người dùng sửa, không âm thầm bỏ
    const items: { materialId: string; quantity: number }[] = [];
    for (const row of used) {
      if (!row.materialId && row.qty.trim() === '') continue;
      const q = parseNumber(row.qty);
      if (!row.materialId) return setError('Hãy chọn vật tư cho dòng "Vật tư đã dùng", hoặc xóa dòng đó.');
      if (q === null || Number.isNaN(q) || q <= 0) return setError('Số lượng vật tư đã dùng phải là số lớn hơn 0.');
      items.push({ materialId: row.materialId, quantity: q });
    }
    if (items.length > 0 && !effLocation) return setError('Chưa có kho để trừ vật tư. Hãy nhờ chủ cơ sở thêm kho ở mục "Vật tư & chi phí".');
    setError(null);
    const id = await logActivity({
      cycle,
      workTypeId: workType.id,
      performedAt: new Date(when).toISOString(),
      data,
      note,
      userId: session.user.id,
      used: items.length > 0 && active ? { organizationId: active.id, locationId: effLocation, items } : undefined,
    });
    try { localStorage.setItem(LAST_CYCLE_KEY, cycle.id); } catch { /* bỏ qua */ }
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
      <main className="auth">
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
      </main>
    );
  }

  return (
    <main className="auth">
      <h1>Ghi việc vừa làm</h1>

      {options.length === 0 ? (
        <>
          <p className="msg warn">Chưa có vụ trồng nào đang hoạt động. Hãy tạo vụ ở màn hình Sản xuất.</p>
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

          <label>
            Vụ trồng
            <select value={effectiveCycleId} onChange={(e) => setCycleId(e.target.value)}>
              {options.map((c) => (
                <option key={c.id} value={c.id}>
                  {cropName(c.crop_type_id)} · {areaName(c.area_id)} ({CYCLE_STATUS_LABEL_VI[c.status]})
                </option>
              ))}
            </select>
          </label>

          <label>
            Thời điểm làm
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </label>

          {workType.field_schema.map((f) => (
            <Field key={f.key} def={f} value={values[f.key] ?? ''} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />
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
                    <div className="row member" key={i}>
                      <select aria-label="Vật tư" value={row.materialId} className="grow"
                        onChange={(e) => setUsed((s) => s.map((r, j) => (j === i ? { ...r, materialId: e.target.value } : r)))}>
                        <option value="">— Chọn vật tư —</option>
                        {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                      <input aria-label={`Số lượng${row.materialId ? ` (${unitOf(row.materialId)})` : ''}`} placeholder={unitOf(row.materialId) || 'Số lượng'}
                        inputMode="decimal" size={6} value={row.qty}
                        onChange={(e) => setUsed((s) => s.map((r, j) => (j === i ? { ...r, qty: e.target.value } : r)))} />
                      <button type="button" className="link inline" aria-label="Xóa dòng vật tư"
                        onClick={() => setUsed((s) => s.filter((_, j) => j !== i))}>Xóa</button>
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

          <label>
            Ghi chú (không bắt buộc)
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>

          {error && <p className="msg error" role="alert">{error}</p>}
          {!navigator.onLine && <p className="msg warn">Đang offline. Bản ghi sẽ được lưu trên điện thoại và gửi sau.</p>}
          <button type="submit" className="primary">Lưu</button>
          <button type="button" className="link" onClick={onClose}>Hủy</button>
        </form>
      )}
    </main>
  );
}

function Field({ def, value, onChange }: { def: FieldDef; value: string; onChange: (v: string) => void }) {
  if (def.type === 'select' && def.options?.length) {
    return (
      <label>
        {def.label}
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">— Chọn —</option>
          {def.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
    );
  }
  return (
    <label>
      {def.label}
      <input value={value} inputMode={def.type === 'number' ? 'decimal' : undefined} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
