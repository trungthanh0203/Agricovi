/**
 * Ô của bảng chấm công giấy khi nhập số liệu (D200, lớp A): đọc chữ người dùng gõ giống như viết trên giấy. Phần thuần, có test.
 *   x, X, ✓, ✔ = đủ ca · ½, 0,5 = nửa ca (kiểu ghi ca) · số khác = số giờ (ví dụ 6,5) · p/o/v/k = P, Ô, V, K (nghỉ) · - = không làm · để trống = chưa ghi
 * Kiểu ghi ca: "1" = đủ ca. Kiểu ghi giờ: mọi số là số giờ làm cả ngày ("1" = 1 giờ), "x" vẫn là đủ ca.
 */
export type CellKind = 'full' | 'half' | 'hours' | 'P' | 'O' | 'V' | 'K';
export type Parsed =
  | { kind: 'empty' }
  | { kind: 'none' }
  | { kind: CellKind; hours?: number }
  | { kind: 'error'; message: string };

export const MAX_HOURS = 16;
export const OFF_KINDS: CellKind[] = ['P', 'O', 'V', 'K'];
export const OFF_LABEL: Record<'P' | 'O' | 'V' | 'K', string> = { get P() { return tx`Nghỉ phép năm`; }, get O() { return tx`Nghỉ ốm`; }, get V() { return tx`Nghỉ việc gia đình`; }, get K() { return tx`Nghỉ không lương / không báo trước`; } };

export function parseCell(text: string, mode: 'shift' | 'hours'): Parsed {
  const t = text.trim().replace(/\s+/g, '');
  if (t === '') return { kind: 'empty' };
  if (/^[-–—]+$/.test(t)) return { kind: 'none' };
  if (/^(x|✓|✔)$/i.test(t)) return { kind: 'full' };
  if (t === '½' || t === '1/2') return mode === 'shift' ? { kind: 'half' } : { kind: 'hours', hours: 0.5 };
  const u = t.toLocaleUpperCase('vi');
  if (u === 'P') return { kind: 'P' };
  if (u === 'Ô' || u === 'O') return { kind: 'O' };
  if (u === 'V') return { kind: 'V' };
  if (u === 'K') return { kind: 'K' };
  if (/^\d+([.,]\d+)?$/.test(t)) {
    const n = Number(normalizeDecimal(t));
    if (!(n > 0)) return { kind: 'error', message: tx`Số giờ phải lớn hơn 0 (không làm việc thì ghi –).` };
    if (n > MAX_HOURS) return { kind: 'error', message: tx`Số giờ không quá ${MAX_HOURS}.` };
    if (mode === 'shift') {
      if (n === 1) return { kind: 'full' };
      if (n === 0.5) return { kind: 'half' };
    }
    return { kind: 'hours', hours: n };
  }
  return { kind: 'error', message: tx`Ký hiệu chưa đúng. Dùng ✓ (x), ½, số giờ, P, Ô, V, K hoặc – (không làm).` };
}

/** Chữ chuẩn để hiện lại trong ô sau khi gõ */
export function cellLabel(p: Parsed): string {
  switch (p.kind) {
    case 'empty': return '';
    case 'none': return '–';
    case 'full': return '✓';
    case 'half': return '½';
    case 'hours': return numberToInput(p.hours!);
    case 'error': return '';
    case 'O': return 'Ô';
    default: return p.kind;
  }
}

export interface Net { fullNet: number }
/** Số phút làm thực tế của một ô công (ca đủ = phút ca trừ nghỉ giữa ca); 0 cho ô nghỉ / trống */
export function workMinutes(p: Parsed, fullNet: number): number {
  if (p.kind === 'full') return fullNet;
  if (p.kind === 'half') return Math.round(fullNet / 2);
  if (p.kind === 'hours') return Math.round((p.hours ?? 0) * 60);
  return 0;
}

export interface Totals { minutes: number; off: number; invalid: number }
/** Tổng một người: phút làm, số ngày nghỉ (P Ô V K), số ô sai; `extraMinutes`/`extraOff` là phần đã có sẵn trong hệ thống (ô khóa) */
export function personTotals(cells: Parsed[], fullNet: number, extraMinutes = 0, extraOff = 0): Totals {
  let minutes = extraMinutes, off = extraOff, invalid = 0;
  for (const c of cells) {
    if (c.kind === 'error') invalid += 1;
    else if (c.kind === 'P' || c.kind === 'O' || c.kind === 'V' || c.kind === 'K') off += 1;
    else minutes += workMinutes(c, fullNet);
  }
  return { minutes, off, invalid };
}

/** Ngày công tương đương (theo ca đủ) hoặc giờ, hiển thị cột Tổng: kiểu ca "N công", kiểu giờ "N giờ" */
export function totalText(t: Totals, mode: 'shift' | 'hours', fullNet: number): string {
  const fmt = (n: number) => numberToInput(Math.round(n * 10) / 10);
  const main = mode === 'hours' ? tx`${fmt(t.minutes / 60)} giờ` : tx`${fmt(fullNet > 0 ? t.minutes / fullNet : 0)} công`;
  return t.off > 0 ? tx`${main} · ${t.off} nghỉ` : main;
}import { normalizeDecimal, numberToInput } from './format';
import { t as tx } from '@lingui/core/macro';

