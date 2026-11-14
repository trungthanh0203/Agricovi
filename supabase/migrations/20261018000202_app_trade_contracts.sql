-- Mục 13 lát 2: HỢP ĐỒNG MUA BÁN / BAO TIÊU mẫu. App lưu các điều khoản đã nhập (số hợp đồng tự đánh số, trạng thái) và in bản điền sẵn để ký tay.
-- Không ký số, không thay luật sư: nội dung điều khoản là mẫu tham khảo sinh ở app (lib/tradeContracts.ts).
--  * kind = 'procure': HTX bao tiêu/thu mua của HỘ THÀNH VIÊN (quyền HTX: coop). kind = 'sale': cơ sở bán cho một bên mua (quyền Doanh thu: sales).
--  * Thông tin bên kia được SAO CHỤP dạng chữ vào hợp đồng (tên, người đại diện, địa chỉ, điện thoại, mã số thuế) nên hợp đồng đã ký không đổi khi hồ sơ đổi.
--  * Bản nháp sửa được; sau khi đánh dấu "đã ký" chỉ đổi trạng thái (hoàn thành, hủy kèm lý do), không sửa điều khoản: muốn đổi thì lập hợp đồng mới.

create table trade_contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  kind text not null check (kind in ('procure', 'sale')),
  contract_no text not null,
  counterparty_org_id uuid references organizations(id),
  partner_id uuid references partners(id),
  counterparty_name text not null check (length(trim(counterparty_name)) between 2 and 160),
  counterparty_rep text check (counterparty_rep is null or length(counterparty_rep) <= 120),
  counterparty_phone text check (counterparty_phone is null or length(counterparty_phone) <= 40),
  counterparty_address text check (counterparty_address is null or length(counterparty_address) <= 300),
  counterparty_tax_code text check (counterparty_tax_code is null or length(counterparty_tax_code) <= 40),
  crop_type_id uuid references crop_types(id),
  product_name text not null check (length(trim(product_name)) between 2 and 120),
  cycle_id uuid references production_cycles(id),
  quantity_kg numeric check (quantity_kg is null or quantity_kg > 0),
  price_mode text not null check (price_mode in ('fixed', 'floor', 'market')),   -- cố định / giá sàn (không thấp hơn) / theo giá thị trường lúc giao
  unit_price bigint check (unit_price is null or unit_price >= 0),
  quality_note text check (quality_note is null or length(quality_note) <= 1000),
  delivery_from date,
  delivery_to date,
  delivery_place text check (delivery_place is null or length(delivery_place) <= 300),
  payment_days integer check (payment_days is null or payment_days between 0 and 365),   -- trả sau bao nhiêu ngày kể từ ngày giao; null = trả ngay
  payment_method text not null default 'either' check (payment_method in ('cash', 'transfer', 'either')),
  extra_terms text check (extra_terms is null or length(extra_terms) <= 2000),
  status text not null default 'draft' check (status in ('draft', 'signed', 'done', 'cancelled')),
  signed_on date,
  valid_to date,
  cancel_reason text check (cancel_reason is null or length(cancel_reason) <= 300),
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (price_mode = 'market' or unit_price is not null),
  check (delivery_to is null or delivery_from is null or delivery_to >= delivery_from),
  check (status <> 'cancelled' or cancel_reason is not null),
  check (status not in ('signed', 'done') or signed_on is not null),
  unique (organization_id, contract_no)
);
create index on trade_contracts (organization_id, created_at desc);
alter table trade_contracts enable row level security;
revoke all on trade_contracts from authenticated, anon;   -- chỉ đọc/ghi qua hàm

-- Quyền theo loại: procure = HTX (coop), sale = Doanh thu (sales)
create or replace function contract_perm(p_org uuid, p_kind text, p_level text) returns boolean
language sql stable security definer set search_path = public as $$
  select case p_kind when 'procure' then has_perm(p_org, 'coop', p_level) when 'sale' then has_perm(p_org, 'sales', p_level) else false end;
$$;
revoke execute on function contract_perm(uuid, text, text) from public, anon, authenticated;

-- Tự đánh số HĐ-năm-0001 riêng từng cơ sở
create or replace function trade_contract_number() returns trigger language plpgsql as $$
declare yr text := to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY'); n integer;
begin
  if new.contract_no is null or length(trim(new.contract_no)) = 0 then
    perform pg_advisory_xact_lock(hashtext('contract-no-' || new.organization_id::text || yr));
    select coalesce(max(substring(c.contract_no from ('^HĐ-' || yr || '-([0-9]+)$'))::integer), 0) + 1 into n
      from trade_contracts c where c.organization_id = new.organization_id and c.contract_no ~ ('^HĐ-' || yr || '-[0-9]+$');
    new.contract_no := 'HĐ-' || yr || '-' || lpad(n::text, 4, '0');
  end if;
  return new;
end $$;
create trigger trade_contract_number_trg before insert on trade_contracts for each row execute function trade_contract_number();

-- Lập mới (p_id null) hoặc sửa bản nháp
create or replace function save_trade_contract(
  p_org uuid, p_id uuid, p_kind text, p_counterparty_org uuid, p_partner uuid,
  p_cp_name text, p_cp_rep text, p_cp_phone text, p_cp_address text, p_cp_tax text,
  p_crop uuid, p_product text, p_cycle uuid, p_qty numeric, p_price_mode text, p_price bigint, p_quality text,
  p_from date, p_to date, p_place text, p_pay_days integer, p_pay_method text, p_extra text, p_valid_to date)
returns uuid language plpgsql security definer set search_path = public as $$
declare c trade_contracts; v_id uuid := p_id;
begin
  if not contract_perm(p_org, p_kind, 'edit') then raise exception 'FORBIDDEN: Bạn không có quyền lập hợp đồng này.'; end if;
  if p_kind = 'procure' and not exists (select 1 from organizations o where o.id = p_org and o.type = 'cooperative') then
    raise exception 'INVALID_CONTRACT: Chỉ hợp tác xã lập hợp đồng bao tiêu với hộ thành viên.';
  end if;
  if p_kind = 'procure' then
    if p_counterparty_org is null or not exists (select 1 from cooperative_memberships where household_org_id = p_counterparty_org and cooperative_org_id = p_org and status = 'active') then
      raise exception 'NOT_MEMBER: Hãy chọn một hộ đang là thành viên của HTX.';
    end if;
  end if;
  if p_partner is not null and not exists (select 1 from partners where id = p_partner and organization_id = p_org) then raise exception 'NOT_FOUND: Không tìm thấy khách hàng này.'; end if;
  if p_price_mode <> 'market' and (p_price is null or p_price <= 0) then raise exception 'INVALID_CONTRACT: Hợp đồng giá cố định hoặc giá sàn cần có đơn giá lớn hơn 0.'; end if;
  if p_from is not null and p_to is not null and p_to < p_from then raise exception 'INVALID_DATE: Ngày giao cuối không được trước ngày giao đầu.'; end if;
  if p_valid_to is not null and p_from is not null and p_valid_to < p_from then raise exception 'INVALID_DATE: Hạn hợp đồng không được trước ngày giao đầu.'; end if;
  if v_id is null then
    insert into trade_contracts (organization_id, kind, contract_no, counterparty_org_id, partner_id, counterparty_name, counterparty_rep, counterparty_phone, counterparty_address, counterparty_tax_code,
      crop_type_id, product_name, cycle_id, quantity_kg, price_mode, unit_price, quality_note, delivery_from, delivery_to, delivery_place, payment_days, payment_method, extra_terms, valid_to)
    values (p_org, p_kind, '', p_counterparty_org, p_partner, trim(p_cp_name), nullif(trim(coalesce(p_cp_rep, '')), ''), nullif(trim(coalesce(p_cp_phone, '')), ''), nullif(trim(coalesce(p_cp_address, '')), ''), nullif(trim(coalesce(p_cp_tax, '')), ''),
      p_crop, trim(p_product), p_cycle, p_qty, p_price_mode, case when p_price_mode = 'market' then null else p_price end, nullif(trim(coalesce(p_quality, '')), ''),
      p_from, p_to, nullif(trim(coalesce(p_place, '')), ''), p_pay_days, coalesce(p_pay_method, 'either'), nullif(trim(coalesce(p_extra, '')), ''), p_valid_to)
    returning id into v_id;
  else
    select * into c from trade_contracts where id = v_id and organization_id = p_org;
    if c.id is null then raise exception 'NOT_FOUND: Không tìm thấy hợp đồng.'; end if;
    if c.status <> 'draft' then raise exception 'NOT_DRAFT: Hợp đồng đã ký hoặc đã đóng nên không sửa điều khoản được. Hãy lập hợp đồng mới.'; end if;
    update trade_contracts set counterparty_org_id = p_counterparty_org, partner_id = p_partner, counterparty_name = trim(p_cp_name),
      counterparty_rep = nullif(trim(coalesce(p_cp_rep, '')), ''), counterparty_phone = nullif(trim(coalesce(p_cp_phone, '')), ''), counterparty_address = nullif(trim(coalesce(p_cp_address, '')), ''),
      counterparty_tax_code = nullif(trim(coalesce(p_cp_tax, '')), ''), crop_type_id = p_crop, product_name = trim(p_product), cycle_id = p_cycle, quantity_kg = p_qty,
      price_mode = p_price_mode, unit_price = case when p_price_mode = 'market' then null else p_price end, quality_note = nullif(trim(coalesce(p_quality, '')), ''),
      delivery_from = p_from, delivery_to = p_to, delivery_place = nullif(trim(coalesce(p_place, '')), ''), payment_days = p_pay_days, payment_method = coalesce(p_pay_method, 'either'),
      extra_terms = nullif(trim(coalesce(p_extra, '')), ''), valid_to = p_valid_to where id = v_id;
  end if;
  return v_id;
end $$;

-- Đổi trạng thái: draft → signed (ngày ký) → done; draft/signed → cancelled (kèm lý do)
create or replace function set_trade_contract_status(p_id uuid, p_status text, p_date date default null, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare c trade_contracts;
begin
  select * into c from trade_contracts where id = p_id;
  if c.id is null or not contract_perm(c.organization_id, c.kind, 'edit') then raise exception 'FORBIDDEN: Bạn không có quyền đổi trạng thái hợp đồng này.'; end if;
  if p_status = 'signed' then
    if c.status <> 'draft' then raise exception 'NOT_DRAFT: Chỉ bản nháp mới đánh dấu đã ký được.'; end if;
    if p_date is null or p_date > (now() at time zone 'Asia/Ho_Chi_Minh')::date then raise exception 'INVALID_DATE: Ngày ký không được để trống hoặc ở tương lai.'; end if;
    update trade_contracts set status = 'signed', signed_on = p_date where id = p_id;
  elsif p_status = 'done' then
    if c.status <> 'signed' then raise exception 'NOT_SIGNED: Chỉ hợp đồng đã ký mới đánh dấu hoàn thành được.'; end if;
    update trade_contracts set status = 'done' where id = p_id;
  elsif p_status = 'cancelled' then
    if c.status in ('done', 'cancelled') then raise exception 'NOT_ALLOWED: Hợp đồng đã hoàn thành hoặc đã hủy.'; end if;
    if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'REASON_REQUIRED: Hãy ghi lý do hủy.'; end if;
    update trade_contracts set status = 'cancelled', cancel_reason = trim(p_reason) where id = p_id;
  else
    raise exception 'INVALID_STATUS: Trạng thái không hợp lệ.';
  end if;
end $$;

-- Xóa bản nháp (hợp đồng đã ký không xóa, chỉ hủy)
create or replace function delete_trade_contract_draft(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c trade_contracts;
begin
  select * into c from trade_contracts where id = p_id;
  if c.id is null or not contract_perm(c.organization_id, c.kind, 'edit') then raise exception 'FORBIDDEN: Bạn không có quyền xóa hợp đồng này.'; end if;
  if c.status <> 'draft' then raise exception 'NOT_DRAFT: Chỉ xóa được bản nháp; hợp đồng đã ký thì hủy kèm lý do.'; end if;
  delete from trade_contracts where id = p_id;
end $$;

-- Danh sách hợp đồng của cơ sở (người xem theo quyền từng loại)
create or replace function get_trade_contracts(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not is_org_member(p_org) then raise exception 'FORBIDDEN: Bạn không thuộc cơ sở này.'; end if;
  return coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at desc) from trade_contracts c
                    where c.organization_id = p_org and contract_perm(p_org, c.kind, 'view')), '[]'::jsonb);
end $$;

revoke execute on function save_trade_contract(uuid, uuid, text, uuid, uuid, text, text, text, text, text, uuid, text, uuid, numeric, text, bigint, text, date, date, text, integer, text, text, date),
  set_trade_contract_status(uuid, text, date, text), delete_trade_contract_draft(uuid), get_trade_contracts(uuid) from public, anon;
grant execute on function save_trade_contract(uuid, uuid, text, uuid, uuid, text, text, text, text, text, uuid, text, uuid, numeric, text, bigint, text, date, date, text, integer, text, text, date),
  set_trade_contract_status(uuid, text, date, text), delete_trade_contract_draft(uuid), get_trade_contracts(uuid) to authenticated, service_role;
