import { db } from './db';
import { perfState } from './perfState';

/**
 * Đo hiệu năng đồng bộ (Đợt 0, docs/PLAN_HIEU_NANG.md): mỗi lần đồng bộ ghi lại thời gian, dung lượng dữ liệu tải (đã giải nén), số yêu cầu và số dòng
 * của các bảng trên máy; giữ 8 lần gần nhất để chủ/quản trị xem ở màn Hỗ trợ & Chia sẻ và chép gửi đi.
 */
export interface SyncPerf { at: string; ms: number; kb: number; requests: number; ok: boolean; first: boolean; rows: Record<string, number>; err?: string; top?: { name: string; n: number; kb: number; ms: number }[] }

const KEY = 'agri.perf.sync';
const TABLES = ['areas', 'cycles', 'logs', 'stages', 'notes', 'harvests', 'expenses', 'sales', 'materials', 'balances', 'incidents', 'countEvents', 'milestones'] as const;
let firstDone = false;

export function readSyncPerf(): SyncPerf[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as SyncPerf[]; } catch { return []; }
}
export function clearSyncPerf(): void {
  try { localStorage.removeItem(KEY); } catch { /* bỏ qua */ }
}

/** Bắt đầu đo một lần đồng bộ; gọi hàm trả về khi xong (kèm kết quả thành công hay lỗi) */
export function beginSyncMeasure(): (ok: boolean, err?: string) => Promise<void> {
  const t0 = performance.now();
  const first = !firstDone;
  firstDone = true;
  perfState.measuring = true;
  perfState.bytes = 0;
  perfState.requests = 0;
  perfState.items = [];
  return async (ok, err) => {
    await new Promise((r) => setTimeout(r, 150));   // chờ các bản sao phản hồi được đếm xong
    perfState.measuring = false;
    const rows: Record<string, number> = {};
    for (const t of TABLES) {
      try { rows[t] = await (db[t] as unknown as { count(): Promise<number> }).count(); } catch { rows[t] = -1; }
    }
    // gộp theo bảng/hàm: số yêu cầu, dung lượng, tổng thời gian chờ; giữ 10 mục nặng nhất
    const g = new Map<string, { name: string; n: number; kb: number; ms: number }>();
    for (const it of perfState.items) {
      const cur = g.get(it.name) ?? { name: it.name, n: 0, kb: 0, ms: 0 };
      cur.n += 1; cur.kb += it.kb; cur.ms += it.ms;
      g.set(it.name, cur);
    }
    const top = [...g.values()].sort((a, b) => b.kb - a.kb).slice(0, 10).map((x) => ({ ...x, kb: Math.round(x.kb), ms: Math.round(x.ms) }));
    const item: SyncPerf = { at: new Date().toISOString(), ms: Math.round(performance.now() - t0), kb: Math.round(perfState.bytes / 1024), requests: perfState.requests, ok, first, rows, ...(err ? { err: err.slice(0, 300) } : {}), top };
    try { localStorage.setItem(KEY, JSON.stringify([item, ...readSyncPerf()].slice(0, 8))); } catch { /* bỏ qua */ }
  };
}

/** Thời gian tải trang lần mở app này (từ lúc bấm mở tới khi trang tải xong) */
export function pageLoadMs(): number | null {
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  return nav && nav.loadEventEnd > 0 ? Math.round(nav.loadEventEnd) : null;
}

/** Văn bản gọn để chép gửi đi: thiết bị, mạng, thời gian tải trang, các lần đồng bộ */
export function perfReport(): string {
  const nav = navigator as unknown as { connection?: { effectiveType?: string; downlink?: number }; deviceMemory?: number; hardwareConcurrency?: number };
  const list = readSyncPerf();
  const lines = [
    `Thiết bị: ${navigator.userAgent.replace(/\s+/g, ' ').slice(0, 120)}`,
    `Mạng: ${nav.connection?.effectiveType ?? '?'} ${nav.connection?.downlink ?? '?'} Mbps · RAM ${nav.deviceMemory ?? '?'} GB · ${nav.hardwareConcurrency ?? '?'} nhân`,
    `Tải trang: ${pageLoadMs() ?? '?'} ms`,
    'Đồng bộ (mới nhất trước): giờ · thời gian · dung lượng tải · số yêu cầu · lần đầu mở app?',
    ...list.map((s) => `${new Date(s.at).toLocaleTimeString('vi-VN')} · ${s.ms} ms · ${s.kb} KB · ${s.requests} yêu cầu · ${s.first ? 'lần đầu' : 'lần sau'}${s.ok ? '' : ` · LỖI: ${s.err ?? 'không rõ'}`}`),
  ];
  if (list[0]?.top?.length) lines.push('Nặng nhất lần mới nhất (bảng/hàm: số yêu cầu · KB · tổng ms): ' + list[0].top.map((t) => `${t.name} ${t.n}x ${t.kb}KB ${t.ms}ms`).join('; '));
  if (list[0]) lines.push('Số dòng trên máy: ' + Object.entries(list[0].rows).map(([k, v]) => `${k} ${v}`).join(', '));
  return lines.join('\n');
}
