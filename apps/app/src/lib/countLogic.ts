/**
 * Số lượng của vụ/lứa (P2 gọn, D100), phần thuần. Số ban đầu là "Số cây/Số con" của vụ; mỗi sự kiện chưa hủy cộng (nhập/dặm) hoặc trừ
 * (chết, loại, xuất). Với VẬT NUÔI, số con ghi ở phiếu thu hoạch/xuất cũng được trừ (truyền vào `harvestOut`) để không phải nhập hai lần.
 * Chưa có số liệu nào thì trả về null, không tự bịa số.
 */
export interface CountEventLite { kind: 'in' | 'dead' | 'culled' | 'out' | string; quantity: number; voided_at?: string | null }

export interface CountSummary {
  initial: number | null; added: number; dead: number; culled: number; out: number;
  remaining: number | null;
  /** (chết + loại) / (ban đầu + nhập thêm), % làm tròn 2 chữ số; null nếu chưa có gốc */
  lossPct: number | null;
  /** diện tích (m²) trên mỗi cây/con còn lại; null nếu thiếu diện tích hoặc hết */
  m2PerUnit: number | null;
}

export const COUNT_KIND_LABEL: Record<string, string> = { in: 'Nhập thêm / dặm', dead: 'Chết', culled: 'Loại thải', out: 'Xuất / chuyển đi' };

export function countSummary(
  cycle: { plant_count?: number | null; planted_area_m2?: number | null },
  events: CountEventLite[],
  harvestOut = 0,
): CountSummary {
  const live = events.filter((e) => !e.voided_at);
  const sum = (k: string) => live.filter((e) => e.kind === k).reduce((n, e) => n + Number(e.quantity), 0);
  const initial = cycle.plant_count ?? null;
  const added = sum('in'), dead = sum('dead'), culled = sum('culled'), out = sum('out') + harvestOut;
  const hasData = initial !== null || live.length > 0;
  const base = (initial ?? 0) + added;
  const remaining = hasData ? base - dead - culled - out : null;
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    initial, added, dead, culled, out, remaining,
    lossPct: hasData && base > 0 ? round2(((dead + culled) * 100) / base) : null,
    m2PerUnit: remaining !== null && remaining > 0 && cycle.planted_area_m2 ? round2(cycle.planted_area_m2 / remaining) : null,
  };
}
