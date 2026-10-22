import { useState } from 'react';
import { DEFAULT_ABOUT_MENU, DEFAULT_FOOTER_COLS, DEFAULT_HEADER_NAV, DEFAULT_SETTINGS } from '@agriconnect/shared';
import { hasTranslation, hasVietnamese } from '@agriconnect/shared/src/i18n';
import { clean, Err, rpc, supabase, useLoad } from '@agriconnect/admin-kit';
import { SITE_URL } from './site';

/**
 * Bản dịch tiếng Anh của nội dung (W8, D71). Tiếng Việt là bản gốc; chưa dịch thì website hiện tiếng Việt.
 *  - Cụm từ chung: chữ nguyên câu như menu, banner, tên danh mục, khẩu hiệu. Mục "Chữ còn thiếu" tự liệt kê những chữ chưa có bản dịch.
 *  - Trang tĩnh và bài viết: dịch riêng từng trang/bài (tiêu đề, mô tả/tóm tắt, thân bài).
 * Quyền ghi do CSDL ép (migration 0052): tổng biên tập, biên tập viên.
 */
interface TRow { kind: string; ref: string; fields: Record<string, string> }
interface Candidate { text: string; from: string }

function collect(menus: { key: string; items: unknown }[], banners: { title: string; subtitle: string | null }[], cats: { name: string; description: string | null }[], settings: { key: string; value: Record<string, string> }[]): Candidate[] {
  const out = new Map<string, string>();
  const add = (t: unknown, from: string) => { const s = typeof t === 'string' ? t.replace(/\s+/g, ' ').trim() : ''; if (s && hasVietnamese(s) && !out.has(s)) out.set(s, from); };
  const nav = (items: unknown, from: string) => {
    if (!Array.isArray(items)) return;
    for (const it of items as { label?: string; title?: string; children?: unknown; links?: unknown }[]) { add(it.label, from); add(it.title, from); nav(it.children, from); nav(it.links, from); }
  };
  // menu mặc định cũng là chữ hiển thị nếu quản trị chưa lưu menu riêng
  nav(DEFAULT_HEADER_NAV, 'Menu'); nav(DEFAULT_ABOUT_MENU, 'Menu'); nav(DEFAULT_FOOTER_COLS, 'Chân trang');
  for (const m of menus) nav(m.items, m.key === 'footer_cols' ? 'Chân trang' : 'Menu');
  for (const b of banners) { add(b.title, 'Banner'); add(b.subtitle, 'Banner'); }
  for (const c of cats) { add(c.name, 'Danh mục'); add(c.description, 'Danh mục'); }
  for (const v of Object.values(DEFAULT_SETTINGS.brand)) add(v, 'Thông tin chung');
  for (const s of settings) for (const v of Object.values(s.value ?? {})) add(v, 'Thông tin chung');
  return [...out.entries()].map(([text, from]) => ({ text, from }));
}

export function SiteTranslationsPage() {
  const [tab, setTab] = useState<'glossary' | 'page' | 'article'>('glossary');
  const { data, error, reload } = useLoad(async () => {
    const [t, m, b, c, s, p, a] = await Promise.all([
      supabase!.from('site_translations').select('kind, ref, fields').eq('lang', 'en'),
      supabase!.from('site_menus').select('key, items'),
      supabase!.from('site_banners').select('title, subtitle'),
      supabase!.from('product_categories').select('name, description'),
      supabase!.from('site_settings').select('key, value'),
      supabase!.from('site_pages').select('slug, title, description, body').order('slug'),
      supabase!.from('site_articles').select('slug, title, summary, body').order('created_at', { ascending: false }).limit(300),
    ]);
    for (const r of [t, m, b, c, s, p, a]) if (r.error) throw new Error(r.error.message);
    return {
      tr: (t.data ?? []) as TRow[],
      cand: collect((m.data ?? []) as never, (b.data ?? []) as never, (c.data ?? []) as never, (s.data ?? []) as never),
      pages: (p.data ?? []) as { slug: string; title: string; description: string | null; body: string }[],
      articles: (a.data ?? []) as { slug: string; title: string; summary: string | null; body: string }[],
    };
  }, []);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  async function save(kind: string, ref: string, fields: Record<string, string>) {
    setErr(null); setMsg(null);
    try { await rpc('site_save_translation', { p_kind: kind, p_ref: ref, p_fields: fields }); setMsg('Đã lưu bản dịch. Website cập nhật trong khoảng 1 phút.'); reload(); }
    catch (x) { setErr(clean(x instanceof Error ? x.message : String(x))); }
  }
  const tr = data?.tr ?? [];
  const find = (kind: string, ref: string) => tr.find((r) => r.kind === kind && r.ref === ref)?.fields ?? {};
  const gloss = tr.filter((r) => r.kind === 'glossary');
  const glossSet = new Set(gloss.map((g) => g.ref));
  const missing = (data?.cand ?? []).filter((c) => !hasTranslation(c.text) && !glossSet.has(c.text));

  return (
    <>
      <p className="muted">Tiếng Việt là bản gốc. Chữ nào chưa có bản tiếng Anh sẽ hiện tiếng Việt trên bản <b>EN</b> của website{SITE_URL ? <> (<a href={`${SITE_URL}/en/`} target="_blank" rel="noreferrer">mở bản tiếng Anh</a>)</> : null}. Giao diện cố định (nút, nhãn, thông báo) đã có sẵn bản dịch.</p>
      <div className="toolbar">
        <select value={tab} onChange={(e) => setTab(e.target.value as typeof tab)}>
          <option value="glossary">Cụm từ chung (menu, banner, danh mục, khẩu hiệu…)</option><option value="page">Trang tĩnh</option><option value="article">Bài viết và tin hội chợ</option>
        </select>
      </div>
      <Err e={error ?? err} />
      {msg && <p className="ok">{msg}</p>}

      {tab === 'glossary' && (
        <>
          <h2>Chữ còn thiếu bản dịch ({missing.length})</h2>
          {missing.length === 0 && <p className="muted">Mọi chữ trong menu, banner, danh mục và thông tin chung đều đã có bản dịch.</p>}
          {missing.map((c) => <GlossRow key={c.text} vi={c.text} en="" tag={c.from} onSave={(en) => save('glossary', c.text, { en })} />)}
          <h2>Cụm từ đã dịch ({gloss.length})</h2>
          {gloss.map((g) => <GlossRow key={g.ref} vi={g.ref} en={g.fields.en ?? ''} onSave={(en) => save('glossary', g.ref, { en })} onDelete={() => save('glossary', g.ref, {})} />)}
          <h2>Thêm cụm từ</h2>
          <GlossRow vi="" en="" editVi onSave={(en, vi) => { if (vi) void save('glossary', vi, { en }); }} />
        </>
      )}

      {tab === 'page' && (data?.pages ?? []).map((p) => (
        <LongRow key={p.slug} title={`/${p.slug}`} vi={{ title: p.title, description: p.description ?? '', body: p.body }} en={find('page', p.slug)}
          fields={[['title', 'Tiêu đề', false], ['description', 'Mô tả ngắn', false], ['body', 'Nội dung', true]]} onSave={(f) => save('page', p.slug, f)} />
      ))}
      {tab === 'page' && (data?.pages ?? []).length === 0 && <p className="muted">Chưa có trang tĩnh nào do quản trị soạn. Các trang mặc định đã có bản tiếng Anh sẵn.</p>}

      {tab === 'article' && (data?.articles ?? []).map((a) => (
        <LongRow key={a.slug} title={a.title} vi={{ title: a.title, summary: a.summary ?? '', body: a.body }} en={find('article', a.slug)}
          fields={[['title', 'Tiêu đề', false], ['summary', 'Tóm tắt', false], ['body', 'Nội dung', true]]} onSave={(f) => save('article', a.slug, f)} />
      ))}
    </>
  );
}

function GlossRow({ vi, en, tag, editVi, onSave, onDelete }: { vi: string; en: string; tag?: string; editVi?: boolean; onSave: (en: string, vi: string) => void; onDelete?: () => void }) {
  const [v, setV] = useState(vi);
  const [e, setE] = useState(en);
  return (
    <div className="card" style={{ padding: 10, margin: '6px 0' }}>
      {editVi ? <input value={v} onChange={(x) => setV(x.target.value)} placeholder="Câu tiếng Việt gốc (viết đúng nguyên văn)" style={{ width: '100%' }} />
        : <div><b>{vi}</b>{tag && <span className="badge"> {tag}</span>}</div>}
      <input value={e} onChange={(x) => setE(x.target.value)} placeholder="Bản tiếng Anh" style={{ width: '100%', marginTop: 6 }} maxLength={600} />
      <div className="acts"><button className="primary" disabled={!e.trim() || (editVi && !v.trim())} onClick={() => { onSave(e, v); if (editVi) { setV(''); setE(''); } }}>Lưu</button>{onDelete && <button className="danger" onClick={onDelete}>Xóa bản dịch</button>}</div>
    </div>
  );
}

function LongRow({ title, vi, en, fields, onSave }: { title: string; vi: Record<string, string>; en: Record<string, string>; fields: [string, string, boolean][]; onSave: (f: Record<string, string>) => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<Record<string, string>>(en);
  const done = Object.values(en).some(Boolean);
  return (
    <section className="card" style={{ margin: '8px 0' }}>
      <h2 style={{ cursor: 'pointer' }} onClick={() => setOpen(!open)}>{title} <span className={`badge ${done ? 'ok' : ''}`}>{done ? 'Đã có bản dịch' : 'Chưa dịch'}</span></h2>
      {open && (
        <>
          {fields.map(([k, label, long]) => (
            <div key={k} style={{ margin: '8px 0' }}>
              <b>{label}</b>
              <p className="muted" style={{ whiteSpace: 'pre-line', margin: '2px 0' }}>{vi[k] || '—'}</p>
              {long ? <textarea rows={8} style={{ width: '100%' }} value={f[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder="English" />
                : <input style={{ width: '100%' }} value={f[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder="English" />}
            </div>
          ))}
          <div className="acts"><button className="primary" onClick={() => onSave(f)}>Lưu bản dịch</button></div>
        </>
      )}
    </section>
  );
}
