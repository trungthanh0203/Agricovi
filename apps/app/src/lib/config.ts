import { useEffect, useState } from 'react';
import { useOrgs } from './orgs';
import { requireOnline } from './serverWrite';
import { supabase } from './supabase';

/**
 * Cấu hình của cơ sở (tab Cấu hình). Chỗ nào cần danh sách (chọn nhóm loại sản phẩm, loại ô, nhóm vật tư, kiểu ô…) lấy từ đây.
 * Thêm cấu hình mới = thêm một mục vào CONFIG_DEFS (và tên khóa vào hàm ở CSDL). Chưa có giá trị đã lưu thì dùng mặc định.
 *
 * Hai kiểu:
 * - 'free': mục chỉ là chữ để chọn, nhập cách nhau bằng dấu phẩy; thêm, bớt, đổi tên thoải mái (giá trị lưu là chính chữ đó).
 * - 'entries': mục CÓ MÃ vì chức năng của app chạy theo nhóm gốc. Mục có sẵn (builtin) mã cố định, không xóa (chỉ dừng); mục tự thêm có
 *   mã riêng và "tính như" một nhóm gốc. Bản ghi lưu NHÓM GỐC ở cột cũ (kind / material_group) + mã mục tự thêm ở cột mới (kind_item / group_item).
 */
export type ProductKind = 'crop' | 'livestock' | 'aquatic' | 'other';

export interface ConfigEntry { code: string; label: string; base: string; active: boolean }

export interface ConfigDef {
  id: string;
  title: string;
  hint: string;
  mode: 'free' | 'entries';
  /** chỉ với 'entries': các mục có sẵn (mã = nhóm gốc) */
  builtins?: { code: string; label: string }[];
  /** chỉ với 'free' */
  defaults: string[];
}

const PRODUCT_BUILTINS = [
  { code: 'crop', label: 'Cây trồng' }, { code: 'livestock', label: 'Vật nuôi' }, { code: 'aquatic', label: 'Thủy sản' }, { code: 'other', label: 'Khác' },
];
const EXPENSE_BUILTINS = [
  { code: 'material', label: 'Vật tư' }, { code: 'labor', label: 'Nhân công' }, { code: 'utility', label: 'Điện, nước' },
  { code: 'rent', label: 'Thuê đất, ao, nhà/chuồng' }, { code: 'depreciation', label: 'Khấu hao nhà/chuồng' }, { code: 'other', label: 'Chi phí khác' },
];
const MATERIAL_BUILTINS = [
  { code: 'feed', label: 'Thức ăn' }, { code: 'vet_drug', label: 'Thuốc thú y' }, { code: 'vaccine', label: 'Vaccine' },
  { code: 'pesticide', label: 'Thuốc bảo vệ thực vật' }, { code: 'fertilizer', label: 'Phân bón' }, { code: 'disinfectant', label: 'Thuốc sát trùng' },
  { code: 'seed', label: 'Giống' }, { code: 'other', label: 'Khác' },
];

export const CONFIG_DEFS: ConfigDef[] = [
  {
    id: 'product_groups', title: 'Nhóm loại sản phẩm', mode: 'entries', builtins: PRODUCT_BUILTINS, defaults: [],
    hint: 'Tích "Sử dụng" cho loại cơ sở của bạn làm (ví dụ chỉ Cây trồng; sau này làm thêm chăn nuôi thì tích thêm Vật nuôi). Các mục khác trong app chỉ hiện lựa chọn của loại đang sử dụng. Mục có sẵn đổi tên được, không xóa. Mục tự thêm phải chọn "tính như" một nhóm có sẵn (ví dụ Gia cầm tính như Vật nuôi) để các chức năng vẫn chạy đúng.',
  },
  {
    id: 'material_groups', title: 'Nhóm vật tư', mode: 'entries', builtins: MATERIAL_BUILTINS, defaults: [],
    hint: 'Dùng để chọn nhóm khi khai báo Vật tư. Mục có sẵn đổi tên hoặc dừng được, không xóa. Mục tự thêm phải chọn "tính như" một nhóm có sẵn (ví dụ Cám đậm đặc tính như Thức ăn để được tính vào FCR).',
  },
  {
    id: 'expense_groups', title: 'Nhóm chi phí', mode: 'entries', builtins: EXPENSE_BUILTINS, defaults: [],
    hint: 'Dùng để chọn Nhóm chi phí khi ghi chi phí. Mục có sẵn đổi tên hoặc dừng được, không xóa. Mục tự thêm phải chọn "tính như" một nhóm có sẵn (ví dụ Thức ăn chăn nuôi tính như Vật tư để báo cáo tách đúng khoản vật tư).',
  },
  {
    id: 'customer_kinds', title: 'Loại khách hàng', mode: 'free', defaults: ['Bán lẻ', 'Thương lái', 'Siêu thị / bếp ăn', 'Doanh nghiệp', 'HTX khác', 'Khác'],
    hint: 'Dùng để chọn Loại khách khi thêm/sửa Khách hàng. Chỉ để phân loại, thêm, bớt hoặc đổi tên tùy ý (khách cũ giữ nguyên loại đã chọn).',
  },
  {
    id: 'housing', title: 'Kiểu ô', mode: 'free', defaults: ['Kín', 'Hở', 'Nửa kín hở'],
    hint: 'Dùng để chọn Kiểu ô của ô sản xuất (ví dụ nhà màng kín hay hở, chuồng kín hay hở). Thêm, bớt hoặc đổi tên tùy ý.',
  },
];

/** Mã kiểu nhà/chuồng cũ (trước migration 0095) còn nằm trong bản lưu trên máy */
const LEGACY_HOUSING: Record<string, string> = { closed: 'Kín', semi_open: 'Nửa kín hở', open: 'Hở' };
/** Mã loại khách cũ (trước migration 0099) còn nằm trong bản lưu trên máy */
const LEGACY_CUSTOMER: Record<string, string> = { retail: 'Bán lẻ', trader: 'Thương lái', market: 'Siêu thị / bếp ăn', enterprise: 'Doanh nghiệp', coop: 'HTX khác', other: 'Khác' };
export const customerKindText = (v: string | null | undefined) => (v ? LEGACY_CUSTOMER[v] ?? v : '');
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

/** Kiểm tra danh sách tự do trước khi lưu; trả về lời nhắc tiếng Việt hoặc null nếu hợp lệ */
export function validateItems(_def: ConfigDef, items: string[]): string | null {
  if (items.length === 0) return 'Cần ít nhất một mục.';
  if (items.some((i) => i.length > 40)) return 'Mỗi mục tối đa 40 ký tự.';
  return null;
}

/** Kiểm tra danh sách mục có mã trước khi lưu */
export function validateEntries(list: ConfigEntry[]): string | null {
  if (list.some((e) => !e.label.trim())) return 'Tên mỗi mục không được để trống.';
  if (list.some((e) => e.label.trim().length > 40)) return 'Tên mỗi mục tối đa 40 ký tự.';
  const seen = new Set<string>();
  for (const e of list) {
    const k = e.label.trim().toLowerCase();
    if (seen.has(k)) return `Tên "${e.label.trim()}" bị trùng.`;
    seen.add(k);
  }
  if (!list.some((e) => e.active)) return 'Cần ít nhất một mục đang dùng.';
  return null;
}

/** Các loại gốc (crop/livestock/aquatic/other) cơ sở đang SỬ DỤNG: nhóm loại sản phẩm đang bật, tính theo nhóm gốc */
export const activeKinds = (list: ConfigEntry[]): Set<string> => new Set(list.filter((e) => e.active).map((e) => e.base));

/** Nhóm vật tư chỉ có ý nghĩa với một số loại: thức ăn/thuốc thú y/vaccine cần vật nuôi hoặc thủy sản; thuốc BVTV/phân bón cần cây trồng */
export const MATERIAL_NEEDS: Record<string, string[]> = { feed: ['livestock', 'aquatic'], vet_drug: ['livestock', 'aquatic'], vaccine: ['livestock', 'aquatic'], pesticide: ['crop'], fertilizer: ['crop'] };

/** Danh sách mục mặc định (chưa lưu gì) của một cấu hình dạng 'entries' */
export const defaultEntries = (def: ConfigDef): ConfigEntry[] => (def.builtins ?? []).map((b) => ({ code: b.code, label: b.label, base: b.code, active: true }));

// ------------------------------------------------------------------ kho nhớ theo cơ sở
interface Store { items: Record<string, string[]>; entries: Record<string, ConfigEntry[]> }
const mem = new Map<string, Store>();
const listeners = new Set<() => void>();
const storageKey = (org: string) => `agricovi.config.${org}`;
const emit = () => listeners.forEach((l) => l());

function read(org: string): Store {
  const hit = mem.get(org);
  if (hit) return hit;
  let s: Store = { items: {}, entries: {} };
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(org)) ?? '{}') as Partial<Store> & Record<string, unknown>;
    s = raw.items && raw.entries ? { items: raw.items, entries: raw.entries } : { items: {}, entries: {} }; // bản lưu cũ (dạng phẳng) bỏ qua, tải lại từ máy chủ
  } catch { /* không có bản lưu */ }
  mem.set(org, s);
  return s;
}

/** Tải cấu hình từ máy chủ (im lặng nếu chưa có mạng hoặc chưa db push: dùng bản đã lưu hoặc mặc định) */
export async function loadConfig(org: string): Promise<void> {
  if (!supabase || !navigator.onLine) return;
  let r = await supabase.from('org_config').select('key, items, entries').eq('organization_id', org);
  if (r.error) r = await supabase.from('org_config').select('key, items').eq('organization_id', org) as typeof r; // chưa db push 0098
  if (r.error) return;
  const s: Store = { items: {}, entries: {} };
  for (const row of (r.data ?? []) as unknown as Array<{ key: string; items: string[]; entries?: ConfigEntry[] | null }>) {
    if (row.entries) s.entries[row.key] = row.entries;
    else if (row.items?.length) s.items[row.key] = row.items;
  }
  mem.set(org, s);
  try { localStorage.setItem(storageKey(org), JSON.stringify(s)); } catch { /* bộ nhớ đầy hoặc bị chặn */ }
  emit();
}

/** Lưu danh sách tự do (chủ/quản lý; cần mạng) */
export async function saveConfig(org: string, key: string, items: string[]): Promise<void> {
  requireOnline('lưu cấu hình');
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const { error } = await supabase.rpc('set_org_config', { p_org: org, p_key: key, p_items: items });
  if (error) throw new Error(error.message);
  await loadConfig(org);
}

/** Lưu danh sách mục có mã (chủ/quản lý; cần mạng) */
export async function saveEntries(org: string, key: string, list: ConfigEntry[]): Promise<void> {
  requireOnline('lưu cấu hình');
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const payload = list.map((e) => ({ code: e.code, label: e.label.trim(), base: e.base, active: e.active }));
  const { error } = await supabase.rpc('set_org_entries', { p_org: org, p_key: key, p_entries: payload });
  if (error) throw new Error(error.message);
  await loadConfig(org);
}

/** Danh sách tự do đang dùng (đã lưu, nếu không có thì mặc định) */
export function itemsOf(org: string | undefined, def: ConfigDef): string[] {
  const saved = org ? read(org).items[def.id] : undefined;
  return saved && saved.length > 0 ? saved : def.defaults;
}

/** Các mục có mã đang dùng; bản lưu thiếu mục có sẵn thì coi như chưa lưu */
export function entriesOf(org: string | undefined, def: ConfigDef): ConfigEntry[] {
  const saved = org ? read(org).entries[def.id] : undefined;
  if (!saved || !(def.builtins ?? []).every((b) => saved.some((e) => e.code === b.code))) return defaultEntries(def);
  return saved;
}

const defById = (id: string) => CONFIG_DEFS.find((d) => d.id === id)!;

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

  const entries = (listId: string) => entriesOf(org, defById(listId));
  /** Mục chọn được: mục đang dùng, kèm mục hiện tại của bản ghi dù đã dừng (để sửa không mất giá trị) */
  const choices = (listId: string, current?: string | null) => entries(listId).filter((e) => e.active || e.code === current);
  /** Mã chọn → nhóm gốc + mã mục tự thêm (null nếu là mục có sẵn) */
  const resolve = (listId: string, choice: string): { base: string; item: string | null } => {
    const e = entries(listId).find((x) => x.code === choice);
    const builtin = defById(listId).builtins?.some((b) => b.code === choice);
    return e ? { base: e.base, item: builtin ? null : e.code } : { base: choice, item: null };
  };
  /** Bản ghi (nhóm gốc + mã mục tự thêm) → mã đang chọn */
  const choiceOf = (listId: string, base: string | null | undefined, item: string | null | undefined): string => {
    const b = base === 'growing' || !base ? 'crop' : base;
    return item && entries(listId).some((e) => e.code === item) ? item : b;
  };
  const labelOf = (listId: string, base: string | null | undefined, item: string | null | undefined): string => {
    const c = choiceOf(listId, base, item);
    return entries(listId).find((e) => e.code === c)?.label ?? base ?? '';
  };

  const kindsOn = activeKinds(entries('product_groups'));
  /** Loại gốc có đang sử dụng không ('growing' cũ = cây trồng; khu cơ sở vật chất và chưa rõ loại luôn coi là có) */
  const kindOn = (k: string | null | undefined) => !k || k === 'facility' || kindsOn.has(k === 'growing' ? 'crop' : k);
  const animalsOn = kindsOn.has('livestock') || kindsOn.has('aquatic');
  return {
    org,
    kindsOn, kindOn, animalsOn,
    /** Cơ sở có dùng Công đoạn trong Quy trình mẫu không (mặc định có) */
    usePhases: (): boolean => read(org ?? '').items['use_phases']?.[0] !== 'no',
    items: (id: string) => itemsOf(org, defById(id)),
    entries, choices, resolve, choiceOf, labelOf,
    /** Nhóm loại sản phẩm chọn được (id là mã mục) */
    productGroups: (current?: string | null) => choices('product_groups', current).map((e) => ({ id: e.code, label: e.label })),
    groupLabel: (kind: string | null | undefined, item?: string | null) => labelOf('product_groups', kind, item),
    housing: (): string[] => itemsOf(org, defById('housing')),
    customerKinds: (): string[] => itemsOf(org, defById('customer_kinds')),
    materialGroups: (current?: string | null) => choices('material_groups', current)
      .filter((e) => { const need = MATERIAL_NEEDS[e.base]; return !need || e.code === current || need.some((k) => kindsOn.has(k)); })
      .map((e) => ({ id: e.code, label: e.label })),
    expenseGroups: (current?: string | null) => choices('expense_groups', current).map((e) => ({ id: e.code, label: e.label })),
    expenseGroupLabel: (category: string | null | undefined, item?: string | null) => (category ? labelOf('expense_groups', category, item) : ''),
    materialGroupLabel: (group: string | null | undefined, item?: string | null) => (group ? labelOf('material_groups', group, item) : ''),
  };
}
