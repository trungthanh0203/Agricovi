import type { PayInput } from './partners';
import { supabase } from './supabase';

function client() {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  return supabase;
}
async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().rpc(fn, args);
  if (error) throw error;
  return data as T;
}

/** Phiếu thu mua HTX–hộ (D149): HTX mua sản phẩm của hộ; công nợ HTX còn phải trả / hộ còn phải thu. Mọi thao tác cần mạng. */
export type ProcStatus = 'overdue' | 'due_soon' | 'ok' | 'paid';
export const PROC_STATUS_LABEL: Record<ProcStatus, string> = { overdue: 'Quá hạn', due_soon: 'Sắp đến hạn', ok: 'Còn hạn', paid: 'Đã trả đủ' };

export interface ProcLine {
  receipt_id: string;
  partner_id: string;      // HTX xem: mã hộ; hộ xem: mã HTX
  partner_name: string;
  receipt_date: string;
  due_date: string | null;
  invoice_no: string | null;
  note: string | null;
  quantity: number;
  unit_price: number;
  total_amount: number;
  crop_name: string | null;
  cycle_id: string | null;
  paid: number;
  remaining: number;
  status: ProcStatus;
  version: number;
}

export async function fetchProcurementLedger(orgId: string, as: 'coop' | 'household', onlyOpen = true): Promise<ProcLine[]> {
  const rows = await rpc<ProcLine[]>('get_procurement_ledger', { p_org: orgId, p_as: as, p_only_open: onlyOpen });
  return rows.map((r) => ({ ...r, quantity: Number(r.quantity), unit_price: Number(r.unit_price), total_amount: Number(r.total_amount), paid: Number(r.paid), remaining: Number(r.remaining) }));
}

export interface NewReceipt {
  id: string; coopId: string; householdId: string; cycleId: string | null; cropId: string | null;
  date: string; quantity: number; unitPrice: number; dueDate: string | null; invoiceNo: string; note: string;
}
export const createProcurementReceipt = (r: NewReceipt) => rpc<unknown>('create_procurement_receipt', {
  p_id: r.id, p_coop: r.coopId, p_household: r.householdId, p_cycle: r.cycleId, p_crop: r.cropId, p_date: r.date, p_qty: r.quantity,
  p_price: r.unitPrice, p_due: r.dueDate, p_invoice: r.invoiceNo || null, p_note: r.note || null,
});

export interface UnpurchasedHarvest { id: string; cycle_id: string; cycle_name: string; harvested_at: string; grade: string | null; quantity: number; lot_code: string | null; crop_type_id: string; crop_name: string }
export async function fetchUnpurchasedHarvests(coopId: string, householdId: string): Promise<{ shared: boolean; harvests: UnpurchasedHarvest[] }> {
  const d = await rpc<{ shared: boolean; harvests: UnpurchasedHarvest[] }>('coop_household_harvests', { p_coop: coopId, p_household: householdId });
  return { shared: d.shared, harvests: d.harvests.map((h) => ({ ...h, quantity: Number(h.quantity) })) };
}
export const createReceiptFromHarvest = (id: string, coopId: string, harvestId: string, unitPrice: number, dueDate: string | null, invoiceNo: string, note: string) =>
  rpc<unknown>('create_procurement_from_harvest', { p_id: id, p_coop: coopId, p_harvest: harvestId, p_price: unitPrice, p_due: dueDate, p_invoice: invoiceNo || null, p_note: note || null });

export const payProcurement = (receiptId: string, i: PayInput, id: string = i.opId ?? crypto.randomUUID()) =>
  rpc<unknown>('pay_procurement', { p_id: id, p_receipt: receiptId, p_amount: i.amount, p_paid_on: i.paidOn, p_method: i.method, p_note: i.note || null });
export const voidProcurementPayment = (paymentId: string, reason: string) => rpc<unknown>('void_procurement_payment', { p_payment: paymentId, p_reason: reason });
export const voidProcurementReceipt = (receiptId: string, reason: string) => rpc<unknown>('void_procurement_receipt', { p_receipt: receiptId, p_reason: reason });

export interface ProcPayment { id: string; paid_on: string; amount: number; method: 'cash' | 'transfer'; note: string | null; voided_at: string | null; void_reason: string | null }
export async function listProcurementPayments(receiptId: string): Promise<ProcPayment[]> {
  const { data, error } = await client().from('procurement_payments').select('id, paid_on, amount, method, note, voided_at, void_reason').eq('receipt_id', receiptId).order('paid_on');
  if (error) throw error;
  return ((data ?? []) as ProcPayment[]).map((p) => ({ ...p, amount: Number(p.amount) }));
}
