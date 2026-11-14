import { countSummary, type CountEventLite } from './countLogic';
import type { FeedByDate } from './growthLogic';

/**
 * Định mức thức ăn theo ngày tuổi (mục 14 lát 4, D167), phần thuần. TÙY CHỌN: lứa không có bảng định mức thì không làm gì.
 * Không có đường nhập mới: "cám thực dùng" là chuỗi cám theo ngày đã có (xuất kho hoặc ghi tay, xem growthSummary), "số con" lấy từ số cây/con và hao hụt.
 *  - Bảng định mức: các dòng "từ ngày tuổi X trở đi: Y kg/con/ngày"; ngày tuổi dùng dòng có X lớn nhất không vượt quá ngày tuổi đó.
 *  - Ngày tuổi = tuổi con giống lúc nhập chuồng + số ngày kể từ ngày bắt đầu lứa.
 *  - So sánh theo KỲ (7 ngày gần đây hoặc cả lứa), không so từng ngày vì cám thường xuất kho theo bao, một lần cho nhiều ngày.
 *  - Không đủ số liệu (thiếu định mức, thiếu số con, chưa ghi cám trong kỳ) thì nói rõ thiếu gì, KHÔNG kết luận ăn thừa/thiếu.
 */
export interface FeedNorm { from_day: number; kg: number }
export interface FeedPlan { age_at_start: number; window_kind: 'week' | 'all'; tolerance_pct: number; norms: FeedNorm[] }

const DAY = 86400000;
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const addDays = (iso: string, n: number) => new Date(ms(iso) + n * DAY).toISOString().slice(0, 10);
const diff = (a: string, b: string) => Math.round((ms(b) - ms(a)) / DAY);
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Định mức (kg/con/ngày) áp dụng cho một ngày tuổi, hoặc null nếu ngày tuổi đó nhỏ hơn dòng đầu tiên */
export function normForAge(norms: FeedNorm[], age: number): number | null {
  let best: FeedNorm | null = null;
  for (const n of norms) if (n.from_day <= age && (!best || n.from_day > best.from_day)) best = n;
  return best ? best.kg : null;
}

export const ageOn = (plan: Pick<FeedPlan, 'age_at_start'>, startDate: string, date: string) => plan.age_at_start + diff(startDate, date);

/** Kiểm tra bảng nhập tay (chuỗi): trả lỗi tiếng Việt hoặc bảng đã chuẩn hóa */
export function parseNormRows(rows: { from_day: string; kg: string }[]): { ok: true; norms: FeedNorm[] } | { ok: false; error: string } {
  const out: FeedNorm[] = [];
  for (const r of rows) {
    if (!r.from_day.trim() && !r.kg.trim()) continue; // bỏ dòng trống
    const d = Number(r.from_day.replace(/\s/g, '')), k = Number(r.kg.replace(/\s/g, '').replace(',', '.'));
    if (!Number.isInteger(d) || d < 0 || d > 3650) return { ok: false, error: 'Ngày tuổi phải là số nguyên từ 0 đến 3650.' };
    if (!Number.isFinite(k) || k <= 0 || k > 50) return { ok: false, error: 'Lượng cám phải lớn hơn 0 và không quá 50 kg/con/ngày.' };
    out.push({ from_day: d, kg: k });
  }
  if (out.length === 0) return { ok: false, error: 'Hãy nhập ít nhất một dòng định mức.' };
  if (new Set(out.map((x) => x.from_day)).size !== out.length) return { ok: false, error: 'Có hai dòng cùng ngày tuổi. Mỗi ngày tuổi chỉ một dòng.' };
  return { ok: true, norms: out.sort((a, b) => a.from_day - b.from_day) };
}

export type FeedCheckState = 'no_plan' | 'no_norm' | 'no_heads' | 'no_feed' | 'ok' | 'high' | 'low';
export interface FeedCheck {
  state: FeedCheckState;
  /** kỳ so sánh (yyyy-mm-dd); null nếu chưa xác định */
  from: string | null;
  to: string;
  /** cám nên cho trong kỳ (kg) theo định mức × số con từng ngày */
  expectedKg: number | null;
  actualKg: number | null;
  /** lệch % so với định mức (dương = dùng nhiều hơn) */
  diffPct: number | null;
  /** số ngày trong kỳ có đủ định mức và số con để tính / tổng số ngày của kỳ */
  coveredDays: number;
  periodDays: number;
  /** cám nên cho hôm nay (kg), nếu tính được */
  todayKg: number | null;
  todayNormKg: number | null;
  todayHeads: number | null;
  /** ngày tuổi hôm nay */
  todayAge: number | null;
}

/** Số con còn lại vào cuối một ngày (null nếu chưa có số liệu số con nào) */
export function headsOnDate(
  cycle: { plant_count?: number | null }, events: (CountEventLite & { event_date?: string })[],
  harvests: { harvested_at: string; unit_count?: number | null; voided_at?: string | null }[], date: string,
): number | null {
  const evs = events.filter((e) => (e.event_date ?? '0000-00-00') <= date);
  const out = harvests.filter((h) => !h.voided_at && h.harvested_at.slice(0, 10) <= date).reduce((n, h) => n + (h.unit_count ?? 0), 0);
  const rem = countSummary(cycle, evs, out).remaining;
  return rem !== null && rem > 0 ? rem : null;
}

export function checkFeed(
  plan: FeedPlan | null,
  cycle: { start_date: string | null; plant_count?: number | null },
  events: (CountEventLite & { event_date?: string })[],
  harvests: { harvested_at: string; unit_count?: number | null; voided_at?: string | null }[],
  feed: FeedByDate[],
  today: string,
): FeedCheck {
  const empty: FeedCheck = { state: 'no_plan', from: null, to: today, expectedKg: null, actualKg: null, diffPct: null, coveredDays: 0, periodDays: 0, todayKg: null, todayNormKg: null, todayHeads: null, todayAge: null };
  if (!plan || plan.norms.length === 0 || !cycle.start_date) return empty;
  const start = cycle.start_date;
  const from = plan.window_kind === 'all' || diff(start, addDays(today, -6)) < 0 ? start : addDays(today, -6);
  const periodDays = Math.max(diff(from, today) + 1, 0);
  const todayAge = ageOn(plan, start, today);
  const todayNorm = normForAge(plan.norms, todayAge);
  const todayHeads = headsOnDate(cycle, events, harvests, today);
  const base: FeedCheck = {
    ...empty, state: 'no_norm', from, periodDays, todayAge, todayNormKg: todayNorm, todayHeads,
    todayKg: todayNorm !== null && todayHeads !== null ? r1(todayNorm * todayHeads) : null,
  };
  if (periodDays === 0) return base;

  let expected = 0, covered = 0, sawHeadsGap = false;
  for (let i = 0; i < periodDays; i++) {
    const d = addDays(from, i);
    const n = normForAge(plan.norms, ageOn(plan, start, d));
    if (n === null) continue;
    const h = headsOnDate(cycle, events, harvests, d);
    if (h === null) { sawHeadsGap = true; continue; }
    expected += n * h; covered++;
  }
  if (covered === 0) return { ...base, state: sawHeadsGap ? 'no_heads' : 'no_norm' };
  const inWin = feed.filter((f) => f.date >= from && f.date <= today);
  const actual = inWin.reduce((n, f) => n + f.kg, 0);
  const common = { ...base, expectedKg: r1(expected), coveredDays: covered };
  if (inWin.length === 0 || actual <= 0) return { ...common, state: 'no_feed', actualKg: 0 };
  const pct = ((actual - expected) / expected) * 100;
  const rounded = Math.round(pct * 10) / 10;
  return { ...common, actualKg: r1(actual), diffPct: rounded, state: pct > plan.tolerance_pct ? 'high' : pct < -plan.tolerance_pct ? 'low' : 'ok' };
}
