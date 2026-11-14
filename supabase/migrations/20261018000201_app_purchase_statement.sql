-- Mục 13 lát 1: BẢNG KÊ THU MUA NÔNG SẢN trực tiếp từ người sản xuất (HTX lập từ phiếu thu mua có sẵn).
-- Bảng kê cần thông tin NGƯỜI BÁN (họ tên, CCCD/CMND, địa chỉ, điện thoại) = dữ liệu cá nhân nhạy cảm, nên:
--  * Chỉ HTX nhập (quyền HTX sửa), BẮT BUỘC kèm xác nhận người bán đã đồng ý (thời điểm lưu lại); người bán rút lại đồng ý thì xóa được.
--  * Bảng riêng, không có chính sách đọc trực tiếp; chỉ đọc qua hàm: xem danh sách thì số giấy tờ bị che (chỉ 4 số cuối), dựng bảng kê đủ số cần quyền HTX sửa.
--  * Mỗi lần lưu, xóa, hoặc dựng bảng kê có số giấy tờ đều ghi vào audit_events (không ghi số giấy tờ).
-- Nội dung pháp lý của mẫu bảng kê chưa đối chiếu văn bản gốc (xem PHAN_TICH_THUE_CO_QUAN_THUE.md): app chỉ dựng bản tham khảo.

create table procurement_sellers (
  cooperative_org_id uuid not null references organizations(id) on delete cascade,
  household_org_id uuid not null references organizations(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  id_number text not null check (id_number ~ '^([0-9]{9}|[0-9]{12})$'),         -- CMND 9 số hoặc CCCD 12 số
  address text not null check (length(trim(address)) between 5 and 300),
  phone text check (phone is null or phone ~ '^[0-9+ ]{8,15}$'),
  consent_at timestamptz not null,
  consent_note text check (consent_note is null or length(consent_note) <= 300),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (cooperative_org_id, household_org_id)
);
alter table procurement_sellers enable row level security;
revoke all on procurement_sellers from authenticated, anon;

create or replace function mask_id(p_id text) returns text language sql immutable as $$
  select case when p_id is null then null else repeat('*', greatest(length(p_id) - 4, 0)) || right(p_id, 4) end;
$$;

-- Lưu thông tin người bán của một hộ thành viên (chỉ HTX; phải có xác nhận đồng ý)
create or replace function set_procurement_seller(p_coop uuid, p_household uuid, p_name text, p_id_number text, p_address text, p_phone text, p_consent boolean, p_consent_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not has_perm(p_coop, 'coop', 'edit') then raise exception 'FORBIDDEN: Bạn không có quyền nhập thông tin người bán của HTX.'; end if;
  if not exists (select 1 from cooperative_memberships where household_org_id = p_household and cooperative_org_id = p_coop and status = 'active') then
    raise exception 'NOT_MEMBER: Hộ này không thuộc HTX.';
  end if;
  if p_consent is distinct from true then
    raise exception 'CONSENT_REQUIRED: Cần người bán đồng ý cho HTX lưu họ tên, số giấy tờ, địa chỉ để lập bảng kê thu mua. Hãy tích ô xác nhận đã được đồng ý.';
  end if;
  if p_name is null or length(trim(p_name)) < 2 then raise exception 'INVALID_SELLER: Hãy nhập họ tên người bán.'; end if;
  if p_id_number is null or trim(p_id_number) !~ '^([0-9]{9}|[0-9]{12})$' then raise exception 'INVALID_SELLER: Số CCCD gồm 12 số (CMND cũ gồm 9 số).'; end if;
  if p_address is null or length(trim(p_address)) < 5 then raise exception 'INVALID_SELLER: Hãy nhập địa chỉ người bán.'; end if;
  if p_phone is not null and trim(p_phone) <> '' and trim(p_phone) !~ '^[0-9+ ]{8,15}$' then raise exception 'INVALID_SELLER: Số điện thoại chưa đúng.'; end if;
  insert into procurement_sellers (cooperative_org_id, household_org_id, full_name, id_number, address, phone, consent_at, consent_note, updated_by, updated_at)
  values (p_coop, p_household, trim(p_name), trim(p_id_number), trim(p_address), nullif(trim(coalesce(p_phone, '')), ''), now(), nullif(trim(coalesce(p_consent_note, '')), ''), auth.uid(), now())
  on conflict (cooperative_org_id, household_org_id) do update
    set full_name = excluded.full_name, id_number = excluded.id_number, address = excluded.address, phone = excluded.phone,
        consent_at = now(), consent_note = excluded.consent_note, updated_by = excluded.updated_by, updated_at = now();
  insert into audit_events (organization_id, actor_id, action, entity, entity_id, after)
  values (p_coop, auth.uid(), 'set_seller', 'procurement_seller', p_household::text, jsonb_build_object('full_name', trim(p_name), 'id_number', mask_id(trim(p_id_number))));
  return jsonb_build_object('household_org_id', p_household, 'full_name', trim(p_name), 'id_masked', mask_id(trim(p_id_number)));
end $$;

-- Xóa thông tin người bán (người bán rút lại đồng ý hoặc không còn cần)
create or replace function delete_procurement_seller(p_coop uuid, p_household uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_perm(p_coop, 'coop', 'edit') then raise exception 'FORBIDDEN: Bạn không có quyền xóa thông tin người bán của HTX.'; end if;
  delete from procurement_sellers where cooperative_org_id = p_coop and household_org_id = p_household;
  insert into audit_events (organization_id, actor_id, action, entity, entity_id)
  values (p_coop, auth.uid(), 'delete_seller', 'procurement_seller', p_household::text);
end $$;

-- Danh sách hộ thành viên kèm tình trạng thông tin người bán (số giấy tờ bị che)
create or replace function get_procurement_sellers(p_coop uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_perm(p_coop, 'coop', 'view') then raise exception 'FORBIDDEN: Bạn không có quyền xem hộ thành viên.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'household_org_id', m.household_org_id, 'household_name', o.name, 'has_profile', s.full_name is not null,
        'full_name', s.full_name, 'id_masked', mask_id(s.id_number), 'address', s.address, 'phone', s.phone, 'consent_at', s.consent_at) order by o.name)
      from cooperative_memberships m
      join organizations o on o.id = m.household_org_id
      left join procurement_sellers s on s.cooperative_org_id = m.cooperative_org_id and s.household_org_id = m.household_org_id
     where m.cooperative_org_id = p_coop and m.status = 'active'), '[]'::jsonb);
end $$;

-- Dữ liệu bảng kê thu mua trong khoảng ngày: mỗi phiếu thu mua chưa hủy một dòng, kèm người bán ĐỦ SỐ giấy tờ (cần quyền HTX sửa) và tiền đã trả bằng tiền mặt
create or replace function get_purchase_statement(p_coop uuid, p_from date, p_to date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare res jsonb;
begin
  if not has_perm(p_coop, 'coop', 'edit') then raise exception 'FORBIDDEN: Chỉ người có quyền HTX (sửa) lập được bảng kê thu mua vì có thông tin cá nhân người bán.'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'INVALID_DATE: Khoảng ngày chưa đúng.'; end if;
  if p_to - p_from > 400 then raise exception 'INVALID_DATE: Mỗi bảng kê tối đa khoảng 13 tháng.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'receipt_id', r.id, 'receipt_date', r.receipt_date, 'invoice_no', r.invoice_no, 'household_org_id', r.household_org_id, 'household_name', h.name,
      'seller', case when s.full_name is null then null else jsonb_build_object('full_name', s.full_name, 'id_number', s.id_number, 'address', s.address, 'phone', s.phone) end,
      'crop_name', cr.name, 'quantity', r.quantity, 'unit_price', r.unit_price, 'amount', r.amount,
      'paid', coalesce(pp.paid, 0), 'cash_paid', coalesce(pp.cash, 0)) order by r.receipt_date, r.created_at), '[]'::jsonb) into res
    from procurement_receipts r
    join organizations h on h.id = r.household_org_id
    left join crop_types cr on cr.id = r.crop_type_id
    left join procurement_sellers s on s.cooperative_org_id = r.cooperative_org_id and s.household_org_id = r.household_org_id
    left join lateral (select sum(x.amount) as paid, sum(x.amount) filter (where x.method = 'cash') as cash
                         from procurement_payments x where x.receipt_id = r.id and x.voided_at is null) pp on true
   where r.cooperative_org_id = p_coop and r.voided_at is null and r.receipt_date between p_from and p_to;
  insert into audit_events (organization_id, actor_id, action, entity, entity_id, after)
  values (p_coop, auth.uid(), 'view_purchase_statement', 'procurement_receipts', null, jsonb_build_object('from', p_from, 'to', p_to));
  return jsonb_build_object('from', p_from, 'to', p_to, 'generated_at', now(), 'rows', res);
end $$;

revoke execute on function mask_id(text) from public, anon, authenticated;
revoke execute on function set_procurement_seller(uuid, uuid, text, text, text, text, boolean, text), delete_procurement_seller(uuid, uuid),
  get_procurement_sellers(uuid), get_purchase_statement(uuid, date, date) from public, anon;
grant execute on function set_procurement_seller(uuid, uuid, text, text, text, text, boolean, text), delete_procurement_seller(uuid, uuid),
  get_procurement_sellers(uuid), get_purchase_statement(uuid, date, date) to authenticated, service_role;
