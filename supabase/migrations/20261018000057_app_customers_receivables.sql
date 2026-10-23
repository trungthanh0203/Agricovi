-- G2-4 (D77): KHÁCH HÀNG và CÔNG NỢ PHẢI THU. Dùng chung bảng Đối tác (cờ is_customer) với nhà cung ứng (D58-3).
-- Quyền gộp với mục DOANH THU (xem/sửa). Dữ liệu khách là dữ liệu cá nhân: riêng tư theo cơ sở, không công khai, quản trị nền tảng không đọc.
-- Chỉ lần bán CÓ chọn khách mới thành công nợ; bán không chọn khách (và toàn bộ dữ liệu bán cũ) coi như thu tiền ngay, không đổi gì.
-- Tiền thu nợ KHÔNG phải doanh thu mới (doanh thu đã ghi lúc bán) nên tổng kết vụ và báo cáo doanh thu không đổi.
-- Hạn thu tiền do người dùng tự nhập (không có mặc định; để trống thì không nhắc quá hạn).

-- ---------------------------------------------------------------------------
-- Đối tác: loại khách; quyền theo cờ (nhà cung ứng theo Chi phí, khách hàng theo Doanh thu)
-- ---------------------------------------------------------------------------
alter table partners add column customer_kind text
  check (customer_kind is null or customer_kind in ('retail', 'trader', 'market', 'enterprise', 'coop', 'other'));

drop policy partners_read on partners;
drop policy partners_insert on partners;
drop policy partners_update on partners;
create policy partners_read on partners for select to authenticated
  using ((is_supplier and has_perm(organization_id, 'expenses', 'view')) or (is_customer and has_perm(organization_id, 'sales', 'view')));
create policy partners_insert on partners for insert to authenticated
  with check ((not is_supplier or has_perm(organization_id, 'expenses', 'edit')) and (not is_customer or has_perm(organization_id, 'sales', 'edit')));
-- Sửa: phải có quyền sửa của MỌI cờ đang bật (đối tác vừa là nhà cung ứng vừa là khách cần cả hai quyền)
create policy partners_update on partners for update to authenticated
  using ((is_supplier and has_perm(organization_id, 'expenses', 'edit')) or (is_customer and has_perm(organization_id, 'sales', 'edit')))
  with check ((not is_supplier or has_perm(organization_id, 'expenses', 'edit')) and (not is_customer or has_perm(organization_id, 'sales', 'edit')));

-- Sửa đối tác: thêm loại khách và bật/tắt cờ (luôn còn ít nhất một cờ)
create or replace function update_partner(p_id uuid, p_expected_version integer, p_op_id uuid, p_changes jsonb)
returns partners
language plpgsql security invoker set search_path = public as $$
declare r partners; cur partners;
begin
  update partners set
    name          = case when p_changes ? 'name'          then p_changes->>'name' else name end,
    phone         = case when p_changes ? 'phone'         then nullif(p_changes->>'phone', '') else phone end,
    address       = case when p_changes ? 'address'       then nullif(p_changes->>'address', '') else address end,
    tax_code      = case when p_changes ? 'tax_code'      then nullif(p_changes->>'tax_code', '') else tax_code end,
    bank_account  = case when p_changes ? 'bank_account'  then nullif(p_changes->>'bank_account', '') else bank_account end,
    goods         = case when p_changes ? 'goods'         then nullif(p_changes->>'goods', '') else goods end,
    note          = case when p_changes ? 'note'          then nullif(p_changes->>'note', '') else note end,
    is_active     = case when p_changes ? 'is_active'     then (p_changes->>'is_active')::boolean else is_active end,
    is_supplier   = case when p_changes ? 'is_supplier'   then (p_changes->>'is_supplier')::boolean else is_supplier end,
    is_customer   = case when p_changes ? 'is_customer'   then (p_changes->>'is_customer')::boolean else is_customer end,
    customer_kind = case when p_changes ? 'customer_kind' then nullif(p_changes->>'customer_kind', '') else customer_kind end,
    last_op_id    = p_op_id
  where id = p_id and version = p_expected_version
  returning * into r;
  if r.id is not null then return r; end if;
  select * into cur from partners where id = p_id;
  if cur.id is null then raise exception 'NOT_FOUND: Không tìm thấy đối tác hoặc bạn không có quyền xem.'; end if;
  if p_op_id is not null and cur.last_op_id = p_op_id then return cur; end if;
  if cur.version <> p_expected_version then
    raise exception 'CONFLICT: Đối tác đã được người khác thay đổi (phiên bản máy chủ %, bạn đang sửa phiên bản %).', cur.version, p_expected_version;
  end if;
  raise exception 'FORBIDDEN: Bạn không có quyền sửa đối tác này (cần quyền sửa mục Chi phí cho nhà cung ứng, mục Doanh thu cho khách hàng).';
end $$;

-- ---------------------------------------------------------------------------
-- Bán hàng có khách + lần thu tiền
-- ---------------------------------------------------------------------------
alter table sales_records
  add column partner_id uuid references partners(id),
  add column invoice_no text check (invoice_no is null or length(invoice_no) <= 60),
  add column due_date date;
create index sales_records_partner_idx on sales_records (partner_id) where partner_id is not null;

create table sale_receipts (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  sale_id uuid not null references sales_records(id),
  received_on date not null,
  amount bigint not null check (amount > 0),
  method text not null default 'cash' check (method in ('cash', 'transfer')),
  note text check (note is null or length(note) <= 300),
  op_id uuid,                                                    -- chống ghi lặp của lệnh "thu của khách" (nhiều dòng cùng lệnh)
  voided_at timestamptz,
  void_reason text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (voided_at is null or (void_reason is not null and length(trim(void_reason)) > 0))
);
create index sale_receipts_sale_idx on sale_receipts (sale_id);
create index sale_receipts_org_op_idx on sale_receipts (organization_id, op_id) where op_id is not null;

-- Lần bán có khách: khách cùng cơ sở, đang dùng, là khách hàng; hạn không trước ngày bán; không đổi khách sau khi ghi;
-- không giảm số tiền xuống dưới số đã thu; không hủy lần bán còn lần thu chưa hủy
create or replace function sales_credit_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare p partners; got bigint;
begin
  if tg_op = 'INSERT' then
    new.invoice_no := nullif(trim(coalesce(new.invoice_no, '')), '');
    if new.partner_id is null then
      new.due_date := null;
      return new;
    end if;
    select * into p from partners where id = new.partner_id;
    if p.id is null or p.organization_id <> new.organization_id then
      raise exception 'PARTNER_INVALID: Khách hàng không thuộc cơ sở này.';
    end if;
    if not p.is_customer or not p.is_active then
      raise exception 'PARTNER_INVALID: Đối tác "%" đã dừng hoặc chưa được đánh dấu là khách hàng.', p.name;
    end if;
    if new.due_date is not null and new.due_date < new.sold_date then
      raise exception 'BILL_INVALID: Hạn thu tiền không được trước ngày bán.';
    end if;
    return new;
  end if;
  -- cập nhật
  if new.partner_id is distinct from old.partner_id then
    raise exception 'SALE_LOCKED: Không đổi khách hàng của lần bán đã ghi. Hãy hủy lần bán rồi ghi lại.';
  end if;
  if old.partner_id is not null then
    select coalesce(sum(amount), 0) into got from sale_receipts where sale_id = new.id and voided_at is null;
    if new.amount < got then
      raise exception 'SALE_LOCKED: Số tiền bán không được thấp hơn số đã thu (% đồng). Hãy hủy bớt các lần thu trước.', got;
    end if;
    if old.voided_at is null and new.voided_at is not null and got > 0 then
      raise exception 'HAS_RECEIPTS: Lần bán này đã có các lần thu tiền. Hãy hủy các lần thu trước rồi mới hủy lần bán.';
    end if;
    if new.due_date is not null and new.due_date < new.sold_date then
      raise exception 'BILL_INVALID: Hạn thu tiền không được trước ngày bán.';
    end if;
  elsif new.due_date is distinct from old.due_date or new.invoice_no is distinct from old.invoice_no then
    raise exception 'SALE_LOCKED: Lần bán không có khách hàng không có số phiếu và hạn thu.';
  end if;
  new.invoice_no := nullif(trim(coalesce(new.invoice_no, '')), '');
  return new;
end $$;
create trigger sales_credit_guard before insert or update on sales_records for each row execute function sales_credit_guard();

create or replace function sale_receipts_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare s sales_records; got bigint;
begin
  if tg_op = 'INSERT' then
    select * into s from sales_records where id = new.sale_id for update;    -- khóa lần bán để hai lần thu cùng lúc không vượt tổng
    if s.id is null or s.organization_id <> new.organization_id then
      raise exception 'BILL_INVALID: Lần bán không thuộc cơ sở này.';
    end if;
    if s.partner_id is null then
      raise exception 'BILL_INVALID: Lần bán này không ghi khách hàng nên không có công nợ phải thu.';
    end if;
    if s.voided_at is not null then
      raise exception 'BILL_INVALID: Lần bán đã hủy, không ghi thu tiền được.';
    end if;
    select coalesce(sum(amount), 0) into got from sale_receipts where sale_id = new.sale_id and voided_at is null;
    if got + new.amount > s.amount then
      raise exception 'OVERPAY: Số tiền thu vượt số còn phải thu của lần bán (còn phải thu % đồng).', s.amount - got;
    end if;
    if new.received_on > vn_today() then
      raise exception 'BILL_INVALID: Ngày thu tiền không được sau ngày hôm nay.';
    end if;
    if new.received_on < s.sold_date then
      raise exception 'BILL_INVALID: Ngày thu tiền không được trước ngày bán.';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'PAYMENT_LOCKED: Không xóa lần thu tiền. Hãy hủy kèm lý do.';
  end if;
  if new.organization_id <> old.organization_id or new.sale_id <> old.sale_id or new.received_on <> old.received_on
     or new.amount <> old.amount or new.method <> old.method or new.created_by is distinct from old.created_by then
    raise exception 'PAYMENT_LOCKED: Chỉ được hủy lần thu tiền (kèm lý do), không sửa số tiền hay ngày thu.';
  end if;
  if old.voided_at is not null and new.voided_at is distinct from old.voided_at then
    raise exception 'PAYMENT_LOCKED: Lần thu tiền đã hủy.';
  end if;
  return new;
end $$;
create trigger sale_receipts_guard before insert or update or delete on sale_receipts for each row execute function sale_receipts_guard();

alter table sale_receipts enable row level security;
create policy sale_rec_read on sale_receipts for select to authenticated using (has_perm(organization_id, 'sales', 'view'));
create policy sale_rec_insert on sale_receipts for insert to authenticated with check (has_perm(organization_id, 'sales', 'edit'));
create policy sale_rec_update on sale_receipts for update to authenticated
  using (has_perm(organization_id, 'sales', 'edit')) with check (has_perm(organization_id, 'sales', 'edit'));
create trigger audit_sale_receipts after insert or update or delete on sale_receipts for each row execute function audit_row_change();

-- Sửa lần bán: thêm số phiếu và hạn thu (chỉ có nghĩa với lần bán có khách)
create or replace function update_sale(p_id uuid, p_expected_version integer, p_op_id uuid, p_changes jsonb)
returns sales_records
language plpgsql security invoker set search_path = public as $$
declare r sales_records; cur sales_records;
begin
  update sales_records set
    sold_date   = case when p_changes ? 'sold_date'   then (p_changes->>'sold_date')::date else sold_date end,
    quantity    = case when p_changes ? 'quantity'    then (p_changes->>'quantity')::numeric else quantity end,
    amount      = case when p_changes ? 'amount'      then (p_changes->>'amount')::bigint else amount end,
    buyer_note  = case when p_changes ? 'buyer_note'  then nullif(p_changes->>'buyer_note', '') else buyer_note end,
    invoice_no  = case when p_changes ? 'invoice_no'  then nullif(p_changes->>'invoice_no', '') else invoice_no end,
    due_date    = case when p_changes ? 'due_date'    then nullif(p_changes->>'due_date', '')::date else due_date end,
    voided_at   = case when p_changes ? 'voided_at'   then (p_changes->>'voided_at')::timestamptz else voided_at end,
    void_reason = case when p_changes ? 'void_reason' then p_changes->>'void_reason' else void_reason end,
    last_op_id  = p_op_id
  where id = p_id and version = p_expected_version
  returning * into r;
  if r.id is not null then return r; end if;

  select * into cur from sales_records where id = p_id;
  if cur.id is null then
    raise exception 'NOT_FOUND: Không tìm thấy khoản bán hoặc bạn không có quyền xem.';
  end if;
  if p_op_id is not null and cur.last_op_id = p_op_id then
    return cur;
  end if;
  if cur.version <> p_expected_version then
    raise exception 'CONFLICT: Khoản bán đã được người khác thay đổi (phiên bản máy chủ %, bạn đang sửa phiên bản %).', cur.version, p_expected_version;
  end if;
  raise exception 'FORBIDDEN: Bạn không có quyền sửa khoản bán này (chỉ chủ và vai trò Kho & chi phí).';
end $$;

-- ---------------------------------------------------------------------------
-- Hàm
-- ---------------------------------------------------------------------------

-- GHI LẦN BÁN CÓ KHÁCH: lần bán + lần thu đầu trong một giao dịch (lỗi thì không lưu gì). Gọi lặp cùng p_id trả lại lần bán đã có.
-- Không chọn khách (p_partner null) thì chỉ ghi lần bán như trước, bỏ qua số phiếu, hạn thu và số đã thu (coi như thu đủ ngay).
create or replace function record_sale(
  p_id uuid, p_org uuid, p_cycle uuid, p_date date, p_qty numeric, p_amount bigint, p_buyer_note text,
  p_partner uuid, p_invoice text, p_due date, p_paid bigint, p_method text)
returns sales_records
language plpgsql security invoker set search_path = public as $$
declare s sales_records;
begin
  select * into s from sales_records where id = p_id;
  if s.id is not null then return s; end if;
  if p_amount is null or p_amount < 0 then raise exception 'BILL_INVALID: Số tiền bán không hợp lệ.'; end if;
  if p_partner is not null and (coalesce(p_paid, 0) < 0 or coalesce(p_paid, 0) > p_amount) then
    raise exception 'OVERPAY: Số tiền đã thu không được lớn hơn số tiền bán.';
  end if;
  insert into sales_records (id, organization_id, cycle_id, sold_date, quantity, amount, buyer_note, partner_id, invoice_no, due_date)
  values (p_id, p_org, p_cycle, p_date, p_qty, p_amount, nullif(trim(coalesce(p_buyer_note, '')), ''), p_partner, p_invoice, p_due)
  returning * into s;
  if p_partner is not null and coalesce(p_paid, 0) > 0 then
    insert into sale_receipts (id, organization_id, sale_id, received_on, amount, method, note)
    values (gen_random_uuid(), p_org, p_id, p_date, p_paid, coalesce(p_method, 'cash'), 'Thu khi bán');
  end if;
  return s;
end $$;

create or replace function collect_sale(p_id uuid, p_sale uuid, p_amount bigint, p_received_on date, p_method text, p_note text)
returns sale_receipts
language plpgsql security invoker set search_path = public as $$
declare s sales_records; r sale_receipts;
begin
  select * into r from sale_receipts where id = p_id;
  if r.id is not null then return r; end if;
  select * into s from sales_records where id = p_sale;
  if s.id is null then raise exception 'NOT_FOUND: Không tìm thấy lần bán hoặc bạn không có quyền xem.'; end if;
  insert into sale_receipts (id, organization_id, sale_id, received_on, amount, method, note)
  values (p_id, s.organization_id, p_sale, p_received_on, p_amount, coalesce(p_method, 'cash'), nullif(trim(coalesce(p_note, '')), ''))
  returning * into r;
  return r;
end $$;

-- Thu của một khách: tự trừ vào các lần bán CŨ NHẤT TRƯỚC (theo ngày bán rồi thứ tự ghi). p_op_id chống ghi lặp.
create or replace function collect_partner(p_op_id uuid, p_partner uuid, p_amount bigint, p_received_on date, p_method text, p_note text)
returns setof sale_receipts
language plpgsql security invoker set search_path = public as $$
declare pr partners; b record; left_amt bigint := p_amount; take bigint; r sale_receipts; open_total bigint;
begin
  select * into pr from partners where id = p_partner;
  if pr.id is null then raise exception 'NOT_FOUND: Không tìm thấy khách hàng hoặc bạn không có quyền xem.'; end if;
  if exists (select 1 from sale_receipts where organization_id = pr.organization_id and op_id = p_op_id) then
    return query select * from sale_receipts where organization_id = pr.organization_id and op_id = p_op_id order by created_at, id;
    return;
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'BILL_INVALID: Số tiền thu phải lớn hơn 0.'; end if;
  select coalesce(sum(x.remaining), 0) into open_total from (
    select sr.amount - coalesce((select sum(amount) from sale_receipts rc where rc.sale_id = sr.id and rc.voided_at is null), 0) as remaining
      from sales_records sr where sr.partner_id = p_partner and sr.voided_at is null) x;
  if p_amount > open_total then
    raise exception 'OVERPAY: Số tiền thu vượt tổng còn phải thu của khách (còn phải thu % đồng).', open_total;
  end if;
  for b in
    select sr.id, sr.amount - coalesce((select sum(amount) from sale_receipts rc where rc.sale_id = sr.id and rc.voided_at is null), 0) as remaining
      from sales_records sr where sr.partner_id = p_partner and sr.voided_at is null
     order by sr.sold_date, sr.created_at, sr.id
  loop
    exit when left_amt <= 0;
    continue when b.remaining <= 0;
    take := least(left_amt, b.remaining);
    insert into sale_receipts (id, organization_id, sale_id, received_on, amount, method, note, op_id)
    values (gen_random_uuid(), pr.organization_id, b.id, p_received_on, take, coalesce(p_method, 'cash'), nullif(trim(coalesce(p_note, '')), ''), p_op_id)
    returning * into r;
    left_amt := left_amt - take;
    return next r;
  end loop;
  return;
end $$;

create or replace function void_sale_receipt(p_id uuid, p_reason text)
returns sale_receipts
language plpgsql security invoker set search_path = public as $$
declare r sale_receipts;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then raise exception 'BILL_INVALID: Hãy ghi lý do hủy lần thu tiền.'; end if;
  update sale_receipts set voided_at = now(), void_reason = trim(p_reason) where id = p_id and voided_at is null returning * into r;
  if r.id is null then
    select * into r from sale_receipts where id = p_id;
    if r.id is null then raise exception 'NOT_FOUND: Không tìm thấy lần thu tiền hoặc bạn không có quyền xem.'; end if;
    if r.voided_at is not null then return r; end if;
    raise exception 'FORBIDDEN: Bạn không có quyền hủy lần thu tiền này (cần quyền sửa mục Doanh thu).';
  end if;
  return r;
end $$;

-- Công nợ phải thu: mỗi lần bán có khách (chưa hủy) kèm đã thu, còn phải thu, tình trạng hạn. Chạy theo quyền người gọi (cần xem Doanh thu).
-- Tình trạng: overdue (quá hạn), due_soon (còn ≤ 7 ngày), ok (còn hạn hoặc không nhập hạn), paid (thu đủ).
create or replace function get_receivables(p_org uuid, p_only_open boolean default true)
returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.partner_name, t.sold_date, t.created_at), '[]'::jsonb) from (
    select s.id as sale_id, s.partner_id, pr.name as partner_name, s.invoice_no, s.sold_date, s.due_date, s.amount as total_amount,
           s.quantity, s.cycle_id, s.created_at, s.version,
           coalesce(c.got, 0) as collected, s.amount - coalesce(c.got, 0) as remaining,
           case when s.amount - coalesce(c.got, 0) <= 0 then 'paid'
                when s.due_date is not null and s.due_date < vn_today() then 'overdue'
                when s.due_date is not null and s.due_date <= vn_today() + 7 then 'due_soon'
                else 'ok' end as status
      from sales_records s
      join partners pr on pr.id = s.partner_id
      left join lateral (select sum(amount) as got from sale_receipts rc where rc.sale_id = s.id and rc.voided_at is null) c on true
     where s.organization_id = p_org and s.partner_id is not null and s.voided_at is null
       and (not p_only_open or s.amount - coalesce(c.got, 0) > 0)
  ) t;
$$;

revoke execute on function update_partner(uuid, integer, uuid, jsonb), update_sale(uuid, integer, uuid, jsonb),
  record_sale(uuid, uuid, uuid, date, numeric, bigint, text, uuid, text, date, bigint, text), collect_sale(uuid, uuid, bigint, date, text, text),
  collect_partner(uuid, uuid, bigint, date, text, text), void_sale_receipt(uuid, text), get_receivables(uuid, boolean) from public, anon;
grant execute on function update_partner(uuid, integer, uuid, jsonb), update_sale(uuid, integer, uuid, jsonb),
  record_sale(uuid, uuid, uuid, date, numeric, bigint, text, uuid, text, date, bigint, text), collect_sale(uuid, uuid, bigint, date, text, text),
  collect_partner(uuid, uuid, bigint, date, text, text), void_sale_receipt(uuid, text), get_receivables(uuid, boolean) to authenticated, service_role;
revoke execute on function sales_credit_guard(), sale_receipts_guard() from public, anon;

-- ---------------------------------------------------------------------------
-- Báo cáo "Doanh thu theo khách hàng" (loại 'customers' trong run_report, D48). Quyền xem = mục Doanh thu (xem).
-- ---------------------------------------------------------------------------
alter table saved_reports drop constraint saved_reports_report_type_check;
alter table saved_reports add constraint saved_reports_report_type_check
  check (report_type in ('expenses', 'sales', 'harvest', 'stock', 'labor', 'cycles', 'purchases', 'customers'));

create or replace function report_allowed(p_org uuid, p_type text) returns boolean
language sql stable security definer set search_path = public as $$
  select case p_type
    when 'expenses' then has_perm(p_org, 'expenses', 'view')
    when 'purchases' then has_perm(p_org, 'expenses', 'view')
    when 'sales'    then has_perm(p_org, 'sales', 'view')
    when 'customers' then has_perm(p_org, 'sales', 'view')
    when 'harvest'  then has_perm(p_org, 'harvest', 'view')
    when 'stock'    then has_perm(p_org, 'inventory', 'view')
    when 'cycles'   then has_perm(p_org, 'summary', 'view')
    when 'labor'    then has_org_role(p_org, array['owner', 'manager']::member_role[])
    else false end;
$$;

create or replace function run_report(p_org uuid, p_type text, p_params jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  f date := coalesce(nullif(p_params ->> 'from', '')::date, current_date - 30);
  t date := coalesce(nullif(p_params ->> 'to', '')::date, current_date);
  grp text := coalesce(nullif(p_params ->> 'group', ''), 'partner');
  cols jsonb; rows jsonb; title text;
begin
  if p_type not in ('purchases', 'customers') then
    return run_report_base(p_org, p_type, p_params);
  end if;
  if not report_allowed(p_org, p_type) then
    raise exception 'FORBIDDEN: Bạn không có quyền xem loại báo cáo này.';
  end if;
  if t < f then raise exception 'INVALID_DATE: Ngày kết thúc không thể trước ngày bắt đầu.'; end if;
  if t - f > 800 then raise exception 'INVALID_DATE: Khoảng thời gian tối đa khoảng 2 năm.'; end if;

  if p_type = 'customers' then
    title := 'Doanh thu theo khách hàng';
    cols := '[{"key":"label","label":"' || case grp when 'month' then 'Tháng' else 'Khách hàng' end || '","kind":"text"},{"key":"count","label":"Số lần bán","kind":"int","sum":true},{"key":"qty","label":"Số lượng (kg)","kind":"num","sum":true},{"key":"amount","label":"Doanh thu","kind":"money","sum":true},{"key":"collected","label":"Đã thu","kind":"money","sum":true},{"key":"owed","label":"Còn phải thu","kind":"money","sum":true}]';
    select coalesce(jsonb_agg(jsonb_build_object('label', g, 'count', n, 'qty', q, 'amount', a, 'collected', c, 'owed', a - c) order by g), '[]') into rows from (
      select case grp when 'month' then to_char(s.sold_date, 'YYYY-MM') else coalesce(pr.name, 'Bán lẻ (không ghi khách)') end as g,
             count(*) as n, sum(s.quantity) as q, sum(s.amount) as a,
             -- bán không ghi khách coi như thu đủ ngay
             sum(case when s.partner_id is null then s.amount
                      else coalesce((select sum(rc.amount) from sale_receipts rc where rc.sale_id = s.id and rc.voided_at is null), 0) end) as c
        from sales_records s left join partners pr on pr.id = s.partner_id
       where s.organization_id = p_org and s.voided_at is null and s.sold_date between f and t
       group by 1) y;
    return jsonb_build_object('type', p_type, 'title', title, 'from', f, 'to', t, 'group', grp, 'columns', cols, 'rows', rows, 'generated_at', now());
  end if;

  -- purchases (giữ nguyên như migration 0056)
  title := 'Mua hàng theo nhà cung ứng';
  if grp = 'material' then
    cols := '[{"key":"label","label":"Vật tư","kind":"text"},{"key":"qty","label":"Số lượng nhập","kind":"num","sum":true},{"key":"amount","label":"Thành tiền","kind":"money","sum":true}]';
    select coalesce(jsonb_agg(jsonb_build_object('label', g, 'qty', q, 'amount', a) order by g), '[]') into rows from (
      select coalesce(m.name, '—') as g, sum(x.quantity_delta) as q, sum(round(x.quantity_delta * coalesce(x.unit_cost, 0))) as a
        from inventory_transactions x
        join purchase_bills b on b.id = x.bill_id and b.voided_at is null
        join materials m on m.id = x.material_id
       where x.organization_id = p_org and x.bill_id is not null and b.bill_date between f and t
       group by 1) y;
  else
    cols := '[{"key":"label","label":"' || case grp when 'month' then 'Tháng' else 'Nhà cung ứng' end || '","kind":"text"},{"key":"count","label":"Số hóa đơn","kind":"int","sum":true},{"key":"total","label":"Tổng tiền","kind":"money","sum":true},{"key":"paid","label":"Đã trả","kind":"money","sum":true},{"key":"owed","label":"Còn nợ","kind":"money","sum":true}]';
    select coalesce(jsonb_agg(jsonb_build_object('label', g, 'count', n, 'total', tot, 'paid', paid, 'owed', tot - paid) order by g), '[]') into rows from (
      select case grp when 'month' then to_char(b.bill_date, 'YYYY-MM') else coalesce(pr.name, '—') end as g,
             count(*) as n, sum(b.total_amount) as tot,
             sum(coalesce((select sum(bp.amount) from bill_payments bp where bp.bill_id = b.id and bp.voided_at is null), 0)) as paid
        from purchase_bills b join partners pr on pr.id = b.partner_id
       where b.organization_id = p_org and b.voided_at is null and b.bill_date between f and t
       group by 1) y;
  end if;
  return jsonb_build_object('type', p_type, 'title', title, 'from', f, 'to', t, 'group', grp, 'columns', cols, 'rows', rows, 'generated_at', now());
end $$;

revoke execute on function run_report(uuid, text, jsonb) from public, anon;
grant execute on function run_report(uuid, text, jsonb) to authenticated, service_role;
