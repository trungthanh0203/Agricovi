/**
 * Nhóm đầu việc cho màn Ghi việc: gom theo mã việc ngay trong app (không cần cột ở CSDL).
 * Mã có hậu tố _aq (thủy sản) / _lv (vật nuôi) xếp cùng nhóm với mã gốc. Việc chưa có trong bảng vào "Khác"; việc do cơ sở tự thêm vào "Việc của cơ sở".
 */
export interface WorkGroup<T> { id: string; label: string; items: T[] }

const GROUPS: { id: string; label: string; codes: string[] }[] = [
  { id: 'prep', label: 'Chuẩn bị & gieo trồng / thả giống', codes: ['bed_prep', 'bedding_prep', 'substrate_prep', 'seed_soaking', 'tray_sowing', 'transplanting', 'pond_preparing', 'stocking'] },
  { id: 'nutrition', label: 'Cho ăn, bón phân, tưới', codes: ['feeding', 'feed_mixing', 'fertilizing', 'irrigation', 'water_checking'] },
  { id: 'care', label: 'Chăm sóc cây', codes: ['pruning', 'trellising', 'pollination', 'mulching', 'replanting'] },
  { id: 'health', label: 'Sức khỏe & phòng bệnh', codes: ['treating', 'vaccinating', 'deworming', 'spraying', 'disinfecting', 'pest_control', 'pit_changing'] },
  { id: 'monitor', label: 'Theo dõi & đo đạc', codes: ['weighing', 'water_measuring', 'feed_tray_checking', 'health_checking'] },
  { id: 'env', label: 'Vệ sinh & môi trường', codes: ['house_cleaning', 'waste_handling', 'water_changing', 'water_treating', 'pond_cleaning'] },
  { id: 'harvest', label: 'Thu hoạch / xuất bán', codes: ['harvesting'] },
];
const MINE: { id: string; label: string } = { id: 'mine', label: 'Việc của cơ sở' };
const OTHER: { id: string; label: string } = { id: 'other', label: 'Khác' };

const baseCode = (code: string) => code.replace(/_(aq|lv)$/, '');

/** Gom danh sách việc thành các nhóm có thứ tự cố định; nhóm rỗng bị bỏ. Trong nhóm giữ thứ tự gốc của danh sách. */
export function groupWorkTypes<T extends { code: string; shared?: boolean }>(list: T[]): WorkGroup<T>[] {
  const out = new Map<string, WorkGroup<T>>();
  const put = (g: { id: string; label: string }, w: T) => {
    const cur = out.get(g.id) ?? { id: g.id, label: g.label, items: [] };
    cur.items.push(w);
    out.set(g.id, cur);
  };
  for (const w of list) {
    if (w.shared === false) { put(MINE, w); continue; }
    const code = baseCode(w.code);
    const g = GROUPS.find((x) => x.codes.includes(code));
    put(g ?? OTHER, w);
  }
  const order = [...GROUPS.map((g) => g.id), MINE.id, OTHER.id];
  return order.map((id) => out.get(id)).filter((g): g is WorkGroup<T> => Boolean(g));
}

/** Những việc người dùng hay làm nhất gần đây (theo số lần ghi trong `days` ngày), chỉ trong `allowed`; trả về tối đa `max` mã loại việc */
export function recentWorkTypeIds(
  logs: { work_type_id: string; created_by?: string | null; performed_at: string; voided_at?: string | null }[],
  userId: string | undefined, allowed: Set<string>, max = 4, days = 60,
): string[] {
  const since = Date.now() - days * 86_400_000;
  const count = new Map<string, number>();
  for (const l of logs) {
    if (l.voided_at || !allowed.has(l.work_type_id)) continue;
    if (userId && l.created_by && l.created_by !== userId) continue;
    if (new Date(l.performed_at).getTime() < since) continue;
    count.set(l.work_type_id, (count.get(l.work_type_id) ?? 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([id]) => id);
}

/** Loại đối tượng (crop/livestock/aquatic/other) → nhãn nhóm ở bước chọn đối tượng */
export const KIND_GROUP: { kind: string; label: string }[] = [
  { kind: 'crop', label: '🌱 Trồng trọt' },
  { kind: 'livestock', label: '🐖 Vật nuôi' },
  { kind: 'aquatic', label: '🐟 Thủy sản' },
  { kind: 'other', label: '📦 Khác' },
];
