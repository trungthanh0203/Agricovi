import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { downloadCsv } from './summary';

export interface ExpenseTotals { n: number; cash_paid: number; material_used: number; allocated_estimated: number }
export interface SaleTotals { n: number; quantity: number; amount: number }

/**
 * Tổng Chi phí/Doanh thu tính ở máy chủ trên TOÀN BỘ khoản (D142), không chỉ phần đã tải về máy.
 * Trả null khi chưa có (đang tải, offline, chưa db push 0148): nơi gọi dùng tạm số tính trên máy.
 * `refreshKey` đổi (ghi/hủy khoản) thì tính lại.
 */
export function useFinanceTotals<T extends ExpenseTotals | SaleTotals>(kind: 'expenses' | 'sales', orgId: string | undefined, cycleFilter: string, refreshKey: string): T | null {
  const [t, setT] = useState<T | null>(null);
  useEffect(() => {
    if (!supabase || !orgId || !navigator.onLine) return;
    let alive = true;
    const args = kind === 'expenses'
      ? { p_org: orgId, p_cycle: cycleFilter && cycleFilter !== 'none' ? cycleFilter : null, p_no_cycle: cycleFilter === 'none' }
      : { p_org: orgId, p_cycle: cycleFilter || null };
    void supabase.rpc(kind === 'expenses' ? 'expense_totals' : 'sales_totals', args).then((r) => {
      if (alive) setT(r.error ? null : (r.data as T));
    });
    return () => { alive = false; };
  }, [kind, orgId, cycleFilter, refreshKey]);
  return t;
}

const csvCell = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** Xuất CSV TẤT CẢ khoản (không chỉ phần đã tải), tải từng trang 1000 dòng từ máy chủ */
export async function exportFinanceCsv(kind: 'expenses' | 'sales', orgId: string, cycleFilter: string, cycleName: (id: string | null) => string): Promise<void> {
  if (!supabase || !navigator.onLine) throw new Error('Cần có mạng để xuất đủ dữ liệu.');
  const table = kind === 'expenses' ? 'expense_records' : 'sales_records';
  const dateCol = kind === 'expenses' ? 'expense_date' : 'sold_date';
  const cols = kind === 'expenses'
    ? 'id, cycle_id, category, kind, amount, expense_date, note, voided_at, void_reason'
    : 'id, cycle_id, sold_date, quantity, unit, amount, buyer_note, voided_at, void_reason';
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(table).select(cols).eq('organization_id', orgId).order(dateCol, { ascending: false }).order('id').range(from, from + 999);
    if (cycleFilter === 'none') q = q.is('cycle_id', null);
    else if (cycleFilter) q = q.eq('cycle_id', cycleFilter);
    const r = await q;
    if (r.error) throw new Error(r.error.message);
    const page = (r.data ?? []) as unknown as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  const head = kind === 'expenses'
    ? ['Ngày', 'Vụ', 'Nhóm', 'Loại', 'Số tiền', 'Ghi chú', 'Đã hủy', 'Lý do hủy']
    : ['Ngày', 'Vụ', 'Số lượng', 'Đơn vị', 'Số tiền', 'Ghi chú người mua', 'Đã hủy', 'Lý do hủy'];
  const lines = rows.map((r) => (kind === 'expenses'
    ? [r.expense_date, cycleName(r.cycle_id as string | null), r.category, r.kind, r.amount, r.note, r.voided_at ? 'x' : '', r.void_reason]
    : [r.sold_date, cycleName(r.cycle_id as string | null), r.quantity, r.unit, r.amount, r.buyer_note, r.voided_at ? 'x' : '', r.void_reason]).map(csvCell).join(','));
  downloadCsv(`${kind === 'expenses' ? 'chi-phi' : 'doanh-thu'}-tat-ca.csv`, '﻿' + [head.join(','), ...lines].join('\n'));
}
