-- G2-2 (D76): ĐỐI TÁC (nhà cung ứng, sau này cả khách hàng), HÓA ĐƠN MUA và CÔNG NỢ PHẢI TRẢ.
-- Quyền: GỘP với mục Chi phí (xem = has_perm 'expenses' view, ghi = 'expenses' edit). Không thêm mục quyền mới.
-- Dữ liệu riêng tư theo cơ sở; không công khai, quản trị nền tảng và website không đọc.
-- Tiền trả cho hóa đơn KHÔNG phải chi phí (tiền mua vật tư đã tính khi dùng, A39/D19) nên không ảnh hưởng báo cáo chi phí và giá thành.
-- Giao dịch kho vẫn CHỈ THÊM: dòng nhập kho chỉ gắn hóa đơn lúc tạo; hủy hóa đơn KHÔNG đảo kho (muốn đảo thì điều chỉnh tồn).

-- ---------------------------------------------------------------------------
-- Bảng
-- ---------------------------------------------------------------------------
create table partners (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  name text not null check (length(trim(name)) between 2 and 120),
  phone text check (phone is null or length(phone) <= 40),
  address text check (address is null or length(address) <= 300),
  tax_code text check (tax_code is null or length(tax_code) <= 40),
  bank_account text check (bank_account is null or length(bank_account) <= 120),
  goods text check (goods is null or length(goods) <= 300),     -- loại hàng thường mua/bán (chữ tự do, để nhớ)
  note text check (note is null or length(note) <= 500),
  is_supplier boolean not null default true,
  is_customer boolean not null default false,                   -- để sẵn cho G2-4 (khách hàng)
  is_active boolean not null default true,
  version integer not null default 1,
  last_op_id uuid,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (is_supplier or is_customer)
);
create unique index partners_org_name_idx on partners (organization_id, lower(trim(name)));
create index partners_org_idx on partners (organization_id);

create table purchase_bills (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  partner_id uuid not null references partners(id),
  invoice_no text check (invoice_no is null or length(invoice_no) <= 60),
  bill_date date not null,
  due_date date,
  total_amount bigint not null check (total_amount >= 0),       -- VND
  note text check (note is null or length(note) <= 500),
  voided_at timestamptz,
  void_reason text,
  version integer not null default 1,
  last_op_id uuid,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (voided_at is null or (void_reason is not null and length(trim(void_reason)) > 0)),
  check (due_date is null or due_date >= bill_date)
);
create index purchase_bills_org_idx on purchase_bills (organization_id, bill_date);
create index purchase_bills_partner_idx on purchase_bills (partner_id);
-- Một nhà cung ứng không có hai hóa đơn (chưa hủy) cùng số
create unique index purchase_bills_invoice_idx on purchase_bills (organization_id, partner_id, lower(trim(invoice_no)))
  where voided_at is null and invoice_no is not null and length(trim(invoice_no)) > 0;

create table bill_payments (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  bill_id uuid not null references purchase_bills(id),
  paid_on date not null,
  amount bigint not null check (amount > 0),
  method text not null default 'cash' check (method in ('cash', 'transfer')),
  note text check (note is null or length(note) <= 300),
  op_id uuid,                                                   -- chống ghi lặp của lệnh "trả cho nhà cung ứng" (nhiều dòng cùng lệnh)
  voided_at timestamptz,
  void_reason text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (voided_at is null or (void_reason is not null and length(trim(void_reason)) > 0))
);
create index bill_payments_bill_idx on bill_payments (bill_id);
create index bill_payments_org_op_idx on bill_payments (organization_id, op_id) where op_id is not null;

-- Nối với phần đã có (chỉ thêm cột)
alter table inventory_transactions add column bill_id uuid references purchase_bills(id);
create index inventory_transactions_bill_idx on inventory_transactions (bill_id) where bill_id is not null;
alter table expense_records add column partner_id uuid references partners(id);   -- chi phí mua của ai (để báo cáo; chưa tạo công nợ)

create trigger partners_bump before update on partners for each row execute function bump_version();
create trigger purchase_bills_bump before update on purchase_bills for each row execute function bump_version();

-- ---------------------------------------------------------------------------
-- Ràng buộc nhất quán (trigger)
-- ---------------------------------------------------------------------------
create or replace function partners_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.organization_id <> old.organization_id then
    raise exception 'PARTNER_INVALID: Không đổi được cơ sở của đối tác.';
  end if;
  new.name := trim(new.name);
  return new;
end $$;
create trigger partners_guard before insert or update on partners for each row execute function partners_guard();

create or replace function purchase_bills_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare p partners; paid bigint;
begin
  if tg_op = 'INSERT' then
    select * into p from partners where id = new.partner_id;
    if p.id is null or p.organization_id <> new.organization_id then
      raise exception 'PARTNER_INVALID: Nhà cung ứng không thuộc cơ sở này.';
    end if;
    if not p.is_supplier or not p.is_active then
      raise exception 'PARTNER_INVALID: Đối tác "%" đã dừng hoặc không phải nhà cung ứng.', p.name;
    end if;
    new.invoice_no := nullif(trim(coalesce(new.invoice_no, '')), '');
    if new.invoice_no is not null and exists (
         select 1 from purchase_bills b where b.organization_id = new.organization_id and b.partner_id = new.partner_id
            and b.voided_at is null and lower(trim(b.invoice_no)) = lower(new.invoice_no)) then
      raise exception 'DUPLICATE_INVOICE: Hóa đơn số "%" của "%" đã được nhập rồi. Hãy kiểm tra để tránh nhập hai lần.', new.invoice_no, p.name;
    end if;
    return new;
  end if;
  -- Sửa: chỉ được đổi số hóa đơn, hạn thanh toán, ghi chú và hủy. Tổng tiền, ngày mua, nhà cung ứng, cơ sở là bất biến.
  if new.organization_id <> old.organization_id or new.partner_id <> old.partner_id
     or new.total_amount <> old.total_amount or new.bill_date <> old.bill_date or new.created_by is distinct from old.created_by then
    raise exception 'BILL_LOCKED: Không sửa được tổng tiền, ngày mua hoặc nhà cung ứng của hóa đơn. Hãy hủy hóa đơn rồi nhập lại.';
  end if;
  if old.voided_at is not null and (new.voided_at is distinct from old.voided_at or new.invoice_no is distinct from old.invoice_no
                                    or new.due_date is distinct from old.due_date) then
    raise exception 'BILL_LOCKED: Hóa đơn đã hủy không sửa được.';
  end if;
  if old.voided_at is null and new.voided_at is not null then
    select coalesce(sum(amount), 0) into paid from bill_payments where bill_id = new.id and voided_at is null;
    if paid > 0 then
      raise exception 'HAS_PAYMENTS: Hóa đơn này đã có các lần trả tiền. Hãy hủy các lần trả trước rồi mới hủy hóa đơn.';
    end if;
  end if;
  new.invoice_no := nullif(trim(coalesce(new.invoice_no, '')), '');
  if new.invoice_no is not null and new.voided_at is null and new.invoice_no is distinct from old.invoice_no and exists (
       select 1 from purchase_bills b where b.organization_id = new.organization_id and b.partner_id = new.partner_id and b.id <> new.id
          and b.voided_at is null and lower(trim(b.invoice_no)) = lower(new.invoice_no)) then
    raise exception 'DUPLICATE_INVOICE: Hóa đơn số "%" của nhà cung ứng này đã được nhập rồi.', new.invoice_no;
  end if;
  return new;
end $$;
create trigger purchase_bills_guard before insert or update on purchase_bills for each row execute function purchase_bills_guard();

create or replace function bill_payments_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare b purchase_bills; paid bigint;
begin
  if tg_op = 'INSERT' then
    select * into b from purchase_bills where id = new.bill_id for update;   -- khóa hóa đơn để hai lần trả cùng lúc không vượt tổng
    if b.id is null or b.organization_id <> new.organization_id then
      raise exception 'BILL_INVALID: Hóa đơn không thuộc cơ sở này.';
    end if;
    if b.voided_at is not null then
      raise exception 'BILL_INVALID: Hóa đơn đã hủy, không ghi trả tiền được.';
    end if;
    select coalesce(sum(amount), 0) into paid from bill_payments where bill_id = new.bill_id and voided_at is null;
    if paid + new.amount > b.total_amount then
      raise exception 'OVERPAY: Số tiền trả vượt số còn nợ của hóa đơn (còn nợ % đồng).', b.total_amount - paid;
    end if;
    if new.paid_on > vn_today() then
      raise exception 'BILL_INVALID: Ngày trả tiền không được sau ngày hôm nay.';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'PAYMENT_LOCKED: Không xóa lần trả tiền. Hãy hủy kèm lý do.';
  end if;
  if new.organization_id <> old.organization_id or new.bill_id <> old.bill_id or new.paid_on <> old.paid_on
     or new.amount <> old.amount or new.method <> old.method or new.created_by is distinct from old.created_by then
    raise exception 'PAYMENT_LOCKED: Chỉ được hủy lần trả tiền (kèm lý do), không sửa số tiền hay ngày trả.';
  end if;
  if old.voided_at is not null and new.voided_at is distinct from old.voided_at then
    raise exception 'PAYMENT_LOCKED: Lần trả tiền đã hủy.';
  end if;
  return new;
end $$;
create trigger bill_payments_guard before insert or update or delete on bill_payments for each row execute function bill_payments_guard();

-- Dòng nhập kho gắn hóa đơn: cùng cơ sở, hóa đơn chưa hủy, và chỉ là nhập kho
create or replace function inventory_txn_bill_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare b purchase_bills;
begin
  if new.bill_id is null then return new; end if;
  select * into b from purchase_bills where id = new.bill_id;
  if b.id is null or b.organization_id <> new.organization_id or b.voided_at is not null or new.txn_type <> 'receipt' then
    raise exception 'BILL_INVALID: Chỉ gắn dòng nhập kho vào hóa đơn còn hiệu lực của cùng cơ sở.';
  end if;
  return new;
end $$;
create trigger inventory_txn_bill_guard before insert on inventory_transactions for each row execute function inventory_txn_bill_guard();

create or replace function expense_partner_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.partner_id is not null and not exists (select 1 from partners where id = new.partner_id and organization_id = new.organization_id) then
    raise exception 'PARTNER_INVALID: Đối tác không thuộc cơ sở này.';
  end if;
  return new;
end $$;
create trigger expense_partner_guard before insert on expense_records for each row execute function expense_partner_guard();

-- ---------------------------------------------------------------------------
-- RLS: xem = Chi phí (xem), ghi = Chi phí (sửa). Không có chính sách xóa (dừng/hủy thay vì xóa).
-- ---------------------------------------------------------------------------
alter table partners enable row level security;
alter table purchase_bills enable row level security;
alter table bill_payments enable row level security;

create policy partners_read on partners for select to authenticated using (has_perm(organization_id, 'expenses', 'view'));
create policy partners_insert on partners for insert to authenticated with check (has_perm(organization_id, 'expenses', 'edit'));
create policy partners_update on partners for update to authenticated
  using (has_perm(organization_id, 'expenses', 'edit')) with check (has_perm(organization_id, 'expenses', 'edit'));

create policy bills_read on purchase_bills for select to authenticated using (has_perm(organization_id, 'expenses', 'view'));
create policy bills_insert on purchase_bills for insert to authenticated with check (has_perm(organization_id, 'expenses', 'edit'));
create policy bills_update on purchase_bills for update to authenticated
  using (has_perm(organization_id, 'expenses', 'edit')) with check (has_perm(organization_id, 'expenses', 'edit'));

create policy bill_pay_read on bill_payments for select to authenticated using (has_perm(organization_id, 'expenses', 'view'));
create policy bill_pay_insert on bill_payments for insert to authenticated with check (has_perm(organization_id, 'expenses', 'edit'));
create policy bill_pay_update on bill_payments for update to authenticated
  using (has_perm(organization_id, 'expenses', 'edit')) with check (has_perm(organization_id, 'expenses', 'edit'));

-- Nhật ký kiểm toán
create trigger audit_partners after insert or update or delete on partners for each row execute function audit_row_change();
create trigger audit_purchase_bills after insert or update or delete on purchase_bills for each row execute function audit_row_change();
create trigger audit_bill_payments after insert or update or delete on bill_payments for each row execute function audit_row_change();

-- ---------------------------------------------------------------------------
-- Hàm
-- ---------------------------------------------------------------------------

-- Sửa đối tác có kiểm tra phiên bản (tên, liên hệ, loại hàng, ghi chú, dừng/dùng lại)
create or replace function update_partner(p_id uuid, p_expected_version integer, p_op_id uuid, p_changes jsonb)
returns partners
language plpgsql security invoker set search_path = public as $$
declare r partners; cur partners;
begin
  update partners set
    name         = case when p_changes ? 'name'         then p_changes->>'name' else name end,
    phone        = case when p_changes ? 'phone'        then nullif(p_changes->>'phone', '') else phone end,
    address      = case when p_changes ? 'address'      then nullif(p_changes->>'address', '') else address end,
    tax_code     = case when p_changes ? 'tax_code'     then nullif(p_changes->>'tax_code', '') else tax_code end,
    bank_account = case when p_changes ? 'bank_account' then nullif(p_changes->>'bank_account', '') else bank_account end,
    goods        = case when p_changes ? 'goods'        then nullif(p_changes->>'goods', '') else goods end,
    note         = case when p_changes ? 'note'         then nullif(p_changes->>'note', '') else note end,
    is_active    = case when p_changes ? 'is_active'    then (p_changes->>'is_active')::boolean else is_active end,
    last_op_id   = p_op_id
  where id = p_id and version = p_expected_version
  returning * into r;
  if r.id is not null then return r; end if;
  select * into cur from partners where id = p_id;
  if cur.id is null then raise exception 'NOT_FOUND: Không tìm thấy đối tác hoặc bạn không có quyền xem.'; end if;
  if p_op_id is not null and cur.last_op_id = p_op_id then return cur; end if;
  if cur.version <> p_expected_version then
    raise exception 'CONFLICT: Đối tác đã được người khác thay đổi (phiên bản máy chủ %, bạn đang sửa phiên bản %).', cur.version, p_expected_version;
  end if;
  raise exception 'FORBIDDEN: Bạn không có quyền sửa đối tác (cần quyền sửa mục Chi phí).';
end $$;

-- Sửa hóa đơn có kiểm tra phiên bản: chỉ số hóa đơn, hạn thanh toán, ghi chú; hoặc hủy (kèm lý do)
create or replace function update_bill(p_id uuid, p_expected_version integer, p_op_id uuid, p_changes jsonb)
returns purchase_bills
language plpgsql security invoker set search_path = public as $$
declare r purchase_bills; cur purchase_bills;
begin
  update purchase_bills set
    invoice_no  = case when p_changes ? 'invoice_no'  then nullif(p_changes->>'invoice_no', '') else invoice_no end,
    due_date    = case when p_changes ? 'due_date'    then nullif(p_changes->>'due_date', '')::date else due_date end,
    note        = case when p_changes ? 'note'        then nullif(p_changes->>'note', '') else note end,
    voided_at   = case when p_changes ? 'voided_at'   then (p_changes->>'voided_at')::timestamptz else voided_at end,
    void_reason = case when p_changes ? 'void_reason' then p_changes->>'void_reason' else void_reason end,
    last_op_id  = p_op_id
  where id = p_id and version = p_expected_version
  returning * into r;
  if r.id is not null then return r; end if;
  select * into cur from purchase_bills where id = p_id;
  if cur.id is null then raise exception 'NOT_FOUND: Không tìm thấy hóa đơn hoặc bạn không có quyền xem.'; end if;
  if p_op_id is not null and cur.last_op_id = p_op_id then return cur; end if;
  if cur.version <> p_expected_version then
    raise exception 'CONFLICT: Hóa đơn đã được người khác thay đổi (phiên bản máy chủ %, bạn đang sửa phiên bản %).', cur.version, p_expected_version;
  end if;
  raise exception 'FORBIDDEN: Bạn không có quyền sửa hóa đơn (cần quyền sửa mục Chi phí).';
end $$;

-- MUA HÀNG THEO HÓA ĐƠN: một giao dịch tạo hóa đơn + các dòng nhập kho + lần trả đầu (nếu có). Lỗi ở đâu thì không gì được lưu.
-- Chạy theo quyền người gọi (RLS): cần quyền sửa mục Chi phí (hóa đơn, trả tiền) VÀ quyền sửa mục Kho (dòng nhập kho).
-- p_lines: [{"id": uuid, "location_id": uuid, "material_id": uuid, "quantity": số, "unit_cost": đồng}]
-- Gọi lặp với cùng p_id thì trả lại hóa đơn đã có, không tạo thêm (an toàn khi mạng chập chờn).
create or replace function record_purchase(
  p_id uuid, p_org uuid, p_partner uuid, p_invoice text, p_bill_date date, p_due_date date, p_total bigint,
  p_note text, p_lines jsonb, p_paid bigint, p_method text)
returns purchase_bills
language plpgsql security invoker set search_path = public as $$
declare b purchase_bills; ln jsonb; n integer := 0;
begin
  select * into b from purchase_bills where id = p_id;
  if b.id is not null then return b; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'BILL_INVALID: Hóa đơn cần có ít nhất một dòng vật tư.';
  end if;
  if p_total is null or p_total < 0 then raise exception 'BILL_INVALID: Tổng tiền hóa đơn không hợp lệ.'; end if;
  if coalesce(p_paid, 0) < 0 or coalesce(p_paid, 0) > p_total then
    raise exception 'OVERPAY: Số tiền đã trả không được lớn hơn tổng tiền hóa đơn.';
  end if;
  insert into purchase_bills (id, organization_id, partner_id, invoice_no, bill_date, due_date, total_amount, note)
  values (p_id, p_org, p_partner, p_invoice, p_bill_date, p_due_date, p_total, nullif(trim(coalesce(p_note, '')), ''))
  returning * into b;
  for ln in select * from jsonb_array_elements(p_lines) loop
    insert into inventory_transactions (id, organization_id, location_id, material_id, txn_type, quantity_delta, unit_cost, txn_date, source, bill_id)
    values ((ln->>'id')::uuid, p_org, (ln->>'location_id')::uuid, (ln->>'material_id')::uuid, 'receipt',
            (ln->>'quantity')::numeric, nullif(ln->>'unit_cost', '')::bigint, p_bill_date, 'online', p_id);
    n := n + 1;
  end loop;
  if coalesce(p_paid, 0) > 0 then
    insert into bill_payments (id, organization_id, bill_id, paid_on, amount, method, note)
    values (gen_random_uuid(), p_org, p_id, p_bill_date, p_paid, coalesce(p_method, 'cash'), 'Trả khi mua');
  end if;
  return b;
end $$;

-- Trả tiền một hóa đơn (mã lần trả tạo sẵn ở app: gọi lặp không ghi hai lần)
create or replace function pay_bill(p_id uuid, p_bill uuid, p_amount bigint, p_paid_on date, p_method text, p_note text)
returns bill_payments
language plpgsql security invoker set search_path = public as $$
declare b purchase_bills; r bill_payments;
begin
  select * into r from bill_payments where id = p_id;
  if r.id is not null then return r; end if;
  select * into b from purchase_bills where id = p_bill;
  if b.id is null then raise exception 'NOT_FOUND: Không tìm thấy hóa đơn hoặc bạn không có quyền xem.'; end if;
  insert into bill_payments (id, organization_id, bill_id, paid_on, amount, method, note)
  values (p_id, b.organization_id, p_bill, p_paid_on, p_amount, coalesce(p_method, 'cash'), nullif(trim(coalesce(p_note, '')), ''))
  returning * into r;
  return r;
end $$;

-- Trả cho một nhà cung ứng: tự trừ vào các hóa đơn CŨ NHẤT TRƯỚC (theo ngày mua rồi thứ tự nhập). Trả về các lần trả đã tạo.
-- p_op_id chống ghi lặp: đã có lệnh cùng mã thì trả lại kết quả cũ.
create or replace function pay_partner(p_op_id uuid, p_partner uuid, p_amount bigint, p_paid_on date, p_method text, p_note text)
returns setof bill_payments
language plpgsql security invoker set search_path = public as $$
declare pr partners; b record; left_amt bigint := p_amount; take bigint; r bill_payments; open_total bigint;
begin
  select * into pr from partners where id = p_partner;
  if pr.id is null then raise exception 'NOT_FOUND: Không tìm thấy nhà cung ứng hoặc bạn không có quyền xem.'; end if;
  if exists (select 1 from bill_payments where organization_id = pr.organization_id and op_id = p_op_id) then
    return query select * from bill_payments where organization_id = pr.organization_id and op_id = p_op_id order by created_at, id;
    return;
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'BILL_INVALID: Số tiền trả phải lớn hơn 0.'; end if;
  select coalesce(sum(x.remaining), 0) into open_total from (
    select pb.total_amount - coalesce((select sum(amount) from bill_payments bp where bp.bill_id = pb.id and bp.voided_at is null), 0) as remaining
      from purchase_bills pb where pb.partner_id = p_partner and pb.voided_at is null) x;
  if p_amount > open_total then
    raise exception 'OVERPAY: Số tiền trả vượt tổng còn nợ của nhà cung ứng (còn nợ % đồng).', open_total;
  end if;
  for b in
    select pb.id, pb.total_amount - coalesce((select sum(amount) from bill_payments bp where bp.bill_id = pb.id and bp.voided_at is null), 0) as remaining
      from purchase_bills pb where pb.partner_id = p_partner and pb.voided_at is null
     order by pb.bill_date, pb.created_at, pb.id
  loop
    exit when left_amt <= 0;
    continue when b.remaining <= 0;
    take := least(left_amt, b.remaining);
    insert into bill_payments (id, organization_id, bill_id, paid_on, amount, method, note, op_id)
    values (gen_random_uuid(), pr.organization_id, b.id, p_paid_on, take, coalesce(p_method, 'cash'), nullif(trim(coalesce(p_note, '')), ''), p_op_id)
    returning * into r;
    left_amt := left_amt - take;
    return next r;
  end loop;
  return;
end $$;

-- Hủy một lần trả tiền (kèm lý do): nợ của hóa đơn tăng lại
create or replace function void_bill_payment(p_id uuid, p_reason text)
returns bill_payments
language plpgsql security invoker set search_path = public as $$
declare r bill_payments;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then raise exception 'BILL_INVALID: Hãy ghi lý do hủy lần trả tiền.'; end if;
  update bill_payments set voided_at = now(), void_reason = trim(p_reason) where id = p_id and voided_at is null returning * into r;
  if r.id is null then
    select * into r from bill_payments where id = p_id;
    if r.id is null then raise exception 'NOT_FOUND: Không tìm thấy lần trả tiền hoặc bạn không có quyền xem.'; end if;
    if r.voided_at is not null then return r; end if;
    raise exception 'FORBIDDEN: Bạn không có quyền hủy lần trả tiền này (cần quyền sửa mục Chi phí).';
  end if;
  return r;
end $$;

-- Công nợ của cơ sở: mỗi hóa đơn chưa hủy kèm đã trả, còn nợ, tình trạng hạn. Chạy theo quyền người gọi (cần xem mục Chi phí).
-- p_only_open = true: chỉ hóa đơn còn nợ. Tình trạng: overdue (quá hạn), due_soon (còn ≤ 7 ngày), ok (còn hạn hoặc không có hạn), paid (đã trả đủ).
create or replace function get_payables(p_org uuid, p_only_open boolean default true)
returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.partner_name, t.bill_date, t.created_at), '[]'::jsonb) from (
    select b.id as bill_id, b.partner_id, pr.name as partner_name, b.invoice_no, b.bill_date, b.due_date, b.total_amount, b.created_at, b.version,
           coalesce(s.paid, 0) as paid, b.total_amount - coalesce(s.paid, 0) as remaining,
           case when b.total_amount - coalesce(s.paid, 0) <= 0 then 'paid'
                when b.due_date is not null and b.due_date < vn_today() then 'overdue'
                when b.due_date is not null and b.due_date <= vn_today() + 7 then 'due_soon'
                else 'ok' end as status
      from purchase_bills b
      join partners pr on pr.id = b.partner_id
      left join lateral (select sum(amount) as paid from bill_payments bp where bp.bill_id = b.id and bp.voided_at is null) s on true
     where b.organization_id = p_org and b.voided_at is null
       and (not p_only_open or b.total_amount - coalesce(s.paid, 0) > 0)
  ) t;
$$;

-- Quyền thực thi: chỉ người đã đăng nhập (kiểm quyền thật nằm ở RLS)
revoke execute on function update_partner(uuid, integer, uuid, jsonb), update_bill(uuid, integer, uuid, jsonb),
  record_purchase(uuid, uuid, uuid, text, date, date, bigint, text, jsonb, bigint, text), pay_bill(uuid, uuid, bigint, date, text, text),
  pay_partner(uuid, uuid, bigint, date, text, text), void_bill_payment(uuid, text), get_payables(uuid, boolean) from public, anon;
grant execute on function update_partner(uuid, integer, uuid, jsonb), update_bill(uuid, integer, uuid, jsonb),
  record_purchase(uuid, uuid, uuid, text, date, date, bigint, text, jsonb, bigint, text), pay_bill(uuid, uuid, bigint, date, text, text),
  pay_partner(uuid, uuid, bigint, date, text, text), void_bill_payment(uuid, text), get_payables(uuid, boolean) to authenticated, service_role;
revoke execute on function partners_guard(), purchase_bills_guard(), bill_payments_guard(), inventory_txn_bill_guard(), expense_partner_guard() from public, anon;
