import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCatalog } from '../lib/catalog';
import { joinItems, parseItems } from '../lib/config';
import { CustomerForm } from './CustomersSection';
import { SupplierForm } from './PartnersSection';
import { db, type MaterialRow } from '../lib/db';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/hooks';
import { norm } from '../lib/invoiceMatch';
import { useOrgs } from '../lib/orgs';
import { createCustomer, createSupplier, listCustomers, listSuppliers } from '../lib/partners';
import { canPerm } from '../lib/permissions';
import { supabase } from '../lib/supabase';

/**
 * Các ô "chọn từ danh mục" dùng khi ghi việc và khai báo vụ (nhóm A, D159): thay cho ô gõ tay.
 * Giá trị lưu vẫn là CHỮ (tên), nên dữ liệu và sổ nhật ký cũ không đổi; giá trị cũ gõ tay vẫn hiện ("đang ghi").
 * Mất mạng hoặc không có quyền xem danh mục đó thì quay về ô gõ tay để không bị chặn.
 */

/** Chọn một tên trong danh sách có sẵn; "Khác (gõ tên)" cho trường hợp ngoài danh mục */
export function NamePicker({ label, value, onChange, names, hint, emptyHint }: { label: string; value: string; onChange: (v: string) => void; names: string[]; hint?: string; emptyHint?: string }) {
  const [other, setOther] = useState(false);
  const known = names.some((n) => norm(n) === norm(value));
  const sel = other ? '__other' : known ? names.find((n) => norm(n) === norm(value))! : value ? '__legacy' : '';
  return (
    <>
      <label>{label}
        <select value={sel} onChange={(e) => {
          const v = e.target.value;
          if (v === '__other') { setOther(true); return; }
          setOther(false);
          if (v === '__legacy') return;
          onChange(v);
        }}>
          <option value="">— Chọn từ danh mục —</option>
          {value && !known && <option value="__legacy">{value} (đang ghi)</option>}
          {names.map((n) => <option key={n} value={n}>{n}</option>)}
          <option value="__other">Khác (gõ tên)</option>
        </select>
        {names.length === 0 && emptyHint && <small className="muted">{emptyHint}</small>}
      </label>
      {other && <label>Tên khác<input value={known ? '' : value} maxLength={120} placeholder={hint} onChange={(e) => onChange(e.target.value)} /></label>}
    </>
  );
}

/** Vật tư đang dùng của cơ sở (đọc từ máy, dùng được offline), tùy chọn lọc theo nhóm gốc */
export function useMaterialNames(groups?: string[]): string[] {
  const { active } = useOrgs();
  const orgId = active?.id ?? '';
  const mats = useLiveQuery(() => (orgId ? db.materials.where('organization_id').equals(orgId).toArray() : []), [orgId], [] as MaterialRow[]);
  return mats.filter((m) => m.is_active && (!groups || (m.material_group != null && groups.includes(m.material_group)))).map((m) => m.name).sort((a, b) => a.localeCompare(b, 'vi'));
}

/** Loại cám: chọn từ vật tư nhóm Thức ăn */
export function FeedNamePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const names = useMaterialNames(['feed']);
  return <NamePicker label="Loại cám (không bắt buộc)" value={value} onChange={onChange} names={names} hint="Ví dụ: Cám heo vỗ béo" emptyHint="Chưa có vật tư nhóm Thức ăn. Thêm ở Khai báo → Vật tư để chọn nhanh lần sau, hoặc chọn 'Khác (gõ tên)'." />;
}

/** Khách hàng / nhà cung cấp: chọn từ danh bạ, thêm mới ngay tại chỗ. Cần mạng và quyền xem Chi phí; không được thì gõ tay. */
export function PartnerNamePicker({ kind, label, value, onChange, hint }: { kind: 'customer' | 'supplier'; label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  const { active } = useOrgs();
  const online = useOnline();
  const orgId = active?.id ?? '';
  const can = canPerm(active?.perms, 'expenses', 'view') && online;
  const [list, setList] = useState<{ id: string; name: string }[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const rows = kind === 'customer' ? await listCustomers(orgId) : await listSuppliers(orgId);
      setList(rows.filter((r) => r.is_active).map((r) => ({ id: r.id, name: r.name })));
    } catch { setList(null); }
  }
  useEffect(() => { if (orgId && can) void load(); }, [orgId, can, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!can || list === null) {
    return <label>{label}<input value={value} maxLength={200} placeholder={hint} onChange={(e) => onChange(e.target.value)} /></label>;
  }
  const names = list.map((p) => p.name);
  const known = names.some((n) => norm(n) === norm(value));
  return (
    <>
      <label>{label}
        <select value={adding ? '__new' : known ? names.find((n) => norm(n) === norm(value))! : value ? '__legacy' : ''} onChange={(e) => {
          const v = e.target.value;
          setError(null);
          if (v === '__new') { setAdding(true); return; }
          setAdding(false);
          if (v === '__legacy') return;
          onChange(v);
        }}>
          <option value="">— Chọn từ danh bạ —</option>
          {value && !known && <option value="__legacy">{value} (đang ghi)</option>}
          {names.map((n) => <option key={n} value={n}>{n}</option>)}
          <option value="__new">{kind === 'customer' ? '＋ Thêm khách hàng mới' : '＋ Thêm nhà cung cấp mới'}</option>
        </select>
      </label>
      {adding && (kind === 'customer'
        ? <CustomerForm title="Thêm khách hàng" busy={busy} onClose={() => setAdding(false)}
            onSave={async (f) => { setBusy(true); try { await createCustomer(orgId, f); await load(); onChange(f.name.trim()); setAdding(false); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); } }} />
        : <SupplierForm title="Thêm nhà cung ứng" busy={busy} onClose={() => setAdding(false)}
            onSave={async (f) => { setBusy(true); try { await createSupplier(orgId, f); await load(); onChange(f.name.trim()); setAdding(false); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); } }} />)}
      {error && <p className="msg error" role="alert">{error}</p>}
    </>
  );
}

/** Cán bộ kỹ thuật / thú y phụ trách: chọn từ nhân sự của cơ sở (tự điền cả điện thoại); "Khác" thì gõ tay */
export function SupervisorFields({ name, phone, onChange }: { name: string; phone: string; onChange: (name: string, phone: string) => void }) {
  const { active } = useOrgs();
  const online = useOnline();
  const orgId = active?.id ?? '';
  const [workers, setWorkers] = useState<{ id: string; full_name: string; phone: string | null }[] | null>(null);
  const [other, setOther] = useState(false);

  useEffect(() => {
    if (!orgId || !online || !supabase) return;
    let alive = true;
    void supabase.from('worker_profiles').select('id, full_name, phone').eq('organization_id', orgId).eq('status', 'active').order('full_name')
      .then(({ data, error }) => { if (alive) setWorkers(error ? null : (data ?? []) as { id: string; full_name: string; phone: string | null }[]); });
    return () => { alive = false; };
  }, [orgId, online]);

  const typed = (
    <div className="pair">
      <label>Cán bộ kỹ thuật / thú y phụ trách<input value={name} maxLength={120} onChange={(e) => onChange(e.target.value, phone)} placeholder="Không bắt buộc" /></label>
      <label>Điện thoại<input value={phone} maxLength={30} inputMode="tel" onChange={(e) => onChange(name, e.target.value)} /></label>
    </div>
  );
  if (!workers || workers.length === 0) return typed;
  const hit = workers.find((w) => norm(w.full_name) === norm(name));
  const sel = other ? '__other' : hit ? hit.id : name ? '__legacy' : '';
  return (
    <>
      <label>Cán bộ kỹ thuật / thú y phụ trách
        <select value={sel} onChange={(e) => {
          const v = e.target.value;
          if (v === '__other') { setOther(true); return; }
          setOther(false);
          if (v === '__legacy') return;
          if (v === '') return onChange('', '');
          const w = workers.find((x) => x.id === v);
          if (w) onChange(w.full_name, w.phone ?? '');
        }}>
          <option value="">— Chọn từ nhân sự —</option>
          {name && !hit && <option value="__legacy">{name} (đang ghi)</option>}
          {workers.map((w) => <option key={w.id} value={w.id}>{w.full_name}{w.phone ? ` · ${w.phone}` : ''}</option>)}
          <option value="__other">Người ngoài cơ sở (gõ tên)</option>
        </select>
      </label>
      {(other || (!hit && name)) && typed}
      {hit && <p className="muted">Điện thoại: {phone || 'chưa có'}</p>}
    </>
  );
}

/** Tên các loại sản phẩm đang dùng của cơ sở (cây trồng, vật nuôi, thủy sản…), đọc từ máy nên nhanh và dùng được offline */
export function useCropNames(): string[] {
  const { cropTypes } = useCatalog();
  return cropTypes.filter((c) => c.is_active).map((c) => c.name).sort((a, b) => a.localeCompare(b, 'vi'));
}

/**
 * Chọn NHIỀU mục từ một danh sách (bấm để bật/tắt), lưu thành chữ cách nhau bằng dấu phẩy như trước.
 * Mục đã ghi từ trước nhưng không có trong danh sách vẫn hiện (đánh dấu) để không mất; "＋ Thêm khác" cho mục ngoài danh sách.
 */
export function ChipsPicker({ label, value, onChange, options, hint }: { label: string; value: string; onChange: (v: string) => void; options: string[]; hint?: string }) {
  const chosen = parseItems(value);
  const has = (n: string) => chosen.some((x) => norm(x) === norm(n));
  const extra = chosen.filter((x) => !options.some((o) => norm(o) === norm(x)));
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const toggle = (n: string) => onChange(joinItems(has(n) ? chosen.filter((x) => norm(x) !== norm(n)) : [...chosen, n]));
  return (
    <fieldset className="roles">
      <legend>{label}</legend>
      <div className="pickchips">
        {options.map((o) => <button key={o} type="button" className={has(o) ? 'chip active' : 'chip'} aria-pressed={has(o)} onClick={() => toggle(o)}>{o}</button>)}
        {extra.map((o) => <button key={o} type="button" className="chip active" aria-pressed title="Đang ghi, chưa có trong danh sách (bấm để bỏ)" onClick={() => toggle(o)}>{o} ✕</button>)}
        {!adding && <button type="button" className="chip" onClick={() => setAdding(true)}>＋ Thêm khác</button>}
      </div>
      {options.length === 0 && extra.length === 0 && hint && <small className="muted">{hint}</small>}
      {adding && (
        <div className="pair">
          <input value={text} maxLength={60} placeholder="Tên mục khác" onChange={(e) => setText(e.target.value)} />
          <div className="btnrow">
            <button type="button" className="secondary" onClick={() => { const t = text.trim(); if (t && !has(t)) onChange(joinItems([...chosen, t])); setText(''); setAdding(false); }}>Thêm</button>
            <button type="button" className="link" onClick={() => { setText(''); setAdding(false); }}>Hủy</button>
          </div>
        </div>
      )}
    </fieldset>
  );
}
