import { requireOnline } from './serverWrite';
import { supabase } from './supabase';

/**
 * Yêu cầu báo giá và đơn đặt hàng từ WEBSITE, xử lý ngay trong app (G2-5, D78).
 * App gọi thẳng các hàm có sẵn của website (cùng tài khoản, cùng CSDL): máy chủ kiểm quyền (chủ, quản lý hoặc biên tập hồ sơ) và quy định
 * thao tác nào được phép ở mỗi trạng thái. App không tự suy ra luật. Chữ ký các hàm được giữ bằng bài kiểm thử hợp đồng
 * `supabase/tests/web_contract.test.mjs`: đổi ở đây phải đổi ở đó và ngược lại.
 */

function client() {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  return supabase;
}

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

// ---------------------------------------------------------------- Khách tiềm năng

export type LeadStatus = 'new' | 'handled' | 'spam';
export interface WebLead {
  id: string;
  kind: string;
  target_name: string | null;
  sender_name: string;
  sender_phone: string | null;
  sender_email: string | null;
  quantity_note: string | null;
  message: string;
  status: LeadStatus;
  note: string | null;
  created_at: string;
  org_name: string | null;
}

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = { new: 'Mới', handled: 'Đã xử lý', spam: 'Rác' };

export function fetchLeads(status: LeadStatus | null = null): Promise<WebLead[]> {
  return call<WebLead[]>('my_quote_requests', { p_status: status });
}

export async function setLeadStatus(id: string, status: 'new' | 'handled', note: string): Promise<void> {
  requireOnline('đổi trạng thái yêu cầu');
  await call('set_my_quote', { p_id: id, p_status: status, p_note: note.trim() || null });
}

/** Yêu cầu nào đã thành khách nào (bảng phía app) */
export async function fetchLeadLinks(orgId: string): Promise<Map<string, string>> {
  const { data, error } = await client().from('web_lead_links').select('quote_id, partner_id').eq('organization_id', orgId);
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as { quote_id: string; partner_id: string }[]).map((r) => [r.quote_id, r.partner_id]));
}

export interface LeadLinkResult { partner_id: string; created: boolean; already: boolean }

/** Thêm yêu cầu vào khách hàng: nối khách trùng số điện thoại hoặc tạo khách mới (máy chủ làm, gọi lặp an toàn) */
export async function linkLeadToCustomer(orgId: string, quoteId: string): Promise<LeadLinkResult> {
  requireOnline('thêm khách hàng');
  return call<LeadLinkResult>('link_lead_to_customer', { p_org: orgId, p_quote: quoteId });
}

// ---------------------------------------------------------------- Đơn hàng

export type OrderStatus = 'placed' | 'quoted' | 'accepted' | 'preparing' | 'shipped' | 'delivered' | 'completed' | 'cancelled' | 'rejected';
export type OrderPayment = 'unpaid' | 'partial' | 'paid';

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  placed: 'Chờ báo giá', quoted: 'Đã báo giá', accepted: 'Đã chốt', preparing: 'Đang chuẩn bị', shipped: 'Đang giao',
  delivered: 'Đã giao', completed: 'Hoàn tất', cancelled: 'Đã hủy', rejected: 'Đã từ chối',
};
export const ORDER_PAYMENT_LABEL: Record<OrderPayment, string> = { unpaid: 'Chưa thanh toán', partial: 'Thanh toán một phần', paid: 'Đã thanh toán' };

/** Thao tác phía bán mà máy chủ cho phép theo trạng thái (get_order.actions) */
export type OrderAction = 'quote' | 'reject' | 'prepare' | 'ship' | 'deliver' | 'seller_cancel' | 'payment';
export const ORDER_ACTION_LABEL: Record<OrderAction, string> = {
  quote: 'Báo giá', reject: 'Từ chối đơn', prepare: 'Bắt đầu chuẩn bị', ship: 'Giao đi', deliver: 'Đã giao tới người mua',
  seller_cancel: 'Hủy đơn', payment: 'Ghi nhận thanh toán',
};

export interface WebOrderSummary {
  id: string;
  code: string;
  status: OrderStatus;
  payment_status: OrderPayment;
  supplier_name: string;
  recipient: string;
  created_at: string;
  updated_at: string;
  total: number | null;
  item_count: number;
  item_names: string | null;
}

export interface WebOrderItem {
  id: string;
  listing_id: string | null;
  name: string;
  unit: string | null;
  list_price: number | null;
  unit_price: number | null;
  quantity: number;
  agreed_quantity: number | null;
}

export interface WebOrderEvent { kind: string; role: 'buyer' | 'seller' | 'system'; from: string | null; to: string | null; note: string | null; at: string }

export interface WebOrderDetail {
  id: string;
  code: string;
  side: 'buyer' | 'seller';
  status: OrderStatus;
  payment_status: OrderPayment;
  supplier_name: string;
  recipient: string;
  recipient_phone: string;
  province: string;
  district: string | null;
  address: string;
  desired_date: string | null;
  buyer_note: string | null;
  seller_note: string | null;
  shipping_fee: number;
  deliver_date: string | null;
  quoted_total: number | null;
  total: number | null;
  cancel_reason: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  buyer_name: string | null;
  actions: OrderAction[];
  items: WebOrderItem[];
  events: WebOrderEvent[];
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export async function fetchOrders(status: OrderStatus | null = null): Promise<WebOrderSummary[]> {
  const rows = await call<WebOrderSummary[]>('list_orders', { p_role: 'seller', p_status: status });
  return rows.map((r) => ({ ...r, total: num(r.total) }));
}

export async function fetchOrder(id: string): Promise<WebOrderDetail> {
  const o = await call<WebOrderDetail>('get_order', { p_id: id });
  return {
    ...o,
    shipping_fee: Number(o.shipping_fee ?? 0), quoted_total: num(o.quoted_total), total: num(o.total),
    items: (o.items ?? []).map((i) => ({ ...i, list_price: num(i.list_price), unit_price: num(i.unit_price), quantity: Number(i.quantity), agreed_quantity: num(i.agreed_quantity) })),
  };
}

export interface QuoteInput {
  items: { id: string; unitPrice: number; quantity: number }[];
  shipping: number;
  note: string;
  deliverDate: string | null;
}

export function validateQuote(i: QuoteInput, ordered: Map<string, number>, today: string): string | null {
  if (i.items.length === 0) return 'Đơn chưa có dòng hàng.';
  for (const it of i.items) {
    if (!Number.isFinite(it.unitPrice) || it.unitPrice <= 0) return 'Hãy nhập đơn giá (lớn hơn 0) cho tất cả các dòng hàng.';
    const max = ordered.get(it.id) ?? 0;
    if (!Number.isFinite(it.quantity) || it.quantity <= 0 || it.quantity > max) return `Số lượng chốt phải lớn hơn 0 và không vượt số lượng người mua đặt (${max}).`;
  }
  if (!Number.isFinite(i.shipping) || i.shipping < 0) return 'Phí giao hàng không được âm.';
  if (i.deliverDate && i.deliverDate < today) return 'Ngày giao dự kiến không được ở quá khứ.';
  return null;
}

export async function quoteOrder(id: string, i: QuoteInput): Promise<void> {
  requireOnline('báo giá');
  await call('quote_order', {
    p_id: id,
    p_items: i.items.map((x) => ({ id: x.id, unit_price: x.unitPrice, quantity: x.quantity })),
    p_shipping: i.shipping,
    p_note: i.note.trim() || null,
    p_date: i.deliverDate || null,
  });
}

/** Các thao tác đổi trạng thái đơn (từ chối, chuẩn bị, giao, hủy…). Máy chủ kiểm lại trạng thái hiện tại. */
export async function orderAction(id: string, action: Exclude<OrderAction, 'quote' | 'payment'>, note: string): Promise<void> {
  requireOnline('xử lý đơn hàng');
  await call('order_action', { p_id: id, p_action: action, p_note: note.trim() || null });
}

export async function setOrderPayment(id: string, status: OrderPayment, note: string): Promise<void> {
  requireOnline('ghi nhận thanh toán');
  await call('set_order_payment', { p_id: id, p_status: status, p_note: note.trim() || null });
}

// ---------------------------------------------------------------- Ghi doanh thu từ đơn (migration 0059)

/** Đơn nào thuộc cơ sở nào, để chỉ hiện đơn của cơ sở đang chọn */
export async function fetchOrderOrgs(): Promise<Record<string, string>> {
  return (await call<Record<string, string> | null>('app_seller_order_orgs', {})) ?? {};
}

export interface OrderContext {
  organization_id: string;
  code: string;
  status: OrderStatus;
  payment_status: OrderPayment;
  recipient: string;
  recipient_phone: string;
  shipping_fee: number;
  delivered_at: string | null;
  items: { id: string; name: string; unit: string | null; quantity: number; agreed_quantity: number | null; unit_price: number | null; cycle_id: string | null; listing_unit: string | null }[];
  sales: { sale_id: string; created_at: string }[];
}

export async function fetchOrderContext(orderId: string): Promise<OrderContext> {
  const c = await call<OrderContext>('app_order_context', { p_order: orderId });
  return {
    ...c, shipping_fee: Number(c.shipping_fee ?? 0),
    items: c.items.map((i) => ({ ...i, quantity: Number(i.quantity), agreed_quantity: num(i.agreed_quantity), unit_price: num(i.unit_price) })),
  };
}

export interface OrderSaleInput {
  orderId: string;
  /** Mã lần bán tạo sẵn: gửi lặp thì máy chủ trả lại lần bán đã có */
  saleId: string;
  orgId: string;
  cycleId: string;
  date: string;
  quantity: number;
  amount: number;
  partnerId: string;
  invoiceNo: string;
  dueDate: string | null;
  collected: number;
  method: 'cash' | 'transfer';
}

/** Ghi lần bán cho đơn (kèm khách, lần thu đầu, liên kết đơn) trong một giao dịch; trả về dòng bán để lưu vào máy */
export async function recordOrderSale(i: OrderSaleInput): Promise<Record<string, unknown>> {
  requireOnline('ghi doanh thu từ đơn');
  return call<Record<string, unknown>>('record_order_sale', {
    p_order: i.orderId, p_sale: i.saleId, p_org: i.orgId, p_cycle: i.cycleId, p_date: i.date, p_qty: i.quantity, p_amount: i.amount,
    p_buyer_note: null, p_partner: i.partnerId, p_invoice: i.invoiceNo.trim() || null, p_due: i.dueDate || null, p_paid: i.collected, p_method: i.method,
  });
}

/** Số điện thoại về dạng so sánh được (giống norm_phone ở máy chủ) */
export function normPhone(p: string | null | undefined): string {
  const d = (p ?? '').replace(/[^0-9]/g, '');
  return /^84[0-9]{9}$/.test(d) ? `0${d.slice(2)}` : d;
}
