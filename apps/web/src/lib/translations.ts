import { sb } from './db';

/**
 * Bản dịch tiếng Anh do quản trị nhập (migration 0052). Lưu đệm ~60 giây trong bộ nhớ của Worker; lỗi/chậm thì bỏ qua (website hiện tiếng Việt).
 */
export interface Translations { glossary: Record<string, string>; page: Record<string, Record<string, string>>; article: Record<string, Record<string, string>> }
const EMPTY: Translations = { glossary: {}, page: {}, article: {} };
const TTL = 60_000;
let memo: { at: number; v: Translations } | null = null;

export async function loadTranslations(): Promise<Translations> {
  if (memo && Date.now() - memo.at < TTL) return memo.v;
  if (!sb) return EMPTY;
  try {
    const r = await Promise.race([
      sb.from('site_translations').select('kind, ref, fields').eq('lang', 'en').limit(2000),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 2500)),
    ]);
    if (r.error) throw new Error(r.error.message);
    const v: Translations = { glossary: {}, page: {}, article: {} };
    for (const row of (r.data ?? []) as { kind: string; ref: string; fields: Record<string, string> }[]) {
      if (row.kind === 'glossary') { if (row.fields.en) v.glossary[row.ref.replace(/\s+/g, ' ').trim()] = row.fields.en; }
      else if (row.kind === 'page' || row.kind === 'article') v[row.kind][row.ref] = row.fields;
    }
    memo = { at: Date.now(), v };
    return v;
  } catch {
    memo = { at: Date.now() - TTL + 8_000, v: memo?.v ?? EMPTY };
    return memo.v;
  }
}

/** Áp bản dịch của bài viết (nếu có) khi xem bằng tiếng Anh */
export function localizeArticle<T extends { slug: string; title: string; summary: string; body: string }>(a: T, tr: Translations | undefined): T {
  const f = tr?.article[a.slug];
  return f ? { ...a, title: f.title ?? a.title, summary: f.summary ?? a.summary, body: f.body ?? a.body } : a;
}
export function localizePage<T extends { title: string; description: string; body: string }>(p: T, slug: string, tr: Translations | undefined): T {
  const f = tr?.page[slug];
  return f ? { ...p, title: f.title ?? p.title, description: f.description ?? p.description, body: f.body ?? p.body } : p;
}
