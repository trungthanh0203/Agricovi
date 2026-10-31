-- D149: Phiếu thu mua HTX–hộ: HTX mua sản phẩm của hộ thành viên (bao tiêu). Tách tiền của hai bên: đây KHÔNG phải chi phí/doanh thu của vụ
-- mà là giao dịch giữa HTX và hộ, sinh công nợ: HTX còn phải trả hộ, hộ còn phải thu HTX. Cả hai bên cùng thấy một sổ.
-- Chỉ thêm; sửa sai = hủy kèm lý do (không xóa). Ghi chỉ qua hàm (có kiểm quyền).

create table procurement_receipts (
  id uuid primary key,
  cooperative_org_id uuid not null references organizations(id) on delete cascade,
  household_org_id uuid not null references organizations(id) on delete cascade,
  cycle_id uuid references production_cycles(id),            -- vụ của hộ nguồn gốc lô hàng (tùy chọn, phục vụ truy xuất)
  crop_type_id uuid references crop_types(id),
  receipt_date date not null,
  quantity numeric not null check (quantity > 0),
  unit_price bigint not null check (unit_price >= 0),         -- đồng/kg
  amount bigint not null check (amount >= 0),
  due_date date,
  invoice_no text check (invoice_no is null or length(invoice_no) <= 60),
  note text check (note is null or length(note) <= 500),
  voided_at timestamptz,
  void_reason text,
  version integer not null default 1,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (voided_at is null or void_reason is not null),
  check (due_date is null or due_date >= receipt_date),
  check (cooperative_org_id <> household_org_id)
);
create index on procurement_receipts (cooperative_org_id, receipt_date desc);
create index on procurement_receipts (household_org_id, receipt_date desc);

create table procurement_payments (
  id uuid primary key,
  receipt_id uuid not null references procurement_receipts(id) on delete restrict,
  cooperative_org_id uuid not null,
  household_org_id uuid not null,
  paid_on date not null,
  amount bigint not null check (amount > 0),
  method text not null default 'cash' check (method in ('cash', 'transfer')),
  note text check (note is null or length(note) <= 300),
  voided_at timestamptz,
  void_reason text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (voided_at is null or void_reason is not null)
);
create index on procurement_payments (receipt_id);

alter table procurement_receipts enable row level security;
alter table procurement_payments enable row level security;
create policy proc_receipts_read on procurement_receipts for select to authenticated
  using (has_perm(cooperative_org_id, 'coop', 'view') or has_perm(household_org_id, 'sales', 'view'));
create policy proc_payments_read on procurement_payments for select to authenticated
  using (has_perm(cooperative_org_id, 'coop', 'view') or has_perm(household_org_id, 'sales', 'view'));
-- không có chính sách ghi: chỉ ghi qua các hàm bên dưới

create or replace function create_procurement_receipt(
  p_id uuid, p_coop uuid, p_household uuid, p_cycle uuid, p_crop uuid, p_date date, p_qty numeric, p_price bigint,
  p_due date, p_invoice text, p_note text) returns procurement_receipts
language plpgsql security definer set search_path = public as $$
declare r procurement_receipts;
begin
  select * into r from procurement_receipts where id = p_id;
  if r.id is not null then
    if r.cooperative_org_id = p_coop then return r; end if;
    raise exception 'DUPLICATE_ID: Mã phiếu đã tồn tại.';
  end if;
  if not has_perm(p_coop, 'coop', 'edit') then raise exception 'FORBIDDEN: Bạn không có quyền lập phiếu thu mua của HTX.'; end if;
  if not exists (select 1 from cooperative_memberships where household_org_id = p_household and cooperative_org_id = p_coop and status = 'active') then
    raise exception 'NOT_MEMBER: Hộ này không thuộc HTX.';
  end if;
  if p_qty is null or p_qty <= 0 then raise exception 'INVALID_QUANTITY: Khối lượng phải lớn hơn 0.'; end if;
  if p_price is null or p_price < 0 then raise exception 'INVALID_PRICE: Đơn giá không hợp lệ.'; end if;
  if p_date is null or p_date > vn_today() then raise exception 'INVALID_DATE: Ngày thu mua không được sau ngày hôm nay.'; end if;
  if p_due is not null and p_due < p_date then raise exception 'INVALID_DATE: Hạn trả tiền không được trước ngày thu mua.'; end if;
  if p_cycle is not null and cycle_area_org(p_cycle) is distinct from p_household then
    raise exception 'INVALID_CYCLE: Vụ không thuộc hộ này.';
  end if;
  insert into procurement_receipts (id, cooperative_org_id, household_org_id, cycle_id, crop_type_id, receipt_date, quantity, unit_price, amount, due_date, invoice_no, note)
    values (p_id, p_coop, p_household, p_cycle, p_crop, p_date, p_qty, p_price, round(p_qty * p_price)::bigint, p_due,
            nullif(trim(coalesce(p_invoice, '')), ''), nullif(trim(coalesce(p_note, '')), ''))
    returning * into r;
  return r;
end $$;

create or replace function pay_procurement(p_id uuid, p_receipt uuid, p_amount bigint, p_paid_on date, p_method text, p_note text) returns procurement_payments
language plpgsql security definer set search_path = public as $$
declare r procurement_receipts; pay procurement_payments; got bigint;
begin
  select * into pay from procurement_payments where id = p_id;
  if pay.id is not null then return pay; end if;
  select * into r from procurement_receipts where id = p_receipt for update;   -- khóa phiếu: hai lần trả cùng lúc không vượt tổng
  if r.id is null then raise exception 'NOT_FOUND: Không tìm thấy phiếu thu mua.'; end if;
  if not has_perm(r.cooperative_org_id, 'coop', 'edit') then raise exception 'FORBIDDEN: Chỉ HTX ghi trả tiền cho hộ.'; end if;
  if r.voided_at is not null then raise exception 'BILL_INVALID: Phiếu đã hủy, không ghi trả tiền được.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT: Số tiền phải lớn hơn 0.'; end if;
  select coalesce(sum(amount), 0) into got from procurement_payments where receipt_id = r.id and voided_at is null;
  if got + p_amount > r.amount then raise exception 'OVERPAY: Số tiền trả vượt số còn phải trả của phiếu (còn % đồng).', r.amount - got; end if;
  if p_paid_on is null or p_paid_on > vn_today() then raise exception 'INVALID_DATE: Ngày trả tiền không được sau ngày hôm nay.'; end if;
  if p_paid_on < r.receipt_date then raise exception 'INVALID_DATE: Ngày trả tiền không được trước ngày thu mua.'; end if;
  insert into procurement_payments (id, receipt_id, cooperative_org_id, household_org_id, paid_on, amount, method, note)
    values (p_id, r.id, r.cooperative_org_id, r.household_org_id, p_paid_on, p_amount, coalesce(p_method, 'cash'), nullif(trim(coalesce(p_note, '')), ''))
    returning * into pay;
  return pay;
end $$;

create or replace function void_procurement_payment(p_payment uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare pay procurement_payments;
begin
  select * into pay from procurement_payments where id = p_payment for update;
  if pay.id is null then raise exception 'NOT_FOUND: Không tìm thấy lần trả tiền.'; end if;
  if not has_perm(pay.cooperative_org_id, 'coop', 'edit') then raise exception 'FORBIDDEN'; end if;
  if pay.voided_at is not null then return; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'REASON_REQUIRED: Hãy ghi lý do hủy (ít nhất 3 ký tự).'; end if;
  update procurement_payments set voided_at = now(), void_reason = trim(p_reason) where id = p_payment;
end $$;

create or replace function void_procurement_receipt(p_receipt uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare r procurement_receipts;
begin
  select * into r from procurement_receipts where id = p_receipt for update;
  if r.id is null then raise exception 'NOT_FOUND: Không tìm thấy phiếu thu mua.'; end if;
  if not has_perm(r.cooperative_org_id, 'coop', 'edit') then raise exception 'FORBIDDEN'; end if;
  if r.voided_at is not null then return; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'REASON_REQUIRED: Hãy ghi lý do hủy (ít nhất 3 ký tự).'; end if;
  if exists (select 1 from procurement_payments where receipt_id = r.id and voided_at is null) then
    raise exception 'HAS_PAYMENTS: Phiếu đã có lần trả tiền. Hãy hủy các lần trả tiền trước (kèm lý do).';
  end if;
  update procurement_receipts set voided_at = now(), void_reason = trim(p_reason), version = version + 1 where id = p_receipt;
end $$;

-- Sổ phiếu thu mua. p_as = 'coop': HTX xem (theo từng hộ); p_as = 'household': hộ xem (HTX nào đã mua của hộ)
create or replace function get_procurement_ledger(p_org uuid, p_as text, p_only_open boolean default true) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if p_as = 'coop' then
    if not has_perm(p_org, 'coop', 'view') then raise exception 'FORBIDDEN: Bạn không có quyền xem công nợ thu mua của HTX.'; end if;
  elsif p_as = 'household' then
    if not has_perm(p_org, 'sales', 'view') then raise exception 'FORBIDDEN: Bạn không có quyền xem doanh thu của hộ.'; end if;
  else raise exception 'INVALID_ARGUMENT'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by t.partner_name, t.receipt_date desc, t.created_at) from (
      select r.id as receipt_id,
             case p_as when 'coop' then r.household_org_id else r.cooperative_org_id end as partner_id,
             case p_as when 'coop' then h.name else c.name end as partner_name,
             r.receipt_date, r.due_date, r.invoice_no, r.note, r.quantity, r.unit_price, r.amount as total_amount, r.cycle_id,
             cr.name as crop_name, r.created_at, r.version, r.voided_at,
             coalesce(pp.paid, 0) as paid, r.amount - coalesce(pp.paid, 0) as remaining,
             case when r.voided_at is not null then 'voided'
                  when r.amount - coalesce(pp.paid, 0) <= 0 then 'paid'
                  when r.due_date is not null and r.due_date < vn_today() then 'overdue'
                  when r.due_date is not null and r.due_date <= vn_today() + 7 then 'due_soon'
                  else 'ok' end as status
        from procurement_receipts r
        join organizations h on h.id = r.household_org_id
        join organizations c on c.id = r.cooperative_org_id
        left join crop_types cr on cr.id = r.crop_type_id
        left join lateral (select sum(amount) as paid from procurement_payments x where x.receipt_id = r.id and x.voided_at is null) pp on true
       where (case p_as when 'coop' then r.cooperative_org_id else r.household_org_id end) = p_org
         and r.voided_at is null
         and (not p_only_open or r.amount - coalesce(pp.paid, 0) > 0)
    ) t), '[]'::jsonb);
end $$;

revoke execute on function create_procurement_receipt(uuid, uuid, uuid, uuid, uuid, date, numeric, bigint, date, text, text),
  pay_procurement(uuid, uuid, bigint, date, text, text), void_procurement_payment(uuid, text), void_procurement_receipt(uuid, text),
  get_procurement_ledger(uuid, text, boolean) from public, anon;
grant execute on function create_procurement_receipt(uuid, uuid, uuid, uuid, uuid, date, numeric, bigint, date, text, text),
  pay_procurement(uuid, uuid, bigint, date, text, text), void_procurement_payment(uuid, text), void_procurement_receipt(uuid, text),
  get_procurement_ledger(uuid, text, boolean) to authenticated;
