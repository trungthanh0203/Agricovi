import { syncInventoryDown } from './inventory';
import { insertRow, requireOnline, updateVersioned } from './serverWrite';
import { supabase } from './supabase';

/**
 * Đối tác (nhà cung ứng) và mua theo hóa đơn (G2-2, D76). Mọi thao tác cần mạng, ghi thẳng lên máy chủ (D24); dữ liệu giá và công nợ
 * nhạy cảm nên KHÔNG lưu trên máy. Quyền: xem = mục Chi phí (xem), ghi = mục Chi phí (sửa); dòng nhập kho còn cần quyền sửa mục Kho.
 */

export interface Partner {
  id: string;
  organization_id: string;
  name: string;
  phone: string | null;
  address: string | null;
  tax_code: string | null;
  bank_account: string | null;
  goods: string | null;
  note: string | null;
  is_supplier: boolean;
  is_customer: boolean;
  is_active: boolean;
  version: number;
}

export interface PartnerInput {
  name: string;
  phone?: string;
  address?: string;
  tax_code?: string;
  bank_account?: string;
  goods?: string;
  note?: string;
}

const COLUMNS = 'id, organization_id, name, phone, address, tax_code, bank_account, goods, note, is_supplier, is_customer, is_active, version';
const nz = (s: string | undefined) => (s && s.trim() ? s.trim() : null);

function client() {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  return supabase;
}

/** Nhà cung ứng của cơ sở (kể cả đã dừng, để lọc ở giao diện) */
export async function listSuppliers(orgId: string): Promise<Partner[]> {
  const { data, error } = await client().from('partners').select(COLUMNS).eq('organization_id', orgId).eq('is_supplier', true).order('name');
  if (error) throw new Error(error.message);
  return (data ?? []) as Partner[];
}

export function validatePartner(f: PartnerInput): string | null {
  if (f.name.trim().length < 2) return 'Tên nhà cung ứng cần ít nhất 2 ký tự.';
  return null;
}

/** Thêm nhà cung ứng; trả về mã mới */
export async function createSupplier(orgId: string, f: PartnerInput, id: string = crypto.randomUUID()): Promise<string> {
  requireOnline('thêm nhà cung ứng');
  const bad = validatePartner(f);
  if (bad) throw new Error(`INVALID_PARTNER: ${bad}`);
  await insertRow('partners', {
    id, organization_id: orgId, name: f.name.trim(), phone: nz(f.phone), address: nz(f.address), tax_code: nz(f.tax_code),
    bank_account: nz(f.bank_account), goods: nz(f.goods), note: nz(f.note), is_supplier: true, is_customer: false,
  });
  return id;
}

/** Sửa hoặc dừng/dùng lại có kiểm tra phiên bản (người khác sửa trước thì báo xung đột, không ghi đè) */
export async function updateSupplier(p: Partner, changes: Partial<PartnerInput> & { is_active?: boolean }): Promise<Partner> {
  requireOnline('sửa nhà cung ứng');
  if (changes.name !== undefined) {
    const bad = validatePartner({ name: changes.name });
    if (bad) throw new Error(`INVALID_PARTNER: ${bad}`);
  }
  const patch: Record<string, unknown> = { ...changes };
  if (changes.name !== undefined) patch.name = changes.name.trim();
  return updateVersioned<Partner>('partners', p.id, p.version, patch);
}

export interface PurchaseLine {
  /** Mã dòng nhập kho tạo sẵn (bấm lặp không nhân đôi) */
  id: string;
  materialId: string;
  /** Số lượng theo đơn vị cơ sở của vật tư */
  quantity: number;
  /** Đơn giá (đồng) theo đơn vị cơ sở */
  unitCost: number;
}

export interface PurchaseInput {
  /** Mã hóa đơn tạo sẵn: gửi lặp thì máy chủ trả lại hóa đơn đã có, không tạo thêm */
  id: string;
  orgId: string;
  partnerId: string;
  invoiceNo: string;
  billDate: string;
  dueDate: string | null;
  total: number;
  note: string;
  locationId: string;
  lines: PurchaseLine[];
  paid: number;
  method: 'cash' | 'transfer';
}

/** Tổng tiền các dòng (mỗi dòng làm tròn tới đồng) */
export const linesTotal = (lines: { quantity: number; unitCost: number }[]): number =>
  lines.reduce((s, l) => s + Math.round(l.quantity * l.unitCost), 0);

/** Kiểm tra trước khi gửi; trả về câu báo lỗi hoặc null */
export function validatePurchase(i: PurchaseInput, today: string): string | null {
  if (!i.partnerId) return 'Hãy chọn nhà cung ứng.';
  if (i.lines.length === 0) return 'Hóa đơn cần ít nhất một dòng vật tư.';
  for (const l of i.lines) {
    if (!l.materialId) return 'Có dòng chưa chọn vật tư.';
    if (!(l.quantity > 0)) return 'Số lượng ở mỗi dòng phải lớn hơn 0.';
    if (!Number.isInteger(l.unitCost) || l.unitCost < 0) return 'Đơn giá phải là số tiền (đồng), không có phần lẻ.';
  }
  if (!i.locationId) return 'Hãy chọn kho nhận hàng.';
  if (i.billDate > today) return 'Ngày mua không được sau ngày hôm nay.';
  if (i.dueDate && i.dueDate < i.billDate) return 'Hạn thanh toán không được trước ngày mua.';
  if (!Number.isInteger(i.total) || i.total < 0) return 'Tổng tiền phải là số tiền (đồng), không có phần lẻ.';
  if (!Number.isInteger(i.paid) || i.paid < 0) return 'Số tiền đã trả phải là số tiền không âm.';
  if (i.paid > i.total) return 'Số tiền đã trả không được lớn hơn tổng tiền hóa đơn.';
  return null;
}

/** Mua theo hóa đơn: tạo hóa đơn + các dòng nhập kho + lần trả đầu trong MỘT giao dịch ở máy chủ (lỗi thì không lưu gì) */
export async function recordPurchase(i: PurchaseInput): Promise<void> {
  requireOnline('lưu hóa đơn mua');
  const { error } = await client().rpc('record_purchase', {
    p_id: i.id,
    p_org: i.orgId,
    p_partner: i.partnerId,
    p_invoice: i.invoiceNo.trim() || null,
    p_bill_date: i.billDate,
    p_due_date: i.dueDate || null,
    p_total: i.total,
    p_note: i.note.trim() || null,
    p_lines: i.lines.map((l) => ({ id: l.id, location_id: i.locationId, material_id: l.materialId, quantity: l.quantity, unit_cost: l.unitCost })),
    p_paid: i.paid,
    p_method: i.method,
  });
  if (error) throw new Error(error.message);
  await syncInventoryDown().catch(() => undefined); // tồn kho mới
}

// ---------------------------------------------------------------------------
// Công nợ phải trả (P3)
// ---------------------------------------------------------------------------

export type PayableStatus = 'overdue' | 'due_soon' | 'ok' | 'paid';

export interface PayableBill {
  bill_id: string;
  partner_id: string;
  partner_name: string;
  invoice_no: string | null;
  bill_date: string;
  due_date: string | null;
  total_amount: number;
  paid: number;
  remaining: number;
  status: PayableStatus;
  version: number;
}

export const PAYABLE_STATUS_LABEL: Record<PayableStatus, string> = {
  overdue: 'Quá hạn', due_soon: 'Sắp đến hạn', ok: 'Còn hạn', paid: 'Đã trả đủ',
};

/** Công nợ của cơ sở: mỗi hóa đơn chưa hủy kèm đã trả, còn nợ, tình trạng hạn. `onlyOpen` = chỉ hóa đơn còn nợ. */
export async function fetchPayables(orgId: string, onlyOpen = true): Promise<PayableBill[]> {
  const { data, error } = await client().rpc('get_payables', { p_org: orgId, p_only_open: onlyOpen });
  if (error) throw new Error(error.message);
  return ((data ?? []) as PayableBill[]).map((b) => ({ ...b, total_amount: Number(b.total_amount), paid: Number(b.paid), remaining: Number(b.remaining) }));
}

export interface BillPayment {
  id: string;
  bill_id: string;
  paid_on: string;
  amount: number;
  method: 'cash' | 'transfer';
  note: string | null;
  voided_at: string | null;
  void_reason: string | null;
}

export async function listBillPayments(billId: string): Promise<BillPayment[]> {
  const { data, error } = await client().from('bill_payments').select('id, bill_id, paid_on, amount, method, note, voided_at, void_reason')
    .eq('bill_id', billId).order('paid_on').order('created_at');
  if (error) throw new Error(error.message);
  return ((data ?? []) as BillPayment[]).map((p) => ({ ...p, amount: Number(p.amount) }));
}

export interface PayInput { amount: number; paidOn: string; method: 'cash' | 'transfer'; note: string; /** mã lần ghi tạo sẵn: bấm lặp không ghi hai lần */ opId?: string }

export function validatePay(i: PayInput, maxAmount: number, today: string): string | null {
  if (!Number.isInteger(i.amount) || i.amount <= 0) return 'Số tiền trả phải là số tiền (đồng) lớn hơn 0, không có phần lẻ.';
  if (i.amount > maxAmount) return `Số tiền trả vượt số còn nợ (còn nợ ${maxAmount.toLocaleString('vi-VN')} đ).`;
  if (i.paidOn > today) return 'Ngày trả không được sau ngày hôm nay.';
  return null;
}

/** Trả tiền một hóa đơn (mã lần trả tạo sẵn: bấm lặp không ghi hai lần) */
export async function payBill(billId: string, i: PayInput, id: string = i.opId ?? crypto.randomUUID()): Promise<void> {
  requireOnline('ghi lần trả tiền');
  const { error } = await client().rpc('pay_bill', { p_id: id, p_bill: billId, p_amount: i.amount, p_paid_on: i.paidOn, p_method: i.method, p_note: i.note.trim() || null });
  if (error) throw new Error(error.message);
}

/** Trả cho nhà cung ứng: máy chủ tự trừ vào các hóa đơn cũ nhất trước */
export async function payPartner(partnerId: string, i: PayInput, opId: string = i.opId ?? crypto.randomUUID()): Promise<void> {
  requireOnline('ghi lần trả tiền');
  const { error } = await client().rpc('pay_partner', { p_op_id: opId, p_partner: partnerId, p_amount: i.amount, p_paid_on: i.paidOn, p_method: i.method, p_note: i.note.trim() || null });
  if (error) throw new Error(error.message);
}

export async function voidPayment(paymentId: string, reason: string): Promise<void> {
  requireOnline('hủy lần trả tiền');
  const { error } = await client().rpc('void_bill_payment', { p_id: paymentId, p_reason: reason });
  if (error) throw new Error(error.message);
}

/** Sửa số hóa đơn, hạn thanh toán, ghi chú (không sửa được tổng tiền, ngày mua, dòng hàng) */
export async function editBill(b: { bill_id: string; version: number }, changes: { invoice_no?: string; due_date?: string | null; note?: string }): Promise<void> {
  requireOnline('sửa hóa đơn');
  const patch: Record<string, unknown> = { ...changes };
  if ('due_date' in changes) patch.due_date = changes.due_date || null; // chuỗi rỗng = bỏ hạn
  await updateVersioned('purchase_bills', b.bill_id, b.version, patch);
}

/** Hủy hóa đơn (kèm lý do). Không đảo kho: hàng đã nhập vẫn nằm trong kho, muốn bỏ thì điều chỉnh tồn. */
export async function voidBill(b: { bill_id: string; version: number }, reason: string): Promise<void> {
  requireOnline('hủy hóa đơn');
  await updateVersioned('purchase_bills', b.bill_id, b.version, { voided_at: new Date().toISOString(), void_reason: reason });
}

/** Tổng hợp nợ để hiện thẻ nhắc: quá hạn và sắp đến hạn */
export function summarizePayables(rows: PayableBill[]): { owed: number; overdueCount: number; overdueAmount: number; soonCount: number; soonAmount: number } {
  let owed = 0, overdueCount = 0, overdueAmount = 0, soonCount = 0, soonAmount = 0;
  for (const b of rows) {
    if (b.remaining <= 0) continue;
    owed += b.remaining;
    if (b.status === 'overdue') { overdueCount++; overdueAmount += b.remaining; }
    else if (b.status === 'due_soon') { soonCount++; soonAmount += b.remaining; }
  }
  return { owed, overdueCount, overdueAmount, soonCount, soonAmount };
}

// ---------------------------------------------------------------------------
// Khách hàng (G2-4, D77): dùng chung bảng Đối tác với nhà cung ứng. Quyền gộp với mục Doanh thu.
// ---------------------------------------------------------------------------

export type CustomerKind = 'retail' | 'trader' | 'market' | 'enterprise' | 'coop' | 'other';
export const CUSTOMER_KIND_LABEL: Record<CustomerKind, string> = {
  retail: 'Bán lẻ', trader: 'Thương lái', market: 'Siêu thị / bếp ăn', enterprise: 'Doanh nghiệp', coop: 'HTX khác', other: 'Khác',
};

export interface Customer extends Partner {
  customer_kind: CustomerKind | null;
}

export interface CustomerInput extends PartnerInput {
  customer_kind?: CustomerKind | '';
}

// Chỉ danh sách khách mới đọc cột customer_kind (nhà cung ứng không cần), để app vẫn chạy nếu máy chủ chưa cập nhật migration mới
const CUSTOMER_COLUMNS = `${COLUMNS}, customer_kind`;

export async function listCustomers(orgId: string): Promise<Customer[]> {
  const { data, error } = await client().from('partners').select(CUSTOMER_COLUMNS).eq('organization_id', orgId).eq('is_customer', true).order('name');
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Customer[];
}

/** Mọi đối tác người dùng xem được (để phát hiện tên trùng với nhà cung ứng đã có) */
export async function listAllPartners(orgId: string): Promise<Pick<Partner, 'id' | 'name' | 'is_supplier' | 'is_customer' | 'is_active' | 'version'>[]> {
  const { data, error } = await client().from('partners').select('id, name, is_supplier, is_customer, is_active, version').eq('organization_id', orgId);
  if (error) throw new Error(error.message);
  return (data ?? []) as Pick<Partner, 'id' | 'name' | 'is_supplier' | 'is_customer' | 'is_active' | 'version'>[];
}

export async function createCustomer(orgId: string, f: CustomerInput, id: string = crypto.randomUUID()): Promise<string> {
  requireOnline('thêm khách hàng');
  const bad = validatePartner(f);
  if (bad) throw new Error(`INVALID_PARTNER: ${bad.replace('nhà cung ứng', 'khách hàng')}`);
  await insertRow('partners', {
    id, organization_id: orgId, name: f.name.trim(), phone: nz(f.phone), address: nz(f.address), tax_code: nz(f.tax_code),
    bank_account: nz(f.bank_account), goods: nz(f.goods), note: nz(f.note), is_supplier: false, is_customer: true, customer_kind: f.customer_kind || null,
  });
  return id;
}

export async function updateCustomer(p: Pick<Partner, 'id' | 'version'>, changes: Partial<CustomerInput> & { is_active?: boolean; is_customer?: boolean }): Promise<Customer> {
  requireOnline('sửa khách hàng');
  if (changes.name !== undefined) {
    const bad = validatePartner({ name: changes.name });
    if (bad) throw new Error(`INVALID_PARTNER: ${bad.replace('nhà cung ứng', 'khách hàng')}`);
  }
  const patch: Record<string, unknown> = { ...changes };
  if (changes.name !== undefined) patch.name = changes.name.trim();
  return updateVersioned<Customer>('partners', p.id, p.version, patch);
}

export interface SaleCreditInput {
  /** Mã lần bán tạo sẵn: gửi lặp thì máy chủ trả lại lần bán đã có */
  id: string;
  orgId: string;
  cycleId: string;
  date: string;
  quantity: number;
  amount: number;
  buyerNote: string;
  partnerId: string;
  invoiceNo: string;
  /** Hạn thu tiền do người dùng nhập (rỗng = không có hạn) */
  dueDate: string | null;
  collected: number;
  method: 'cash' | 'transfer';
}

export function validateSaleCredit(i: SaleCreditInput, today: string): string | null {
  if (!i.partnerId) return 'Hãy chọn khách hàng.';
  if (!(i.quantity > 0)) return 'Số lượng bán phải là số lớn hơn 0 (kg).';
  if (!Number.isInteger(i.amount) || i.amount < 0) return 'Số tiền bán phải là số đồng không có phần lẻ.';
  if (i.date > today) return 'Ngày bán không được sau ngày hôm nay.';
  if (i.dueDate && i.dueDate < i.date) return 'Hạn thu tiền không được trước ngày bán.';
  if (!Number.isInteger(i.collected) || i.collected < 0) return 'Số tiền đã thu phải là số tiền không âm.';
  if (i.collected > i.amount) return 'Số tiền đã thu không được lớn hơn số tiền bán.';
  return null;
}

/** Ghi lần bán CÓ KHÁCH + lần thu đầu trong một giao dịch ở máy chủ; trả về dòng bán để lưu vào máy */
export async function recordSaleWithCustomer(i: SaleCreditInput): Promise<Record<string, unknown>> {
  requireOnline('ghi bán hàng');
  const { data, error } = await client().rpc('record_sale', {
    p_id: i.id, p_org: i.orgId, p_cycle: i.cycleId, p_date: i.date, p_qty: i.quantity, p_amount: i.amount,
    p_buyer_note: i.buyerNote.trim() || null, p_partner: i.partnerId, p_invoice: i.invoiceNo.trim() || null,
    p_due: i.dueDate || null, p_paid: i.collected, p_method: i.method,
  });
  if (error) throw new Error(error.message);
  return data as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Công nợ phải thu (G2-4)
// ---------------------------------------------------------------------------

export interface ReceivableSale {
  sale_id: string;
  partner_id: string;
  partner_name: string;
  invoice_no: string | null;
  sold_date: string;
  due_date: string | null;
  total_amount: number;
  quantity: number;
  cycle_id: string;
  collected: number;
  remaining: number;
  status: PayableStatus;
  version: number;
}

export const RECEIVABLE_STATUS_LABEL: Record<PayableStatus, string> = {
  overdue: 'Quá hạn', due_soon: 'Sắp đến hạn', ok: 'Còn hạn', paid: 'Đã thu đủ',
};

/** Công nợ phải thu của cơ sở: mỗi lần bán có khách (chưa hủy) kèm đã thu, còn phải thu, tình trạng hạn */
export async function fetchReceivables(orgId: string, onlyOpen = true): Promise<ReceivableSale[]> {
  const { data, error } = await client().rpc('get_receivables', { p_org: orgId, p_only_open: onlyOpen });
  if (error) throw new Error(error.message);
  return ((data ?? []) as ReceivableSale[]).map((b) => ({
    ...b, total_amount: Number(b.total_amount), quantity: Number(b.quantity), collected: Number(b.collected), remaining: Number(b.remaining),
  }));
}

export interface SaleReceipt {
  id: string;
  sale_id: string;
  received_on: string;
  amount: number;
  method: 'cash' | 'transfer';
  note: string | null;
  voided_at: string | null;
  void_reason: string | null;
}

export async function listSaleReceipts(saleId: string): Promise<SaleReceipt[]> {
  const { data, error } = await client().from('sale_receipts').select('id, sale_id, received_on, amount, method, note, voided_at, void_reason')
    .eq('sale_id', saleId).order('received_on').order('created_at');
  if (error) throw new Error(error.message);
  return ((data ?? []) as SaleReceipt[]).map((p) => ({ ...p, amount: Number(p.amount) }));
}

/** Thu tiền một lần bán (mã lần thu tạo sẵn: bấm lặp không ghi hai lần) */
export async function collectSale(saleId: string, i: PayInput, id: string = i.opId ?? crypto.randomUUID()): Promise<void> {
  requireOnline('ghi lần thu tiền');
  const { error } = await client().rpc('collect_sale', { p_id: id, p_sale: saleId, p_amount: i.amount, p_received_on: i.paidOn, p_method: i.method, p_note: i.note.trim() || null });
  if (error) throw new Error(error.message);
}

/** Thu của một khách: máy chủ tự trừ vào các lần bán cũ nhất trước */
export async function collectPartner(partnerId: string, i: PayInput, opId: string = i.opId ?? crypto.randomUUID()): Promise<void> {
  requireOnline('ghi lần thu tiền');
  const { error } = await client().rpc('collect_partner', { p_op_id: opId, p_partner: partnerId, p_amount: i.amount, p_received_on: i.paidOn, p_method: i.method, p_note: i.note.trim() || null });
  if (error) throw new Error(error.message);
}

export async function voidSaleReceipt(receiptId: string, reason: string): Promise<void> {
  requireOnline('hủy lần thu tiền');
  const { error } = await client().rpc('void_sale_receipt', { p_id: receiptId, p_reason: reason });
  if (error) throw new Error(error.message);
}

/** Sửa số phiếu và hạn thu của lần bán có khách (không sửa số tiền ở đây) */
export async function editSaleCredit(s: { sale_id: string; version: number }, changes: { invoice_no?: string; due_date?: string }): Promise<void> {
  requireOnline('sửa lần bán');
  const patch: Record<string, unknown> = {};
  if ('invoice_no' in changes) patch.invoice_no = changes.invoice_no ?? '';
  if ('due_date' in changes) patch.due_date = changes.due_date || '';
  await updateVersioned('sales_records', s.sale_id, s.version, patch);
}

/** Hủy lần bán còn nợ (kèm lý do). Máy chủ từ chối nếu còn lần thu chưa hủy. */
export async function voidSaleCredit(s: { sale_id: string; version: number }, reason: string): Promise<Record<string, unknown>> {
  requireOnline('hủy lần bán');
  return updateVersioned<Record<string, unknown>>('sales_records', s.sale_id, s.version, { voided_at: new Date().toISOString(), void_reason: reason });
}
