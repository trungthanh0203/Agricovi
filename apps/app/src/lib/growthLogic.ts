import { countSummary, type CountEventLite } from './countLogic';

/**
 * Tăng trọng (ADG) và FCR của lứa nuôi (P3 gọn, D100), phần thuần. Số liệu thô lấy từ get_cycle_growth (các lần cân, cám đã xuất theo ngày).
 * Đây là số ƯỚC TÍNH từ các lần cân mẫu, không thay cho cân xuất chuồng. Thiếu dữ liệu thì trả về null, không tự bịa số.
 *  - ADG (g/con/ngày) = (cân TB lần cuối − cân TB lần đầu) × 1000 ÷ số ngày giữa hai lần cân.
 *  - FCR = cám đã dùng giữa hai lần cân ÷ (tăng cân mỗi con × số con còn lại ở lần cân cuối). Cám tính từ NGÀY SAU lần cân đầu đến hết ngày cân cuối.
 *  - Cám trên mỗi kg xuất bán = tổng cám đã dùng của vụ ÷ tổng kg đã xuất bán (không phải FCR chuẩn vì chưa trừ cân nặng lúc nhập).
 */
export interface Weighing { date: string; pigs: number | null; avg_kg: number; id?: string | null; manual?: boolean }
export interface FeedByDate { date: string; kg: number }
export interface GrowthRaw {
  /** Cân nặng xuất chuồng dự kiến (kg/con) do cơ sở đặt (migration 0200) */
  target_weight_kg?: number | null;
  weighings: Weighing[];
  feed: { can_view: boolean; stock_by_date: FeedByDate[]; other_unit: boolean; logs_by_date: FeedByDate[]; manual_entries?: { id: string; date: string; kg: number; name: string | null }[] };
}

export interface Growth {
  weighings: Weighing[];
  days: number | null;
  adgG: number | null;
  /** cám dùng giữa hai lần cân (kg) và con số đã dùng để chia */
  feedBetweenKg: number | null;
  heads: number | null;
  fcr: number | null;
  feedTotalKg: number | null;
  feedSource: 'stock' | 'logs' | null;
  soldKg: number | null;
  feedPerSoldKg: number | null;
  needMore: 'weighings' | 'feed' | null;
}

const DAY = 86400000;
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
const sum = (xs: FeedByDate[], f: (x: FeedByDate) => boolean) => xs.filter(f).reduce((n, x) => n + x.kg, 0);
const r = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

export function growthSummary(
  raw: GrowthRaw,
  cycle: { plant_count?: number | null },
  events: CountEventLite[] & { event_date?: string }[],
  harvests: { harvested_at: string; quantity: number; unit_count?: number | null; voided_at?: string | null }[],
  livestock: boolean,
): Growth {
  const w = [...raw.weighings].sort((a, b) => a.date.localeCompare(b.date));
  const stockTotal = sum(raw.feed.stock_by_date, () => true);
  const useStock = raw.feed.can_view && stockTotal > 0;
  const feed = useStock ? raw.feed.stock_by_date : raw.feed.logs_by_date;
  const feedTotal = feed.length > 0 ? sum(feed, () => true) : null;
  const liveH = harvests.filter((h) => !h.voided_at);
  const soldKg = liveH.length > 0 ? liveH.reduce((n, h) => n + Number(h.quantity), 0) : null;
  const base: Growth = {
    weighings: w, days: null, adgG: null, feedBetweenKg: null, heads: null, fcr: null,
    feedTotalKg: feedTotal === null ? null : r(feedTotal, 1), feedSource: feedTotal === null ? null : useStock ? 'stock' : 'logs',
    soldKg, feedPerSoldKg: feedTotal !== null && soldKg ? r(feedTotal / soldKg, 2) : null, needMore: null,
  };
  if (w.length < 2) return { ...base, needMore: 'weighings' };
  const first = w[0]!, last = w[w.length - 1]!;
  const span = days(first.date, last.date);
  if (span <= 0) return { ...base, needMore: 'weighings' };
  const gain = last.avg_kg - first.avg_kg;
  const adg = r((gain * 1000) / span, 0);
  // số con còn lại tới ngày cân cuối (vật nuôi: gồm số con đã xuất ở phiếu thu); không có thì dùng số con cân ở lần cuối
  const evs = events.filter((e) => ((e as { event_date?: string }).event_date ?? '0000') <= last.date);
  const out = livestock ? liveH.filter((h) => h.harvested_at.slice(0, 10) <= last.date).reduce((n, h) => n + (h.unit_count ?? 0), 0) : 0;
  const rem = countSummary(cycle, evs, out).remaining;
  const heads = rem !== null && rem > 0 ? rem : last.pigs;
  const between = feed.length > 0 ? sum(feed, (x) => x.date > first.date && x.date <= last.date) : null;
  const ok = between !== null && between > 0 && heads && gain > 0;
  return {
    ...base, days: span, adgG: adg, heads: heads ?? null, feedBetweenKg: between === null ? null : r(between, 1),
    fcr: ok ? r(between / (gain * heads), 2) : null, needMore: between === null || between <= 0 ? 'feed' : null,
  };
}


// ---------------------------------------------------------------- dự báo ngày xuất chuồng (mục 14, lát 2)
/**
 * Dự báo ngày đạt cân xuất chuồng từ các lần cân mẫu (số ƯỚC TÍNH, không thay cân thực tế). Thiếu dữ liệu thì nói rõ thiếu gì, không bịa ngày.
 *  - Tốc độ tăng cân (kg/con/ngày): (a) giữa hai lần cân CUỐI nếu có từ 3 lần cân và cách nhau từ 3 ngày (đà gần đây), (b) từ lần cân đầu tới lần cuối (trung bình cả lứa).
 *    Có cả hai thì cho KHOẢNG ngày (nhanh nhất – chậm nhất); chỉ một thì một ngày.
 *  - Ngày ước tính tính từ NGÀY CÂN CUỐI: ngày cân cuối + (cân mục tiêu − cân cuối) ÷ tốc độ. Lần cân cuối quá cũ (hơn 14 ngày so với hôm nay) thì nhắc cân lại.
 *  - Dự báo vượt 2 năm thì coi như chưa dự báo được.
 */
export type ForecastState = 'no_target' | 'need_weighings' | 'reached' | 'no_growth' | 'too_far' | 'ok';
export interface HarvestForecast {
  state: ForecastState;
  targetKg: number | null;
  lastDate: string | null;
  lastAvgKg: number | null;
  /** đã đạt: ngày của lần cân đầu tiên đạt hoặc vượt mục tiêu */
  reachedOn: string | null;
  /** khoảng ngày dự báo (yyyy-mm-dd); trùng nhau nếu chỉ có một ước tính */
  fromDate: string | null;
  toDate: string | null;
  /** tốc độ g/con/ngày dùng để ước (nhanh, chậm) */
  adgFastG: number | null;
  adgSlowG: number | null;
  /** số ngày kể từ hôm nay tới đầu/cuối khoảng (âm = đã qua mà chưa đạt: nên cân lại) */
  daysToFrom: number | null;
  daysToTo: number | null;
  stale: boolean;
  /** so với ngày xuất dự kiến của vụ: dương = dự báo muộn hơn kế hoạch (ngày); null nếu vụ chưa có ngày dự kiến */
  vsPlanDays: number | null;
}

const addDaysIso = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const MAX_FORECAST_DAYS = 730;

export function forecastHarvest(weighings: Weighing[], targetKg: number | null | undefined, today: string, plannedEnd?: string | null): HarvestForecast {
  const base: HarvestForecast = {
    state: 'no_target', targetKg: targetKg ?? null, lastDate: null, lastAvgKg: null, reachedOn: null, fromDate: null, toDate: null,
    adgFastG: null, adgSlowG: null, daysToFrom: null, daysToTo: null, stale: false, vsPlanDays: null,
  };
  if (!targetKg || targetKg <= 0) return base;
  const w = [...weighings].filter((x) => x.avg_kg > 0).sort((a, b) => a.date.localeCompare(b.date));
  if (w.length < 2) return { ...base, state: 'need_weighings', lastDate: w[w.length - 1]?.date ?? null, lastAvgKg: w[w.length - 1]?.avg_kg ?? null };
  const first = w[0]!, last = w[w.length - 1]!, prev = w[w.length - 2]!;
  const common = { ...base, lastDate: last.date, lastAvgKg: last.avg_kg, stale: days(last.date, today) > 14 };
  const hit = w.find((x) => x.avg_kg >= targetKg);
  if (hit) return { ...common, state: 'reached', reachedOn: hit.date };

  const rates: number[] = []; // kg/con/ngày
  const spanAll = days(first.date, last.date);
  if (spanAll > 0 && last.avg_kg > first.avg_kg) rates.push((last.avg_kg - first.avg_kg) / spanAll);
  const spanRecent = days(prev.date, last.date);
  if (w.length > 2 && spanRecent >= 3 && last.avg_kg > prev.avg_kg) rates.push((last.avg_kg - prev.avg_kg) / spanRecent);
  if (rates.length === 0) return { ...common, state: 'no_growth' };

  const need = targetKg - last.avg_kg;
  const fast = Math.max(...rates), slow = Math.min(...rates);
  const dFast = Math.ceil(need / fast), dSlow = Math.ceil(need / slow);
  if (dSlow > MAX_FORECAST_DAYS) return { ...common, state: 'too_far', adgFastG: r(fast * 1000, 0), adgSlowG: r(slow * 1000, 0) };
  const fromDate = addDaysIso(last.date, dFast), toDate = addDaysIso(last.date, dSlow);
  return {
    ...common, state: 'ok', fromDate, toDate, adgFastG: r(fast * 1000, 0), adgSlowG: r(slow * 1000, 0),
    daysToFrom: days(today, fromDate), daysToTo: days(today, toDate),
    vsPlanDays: plannedEnd ? days(plannedEnd, toDate) : null,
  };
}
