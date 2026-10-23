import { useEffect, useState } from 'react';
import { db } from './db';
import { dataUrlToFile, fileToBlobs } from './image';
import { supabase } from './supabase';

/**
 * Kho ảnh riêng 'org-media' (G2-1, D75). Cột image của bản ghi giữ tham chiếu ngắn "storage:<mã cơ sở>/<loại>/<mã ảnh>.jpg"
 * (ảnh nhỏ là cùng tên thêm "_t"); ảnh cũ dạng data URL vẫn dùng được song song cho tới khi chuyển xong.
 */
export type ImageKind = 'areas' | 'crops' | 'materials' | 'licenses';
export const BUCKET = 'org-media';
const PREFIX = 'storage:';

export const isStorageRef = (v: string | null | undefined): v is string => Boolean(v && v.startsWith(PREFIX));
const pathOf = (ref: string) => ref.slice(PREFIX.length);
const thumbPath = (path: string) => path.replace(/\.jpg$/, '_t.jpg');

/** Đưa một ảnh lên kho (cần mạng). Trả về tham chiếu để lưu vào cột image. */
export async function uploadImage(file: File, orgId: string, kind: ImageKind): Promise<string> {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  if (!navigator.onLine) throw new Error('OFFLINE: Cần có mạng để thêm ảnh. Hãy kết nối mạng rồi thử lại.');
  const { full, thumb } = await fileToBlobs(file);
  const path = `${orgId}/${kind}/${crypto.randomUUID()}.jpg`;
  const opts = { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false };
  const a = await supabase.storage.from(BUCKET).upload(path, full, opts);
  if (a.error) throw new Error(a.error.message);
  const b = await supabase.storage.from(BUCKET).upload(thumbPath(path), thumb, opts);
  if (b.error) {
    await supabase.storage.from(BUCKET).remove([path]); // không để lại ảnh mồ côi
    throw new Error(b.error.message);
  }
  // giữ luôn bản vừa chọn trên máy để hiện ngay, không phải tải lại
  await db.media.put({ key: `${path}|t`, blob: thumb, at: Date.now() });
  await db.media.put({ key: `${path}|f`, blob: full, at: Date.now() });
  return PREFIX + path;
}

/** Xóa ảnh khỏi kho (cố gắng hết sức; không báo lỗi nếu không xóa được) */
export async function removeImage(ref: string | null | undefined): Promise<void> {
  if (!supabase || !isStorageRef(ref) || !navigator.onLine) return;
  const p = pathOf(ref);
  try { await supabase.storage.from(BUCKET).remove([p, thumbPath(p)]); } catch { /* bỏ qua */ }
  await db.media.bulkDelete([`${p}|t`, `${p}|f`]);
}

const MAX_CACHE_ITEMS = 400; // vài chục MB; bỏ bớt ảnh lâu không xem nhất

async function trimCache(): Promise<void> {
  const n = await db.media.count();
  if (n <= MAX_CACHE_ITEMS) return;
  const old = await db.media.orderBy('at').limit(n - MAX_CACHE_ITEMS).primaryKeys();
  await db.media.bulkDelete(old);
}

const inflight = new Map<string, Promise<Blob | null>>();

/** Lấy ảnh: ưu tiên bản đã lưu trên máy, không có thì tải từ kho (cần mạng) rồi lưu lại để dùng offline */
async function loadBlob(ref: string, size: 'f' | 't'): Promise<Blob | null> {
  const path = pathOf(ref);
  const key = `${path}|${size}`;
  const hit = await db.media.get(key);
  if (hit) { void db.media.update(key, { at: Date.now() }); return hit.blob; }
  const client = supabase;
  if (!client || !navigator.onLine) return null;
  let p = inflight.get(key);
  if (!p) {
    p = (async () => {
      const { data, error } = await client.storage.from(BUCKET).download(size === 't' ? thumbPath(path) : path);
      if (error || !data) return null;
      await db.media.put({ key, blob: data, at: Date.now() });
      void trimCache();
      return data;
    })().finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

/**
 * Địa chỉ ảnh dùng được trong thẻ <img>: data URL cũ dùng nguyên; tham chiếu kho thì tải (hoặc lấy từ máy) rồi đổi thành địa chỉ tạm.
 * `size` 't' = ảnh nhỏ cho danh sách, 'f' = ảnh đầy đủ. Chưa có ảnh hoặc mất mạng chưa tải được thì trả null.
 */
export function useImageSrc(value: string | null | undefined, size: 't' | 'f' = 't'): string | null {
  const [src, setSrc] = useState<string | null>(() => (value && !isStorageRef(value) ? value : null));
  useEffect(() => {
    if (!value) { setSrc(null); return; }
    if (!isStorageRef(value)) { setSrc(value); return; }
    let alive = true;
    let url: string | null = null;
    setSrc(null);
    void loadBlob(value, size).then((b) => {
      if (!alive || !b) return;
      url = URL.createObjectURL(b);
      setSrc(url);
    });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [value, size]);
  return src;
}

export interface MigrateReport { moved: number; failed: number }

/**
 * Chuyển ảnh cũ (data URL trong cột) của một cơ sở sang kho ảnh. An toàn: chỉ sửa cột image của dòng SAU KHI tải lên thành công,
 * dòng nào lỗi thì giữ nguyên ảnh cũ; chạy lại nhiều lần được (bỏ qua ảnh đã chuyển).
 */
export async function migrateOldImages(orgId: string, onProgress?: (done: number, total: number) => void): Promise<MigrateReport> {
  const client = supabase;
  if (!client) throw new Error('Supabase chưa được cấu hình');
  if (!navigator.onLine) throw new Error('OFFLINE: Cần có mạng để chuyển ảnh. Hãy kết nối mạng rồi thử lại.');
  const sources: { table: string; kind: ImageKind }[] = [
    { table: 'production_areas', kind: 'areas' },
    { table: 'crop_types', kind: 'crops' },
    { table: 'materials', kind: 'materials' },
    { table: 'org_catalog_overrides', kind: 'crops' },
    { table: 'org_licenses', kind: 'licenses' },
  ];
  type Row = { id?: string; item_kind?: string; item_id?: string; image: string };
  const jobs: { table: string; kind: ImageKind; row: Row }[] = [];
  for (const s of sources) {
    const sel = s.table === 'org_catalog_overrides' ? 'item_kind, item_id, image' : 'id, image';
    const { data, error } = await client.from(s.table).select(sel).eq('organization_id', orgId).like('image', 'data:%');
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as unknown as Row[]) jobs.push({ table: s.table, kind: s.kind, row });
  }
  let moved = 0;
  let failed = 0;
  for (const [i, j] of jobs.entries()) {
    try {
      const ref = await uploadImage(await dataUrlToFile(j.row.image), orgId, j.kind);
      const q = client.from(j.table).update({ image: ref });
      const { error } = j.table === 'org_catalog_overrides'
        ? await q.eq('organization_id', orgId).eq('item_kind', j.row.item_kind!).eq('item_id', j.row.item_id!)
        : await q.eq('id', j.row.id!);
      if (error) throw new Error(error.message);
      moved++;
    } catch {
      failed++;
    }
    onProgress?.(i + 1, jobs.length);
  }
  return { moved, failed };
}
