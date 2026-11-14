/**
 * Số lượng của vụ/lứa (P2 gọn, D100), phần thuần. Số ban đầu là "Số cây/Số con" của vụ; mỗi sự kiện chưa hủy cộng (nhập/dặm) hoặc trừ
 * (chết, loại, xuất). Với VẬT NUÔI, số con ghi ở phiếu thu hoạch/xuất cũng được trừ (truyền vào `harvestOut`) để không phải nhập hai lần.
 * Chưa có số liệu nào thì trả về null, không tự bịa số.
 */
export interface CountEventLite { kind: 'in' | 'dead' | 'culled' | 'out' | 'born' | 'move' | 'open' | string; quantity: number; voided_at?: string | null; animal_group?: string | null; to_group?: string | null }

export interface CountSummary {
  initial: number | null; added: number; dead: number; culled: number; out: number;
  remaining: number | null;
  /** (chết + loại) / (ban đầu + nhập thêm), % làm tròn 2 chữ số; null nếu chưa có gốc */
  lossPct: number | null;
  /** diện tích (m²) trên mỗi cây/con còn lại; null nếu thiếu diện tích hoặc hết */
  m2PerUnit: number | null;
}

export const COUNT_KIND_LABEL: Record<string, string> = { in: 'Nhập thêm / dặm', dead: 'Chết', culled: 'Loại thải', out: 'Xuất / chuyển đi', born: 'Mới sinh', move: 'Chuyển nhóm', open: 'Tồn đầu' };

export function countSummary(
  cycle: { plant_count?: number | null; planted_area_m2?: number | null },
  events: CountEventLite[],
  harvestOut = 0,
): CountSummary {
  const live = events.filter((e) => !e.voided_at);
  const sum = (k: string) => live.filter((e) => e.kind === k).reduce((n, e) => n + Number(e.quantity), 0);
  const initial = cycle.plant_count ?? null;
  const added = sum('in') + sum('born'), dead = sum('dead'), culled = sum('culled'), out = sum('out') + harvestOut;
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

/**
 * Số đầu hiện có của từng NHÓM đàn (migration 0182): tồn đầu + nhập + mới sinh + chuyển vào − chết − loại − xuất − chuyển ra.
 * Sự kiện chưa gắn nhóm được gom vào nhóm "" (chưa chia nhóm). Chỉ tính sự kiện chưa hủy.
 */
export function groupHeads(events: CountEventLite[]): Map<string, number> {
  const m = new Map<string, number>();
  const add = (g: string | null | undefined, n: number) => m.set(g ?? '', (m.get(g ?? '') ?? 0) + n);
  for (const e of events) {
    if (e.voided_at) continue;
    const q = Number(e.quantity);
    if (e.kind === 'open' || e.kind === 'in' || e.kind === 'born') add(e.animal_group, q);
    else if (e.kind === 'dead' || e.kind === 'culled' || e.kind === 'out') add(e.animal_group, -q);
    else if (e.kind === 'move') { add(e.animal_group, -q); add(e.to_group, q); }
  }
  return m;
}

// ---------------------------------------------------------------- cảnh báo hao hụt (mục 14, lát 1)
/**
 * Ngưỡng cảnh báo hao hụt của cơ sở, lưu ở bảng ngưỡng sẵn có (measure_limits; khóa loss_cum_pct và loss_week_pct, giá trị trần là max_value, đơn vị %):
 *  - Cộng dồn: (chết + loại) ÷ (số ban đầu + nhập thêm). Mặc định 10% khi chưa đặt (đúng mức cũ).
 *  - 7 ngày gần đây: số chết + loại trong 7 ngày ÷ số đầu con có ở đầu cửa sổ 7 ngày. Mặc định TẮT (cơ sở tự đặt, nên hỏi thú y / kỹ thuật).
 */
export const LOSS_CUM_KEY = 'loss_cum_pct';
export const LOSS_WEEK_KEY = 'loss_week_pct';
export const DEFAULT_LOSS_CUM_PCT = 10;

export interface LossLimitRow { metric: string; max_value: number | null; is_active?: boolean }
export interface LossThresholds { cumPct: number; weekPct: number | null }

export function lossThresholds(limits: LossLimitRow[]): LossThresholds {
  const cum = limits.find((l) => l.metric === LOSS_CUM_KEY);
  const week = limits.find((l) => l.metric === LOSS_WEEK_KEY);
  return {
    cumPct: cum && cum.is_active !== false && cum.max_value !== null ? cum.max_value : DEFAULT_LOSS_CUM_PCT,
    weekPct: week && week.is_active !== false && week.max_value !== null ? week.max_value : null,
  };
}

export interface LossStatus {
  remaining: number | null;
  cumPct: number | null;
  weekLoss: number;
  weekPct: number | null;
  cumAlert: boolean;
  weekAlert: boolean;
}

const addDaysIso = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** Tình hình hao hụt của một vụ/lứa so với ngưỡng; `today` là yyyy-mm-dd theo giờ Việt Nam. Chưa có số liệu thì không cảnh báo. */
export function lossStatus(
  cycle: { plant_count?: number | null; planted_area_m2?: number | null },
  events: (CountEventLite & { event_date?: string })[],
  harvestOut: number,
  th: LossThresholds,
  today: string,
): LossStatus {
  const s = countSummary(cycle, events, harvestOut);
  const from = addDaysIso(today, -6); // 7 ngày gồm cả hôm nay
  const live = events.filter((e) => !e.voided_at && e.event_date !== undefined && e.event_date >= from && e.event_date <= today);
  const sumW = (kinds: string[]) => live.filter((e) => kinds.includes(e.kind)).reduce((n, e) => n + Number(e.quantity), 0);
  const weekLoss = sumW(['dead', 'culled']);
  // số đầu con ở đầu cửa sổ = hiện còn + đã mất/xuất trong cửa sổ − đã nhập trong cửa sổ
  const startBase = s.remaining === null ? null : s.remaining + weekLoss + sumW(['out']) - sumW(['in', 'born']);
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const weekPct = startBase !== null && startBase > 0 ? round2((weekLoss * 100) / startBase) : null;
  return {
    remaining: s.remaining,
    cumPct: s.lossPct,
    weekLoss,
    weekPct,
    cumAlert: s.lossPct !== null && s.dead + s.culled > 0 && s.lossPct >= th.cumPct,
    weekAlert: th.weekPct !== null && weekPct !== null && weekLoss > 0 && weekPct >= th.weekPct,
  };
}

/** Câu cảnh báo ngắn gọn cho người dùng; mảng rỗng nếu không có cảnh báo */
export function lossMessages(st: LossStatus, th: LossThresholds, unit: string): string[] {
  const f = (n: number) => String(n).replace('.', ',');
  const out: string[] = [];
  if (st.cumAlert && st.cumPct !== null) out.push(`Hao hụt cộng dồn ${f(st.cumPct)}%, đã tới ngưỡng ${f(th.cumPct)}%.`);
  if (st.weekAlert && st.weekPct !== null && th.weekPct !== null) out.push(`7 ngày gần đây hao ${f(st.weekPct)}% (${st.weekLoss.toLocaleString('vi-VN')} ${unit}), vượt ngưỡng ${f(th.weekPct)}%.`);
  return out;
}
