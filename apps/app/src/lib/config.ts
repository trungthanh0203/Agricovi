import { useEffect, useState } from 'react';
import { useOrgs } from './orgs';
import { requireOnline } from './serverWrite';
import { supabase } from './supabase';

/**
 * Cấu hình của cơ sở (tab Cấu hình): mỗi cấu hình là một danh sách các mục nhỏ do chủ/quản lý sửa (nhập cách nhau bằng dấu phẩy).
 * Chỗ nào cần danh sách này (chọn nhóm loại sản phẩm, loại khu, kiểu nhà/chuồng…) lấy từ đây. Thêm cấu hình mới = thêm một mục vào CONFIG_DEFS
 * (và tên khóa vào hàm set_org_config ở CSDL). Chưa có giá trị đã lưu thì dùng `defaults`.
 *
 * Hai kiểu:
 * - 'fixed': mỗi mục gắn với một chức năng nên có MÃ cố định theo thứ tự (`codes`); chỉ đổi được TÊN gọi, giữ đúng số mục.
 * - 'free': mục chỉ là chữ để chọn; thêm, bớt, đổi tên thoải mái (giá trị lưu là chính chữ đó).
 */
export type ProductKind = 'crop' | 'livestock' | 'aquatic' | 'other';

export interface ConfigDef {
  id: string;
  title: string;
  hint: string;
  mode: 'fixed' | 'free';
  codes?: string[];
  defaults: string[];
}

export const CONFIG_DEFS: ConfigDef[] = [
  {
    id: 'product_groups',
    title: 'Nhóm loại sản phẩm',
    hint: 'Dùng để chọn loại khi khai báo Sản phẩm và Loại khu của Trang trại. Cần đúng 4 mục theo thứ tự: cây trồng, vật nuôi, thủy sản, khác (mỗi mục gắn với chức năng riêng nên chỉ đổi được tên gọi).',
    mode: 'fixed',
    codes: ['crop', 'livestock', 'aquatic', 'other'],
    defaults: ['Cây trồng', 'Vật nuôi', 'Thủy sản', 'Khác'],
  },
  {
    id: 'material_groups',
    title: 'Nhóm vật tư',
    hint: 'Dùng để chọn nhóm khi khai báo Vật tư. Cần đúng 8 mục theo thứ tự: thức ăn, thuốc thú y, vaccine, thuốc bảo vệ thực vật, phân bón, thuốc sát trùng, giống, khác (mỗi mục gắn với chức năng như tính FCR nên chỉ đổi được tên gọi).',
    mode: 'fixed',
    codes: ['feed', 'vet_drug', 'vaccine', 'pesticide', 'fertilizer', 'disinfectant', 'seed', 'other'],
    defaults: ['Thức ăn', 'Thuốc thú y', 'Vaccine', 'Thuốc bảo vệ thực vật', 'Phân bón', 'Thuốc sát trùng', 'Giống', 'Khác'],
  },
  {
    id: 'housing',
    title: 'Kiểu nhà / chuồng',
    hint: 'Dùng để chọn Kiểu nhà/chuồng của Trang trại. Thêm, bớt hoặc đổi tên tùy ý.',
    mode: 'free',
    defaults: ['Kín', 'Hở', 'Nửa kín hở'],
  },
];

/** Mã kiểu nhà/chuồng cũ (trước migration 0095) còn nằm trong bản lưu trên máy */
const LEGACY_HOUSING: Record<string, string> = { closed: 'Kín', semi_open: 'Nửa kín hở', open: 'Hở' };
export const housingText = (v: string | null | undefined) => (v ? LEGACY_HOUSING[v] ?? v : '');

/** Chữ nhập cách nhau bằng dấu phẩy → danh sách đã làm sạch (bỏ trống, bỏ trùng) */
export function parseItems(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[,\n;]/)) {
    const t = raw.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}
export const joinItems = (items: string[]) => items.join(', ');

/** Kiểm tra trước khi lưu; trả về lời nhắc tiếng Việt hoặc null nếu hợp lệ */
export function validateItems(def: ConfigDef, items: string[]): string | null {
  if (items.length === 0) return 'Cần ít nhất một mục.';
  if (items.some((i) => i.length > 40)) return 'Mỗi mục tối đa 40 ký tự.';
  if (def.mode === 'fixed' && items.length !== (def.codes?.length ?? 0)) {
    return `Cần đúng ${def.codes?.length} mục (hiện có ${items.length}). Chỉ đổi tên gọi, giữ thứ tự: ${def.defaults.join(', ')}.`;
  }
  return null;
}

// ------------------------------------------------------------------ kho nhớ theo cơ sở
type Store = Record<string, string[]>;
const mem = new Map<string, Store>();
const listeners = new Set<() => void>();
const storageKey = (org: string) => `agricovi.config.${org}`;
const emit = () => listeners.forEach((l) => l());

function read(org: string): Store {
  const hit = mem.get(org);
  if (hit) return hit;
  let s: Store = {};
  try { s = JSON.parse(localStorage.getItem(storageKey(org)) ?? '{}') as Store; } catch { /* không có bản lưu */ }
  mem.set(org, s);
  return s;
}

/** Tải cấu hình từ máy chủ (im lặng nếu chưa có mạng hoặc chưa db push 0095: dùng bản đã lưu hoặc mặc định) */
export async function loadConfig(org: string): Promise<void> {
  if (!supabase || !navigator.onLine) return;
  const { data, error } = await supabase.from('org_config').select('key, items').eq('organization_id', org);
  if (error) return;
  const s: Store = {};
  for (const r of data ?? []) s[r.key as string] = r.items as string[];
  mem.set(org, s);
  try { localStorage.setItem(storageKey(org), JSON.stringify(s)); } catch { /* bộ nhớ đầy hoặc bị chặn */ }
  emit();
}

/** Lưu một cấu hình (chủ/quản lý; cần mạng) */
export async function saveConfig(org: string, key: string, items: string[]): Promise<void> {
  requireOnline('lưu cấu hình');
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const { error } = await supabase.rpc('set_org_config', { p_org: org, p_key: key, p_items: items });
  if (error) throw new Error(error.message);
  await loadConfig(org);
}

/** Danh sách đang dùng của một cấu hình (đã lưu, nếu không hợp lệ thì mặc định) */
export function itemsOf(org: string | undefined, def: ConfigDef): string[] {
  const saved = org ? read(org)[def.id] : undefined;
  if (!saved || saved.length === 0) return def.defaults;
  if (def.mode === 'fixed' && saved.length !== (def.codes?.length ?? 0)) return def.defaults;
  return saved;
}

/** Hook: tự tải khi đổi cơ sở và tự vẽ lại khi cấu hình đổi */
export function useConfig() {
  const { active } = useOrgs();
  const org = active?.id;
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  useEffect(() => { if (org) void loadConfig(org); }, [org]);
  const def = (id: string) => CONFIG_DEFS.find((d) => d.id === id)!;
  return {
    org,
    items: (id: string) => itemsOf(org, def(id)),
    /** Nhóm loại sản phẩm: mã cố định + tên đang dùng */
    productGroups: (): { id: ProductKind; label: string }[] => {
      const d = def('product_groups');
      const labels = itemsOf(org, d);
      return d.codes!.map((c, i) => ({ id: c as ProductKind, label: labels[i]! }));
    },
    /** Tên gọi của một nhóm; mã lạ hoặc cũ ('growing') coi như cây trồng */
    groupLabel: (kind: string | null | undefined): string => {
      const d = def('product_groups');
      const labels = itemsOf(org, d);
      const i = d.codes!.indexOf(kind === 'growing' || !kind ? 'crop' : kind);
      return i >= 0 ? labels[i]! : kind ?? '';
    },
    housing: (): string[] => itemsOf(org, def('housing')),
    /** Nhóm vật tư: mã cố định + tên đang dùng */
    materialGroups: (): { id: string; label: string }[] => {
      const d = def('material_groups');
      const labels = itemsOf(org, d);
      return d.codes!.map((c, i) => ({ id: c, label: labels[i]! }));
    },
    materialGroupLabel: (code: string | null | undefined): string => {
      const d = def('material_groups');
      const i = code ? d.codes!.indexOf(code) : -1;
      return i >= 0 ? itemsOf(org, d)[i]! : '';
    },
  };
}
