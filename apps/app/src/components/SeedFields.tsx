import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AutoTextarea } from './AutoTextarea';
import { SupplierForm } from './PartnersSection';
import { db, type MaterialRow } from '../lib/db';
import { friendlyError } from '../lib/errors';
import { fmtDate } from '../lib/dates';
import { todayLocal, useOnline } from '../lib/hooks';
import { createMaterial, fetchLots, type LotOption } from '../lib/inventory';
import { norm } from '../lib/invoiceMatch';
import { useOrgs } from '../lib/orgs';
import { createSupplier, listSuppliers, type Partner } from '../lib/partners';
import { canPerm } from '../lib/permissions';
import { linkMaterialSupplier, loadMaterialSuppliers, SELF_SEED, type MaterialSupplier } from '../lib/seedPick';
import { useTable } from '../lib/tables';

/** Giống của vụ chọn từ DANH MỤC VẬT TƯ (nhóm "Giống"); chưa có thì thêm nhanh vào danh mục rồi chọn. Lưu vào vụ vẫn là tên giống (chữ) như trước. */
export function SeedVarietyField({ label, hint, value, onChange, kind }: { label: string; hint: string; value: string; onChange: (v: string) => void; kind?: string }) {
  const { active } = useOrgs();
  const online = useOnline();
  const orgId = active?.id ?? '';
  const units = useTable('units');
  const mats = useLiveQuery(() => (orgId ? db.materials.where('organization_id').equals(orgId).toArray() : []), [orgId], [] as MaterialRow[])
    .filter((m) => m.is_active && m.material_group === 'seed').sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const canAdd = canPerm(active?.perms, 'inventory', 'edit') && online;
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [unitId, setUnitId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortedUnits = useMemo(() => [...units].sort((a, b) => a.name.localeCompare(b.name, 'vi')), [units]);
  const defaultUnit = useMemo(() => {
    const want = kind === 'livestock' || kind === 'aquatic' ? ['con'] : ['goi', 'hat', 'cay'];
    return sortedUnits.find((u) => want.includes(norm(u.name)))?.id ?? sortedUnits[0]?.id ?? '';
  }, [sortedUnits, kind]);

  const matched = mats.find((m) => norm(m.name) === norm(value));

  // chưa có giống nào trong danh mục và không thêm được: cho gõ tay như trước để không bị chặn
  if (mats.length === 0 && !canAdd) {
    return (
      <label>{label}
        <AutoTextarea value={value} maxLength={120} onChange={onChange} placeholder={hint} />
        <small className="muted">Chưa có giống trong danh mục vật tư. Người có quyền Kho có thể thêm ở Khai báo → Vật tư (nhóm Giống) để lần sau chọn từ danh sách.</small>
      </label>
    );
  }

  async function saveNew() {
    const n = name.trim();
    if (n.length < 2) return setError('Hãy nhập tên giống (ít nhất 2 ký tự).');
    const uid = unitId || defaultUnit;
    if (!uid) return setError('Chưa có đơn vị tính. Hãy kết nối mạng để tải danh sách đơn vị rồi thử lại.');
    const dup = mats.find((m) => norm(m.name) === norm(n));
    if (dup) { onChange(dup.name); setAdding(false); return; }
    setBusy(true); setError(null);
    try {
      await createMaterial(orgId, { name: n, category: '', unitId: uid, threshold: null, ext: { material_group: 'seed' } });
      onChange(n);
      setAdding(false);
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  return (
    <>
      <label>{label}
        <select value={matched ? matched.id : value ? '__legacy' : ''} onChange={(e) => {
          const v = e.target.value;
          if (v === '__new') { setName(''); setUnitId(defaultUnit); setError(null); setAdding(true); return; }
          if (v === '__legacy') return;
          onChange(mats.find((m) => m.id === v)?.name ?? '');
        }}>
          <option value="">— Chọn giống từ danh mục vật tư —</option>
          {value && !matched && <option value="__legacy">{value} (đang ghi, chưa có trong danh mục)</option>}
          {mats.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          {canAdd && <option value="__new">＋ Thêm giống mới vào danh mục vật tư…</option>}
        </select>
        {value && !matched && canAdd && <small className="muted">Giống này chưa có trong danh mục. Chọn "＋ Thêm giống mới" để lưu vào danh mục rồi chọn lại, sẽ tiện cho các vụ sau.</small>}
        {!value && <small className="muted">{hint}</small>}
      </label>
      {adding && (
        <div className="inline-form card slim">
          <strong>Thêm nhanh giống vào danh mục vật tư</strong>
          <label>Tên giống<input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder={hint} /></label>
          <label>Đơn vị tính
            <select value={unitId || defaultUnit} onChange={(e) => setUnitId(e.target.value)}>{sortedUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
          </label>
          <small className="muted">Giống được lưu ở Khai báo → Vật tư (nhóm Giống); sửa thêm thông tin ở đó nếu cần.</small>
          {error && <p className="msg error" role="alert">{error}</p>}
          <div className="btnrow">
            <button type="button" className="primary" disabled={busy} onClick={() => void saveNew()}>{busy ? 'Đang lưu…' : 'Lưu giống và chọn'}</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => setAdding(false)}>Hủy</button>
          </div>
        </div>
      )}
    </>
  );
}

/** Nguồn giống = nhà cung cấp: tự liệt kê các nhà cung cấp ĐÃ BÁN giống đã chọn (theo hóa đơn mua hoặc đã chọn trước đây); thiếu thì chọn từ danh bạ hoặc thêm mới. */
export function SeedSourceField({ label, variety, value, onChange }: { label: string; variety: string; value: string; onChange: (v: string) => void }) {
  const { active } = useOrgs();
  const online = useOnline();
  const orgId = active?.id ?? '';
  const mats = useLiveQuery(() => (orgId ? db.materials.where('organization_id').equals(orgId).toArray() : []), [orgId], [] as MaterialRow[]);
  const varietyMat = variety.trim() ? mats.find((m) => m.is_active && m.material_group === 'seed' && norm(m.name) === norm(variety)) : undefined;
  const canSee = canPerm(active?.perms, 'expenses', 'view');
  const canLink = canPerm(active?.perms, 'inventory', 'edit');

  const [listed, setListed] = useState<MaterialSupplier[]>([]);
  const [all, setAll] = useState<Partner[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'' | 'other' | 'new'>('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setListed([]);
    if (!orgId || !varietyMat || !canSee || !online) return;
    let alive = true;
    setLoading(true);
    void loadMaterialSuppliers(orgId, varietyMat.id).then((r) => { if (alive) setListed(r); }).catch(() => undefined).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [orgId, varietyMat?.id, canSee, online]); // eslint-disable-line react-hooks/exhaustive-deps

  async function ensureAll() {
    if (all || !orgId) return;
    try { setAll((await listSuppliers(orgId)).filter((p) => p.is_active)); } catch (e) { setError(friendlyError(e)); }
  }

  // không xem được danh bạ nhà cung ứng hoặc đang offline: gõ tay như trước để không bị chặn
  if (!canSee || !online) {
    return <label>{label}<AutoTextarea value={value} maxLength={200} onChange={onChange} /></label>;
  }

  const pick = (p: { id: string; name: string }, link: boolean) => {
    onChange(p.name);
    if (link && varietyMat && canLink) void linkMaterialSupplier(orgId, varietyMat.id, p.id); // nhớ để lần sau hiện sẵn trong danh sách của giống này
    setMode('');
  };
  const listedNames = new Set(listed.map((s) => norm(s.name)));
  const isListed = listedNames.has(norm(value));
  const isSelf = value === SELF_SEED;
  const selectValue = isListed ? `p:${listed.find((s) => norm(s.name) === norm(value))!.partner_id}` : isSelf ? '__self' : value ? '__legacy' : '';

  return (
    <>
      <label>{label}
        <select value={mode === 'other' ? '__other' : mode === 'new' ? '__new' : selectValue} onChange={(e) => {
          const v = e.target.value;
          setError(null);
          if (v === '__other') { setMode('other'); void ensureAll(); return; }
          if (v === '__new') { setMode('new'); return; }
          setMode('');
          if (v === '__self') return onChange(SELF_SEED);
          if (v === '__legacy') return;
          if (v === '') return onChange('');
          const s = listed.find((x) => `p:${x.partner_id}` === v);
          if (s) onChange(s.name);
        }}>
          <option value="">— Chọn nhà cung cấp —</option>
          {value && !isListed && !isSelf && <option value="__legacy">{value} (đang ghi)</option>}
          {listed.length > 0 && <optgroup label={`Đã cung cấp "${varietyMat?.name ?? 'giống này'}"`}>
            {listed.map((s) => <option key={s.partner_id} value={`p:${s.partner_id}`}>{s.name}{s.purchases > 0 ? ` · mua ${s.purchases} lần${s.last_date ? `, gần nhất ${fmtDate(s.last_date)}` : ''}` : ''}</option>)}
          </optgroup>}
          <option value="__self">{SELF_SEED}</option>
          <option value="__other">Nhà cung cấp khác trong danh bạ…</option>
          <option value="__new">＋ Thêm nhà cung cấp mới</option>
        </select>
        {loading && <small className="muted">Đang tìm nhà cung cấp của giống này…</small>}
        {!loading && varietyMat && listed.length === 0 && <small className="muted">Chưa có nhà cung cấp nào gắn với giống này. Chọn từ danh bạ hoặc thêm mới; app sẽ nhớ cho lần sau.</small>}
        {!varietyMat && <small className="muted">{variety.trim() ? 'Giống này chưa có trong danh mục vật tư nên chưa gợi ý được nhà cung cấp.' : 'Chọn giống trước để thấy các nhà cung cấp của giống đó.'}</small>}
      </label>
      {mode === 'other' && (
        <label>Chọn từ danh bạ nhà cung ứng
          <select value="" onChange={(e) => { const p = (all ?? []).find((x) => x.id === e.target.value); if (p) pick(p, true); }}>
            <option value="">{all ? '— Chọn nhà cung cấp —' : 'Đang tải danh bạ…'}</option>
            {(all ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {all && all.length === 0 && <small className="muted">Danh bạ chưa có nhà cung ứng nào. Chọn "＋ Thêm nhà cung cấp mới".</small>}
        </label>
      )}
      {mode === 'new' && (
        <SupplierForm title="Thêm nhà cung ứng" busy={busy} onClose={() => setMode('')}
          onSave={async (f) => {
            setBusy(true); setError(null);
            try { const id = await createSupplier(orgId, f); setAll(null); pick({ id, name: f.name.trim() }, true); }
            catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
          }} />
      )}
      {error && <p className="msg error" role="alert">{error}</p>}
    </>
  );
}

/** Số lô giống: chọn từ các lô giống đã nhập kho (kèm hạn dùng); chưa nhập kho theo lô thì gõ số lô in trên bao giống. */
export function SeedLotField({ label, variety, value, onChange }: { label: string; variety: string; value: string; onChange: (v: string) => void }) {
  const { active } = useOrgs();
  const online = useOnline();
  const orgId = active?.id ?? '';
  const mats = useLiveQuery(() => (orgId ? db.materials.where('organization_id').equals(orgId).toArray() : []), [orgId], [] as MaterialRow[]);
  const varietyMat = variety.trim() ? mats.find((m) => m.is_active && m.material_group === 'seed' && norm(m.name) === norm(variety)) : undefined;
  const [lots, setLots] = useState<LotOption[]>([]);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    setLots([]);
    if (!varietyMat || !online) return;
    let alive = true;
    void fetchLots(varietyMat.id).then((r) => { if (alive) setLots(r); });
    return () => { alive = false; };
  }, [varietyMat?.id, online]);

  // giống chưa nhập kho theo lô: gõ số lô như trước
  if (lots.length === 0) {
    return (
      <label>{label}<input value={value} maxLength={80} onChange={(e) => onChange(e.target.value)} />
        {varietyMat && <small className="muted">Giống này chưa có lô nào trong kho. Nhập kho giống kèm số lô thì lần sau chọn được ở đây.</small>}
      </label>
    );
  }
  const today = todayLocal();
  const hit = lots.find((l) => l.lot_no.trim().toLowerCase() === value.trim().toLowerCase());
  const sel = typing ? '__type' : hit ? hit.id : value ? '__type' : '';
  return (
    <>
      <label>{label}
        <select value={sel} onChange={(e) => {
          const v = e.target.value;
          if (v === '__type') { setTyping(true); return; }
          setTyping(false);
          onChange(lots.find((l) => l.id === v)?.lot_no ?? '');
        }}>
          <option value="">— Chọn lô giống đã nhập kho —</option>
          {lots.map((l) => <option key={l.id} value={l.id}>{l.lot_no}{l.expiry_date ? ` · hạn ${fmtDate(l.expiry_date)}` : ''}{l.expiry_date && l.expiry_date < today ? ' (HẾT HẠN)' : ''}</option>)}
          <option value="__type">Lô khác (gõ số lô)</option>
        </select>
        {hit?.expiry_date && hit.expiry_date < today && <small className="warn">Lô này đã hết hạn dùng. Hãy kiểm tra lại giống trước khi gieo trồng.</small>}
      </label>
      {sel === '__type' && <label>Số lô khác<input value={value} maxLength={80} onChange={(e) => onChange(e.target.value)} /></label>}
    </>
  );
}
