import { supabase } from './supabase';

/**
 * Phiếu khoán (mục 11): trả công theo việc (theo sản lượng hoặc trọn gói), một phiếu giao cho một hoặc nhiều người.
 * Lập phiếu = giao khoán; nghiệm thu = nhập sản lượng thực tế, lúc đó tiền được chia vào kỳ lương tháng của ngày làm (migration 0198).
 * Là chức năng quản lý nên cần mạng (D24). Phần thuần (định dạng, chia phần) ở cuối file.
 */
export interface PieceShare { worker_id: string; name: string; pct: number; amount: number | null }
export interface PieceJob {
  id: string; cycle_id: string | null; title: string; work_date: string; pay_mode: 'output' | 'lump'; unit: string | null;
  unit_price: number | null; lump_amount: number | null; quantity: number | null; total_amount: number | null;
  status: 'draft' | 'confirmed' | 'cancelled'; note: string | null; cancel_reason: string | null; pay_state: 'locked' | 'calculated' | null; shares: PieceShare[];
}
export interface PieceList { can_edit: boolean; can_see_all: boolean; jobs: PieceJob[] }

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  if (!navigator.onLine) throw new Error('OFFLINE: Cần có mạng để thực hiện. Hãy kết nối mạng rồi thử lại.');
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export async function fetchPieceJobs(orgId: string, from: string, to: string): Promise<PieceList> {
  const d = await rpc<Record<string, unknown>>('get_piece_jobs', { p_org: orgId, p_from: from, p_to: to, p_cycle: null });
  const jobs = ((d.jobs ?? []) as Record<string, unknown>[]).map((j) => ({
    id: String(j.id), cycle_id: (j.cycle_id as string | null) ?? null, title: String(j.title), work_date: String(j.work_date), pay_mode: j.pay_mode as PieceJob['pay_mode'],
    unit: (j.unit as string | null) ?? null, unit_price: n(j.unit_price), lump_amount: n(j.lump_amount), quantity: n(j.quantity), total_amount: n(j.total_amount),
    status: j.status as PieceJob['status'], note: (j.note as string | null) ?? null, cancel_reason: (j.cancel_reason as string | null) ?? null,
    pay_state: (j.pay_state as PieceJob['pay_state']) ?? null,
    shares: ((j.shares ?? []) as Record<string, unknown>[]).map((s) => ({ worker_id: String(s.worker_id), name: String(s.name ?? ''), pct: Number(s.pct), amount: n(s.amount) })),
  }));
  return { can_edit: Boolean(d.can_edit), can_see_all: Boolean(d.can_see_all), jobs };
}

export interface PieceInput {
  cycleId: string | null; title: string; date: string; mode: 'output' | 'lump'; unit: string; price: number | null; lump: number | null;
  /** pct = null: chia đều */
  workers: { worker_id: string; pct: number | null }[]; note: string;
}

const args = (i: PieceInput) => ({
  p_cycle: i.cycleId, p_title: i.title, p_date: i.date, p_mode: i.mode, p_unit: i.mode === 'output' ? i.unit : null, p_price: i.mode === 'output' ? i.price : null,
  p_lump: i.mode === 'lump' ? i.lump : null, p_workers: i.workers.map((w) => (w.pct === null ? { worker_id: w.worker_id } : { worker_id: w.worker_id, pct: w.pct })), p_note: i.note.trim() || null,
});

export const createPieceJob = (orgId: string, i: PieceInput) => rpc<string>('create_piece_job', { p_org: orgId, ...args(i) });
export const updatePieceJob = (id: string, i: PieceInput) => rpc<string>('update_piece_job', { p_id: id, ...args(i) });
export const confirmPieceJob = (id: string, quantity: number | null) => rpc<unknown>('confirm_piece_job', { p_id: id, p_quantity: quantity });
export const cancelPieceJob = (id: string, reason: string) => rpc<unknown>('cancel_piece_job', { p_id: id, p_reason: reason });

// ---------------------------------------------------------------- phần thuần
const vnd = (x: number) => `${Math.round(x).toLocaleString('vi-VN')} đ`;
const qty = (x: number) => x.toLocaleString('vi-VN', { maximumFractionDigits: 2 });

/** "2.000 đ/kg" hoặc "Trọn gói 3.000.000 đ" */
export const modeText = (j: Pick<PieceJob, 'pay_mode' | 'unit' | 'unit_price' | 'lump_amount'>) =>
  j.pay_mode === 'output' ? `${vnd(j.unit_price ?? 0)}/${j.unit ?? ''}` : `Trọn gói ${vnd(j.lump_amount ?? 0)}`;

/** Tiền dự kiến chia cho từng người (người cuối nhận phần lẻ, giống máy chủ) */
export function previewShares(total: number, pcts: number[]): number[] {
  const out: number[] = [];
  let paid = 0;
  pcts.forEach((p, i) => { const a = i === pcts.length - 1 ? total - paid : Math.round((total * p) / 100); out.push(a); paid += a; });
  return out;
}

/** Phần trăm chia đều: giữ tổng đúng 100 (người cuối nhận phần dư) */
export function equalPcts(count: number): number[] {
  if (count <= 0) return [];
  const each = Math.round((100 / count) * 100) / 100;
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? Math.round((100 - each * (count - 1)) * 100) / 100 : each));
}

/** Một dòng tóm tắt trạng thái phiếu để hiện trong danh sách */
export function statusText(j: PieceJob): { label: string; tone: 'ok' | 'warn' | 'err' } {
  if (j.status === 'cancelled') return { label: 'Đã hủy', tone: 'err' };
  if (j.status === 'draft') return { label: 'Chờ nghiệm thu', tone: 'warn' };
  return { label: j.pay_state === 'locked' ? 'Đã nghiệm thu · đã chốt lương' : 'Đã nghiệm thu', tone: 'ok' };
}

export const resultText = (j: PieceJob) => (j.status === 'confirmed' && j.pay_mode === 'output' && j.quantity !== null ? `${qty(j.quantity)} ${j.unit ?? ''}` : '');
