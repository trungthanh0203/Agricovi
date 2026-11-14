import { supabase } from './supabase';

/**
 * Hợp đồng mua bán / bao tiêu mẫu (mục 13 lát 2). Lưu điều khoản đã nhập, tự đánh số HĐ-năm-0001, in bản điền sẵn để ký tay. KHÔNG ký số, KHÔNG thay luật sư:
 * nội dung điều khoản là MẪU THAM KHẢO sinh ở đây (buildContractDoc), cần người có chuyên môn pháp lý xem trước khi ký. Cần mạng (chức năng quản lý, D24).
 */
export type ContractKind = 'procure' | 'sale';
export type ContractStatus = 'draft' | 'signed' | 'done' | 'cancelled';
export type PriceMode = 'fixed' | 'floor' | 'market';
export type PayMethod = 'cash' | 'transfer' | 'either';

export interface TradeContract {
  id: string; organization_id: string; kind: ContractKind; contract_no: string;
  counterparty_org_id: string | null; partner_id: string | null;
  counterparty_name: string; counterparty_rep: string | null; counterparty_phone: string | null; counterparty_address: string | null; counterparty_tax_code: string | null;
  crop_type_id: string | null; product_name: string; cycle_id: string | null; quantity_kg: number | null;
  price_mode: PriceMode; unit_price: number | null; quality_note: string | null;
  delivery_from: string | null; delivery_to: string | null; delivery_place: string | null;
  payment_days: number | null; payment_method: PayMethod; extra_terms: string | null;
  status: ContractStatus; signed_on: string | null; valid_to: string | null; cancel_reason: string | null; created_at: string;
}

export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = { draft: 'Bản nháp', signed: 'Đã ký', done: 'Đã hoàn thành', cancelled: 'Đã hủy' };
export const CONTRACT_KIND_LABEL: Record<ContractKind, string> = { procure: 'Bao tiêu / thu mua từ hộ', sale: 'Bán cho khách / đối tác' };
export const PRICE_MODE_LABEL: Record<PriceMode, string> = { fixed: 'Giá cố định', floor: 'Giá sàn (không thấp hơn)', market: 'Theo giá thị trường lúc giao' };
export const PAY_METHOD_LABEL: Record<PayMethod, string> = { cash: 'Tiền mặt', transfer: 'Chuyển khoản', either: 'Tiền mặt hoặc chuyển khoản' };

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  if (!navigator.onLine) throw new Error('OFFLINE: Cần có mạng để thực hiện. Hãy kết nối mạng rồi thử lại.');
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export async function fetchContracts(orgId: string): Promise<TradeContract[]> {
  const rows = await rpc<TradeContract[]>('get_trade_contracts', { p_org: orgId });
  return rows.map((r) => ({ ...r, quantity_kg: r.quantity_kg == null ? null : Number(r.quantity_kg), unit_price: r.unit_price == null ? null : Number(r.unit_price) }));
}

export interface ContractInput {
  id: string | null; kind: ContractKind; counterpartyOrgId: string | null; partnerId: string | null;
  name: string; rep: string; phone: string; address: string; taxCode: string;
  cropId: string | null; product: string; cycleId: string | null; quantityKg: number | null; priceMode: PriceMode; unitPrice: number | null; quality: string;
  deliveryFrom: string | null; deliveryTo: string | null; place: string; payDays: number | null; payMethod: PayMethod; extra: string; validTo: string | null;
}
export const saveContract = (orgId: string, i: ContractInput) => rpc<string>('save_trade_contract', {
  p_org: orgId, p_id: i.id, p_kind: i.kind, p_counterparty_org: i.counterpartyOrgId, p_partner: i.partnerId,
  p_cp_name: i.name, p_cp_rep: i.rep || null, p_cp_phone: i.phone || null, p_cp_address: i.address || null, p_cp_tax: i.taxCode || null,
  p_crop: i.cropId, p_product: i.product, p_cycle: i.cycleId, p_qty: i.quantityKg, p_price_mode: i.priceMode, p_price: i.unitPrice, p_quality: i.quality || null,
  p_from: i.deliveryFrom, p_to: i.deliveryTo, p_place: i.place || null, p_pay_days: i.payDays, p_pay_method: i.payMethod, p_extra: i.extra || null, p_valid_to: i.validTo,
});
export const markContractSigned = (id: string, date: string) => rpc<void>('set_trade_contract_status', { p_id: id, p_status: 'signed', p_date: date, p_reason: null });
export const markContractDone = (id: string) => rpc<void>('set_trade_contract_status', { p_id: id, p_status: 'done', p_date: null, p_reason: null });
export const cancelContract = (id: string, reason: string) => rpc<void>('set_trade_contract_status', { p_id: id, p_status: 'cancelled', p_date: null, p_reason: reason });
export const deleteContractDraft = (id: string) => rpc<void>('delete_trade_contract_draft', { p_id: id });

// ---------------------------------------------------------------- mẫu văn bản (phần thuần)
const DOTS = '……………………………';
const vnDate = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const vnd = (n: number) => `${Math.round(n).toLocaleString('vi-VN')} đồng`;
const qty = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 2 });

export interface ContractParty { role: 'A' | 'B'; heading: string; lines: string[] }
export interface ContractDoc { title: string; number: string; parties: ContractParty[]; intro: string; articles: { title: string; paras: string[] }[]; closing: string; note: string }

/**
 * Văn bản hợp đồng điền sẵn từ dữ liệu đã nhập. Bên A: procure = HTX (bên mua), sale = cơ sở (bên bán). Bên B là bên còn lại.
 * Thông tin chưa có thì để dòng chấm cho hai bên điền tay; không tự lấy thêm dữ liệu cá nhân nào (CCCD, địa chỉ cá nhân).
 */
export function buildContractDoc(c: TradeContract, ownerName: string): ContractDoc {
  const buyerIsA = c.kind === 'procure';
  const buyer = buyerIsA ? 'Bên A' : 'Bên B', seller = buyerIsA ? 'Bên B' : 'Bên A';
  const a: ContractParty = { role: 'A', heading: buyerIsA ? 'BÊN A (Bên mua)' : 'BÊN A (Bên bán)', lines: [`Tên: ${ownerName}`, `Địa chỉ: ${DOTS}`, `Mã số thuế: ${DOTS}`, `Người đại diện: ${DOTS}   Chức vụ: ${DOTS}`, `Điện thoại: ${DOTS}`] };
  const b: ContractParty = {
    role: 'B', heading: buyerIsA ? 'BÊN B (Bên bán)' : 'BÊN B (Bên mua)',
    lines: [
      `Tên: ${c.counterparty_name}`, `Địa chỉ: ${c.counterparty_address || DOTS}`, ...(c.kind === 'sale' ? [`Mã số thuế: ${c.counterparty_tax_code || DOTS}`] : []),
      `Người đại diện: ${c.counterparty_rep || DOTS}   Chức vụ: ${DOTS}`, `Điện thoại: ${c.counterparty_phone || DOTS}`,
    ],
  };

  const priceText = c.price_mode === 'fixed'
    ? `Đơn giá ${vnd(c.unit_price ?? 0)}/kg, cố định trong suốt thời gian giao nhận ghi tại Điều 3.`
    : c.price_mode === 'floor'
      ? `Giá không thấp hơn ${vnd(c.unit_price ?? 0)}/kg. Nếu giá thị trường tại thời điểm giao nhận cao hơn thì hai bên thỏa thuận lại giá của đợt giao đó.`
      : 'Giá theo giá thị trường tại thời điểm giao nhận, hai bên thống nhất cho từng đợt giao và ghi vào phiếu giao nhận / phiếu thu mua của đợt đó.';
  const delivery = c.delivery_from || c.delivery_to
    ? `Thời gian giao nhận: ${c.delivery_from && c.delivery_to ? `từ ngày ${vnDate(c.delivery_from)} đến ngày ${vnDate(c.delivery_to)}` : c.delivery_from ? `từ ngày ${vnDate(c.delivery_from)}` : `đến ngày ${vnDate(c.delivery_to)}`}.`
    : `Thời gian giao nhận: ${DOTS}.`;
  const pay = c.payment_days == null || c.payment_days === 0
    ? `${buyer} thanh toán cho ${seller} ngay khi giao nhận xong từng đợt.`
    : `${buyer} thanh toán cho ${seller} trong vòng ${c.payment_days} ngày kể từ ngày giao nhận từng đợt.`;

  const articles: ContractDoc['articles'] = [
    { title: 'Điều 1. Đối tượng hợp đồng', paras: [
      `${seller} đồng ý bán và ${buyer} đồng ý mua sản phẩm: ${c.product_name}.`,
      c.quantity_kg ? `Khối lượng dự kiến: khoảng ${qty(c.quantity_kg)} kg (khối lượng thực tế theo số cân từng đợt giao nhận).` : 'Khối lượng: theo số cân thực tế từng đợt giao nhận.',
      `Chất lượng: ${c.quality_note || 'sản phẩm tươi, đúng chủng loại, đạt yêu cầu về chất lượng và an toàn thực phẩm do hai bên thống nhất'}.`,
    ] },
    { title: 'Điều 2. Giá', paras: [priceText] },
    { title: 'Điều 3. Giao nhận', paras: [
      delivery,
      `Địa điểm giao nhận: ${c.delivery_place || DOTS}.`,
      'Khối lượng được xác định bằng cân tại nơi nhận, có sự chứng kiến của đại diện hai bên; mỗi đợt giao nhận lập phiếu ghi ngày, khối lượng, đơn giá, thành tiền.',
    ] },
    { title: 'Điều 4. Thanh toán', paras: [
      pay,
      `Hình thức thanh toán: ${PAY_METHOD_LABEL[c.payment_method].toLowerCase()}. Các khoản thanh toán lớn nên chuyển khoản và lưu chứng từ.`,
    ] },
    { title: `Điều 5. Trách nhiệm của ${seller}`, paras: [
      `Giao đúng sản phẩm, đúng thời gian và địa điểm đã thỏa thuận; cung cấp thông tin về quá trình sản xuất (nhật ký sản xuất, vật tư đã dùng) khi ${buyer} yêu cầu để truy xuất nguồn gốc.`,
      'Tuân thủ thời gian cách ly của thuốc bảo vệ thực vật, thuốc thú y và các quy định về an toàn thực phẩm trước khi thu hoạch và giao hàng.',
    ] },
    { title: `Điều 6. Trách nhiệm của ${buyer}`, paras: [
      `Nhận hàng và thanh toán đúng thỏa thuận; thông báo trước cho ${seller} lịch nhận hàng; không từ chối nhận hàng đạt chất lượng đã thỏa thuận khi không có lý do chính đáng.`,
    ] },
    { title: 'Điều 7. Vi phạm, bất khả kháng và giải quyết tranh chấp', paras: [
      'Bên nào vi phạm gây thiệt hại cho bên kia thì bồi thường theo thiệt hại thực tế; mức phạt vi phạm (nếu có) do hai bên thỏa thuận tại phần điều khoản bổ sung.',
      'Trường hợp bất khả kháng (thiên tai, dịch bệnh, quyết định của cơ quan nhà nước…) làm một bên không thực hiện được thì thông báo kịp thời cho bên kia và hai bên cùng bàn cách xử lý.',
      'Tranh chấp được giải quyết trước hết bằng thương lượng; nếu không được thì đưa ra Tòa án có thẩm quyền theo quy định pháp luật.',
    ] },
    { title: 'Điều 8. Hiệu lực', paras: [
      `Hợp đồng có hiệu lực từ ngày ký${c.valid_to ? ` đến hết ngày ${vnDate(c.valid_to)}` : ''}, lập thành hai bản, mỗi bên giữ một bản có giá trị như nhau.`,
    ] },
  ];
  if (c.extra_terms) articles.push({ title: 'Điều 9. Điều khoản bổ sung', paras: c.extra_terms.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) });

  return {
    title: c.kind === 'procure' ? 'HỢP ĐỒNG BAO TIÊU, THU MUA NÔNG SẢN' : 'HỢP ĐỒNG MUA BÁN NÔNG SẢN',
    number: `Số: ${c.contract_no}`,
    parties: [a, b],
    intro: 'Hôm nay, hai bên gồm:',
    articles,
    closing: c.signed_on ? `Ký ngày ${vnDate(c.signed_on)}.` : 'Ngày … tháng … năm …',
    note: 'Mẫu tham khảo do phần mềm lập sẵn từ thông tin đã nhập. Cần luật sư hoặc cán bộ pháp chế xem trước khi ký; không thay thế tư vấn pháp lý.',
  };
}

/** Gợi ý đơn giá cho phiếu thu mua: hợp đồng bao tiêu đã ký (còn hiệu lực) với hộ đó, giá cố định hoặc giá sàn */
export function contractPriceFor(contracts: TradeContract[], householdId: string, cropId: string | null, today: string): { price: number; contractNo: string } | null {
  const ok = contracts.filter((c) => c.kind === 'procure' && c.status === 'signed' && c.counterparty_org_id === householdId && c.unit_price !== null && c.price_mode !== 'market'
    && (!c.valid_to || c.valid_to >= today) && (!c.crop_type_id || !cropId || c.crop_type_id === cropId));
  if (ok.length === 0) return null;
  const best = ok.sort((x, y) => (y.signed_on ?? '').localeCompare(x.signed_on ?? ''))[0]!;
  return { price: best.unit_price!, contractNo: best.contract_no };
}
