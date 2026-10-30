import { useMemo } from 'react';
import type { AreaRow } from './db';
import type { CycleStat } from './cycleStatsLogic';
import { useTable } from './tables';

/**
 * Hai cấp khu (D125, migration 0136): PHÂN KHU (cấp 1, cụm) → NHÀ MÀNG / CHUỒNG / AO (cấp 2, nơi chạy vụ). Vụ gắn vào cấp thấp nhất:
 * phân khu đã chia nhỏ thì vụ gắn nhà màng; phân khu chưa chia thì vụ gắn thẳng phân khu như trước.
 */

/** Tên cấp 2 theo loại khu */
export function cellWord(kind?: string | null): string {
  if (kind === 'livestock') return 'Chuồng';
  if (kind === 'aquatic') return 'Ao';
  if (kind === 'other') return 'Ô';
  return 'Nhà màng';
}

const byName = (a: AreaRow, b: AreaRow) => a.name.localeCompare(b.name, 'vi', { numeric: true });

export const topAreas = (areas: AreaRow[]) => areas.filter((a) => !a.parent_id).sort(byName);
export const cellsOf = (areas: AreaRow[], parentId: string) => areas.filter((a) => a.parent_id === parentId).sort(byName);
export const hasCells = (areas: AreaRow[], id: string) => areas.some((a) => a.parent_id === id);

/** Khu tạo vụ được: khu nuôi trồng (không phải cơ sở vật chất) và chưa chia nhà màng */
export const cycleAreas = (areas: AreaRow[]) => areas.filter((a) => a.kind !== 'facility' && !hasCells(areas, a.id));

/** "Phân khu A › Nhà màng 3"; khu không có cha thì chỉ tên khu */
export function areaPath(areaId: string | null | undefined, areas: AreaRow[]): string {
  const a = areas.find((x) => x.id === areaId);
  if (!a) return '';
  const p = a.parent_id ? areas.find((x) => x.id === a.parent_id) : undefined;
  return p ? `${p.name} › ${a.name}` : a.name;
}

/** Diện tích hiển thị của phân khu: có nhà màng thì cộng diện tích các nhà màng (đổi ha sang m² để cộng), nếu không thì diện tích của chính nó */
export function areaSizeM2(a: AreaRow, areas: AreaRow[]): number | null {
  const toM2 = (x: AreaRow) => (x.area_size == null ? 0 : x.area_unit === 'ha' ? x.area_size * 10000 : x.area_size);
  const kids = areas.filter((c) => c.parent_id === a.id);
  if (kids.length === 0) return a.area_size == null ? null : toM2(a);
  const sum = kids.reduce((s, c) => s + toM2(c), 0);
  return sum > 0 ? sum : null;
}

/** Danh sách phẳng theo thứ tự cây: phân khu rồi các nhà màng của nó */
export function orderedAreas(areas: AreaRow[]): AreaRow[] {
  return topAreas(areas).flatMap((t) => [t, ...cellsOf(areas, t.id)]);
}

/** Hook: hàm trả tên đầy đủ "Phân khu › Nhà màng" của một khu theo mã */
export function useAreaPath(): (id: string | null | undefined) => string {
  const areas = useTable('areas');
  return useMemo(() => (id) => areaPath(id, areas), [areas]);
}

/** Tổng hợp số liệu theo phân khu cha (D125): cộng các vụ của chính phân khu và của mọi nhà màng con. null = người xem không có quyền mục đó. */
export interface AreaRollupRow {
  area: AreaRow; cycles: number; running: number;
  cost: number | null; harvest: number | null; revenue: number | null; profit: number | null;
  cells: AreaRollupRow[];
}

const addN = (a: number | null, b: number | null): number | null => (a === null && b === null ? null : (a ?? 0) + (b ?? 0));

function leafRollup(area: AreaRow, cycles: { id: string; area_id: string; status: string }[], stats: Map<string, CycleStat>): AreaRollupRow {
  const mine = cycles.filter((c) => c.area_id === area.id);
  const row: AreaRollupRow = { area, cycles: mine.length, running: mine.filter((c) => c.status === 'active').length, cost: null, harvest: null, revenue: null, profit: null, cells: [] };
  for (const c of mine) {
    const s = stats.get(c.id);
    if (!s) continue;
    row.cost = addN(row.cost, s.cost_total); row.harvest = addN(row.harvest, s.harvest_net); row.revenue = addN(row.revenue, s.revenue); row.profit = addN(row.profit, s.profit);
  }
  return row;
}

export function rollupByArea(areas: AreaRow[], cycles: { id: string; area_id: string; status: string }[], stats: CycleStat[]): AreaRollupRow[] {
  const byId = new Map(stats.map((s) => [s.cycle_id, s]));
  return topAreas(areas).filter((t) => t.kind !== 'facility').map((t) => {
    const own = leafRollup(t, cycles, byId);
    const cells = cellsOf(areas, t.id).map((c) => leafRollup(c, cycles, byId));
    const total = [own, ...cells].reduce<AreaRollupRow>((s, r) => ({
      ...s, cycles: s.cycles + r.cycles, running: s.running + r.running,
      cost: addN(s.cost, r.cost), harvest: addN(s.harvest, r.harvest), revenue: addN(s.revenue, r.revenue), profit: addN(s.profit, r.profit),
    }), { area: t, cycles: 0, running: 0, cost: null, harvest: null, revenue: null, profit: null, cells: [] });
    return { ...total, cells };
  }).filter((r) => r.cycles > 0);
}
