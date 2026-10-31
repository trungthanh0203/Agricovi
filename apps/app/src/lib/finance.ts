import { db, type CycleRow, type ExpenseRow, type SaleRow } from './db';
import { insertAndCache, updateAndCache } from './serverWrite';
import { supabase } from './supabase';

/**
 * Chi phí và doanh thu (FR-INV-005/006, v1.1 mục 4.5).
 *  - Chỉ chủ và vai trò Kho & chi phí ghi/sửa/hủy; quản lý và Quản lý HTX chỉ xem (D18).
 *  - Cần mạng, ghi thẳng lên máy chủ (D24); sửa/hủy gửi kèm phiên bản để phát hiện xung đột; hủy cần lý do, không khôi phục.
 *  - Chi phí ước tính/phân bổ bắt buộc ghi giả định (máy chủ cũng ép).
 */

export const EXPENSE_CATEGORY_LABEL: Record<string, string> = {
  material: 'Vật tư',
  labor: 'Nhân công',
  utility: 'Điện, nước',
  rent: 'Thuê đất, ao, nhà/chuồng',
  depreciation: 'Khấu hao nhà/chuồng',
  other: 'Chi phí khác',
};

export const EXPENSE_KIND_LABEL: Record<string, string> = {
  cash_paid: 'Tiền thực chi',
  material_used: 'Vật tư đã dùng (ghi tay)',
  allocated: 'Chi phí phân bổ',
  estimated: 'Chi phí ước tính',
};

export const EXPENSE_KIND_HINT: Record<string, string> = {
  cash_paid: 'Tiền bạn đã thật sự bỏ ra, có thể chứng minh bằng hóa đơn hoặc sổ.',
  material_used: 'Chỉ dùng cho vật tư dùng mà KHÔNG nhập qua kho. Vật tư xuất từ kho đã được tính tự động, ghi ở đây sẽ bị tính hai lần.',
  allocated: 'Một khoản chung chia cho vụ này (ví dụ khấu hao nhà màng). Phải ghi cách chia.',
  estimated: 'Số tiền bạn ước chừng, chưa có chứng từ. Phải ghi cách ước tính.',
};

/** Loại bắt buộc phải ghi giả định (khớp ràng buộc ở máy chủ) */
export const NEEDS_ASSUMPTION = new Set(['allocated', 'estimated']);

const EXPENSE_COLUMNS_BASE =
  'id, organization_id, cycle_id, category, kind, amount, expense_date, note, voided_at, void_reason, version, created_by, received_at';
const EXPENSE_COLUMNS = `${EXPENSE_COLUMNS_BASE}, category_item`;

/** Tải chi phí gần đây; chưa db push 0100 (chưa có cột category_item) thì tải bản cũ */
async function expenseQuery(): Promise<{ data: ExpenseRow[] | null; error: { message?: string } | null }> {
  const q = (cols: string) => supabase!.from('expense_records').select(cols).order('expense_date', { ascending: false }).limit(200);
  const r = await q(EXPENSE_COLUMNS);
  return (r.error && /column|schema cache/i.test(r.error.message ?? '') ? await q(EXPENSE_COLUMNS_BASE) : r) as unknown as { data: ExpenseRow[] | null; error: { message?: string } | null };
}
const SALE_COLUMNS =
  'id, organization_id, cycle_id, sold_date, quantity, unit, amount, buyer_note, voided_at, void_reason, version, created_by, received_at';

/** Tải chi phí và doanh thu gần đây (200 bản ghi mới nhất mỗi loại). Chỉ vai trò được đọc mới có dữ liệu. */
export async function syncFinanceDown(): Promise<void> {
  if (!supabase || !navigator.onLine) return;
  const pendingIds = new Set(
    (await db.outbox.where('state').notEqual('synced').toArray()).map((i) => i.payload.id as string),
  );
  const [ex, sa] = await Promise.all([
    expenseQuery(),
    supabase.from('sales_records').select(SALE_COLUMNS).order('sold_date', { ascending: false }).limit(200),
  ]);
  if (ex.error) throw ex.error;
  if (sa.error) throw sa.error;
  await db.expenses.bulkPut(
    ((ex.data ?? []) as ExpenseRow[]).filter((r) => !pendingIds.has(r.id)).map((r) => ({ ...r, amount: Number(r.amount) })),
  );
  await db.sales.bulkPut(
    ((sa.data ?? []) as SaleRow[]).filter((r) => !pendingIds.has(r.id)).map((r) => ({ ...r, quantity: Number(r.quantity), amount: Number(r.amount) })),
  );
}

// ---------------------------------------------------------------- Chi phí

export interface NewExpense {
  /** Mã tạo sẵn cho lần nhập này: bấm Lưu lặp (mất mạng giữa chừng) không tạo trùng */
  id?: string;
  /** Cơ sở ghi chi phí (cơ sở đang chọn); bị thay bằng chủ vụ nếu gắn vụ */
  organizationId: string;
  cycle: CycleRow | null;
  category: string;
  /** Mã mục tự thêm trong cấu hình Nhóm chi phí (bỏ trống nếu là mục có sẵn) */
  categoryItem?: string | null;
  kind: string;
  amount: number;
  date: string; // yyyy-mm-dd
  note: string;
  userId: string;
}

export async function recordExpense(e: NewExpense): Promise<string> {
  const id = e.id ?? crypto.randomUUID();
  const row = {
    id,
    organization_id: e.cycle ? e.cycle.owner_org_id : e.organizationId,
    cycle_id: e.cycle?.id ?? null,
    category: e.category,
    ...(e.categoryItem ? { category_item: e.categoryItem } : {}),
    kind: e.kind,
    amount: e.amount,
    expense_date: e.date,
    note: e.note.trim() || null,
  };
  await insertAndCache(
    'expense_records', { ...row, source: 'online', created_by: e.userId },
    { ...row, version: 1, created_by: e.userId, received_at: new Date().toISOString() }, 'ghi chi phí',
  );
  return id;
}

export interface ExpenseEdit {
  category: string;
  /** null = bỏ mục tự thêm (về mục có sẵn); undefined = không đổi */
  categoryItem?: string | null;
  kind: string;
  amount: number;
  date: string;
  note: string;
}

export async function editExpense(id: string, e: ExpenseEdit): Promise<void> {
  const cur = await db.expenses.get(id);
  if (!cur) return;
  const changes = { category: e.category, ...(e.categoryItem !== undefined ? { category_item: e.categoryItem } : {}), kind: e.kind, amount: e.amount, expense_date: e.date, note: e.note.trim() || null };
  await updateAndCache('expense_records', id, cur.version, changes, 'sửa khoản chi');
}

export async function voidExpense(id: string, reason: string): Promise<void> {
  const cur = await db.expenses.get(id);
  if (!cur) return;
  await updateAndCache('expense_records', id, cur.version, { voided_at: new Date().toISOString(), void_reason: reason.trim() }, 'hủy khoản chi');
}

/** Kiểm tra chi phí nhập: trả về thông báo lỗi tiếng Việt hoặc null nếu hợp lệ */
export function validateExpense(amount: number | null, kind: string, note: string): string | null {
  if (amount === null || Number.isNaN(amount) || amount < 0 || !Number.isInteger(amount)) {
    return 'Số tiền phải là số đồng không có phần lẻ (ví dụ 150000).';
  }
  if (NEEDS_ASSUMPTION.has(kind) && note.trim().length < 3) {
    return `${EXPENSE_KIND_LABEL[kind]} phải ghi cách ${kind === 'estimated' ? 'ước tính' : 'phân bổ'} vào ô ghi chú.`;
  }
  return null;
}

// ---------------------------------------------------------------- Doanh thu

export interface NewSale {
  id?: string; // mã tạo sẵn cho lần nhập này (chống trùng khi bấm lặp)
  cycle: CycleRow;
  date: string; // yyyy-mm-dd
  quantity: number;
  amount: number;
  buyerNote: string;
  userId: string;
  /** Lý do bán trong thời gian cách ly (D96) */
  withdrawalReason?: string;
}

export async function recordSale(s: NewSale): Promise<string> {
  const id = s.id ?? crypto.randomUUID();
  const row = {
    id,
    organization_id: s.cycle.owner_org_id, // máy chủ tự gán lại theo chủ vụ
    cycle_id: s.cycle.id,
    sold_date: s.date,
    quantity: s.quantity,
    unit: 'kg',
    amount: s.amount,
    buyer_note: s.buyerNote.trim() || null,
    ...(s.withdrawalReason?.trim() ? { withdrawal_reason: s.withdrawalReason.trim() } : {}),
  };
  await insertAndCache(
    'sales_records', { ...row, source: 'online', created_by: s.userId },
    { ...row, version: 1, created_by: s.userId, received_at: new Date().toISOString() }, 'ghi bán hàng',
  );
  return id;
}

export interface SaleEdit {
  date: string;
  quantity: number;
  amount: number;
  buyerNote: string;
}

export async function editSale(id: string, e: SaleEdit): Promise<void> {
  const cur = await db.sales.get(id);
  if (!cur) return;
  const changes = { sold_date: e.date, quantity: e.quantity, amount: e.amount, buyer_note: e.buyerNote.trim() || null };
  await updateAndCache('sales_records', id, cur.version, changes, 'sửa khoản bán');
}

export async function voidSale(id: string, reason: string): Promise<void> {
  const cur = await db.sales.get(id);
  if (!cur) return;
  await updateAndCache('sales_records', id, cur.version, { voided_at: new Date().toISOString(), void_reason: reason.trim() }, 'hủy khoản bán');
}

export function validateSale(quantity: number | null, amount: number | null): string | null {
  if (quantity === null || Number.isNaN(quantity) || quantity <= 0) return 'Số lượng bán phải là số lớn hơn 0 (kg).';
  if (amount === null || Number.isNaN(amount) || amount < 0 || !Number.isInteger(amount)) {
    return 'Số tiền thu phải là số đồng không có phần lẻ (ví dụ 2500000).';
  }
  return null;
}

/**
 * Tải thêm 200 khoản cũ hơn khoản cũ nhất đang có trên máy (Đợt 2, D141). Trả về true nếu có thể còn nữa.
 * Đồng bộ nền chỉ giữ 200 khoản gần nhất; muốn xem cũ hơn thì bấm "Tải thêm".
 */
export async function loadOlderFinance(kind: 'expenses' | 'sales'): Promise<boolean> {
  if (!supabase || !navigator.onLine) throw new Error('Cần có mạng để tải thêm.');
  const isEx = kind === 'expenses';
  const col = isEx ? 'expense_date' : 'sold_date';
  const local = isEx ? await db.expenses.toArray() : await db.sales.toArray();
  const oldest = local.map((r) => (r as unknown as Record<string, string>)[col]).sort()[0];
  const have = new Set(local.map((r) => r.id));
  const q = isEx
    ? supabase.from('expense_records').select(EXPENSE_COLUMNS_BASE + ', category_item')
    : supabase.from('sales_records').select(SALE_COLUMNS);
  let r: { data: unknown; error: { message?: string } | null } = await (oldest ? q.lte(col, oldest) : q).order(col, { ascending: false }).limit(200);
  if (r.error && isEx && /column|schema cache/i.test(r.error.message ?? '')) {
    const q2 = supabase.from('expense_records').select(EXPENSE_COLUMNS_BASE);
    r = await (oldest ? q2.lte(col, oldest) : q2).order(col, { ascending: false }).limit(200);
  }
  if (r.error) throw r.error;
  const rows = (r.data ?? []) as unknown as Array<{ id: string }>;
  const fresh = rows.filter((x) => !have.has(x.id));
  if (isEx) await db.expenses.bulkPut(fresh.map((x) => ({ ...(x as unknown as ExpenseRow), amount: Number((x as unknown as ExpenseRow).amount) })));
  else await db.sales.bulkPut(fresh.map((x) => ({ ...(x as unknown as SaleRow), quantity: Number((x as unknown as SaleRow).quantity), amount: Number((x as unknown as SaleRow).amount) })));
  return rows.length >= 200 && fresh.length > 0;
}
