import { addMonths } from './dates';
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

/** Hạn thanh toán mặc định: 1 tháng sau ngày mua (quyết định 23/10/2026) */
export const defaultDueDate = (billDate: string): string => addMonths(billDate, 1);

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
