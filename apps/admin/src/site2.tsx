import { useState, type FormEvent } from 'react';
import { DEFAULT_HEADER_NAV, parseBody } from '@agriconnect/shared';
import { Err, useLoad } from './pages';
import { canPublish, compressImage, locked, SITE_URL, SiteBadge, STATUS_LABEL, statusOptions } from './site';
import { clean, downloadCsv, fmtDateTime, rpc, supabase } from './supabase';

/**
 * W2 (D60–D61): danh mục sản phẩm, vật tư do quản trị nhập (nhập tay hoặc từ CSV), bài viết/tin xuất khẩu/tin hội chợ, hàng đợi yêu cầu báo giá.
 * Quyền thật do CSDL ép (migration 0043). Ảnh: mỗi chỗ chỉ 1 ảnh, nén nhỏ.
 */
const slugify = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(/[^0-9.]/g, '')));
const err2 = (x: unknown) => clean(x instanceof Error ? x.message : String(x));

function ImageField({ value, onChange, max, limit, label }: { value: string; onChange: (v: string) => void; max: number; limit: number; label: string }) {
  const [busy, setBusy] = useState(false);
  const [e, setE] = useState<string | null>(null);
  return (
    <label>{label}
      <input type="file" accept="image/*" disabled={busy} onChange={(ev) => {
        const f = ev.target.files?.[0];
        if (!f) return;
        setBusy(true); setE(null);
        compressImage(f, max, limit).then(onChange).catch((x) => setE(err2(x))).finally(() => setBusy(false));
      }} />
      {value && <><img src={value} alt="" style={{ maxWidth: 220, borderRadius: 8, marginTop: 6 }} /><button type="button" onClick={() => onChange('')}>Bỏ ảnh</button></>}
      <Err e={e} />
      <small>Chỉ 1 ảnh, tự thu nhỏ để nhẹ cơ sở dữ liệu.</small>
    </label>
  );
}

// ============================================================ Danh mục
interface CatRow { id: string; parent_id: string | null; slug: string; name: string; branch: string; description: string | null; sort_order: number; is_active: boolean; restricted: boolean; version: number }
const BRANCH_LABEL: Record<string, string> = { nong_san: 'Nông sản', giong: 'Giống', vat_tu: 'Vật tư nông nghiệp', phu_kien: 'Phụ kiện, thiết bị' };

export function SiteCategoriesPage({ roles }: { roles: string[] }) {
  const { data, error, reload } = useLoad(async () => {
    const { data: rows, error: e } = await supabase!.from('product_categories').select('id, parent_id, slug, name, branch, description, sort_order, is_active, restricted, version').order('sort_order').order('name');
    if (e) throw new Error(e.message);
    return (rows ?? []) as CatRow[];
  });
  const [f, setF] = useState<(Omit<CatRow, 'id' | 'sort_order'> & { id: string | null; sort: string }) | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const can = canPublish(roles);
  const all = data ?? [];
  const byId = new Map(all.map((c) => [c.id, c]));
  const depth = (c: CatRow) => { let d = 0, p = c.parent_id; while (p && d < 5) { p = byId.get(p)?.parent_id ?? null; d++; } return d; };
  // sắp theo cây: cha trước con
  const ordered: CatRow[] = [];
  const walk = (parent: string | null) => all.filter((c) => c.parent_id === parent).forEach((c) => { ordered.push(c); walk(c.id); });
  walk(null);

  const open = (c: CatRow | null) => { setErr(null); setF(c ? { ...c, sort: String(c.sort_order) } : { id: null, parent_id: null, slug: '', name: '', branch: 'nong_san', description: '', sort: '0', is_active: true, restricted: false, version: 0 }); };
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!f) return;
    setErr(null);
    try {
      await rpc('site_save_category', { p_id: f.id, p_parent: f.parent_id || null, p_slug: f.slug, p_name: f.name, p_branch: f.branch, p_desc: f.description ?? '', p_sort: Number(f.sort) || 0, p_active: f.is_active, p_restricted: f.restricted, p_version: f.id ? f.version : null });
      setF(null); reload();
    } catch (x) { setErr(err2(x)); }
  }
  return (
    <>
      <p className="muted">Cây danh mục hiện trên website (menu Danh mục, trang danh mục). Danh mục đã dùng không xóa, chỉ tắt "Đang dùng". {!can && 'Chỉ tổng biên tập hoặc quản trị viên được sửa.'}</p>
      <Err e={error} />
      {!f && can && <div className="toolbar"><button className="primary" onClick={() => open(null)}>+ Thêm danh mục</button></div>}
      {f && (
        <section className="card">
          <h2>{f.id ? 'Sửa danh mục' : 'Thêm danh mục'}</h2>
          <form className="form" onSubmit={(e) => void save(e)}>
            <label>Tên<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value, slug: f.id ? f.slug : slugify(e.target.value) })} /></label>
            <label>Địa chỉ (không dấu)<input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.trim().toLowerCase() })} /><small>/danh-muc/{f.slug || '…'}/</small></label>
            <label>Thuộc danh mục cha
              <select value={f.parent_id ?? ''} onChange={(e) => setF({ ...f, parent_id: e.target.value || null })}>
                <option value="">(Danh mục gốc)</option>
                {all.filter((c) => c.id !== f.id).map((c) => <option key={c.id} value={c.id}>{'— '.repeat(depth(c))}{c.name}</option>)}
              </select>
            </label>
            <label>Nhánh
              <select value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })}>{Object.entries(BRANCH_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <small>Nhánh "Vật tư" và "Phụ kiện" dành cho vật tư do quản trị nhập; "Nông sản" và "Giống" cho sản phẩm của nhà cung cấp.</small>
            </label>
            <label>Mô tả ngắn (tùy chọn)<input value={f.description ?? ''} maxLength={300} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
            <label>Thứ tự (số nhỏ hiện trước)<input value={f.sort} inputMode="numeric" onChange={(e) => setF({ ...f, sort: e.target.value })} /></label>
            <label className="check"><input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} /> Đang dùng (hiện trên website)</label>
            <label className="check"><input type="checkbox" checked={f.restricted} onChange={(e) => setF({ ...f, restricted: e.target.checked })} /> Hàng hạn chế (thuốc BVTV, thuốc thú y: cần giấy phép, chưa mở)</label>
            <Err e={err} />
            <div className="toolbar"><button className="primary" disabled={!can}>Lưu</button><button type="button" onClick={() => setF(null)}>Hủy</button></div>
          </form>
        </section>
      )}
      <table className="list"><thead><tr><th>Danh mục</th><th>Địa chỉ</th><th>Nhánh</th><th>Thứ tự</th><th></th><th></th></tr></thead>
        <tbody>
          {ordered.map((c) => (
            <tr key={c.id} className={c.is_active ? '' : 'off'}>
              <td style={{ paddingLeft: 8 + depth(c) * 20 }}><strong>{c.name}</strong></td><td>/{c.slug}</td><td>{BRANCH_LABEL[c.branch]}</td><td>{c.sort_order}</td>
              <td>{!c.is_active ? 'Đã tắt' : c.restricted ? 'Hạn chế' : ''}</td><td>{can && <button onClick={() => open(c)}>Sửa</button>}</td>
            </tr>))}
        </tbody></table>
    </>
  );
}

// ============================================================ Vật tư
interface MatRow { id: string; category_id: string | null; slug: string; name: string; brand: string | null; summary: string | null; ingredients: string | null; usage: string | null; safety: string | null; unit: string | null; price_from: number | null; price_note: string | null; distributor: string | null; image: string | null; status: string; sort_order: number; version: number }
interface MatForm { id: string | null; version: number | null; category: string; slug: string; name: string; brand: string; summary: string; ingredients: string; usage: string; safety: string; unit: string; price: string; priceNote: string; distributor: string; image: string; status: string; sort: string }
const emptyMat: MatForm = { id: null, version: null, category: '', slug: '', name: '', brand: '', summary: '', ingredients: '', usage: '', safety: '', unit: '', price: '', priceNote: '', distributor: '', image: '', status: 'draft', sort: '0' };

// Đọc CSV đơn giản (có ngoặc kép), tự nhận dấu phân cách , hoặc ;
function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, '');
  const delim = (t.split('\n')[0] ?? '').split(';').length > (t.split('\n')[0] ?? '').split(',').length ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some((x) => x.trim())) rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell); if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}
const CSV_COLS: [string, string[]][] = [
  ['name', ['name', 'tên', 'ten', 'tên vật tư']], ['category', ['category', 'danh mục', 'danh muc', 'nhóm']], ['brand', ['brand', 'thương hiệu', 'thuong hieu']],
  ['summary', ['summary', 'mô tả ngắn', 'mo ta ngan', 'mô tả']], ['ingredients', ['ingredients', 'thành phần', 'thanh phan']], ['usage', ['usage', 'hướng dẫn', 'huong dan', 'hướng dẫn sử dụng']],
  ['unit', ['unit', 'đơn vị', 'don vi']], ['price_from', ['price_from', 'giá từ', 'gia tu', 'giá']], ['price_note', ['price_note', 'giá chữ', 'ghi chú giá']], ['distributor', ['distributor', 'nhà phân phối', 'nha phan phoi']],
];
const CSV_SAMPLE: (string | number | null)[][] = [
  ['Tên', 'Danh mục', 'Thương hiệu', 'Mô tả ngắn', 'Thành phần', 'Hướng dẫn', 'Đơn vị', 'Giá từ', 'Giá chữ', 'Nhà phân phối'],
  ['NPK 30-11-10 TE', 'phan-bon', 'Hòa Bình', 'Phân NPK cho dưa lưới', 'N 30%, P2O5 11%, K2O 10%', 'Bón gốc 20 kg/ha', 'kg', 18000, '', 'Đại lý A'],
];

export function SiteMaterialsPage({ roles }: { roles: string[] }) {
  const { data, error, reload } = useLoad(async () => {
    const [m, c] = await Promise.all([
      supabase!.from('site_materials').select('id, category_id, slug, name, brand, summary, ingredients, usage, safety, unit, price_from, price_note, distributor, image, status, sort_order, version').order('updated_at', { ascending: false }),
      supabase!.from('product_categories').select('id, slug, name, branch, parent_id').in('branch', ['vat_tu', 'phu_kien']).eq('restricted', false).order('sort_order'),
    ]);
    if (m.error) throw new Error(m.error.message);
    return { rows: (m.data ?? []) as MatRow[], cats: (c.data ?? []) as { id: string; slug: string; name: string; parent_id: string | null }[] };
  });
  const [f, setF] = useState<MatForm | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [csv, setCsv] = useState(false);
  const [csvMsg, setCsvMsg] = useState<string | null>(null);
  const cats = data?.cats ?? [];
  const catName = (id: string | null) => cats.find((c) => c.id === id)?.name ?? '—';

  const open = (m: MatRow | null) => {
    setErr(null); setMsg(null);
    setF(m ? { id: m.id, version: m.version, category: m.category_id ?? '', slug: m.slug, name: m.name, brand: m.brand ?? '', summary: m.summary ?? '', ingredients: m.ingredients ?? '', usage: m.usage ?? '', safety: m.safety ?? '',
      unit: m.unit ?? '', price: m.price_from == null ? '' : String(m.price_from), priceNote: m.price_note ?? '', distributor: m.distributor ?? '', image: m.image ?? '', status: m.status, sort: String(m.sort_order) } : emptyMat);
  };
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!f) return;
    setErr(null);
    try {
      await rpc('site_save_material', { p_id: f.id, p_category: f.category || null, p_slug: f.slug, p_name: f.name, p_brand: f.brand, p_summary: f.summary, p_ingredients: f.ingredients, p_usage: f.usage, p_safety: f.safety,
        p_unit: f.unit, p_price_from: num(f.price), p_price_note: f.priceNote, p_distributor: f.distributor, p_image: f.image, p_status: f.status, p_sort: Number(f.sort) || 0, p_version: f.version });
      setMsg('Đã lưu.'); setF(null); reload();
    } catch (x) { setErr(err2(x)); }
  }
  async function remove() {
    if (!f?.id || !window.confirm('Xóa vật tư này? Nếu chỉ muốn ẩn, hãy đổi trạng thái thành "Đã gỡ".')) return;
    try { await rpc('site_delete_material', { p_id: f.id }); setF(null); reload(); } catch (x) { setErr(err2(x)); }
  }
  async function importFile(file: File | undefined) {
    if (!file) return;
    setCsvMsg(null);
    try {
      const rows = parseCsv(await file.text());
      if (rows.length < 2) throw new Error('Tệp cần có dòng tiêu đề và ít nhất một dòng dữ liệu.');
      const head = rows[0]!.map((h) => h.trim().toLowerCase());
      const idx = CSV_COLS.map(([key, aliases]) => [key, head.findIndex((h) => aliases.includes(h))] as const);
      if (idx.find(([k]) => k === 'name')![1] < 0) throw new Error('Không thấy cột "Tên" ở dòng tiêu đề.');
      const items = rows.slice(1).map((r) => Object.fromEntries(idx.filter(([, i]) => i >= 0).map(([k, i]) => [k, (r[i] ?? '').trim()])));
      let created = 0; const skipped: string[] = [];
      for (let i = 0; i < items.length; i += 200) {
        const res = await rpc<{ created: number; skipped: { name: string; why: string }[] }>('site_import_materials', { p_rows: items.slice(i, i + 200) });
        created += res.created; skipped.push(...res.skipped.map((s) => `${s.name || '(trống)'}: ${s.why}`));
      }
      setCsvMsg(`Đã nhập ${created} vật tư (ở dạng Nháp, hãy kiểm tra rồi đăng).${skipped.length ? ` Bỏ qua ${skipped.length} dòng: ${skipped.slice(0, 8).join('; ')}${skipped.length > 8 ? '…' : ''}` : ''}`);
      reload();
    } catch (x) { setCsvMsg('LỖI: ' + err2(x)); }
  }
  const isLocked = f ? locked(roles, (data?.rows ?? []).find((m) => m.id === f.id)?.status) : false;
  const rows = (data?.rows ?? []).filter((m) => !filter || m.status === filter);

  return (
    <>
      <p className="muted">Vật tư nông nghiệp đợt đầu do quản trị viên nhập và đăng lên website; người mua gửi "Yêu cầu báo giá" (xem mục Yêu cầu báo giá). Chưa nhập thuốc bảo vệ thực vật, thuốc thú y.</p>
      <Err e={error} />{msg && <p className="msg ok" role="status">{msg}</p>}
      {!f && (
        <div className="toolbar">
          <button className="primary" onClick={() => open(null)}>+ Thêm vật tư</button>
          <button onClick={() => setCsv(!csv)}>Nhập từ tệp CSV</button>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">Mọi trạng thái</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </div>
      )}
      {csv && !f && (
        <section className="card">
          <h2>Nhập vật tư từ tệp CSV</h2>
          <p className="muted">Tệp CSV có dòng tiêu đề: Tên, Danh mục (địa chỉ danh mục, ví dụ phan-bon), Thương hiệu, Mô tả ngắn, Thành phần, Hướng dẫn, Đơn vị, Giá từ, Giá chữ, Nhà phân phối. Chỉ cột Tên là bắt buộc. Mọi dòng vào dạng <b>Nháp</b>; tên trùng thì bỏ qua. Tệp lưu từ Excel dạng "CSV UTF-8".</p>
          <div className="toolbar"><button onClick={() => downloadCsv('mau-nhap-vat-tu.csv', CSV_SAMPLE)}>Tải tệp mẫu</button><input type="file" accept=".csv,text/csv" onChange={(e) => void importFile(e.target.files?.[0])} /></div>
          {csvMsg && <p className={`msg ${csvMsg.startsWith('LỖI') ? 'error' : 'ok'}`} role="status">{csvMsg}</p>}
          <small>Danh mục có sẵn: {cats.map((c) => c.slug).join(', ') || '—'}</small>
        </section>
      )}
      {f && (
        <section className="card">
          <h2>{f.id ? `Sửa vật tư: ${f.name}` : 'Thêm vật tư'}</h2>
          {isLocked && <p className="msg error">Vật tư đã đăng chỉ tổng biên tập hoặc quản trị viên được sửa.</p>}
          <form className="form" onSubmit={(e) => void save(e)}>
            <label>Tên vật tư<input value={f.name} maxLength={160} onChange={(e) => setF({ ...f, name: e.target.value, slug: f.id ? f.slug : slugify(e.target.value) })} /></label>
            <label>Địa chỉ (không dấu)<input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.trim().toLowerCase() })} /><small>/vat-tu/{f.slug || '…'}</small></label>
            <label>Danh mục
              <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="">(Chưa chọn)</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </label>
            <label>Thương hiệu<input value={f.brand} maxLength={80} onChange={(e) => setF({ ...f, brand: e.target.value })} /></label>
            <label>Mô tả ngắn<input value={f.summary} maxLength={300} onChange={(e) => setF({ ...f, summary: e.target.value })} /></label>
            <label>Thành phần<textarea rows={2} maxLength={500} value={f.ingredients} onChange={(e) => setF({ ...f, ingredients: e.target.value })} /></label>
            <label>Hướng dẫn sử dụng<textarea rows={3} maxLength={1500} value={f.usage} onChange={(e) => setF({ ...f, usage: e.target.value })} /></label>
            <label>Lưu ý an toàn<textarea rows={2} maxLength={800} value={f.safety} onChange={(e) => setF({ ...f, safety: e.target.value })} /></label>
            <label>Đơn vị bán<input value={f.unit} maxLength={30} onChange={(e) => setF({ ...f, unit: e.target.value })} placeholder="kg, bao, chai…" /></label>
            <label>Giá tham khảo "từ" (đồng)<input value={f.price} inputMode="numeric" onChange={(e) => setF({ ...f, price: e.target.value })} /></label>
            <label>Hoặc ghi chữ (nếu không có giá số)<input value={f.priceNote} maxLength={120} onChange={(e) => setF({ ...f, priceNote: e.target.value })} placeholder="Liên hệ báo giá" /></label>
            <label>Nhà phân phối / nơi liên hệ<input value={f.distributor} maxLength={200} onChange={(e) => setF({ ...f, distributor: e.target.value })} /></label>
            <ImageField label="Ảnh sản phẩm" value={f.image} max={640} limit={80_000} onChange={(v) => setF({ ...f, image: v })} />
            <label>Thứ tự<input value={f.sort} inputMode="numeric" onChange={(e) => setF({ ...f, sort: e.target.value })} /></label>
            <label>Trạng thái
              <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{statusOptions(roles).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>
            </label>
            <Err e={err} />
            <div className="toolbar"><button className="primary" disabled={isLocked}>Lưu</button><button type="button" onClick={() => setF(null)}>Hủy</button>{f.id && canPublish(roles) && <button type="button" onClick={() => void remove()}>Xóa</button>}</div>
          </form>
        </section>
      )}
      {!f && (
        <table className="list"><thead><tr><th>Ảnh</th><th>Vật tư</th><th>Danh mục</th><th>Giá từ</th><th>Trạng thái</th><th></th></tr></thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td>{m.image ? <img src={m.image} alt="" style={{ width: 56, borderRadius: 6 }} /> : ''}</td>
                <td><strong>{m.name}</strong>{m.brand && <small>{m.brand}</small>}</td><td>{catName(m.category_id)}</td>
                <td>{m.price_from ? `${Number(m.price_from).toLocaleString('vi-VN')} đ` : m.price_note ?? ''}</td><td><SiteBadge s={m.status} /></td>
                <td className="acts"><button onClick={() => open(m)}>Sửa</button>{m.status === 'published' && SITE_URL && <a href={`${SITE_URL}/vat-tu/${m.slug}`} target="_blank" rel="noopener noreferrer">Xem</a>}</td>
              </tr>))}
            {rows.length === 0 && <tr><td colSpan={6} className="muted">Chưa có vật tư.</td></tr>}
          </tbody></table>
      )}
    </>
  );
}

// ============================================================ Bài viết, tin xuất khẩu, tin hội chợ
interface ArtRow { id: string; channel: string; section: string | null; slug: string; title: string; summary: string | null; body: string; image: string | null; source_name: string | null; source_url: string | null; event_start: string | null; event_end: string | null; event_place: string | null; event_organizer: string | null; status: string; published_at: string | null; version: number; updated_at: string }
interface ArtForm { id: string | null; version: number | null; channel: string; section: string; slug: string; title: string; summary: string; body: string; image: string; sourceName: string; sourceUrl: string; start: string; end: string; place: string; organizer: string; status: string; publishedAt: string }
const CHANNEL_LABEL: Record<string, string> = { nong_nghiep: 'Tin nông nghiệp', xuat_khau: 'Tin xuất khẩu', hoi_cho: 'Tin hội chợ' };
const CHANNEL_HREF: Record<string, string> = { nong_nghiep: '/tin-nong-nghiep/', xuat_khau: '/tin-xuat-khau/', hoi_cho: '/tin-hoi-cho/' };
const sectionsOf = (channel: string) => (DEFAULT_HEADER_NAV.find((i) => i.href === CHANNEL_HREF[channel])?.children ?? []).map((c) => ({ slug: c.href.split('/').filter(Boolean).pop() ?? '', label: c.label }));
const emptyArt: ArtForm = { id: null, version: null, channel: 'nong_nghiep', section: '', slug: '', title: '', summary: '', body: '', image: '', sourceName: '', sourceUrl: '', start: '', end: '', place: '', organizer: '', status: 'draft', publishedAt: '' };
const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');

export function SiteArticlesPage({ roles }: { roles: string[] }) {
  const { data, error, reload } = useLoad(async () => {
    const { data: rows, error: e } = await supabase!.from('site_articles').select('id, channel, section, slug, title, summary, body, image, source_name, source_url, event_start, event_end, event_place, event_organizer, status, published_at, version, updated_at').order('updated_at', { ascending: false });
    if (e) throw new Error(e.message);
    return (rows ?? []) as ArtRow[];
  });
  const [f, setF] = useState<ArtForm | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const open = (a: ArtRow | null) => {
    setErr(null);
    setF(a ? { id: a.id, version: a.version, channel: a.channel, section: a.section ?? '', slug: a.slug, title: a.title, summary: a.summary ?? '', body: a.body, image: a.image ?? '', sourceName: a.source_name ?? '', sourceUrl: a.source_url ?? '',
      start: a.event_start ?? '', end: a.event_end ?? '', place: a.event_place ?? '', organizer: a.event_organizer ?? '', status: a.status, publishedAt: toLocal(a.published_at) } : emptyArt);
  };
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!f) return;
    setErr(null);
    if (f.sourceUrl && !/^https:\/\/\S+$/.test(f.sourceUrl)) { setErr('Liên kết nguồn phải bắt đầu bằng https://'); return; }
    try {
      const hoi = f.channel === 'hoi_cho';
      await rpc('site_save_article', { p_id: f.id, p_channel: f.channel, p_section: hoi ? '' : f.section, p_slug: f.slug, p_title: f.title, p_summary: f.summary, p_body: f.body, p_image: f.image, p_source_name: f.sourceName, p_source_url: f.sourceUrl,
        p_event_start: hoi && f.start ? f.start : null, p_event_end: hoi && f.end ? f.end : null, p_event_place: hoi ? f.place : '', p_event_organizer: hoi ? f.organizer : '', p_status: f.status,
        p_published_at: f.publishedAt ? new Date(f.publishedAt).toISOString() : null, p_version: f.version });
      setF(null); reload();
    } catch (x) { setErr(err2(x)); }
  }
  async function remove() {
    if (!f?.id || !window.confirm('Xóa bài này? Nếu chỉ muốn ẩn, hãy đổi trạng thái thành "Đã gỡ".')) return;
    try { await rpc('site_delete_article', { p_id: f.id }); setF(null); reload(); } catch (x) { setErr(err2(x)); }
  }
  const isLocked = f ? locked(roles, (data ?? []).find((a) => a.id === f.id)?.status) : false;
  const rows = (data ?? []).filter((a) => !filter || a.channel === filter);
  const blocks = f ? parseBody(f.body) : [];

  return (
    <>
      <p className="muted">Tin nông nghiệp, tin xuất khẩu và tin hội chợ hiện ở menu Tin trên website. Giá nông sản tham khảo và Lịch thời vụ là bài thuộc mục tương ứng của Tin nông nghiệp.</p>
      <Err e={error} />
      {!f && <div className="toolbar"><button className="primary" onClick={() => open(null)}>+ Thêm bài</button>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">Mọi chuyên mục</option>{Object.entries(CHANNEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>}
      {f && (
        <section className="card">
          <h2>{f.id ? 'Sửa bài' : 'Thêm bài'}</h2>
          {isLocked && <p className="msg error">Bài đã đăng chỉ tổng biên tập hoặc quản trị viên được sửa.</p>}
          <form className="form" onSubmit={(e) => void save(e)}>
            <label>Chuyên mục
              <select value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value, section: '' })}>{Object.entries(CHANNEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </label>
            {f.channel !== 'hoi_cho' && (
              <label>Mục con
                <select value={f.section} onChange={(e) => setF({ ...f, section: e.target.value })}><option value="">(Chung)</option>{sectionsOf(f.channel).map((s) => <option key={s.slug} value={s.slug}>{s.label}</option>)}</select>
              </label>
            )}
            <label>Tiêu đề<input value={f.title} maxLength={200} onChange={(e) => setF({ ...f, title: e.target.value, slug: f.id ? f.slug : slugify(e.target.value).slice(0, 80) })} /></label>
            <label>Địa chỉ bài (không dấu)<input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.trim().toLowerCase() })} /><small>/bai-viet/{f.slug || '…'}</small></label>
            <label>Tóm tắt (hiện đầu bài và khi chia sẻ)<textarea rows={2} maxLength={400} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} /></label>
            {f.channel === 'hoi_cho' && (
              <>
                <label>Ngày bắt đầu<input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></label>
                <label>Ngày kết thúc (nếu nhiều ngày)<input type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></label>
                <label>Địa điểm<input value={f.place} maxLength={200} onChange={(e) => setF({ ...f, place: e.target.value })} /></label>
                <label>Đơn vị tổ chức<input value={f.organizer} maxLength={200} onChange={(e) => setF({ ...f, organizer: e.target.value })} /></label>
              </>
            )}
            <label>Nội dung
              <textarea rows={12} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
              <small>Dòng trống = sang đoạn mới. <code>## Tiêu đề nhỏ</code> · dòng bắt đầu bằng <code>- </code> là danh sách · <code>[[Chữ trên nút|/duong-dan]]</code> tạo nút.</small>
            </label>
            <ImageField label="Ảnh đại diện" value={f.image} max={720} limit={90_000} onChange={(v) => setF({ ...f, image: v })} />
            <label>Nguồn tin (nếu dẫn lại)<input value={f.sourceName} maxLength={120} onChange={(e) => setF({ ...f, sourceName: e.target.value })} placeholder="Tên báo/đơn vị" /></label>
            <label>Liên kết nguồn (https://…)<input value={f.sourceUrl} onChange={(e) => setF({ ...f, sourceUrl: e.target.value.trim() })} /></label>
            <label>Thời điểm đăng (để trống = ngay khi đăng; chọn tương lai để hẹn giờ)<input type="datetime-local" value={f.publishedAt} onChange={(e) => setF({ ...f, publishedAt: e.target.value })} /></label>
            <label>Trạng thái
              <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{statusOptions(roles).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>
              {!canPublish(roles) && <small>Bạn soạn nháp rồi chọn "Chờ duyệt"; tổng biên tập sẽ đăng.</small>}
            </label>
            <Err e={err} />
            <div className="toolbar"><button className="primary" disabled={isLocked}>Lưu</button><button type="button" onClick={() => setF(null)}>Hủy</button>{f.id && canPublish(roles) && <button type="button" onClick={() => void remove()}>Xóa bài</button>}</div>
          </form>
          <h2>Xem trước nội dung</h2>
          <div className="card" style={{ background: 'transparent' }}>
            {blocks.map((b, i) => (b.t === 'h' ? <h4 key={i}>{b.text}</h4> : b.t === 'p' ? <p key={i}>{b.text}</p> : b.t === 'ul' ? <ul key={i}>{b.items.map((x, j) => <li key={j}>{x}</li>)}</ul> : <p key={i}><button type="button">{b.label}</button> <small>→ {b.href}</small></p>))}
          </div>
        </section>
      )}
      {!f && (
        <table className="list"><thead><tr><th>Bài</th><th>Chuyên mục</th><th>Trạng thái</th><th>Cập nhật</th><th></th></tr></thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td><strong>{a.title}</strong>{a.channel === 'hoi_cho' && a.event_start && <small>Ngày {new Date(a.event_start).toLocaleDateString('vi-VN')}{a.event_place ? ` · ${a.event_place}` : ''}</small>}</td>
                <td>{CHANNEL_LABEL[a.channel]}{a.section ? ` / ${sectionsOf(a.channel).find((s) => s.slug === a.section)?.label ?? a.section}` : ''}</td>
                <td><SiteBadge s={a.status} />{a.status === 'published' && a.published_at && new Date(a.published_at) > new Date() && <small>Hẹn {fmtDateTime(a.published_at)}</small>}</td>
                <td>{fmtDateTime(a.updated_at)}</td>
                <td className="acts"><button onClick={() => open(a)}>Sửa</button>{a.status === 'published' && SITE_URL && <a href={`${SITE_URL}/bai-viet/${a.slug}`} target="_blank" rel="noopener noreferrer">Xem</a>}</td>
              </tr>))}
            {rows.length === 0 && <tr><td colSpan={5} className="muted">Chưa có bài nào.</td></tr>}
          </tbody></table>
      )}
    </>
  );
}

// ============================================================ Yêu cầu báo giá
interface QuoteRow { id: string; kind: string; target_name: string | null; org_name: string | null; sender_name: string; sender_phone: string | null; sender_email: string | null; quantity_note: string | null; message: string; status: string; note: string | null; created_at: string }
const KIND_LABEL: Record<string, string> = { material: 'Vật tư', product: 'Sản phẩm', profile: 'Nhà cung cấp', general: 'Chung' };

export function SiteQuotesPage() {
  const [status, setStatus] = useState('new');
  const { data, error, reload } = useLoad(() => rpc<QuoteRow[]>('site_list_quotes', { p_status: status || null, p_limit: 200 }), [status]);
  const [err, setErr] = useState<string | null>(null);
  async function set(q: QuoteRow, st: string) {
    setErr(null);
    const note = st === 'handled' ? window.prompt('Ghi chú (tùy chọn), ví dụ: đã gọi lại, đã chuyển cho nhà cung cấp', q.note ?? '') : q.note;
    if (note === null) return;
    try { await rpc('site_set_quote', { p_id: q.id, p_status: st, p_note: note ?? '' }); reload(); } catch (x) { setErr(err2(x)); }
  }
  return (
    <>
      <p className="muted">Yêu cầu do khách gửi từ website (không cần tài khoản). Hãy liên hệ lại và chuyển thông tin cho nhà cung cấp hoặc nhà phân phối. Thông tin này là dữ liệu cá nhân, chỉ dùng để xử lý yêu cầu.</p>
      <div className="toolbar"><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="new">Mới</option><option value="handled">Đã xử lý</option><option value="spam">Rác</option><option value="">Tất cả</option></select></div>
      <Err e={error ?? err} />
      <table className="list"><thead><tr><th>Thời gian</th><th>Hỏi về</th><th>Người gửi</th><th>Nội dung</th><th></th></tr></thead>
        <tbody>
          {(data ?? []).map((q) => (
            <tr key={q.id}>
              <td>{fmtDateTime(q.created_at)}<small>{q.status === 'new' ? 'Mới' : q.status === 'handled' ? 'Đã xử lý' : 'Rác'}</small></td>
              <td><strong>{q.target_name ?? 'Chung'}</strong><small>{KIND_LABEL[q.kind]}{q.org_name ? ` · ${q.org_name}` : ''}</small></td>
              <td>{q.sender_name}<small>{[q.sender_phone, q.sender_email].filter(Boolean).join(' · ')}</small></td>
              <td>{q.message}{q.quantity_note && <small>Số lượng: {q.quantity_note}</small>}{q.note && <small>Ghi chú: {q.note}</small>}</td>
              <td className="acts">{q.status !== 'handled' && <button onClick={() => void set(q, 'handled')}>Đã xử lý</button>}{q.status !== 'spam' && <button onClick={() => void set(q, 'spam')}>Rác</button>}{q.status !== 'new' && <button onClick={() => void set(q, 'new')}>Mở lại</button>}</td>
            </tr>))}
          {(data ?? []).length === 0 && <tr><td colSpan={5} className="muted">Không có yêu cầu.</td></tr>}
        </tbody></table>
    </>
  );
}
