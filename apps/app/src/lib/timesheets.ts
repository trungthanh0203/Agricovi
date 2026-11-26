import { supabase } from './supabase';
import type { CellKind } from './timesheetCells';
import { t as tx } from '@lingui/core/macro';

/**
 * Bảng chấm công giấy (D199, migration 0226, lớp C): in bảng có sẵn tên người và các ngày từ-đến, kèm ghi chú cách ghi.
 * Khi in, bảng được LƯU (mã bảng, kỳ, người theo thứ tự đã in, ca mặc định, kiểu ghi) để lớp A nhập số liệu dựng đúng lưới như tờ giấy.
 * Chỉ làm khi có mạng (chức năng quản lý, D24).
 */
export type SheetMode = 'shift' | 'hours';
export const MODE_LABEL: Record<SheetMode, string> = { get shift() { return tx`Đánh dấu ca (✓ ½ P Ô V K)`; }, get hours() { return tx`Ghi số giờ làm mỗi ngày`; } };

export interface SheetWorker { worker_id: string; name: string; team: string | null }
export interface SheetData {
  from_date: string; to_date: string; mode: SheetMode; shift_start: string; shift_end: string; break_minutes: number; workers: SheetWorker[]; note: string | null;
}
export interface Sheet extends SheetData {
  id: string; organization_id: string; code: string; status: 'printed' | 'entered'; version: number; created_at: string;
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error(tx`Supabase chưa được cấu hình`);
  if (!navigator.onLine) throw new Error(tx`OFFLINE: Cần có mạng để thực hiện. Hãy kết nối mạng rồi thử lại.`);
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

const COLS = 'id,organization_id,code,from_date,to_date,mode,shift_start,shift_end,break_minutes,workers,note,status,version,created_at';
export async function fetchSheets(orgId: string): Promise<Sheet[]> {
  if (!supabase || !navigator.onLine) return [];
  const { data, error } = await supabase.from('timesheet_sheets').select(COLS).eq('organization_id', orgId).order('created_at', { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as Sheet[];
}
export const createSheet = (orgId: string, id: string, d: SheetData) => rpc<Sheet>('create_timesheet_sheet', {
  p_id: id, p_org: orgId, p_from: d.from_date, p_to: d.to_date, p_mode: d.mode, p_start: hhmm(d.shift_start), p_end: hhmm(d.shift_end), p_break: d.break_minutes,
  p_workers: d.workers.map((w) => w.worker_id), p_note: d.note ?? '',
});
export const markSheetEntered = (id: string, version: number, entered: boolean) => rpc<Sheet>('mark_timesheet_entered', { p_id: id, p_version: version, p_entered: entered });

/** "07:30:00" -> "07:30" */
export const hhmm = (t: string): string => t.slice(0, 5);

export const DOW = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
export interface SheetDay { date: string; day: number; month: number; year: number; dow: number }
const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Các ngày từ `from` đến `to` (gồm cả hai đầu), tối đa 62 ngày để không tạo mảng quá lớn khi nhập sai */
export function listDays(from: string, to: string): SheetDay[] {
  const out: SheetDay[] = [];
  for (let d = utc(from); iso(d) <= to && out.length < 62; d = new Date(d.getTime() + 86400000)) {
    out.push({ date: iso(d), day: d.getUTCDate(), month: d.getUTCMonth() + 1, year: d.getUTCFullYear(), dow: d.getUTCDay() });
  }
  return out;
}
export const dayCount = (from: string, to: string): number => Math.round((utc(to).getTime() - utc(from).getTime()) / 86400000) + 1;

/** Ngày bắt đầu gợi ý khi mở màn tạo bảng: 7 ngày gần nhất (người dùng tự chọn lại từ-đến) */
export const defaultFrom = (today: string): string => iso(new Date(utc(today).getTime() - 6 * 86400000));

/** Ca mặc định và tùy chọn in: nhớ theo cơ sở trên máy này (không cần lưu máy chủ) */
export interface SheetPrefs { start: string; end: string; brk: number; mode: SheetMode; perTeamPage: boolean; shadeSunday: boolean; noteColumn: boolean }
export const DEFAULT_PREFS: SheetPrefs = { start: '07:30', end: '17:00', brk: 60, mode: 'shift', perTeamPage: false, shadeSunday: true, noteColumn: true };
const key = (orgId: string) => `agriconnect.sheetprefs.${orgId}`;
export function loadPrefs(orgId: string): SheetPrefs {
  try { const s = localStorage.getItem(key(orgId)); return s ? { ...DEFAULT_PREFS, ...(JSON.parse(s) as Partial<SheetPrefs>) } : { ...DEFAULT_PREFS }; } catch { return { ...DEFAULT_PREFS }; }
}
export function savePrefs(orgId: string, p: SheetPrefs): void {
  try { localStorage.setItem(key(orgId), JSON.stringify(p)); } catch { /* bỏ qua */ }
}

/** Nhóm người theo tổ (tổ theo tên, "Chưa vào tổ" cuối), trong tổ theo tên */
export function groupByTeam<T extends { team: string | null; name: string }>(list: T[]): { team: string | null; items: T[] }[] {
  const by = new Map<string | null, T[]>();
  for (const w of list) by.set(w.team, [...(by.get(w.team) ?? []), w]);
  const cmp = (a: string, b: string) => a.localeCompare(b, 'vi');
  return [...by.entries()]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : cmp(a, b)))
    .map(([team, items]) => ({ team, items: [...items].sort((x, y) => cmp(x.name, y.name)) }));
}

// ---- Nhập số liệu theo bảng đã in (lớp A, D200, migration 0227) ----
export interface CellOut { w: string; d: string; k: CellKind; h?: number }
export interface SkippedCell { w: string; d: string; reason: string }
export interface SaveResult { saved: number; unchanged: number; skipped: SkippedCell[] }
export interface ExistingWork { w: string; d: string; minutes: number; status: string; mine: boolean }
export interface ExistingAbsence { w: string; d: string; kind: string; mine: boolean }
export interface Existing { work: ExistingWork[]; absences: ExistingAbsence[] }

/** Lưu các ô đã điền; máy chủ tự suy ra giờ từ ca của bảng. Gửi theo lô 500 ô; ô không ghi được trả về kèm lý do */
export async function recordTimesheet(sheetId: string, cells: CellOut[]): Promise<SaveResult> {
  const total: SaveResult = { saved: 0, unchanged: 0, skipped: [] };
  for (let i = 0; i < cells.length; i += 500) {
    const r = await rpc<SaveResult>('record_timesheet', { p_sheet: sheetId, p_cells: cells.slice(i, i + 500) });
    total.saved += r.saved; total.unchanged += r.unchanged; total.skipped.push(...r.skipped);
  }
  return total;
}
export const fetchExisting = (sheetId: string) => rpc<Existing>('timesheet_existing', { p_sheet: sheetId });
