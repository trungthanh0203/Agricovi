-- Mua gói dịch vụ (D131): chủ cơ sở xem các gói hệ thống cung cấp, chọn mua bằng cách điền họ tên, điện thoại, địa chỉ; yêu cầu hiện ở trang quản trị nền tảng
-- (mục "Đơn mua gói") để duyệt, kèm email thông báo gửi bởi Edge Function plan-order. Duyệt = ghi nhận thanh toán và kích hoạt/gia hạn gói
-- (dùng lại admin_record_payment). Không có thanh toán trực tuyến: việc thu tiền do quản trị liên hệ ngoài app.

create table plan_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  requested_by uuid not null references auth.users(id),
  plan_tier_id uuid not null references plan_tiers(id),
  plan_name text not null,                       -- bản chụp lúc mua (đổi tên/giá gói sau không đổi đơn cũ)
  quarters integer not null check (quarters between 1 and 8),
  price_per_quarter bigint not null,
  amount bigint not null,
  full_name text not null check (length(trim(full_name)) between 2 and 80),
  phone text not null check (length(trim(phone)) between 8 and 20),
  address text not null check (length(trim(address)) between 3 and 300),
  note text check (note is null or length(note) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note text,
  subscription_id uuid references subscriptions(id),
  email_status text,                             -- 'sent' | 'skipped' (chưa cấu hình gửi thư) | 'failed'
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id)
);
create index on plan_orders (status, created_at);
create index on plan_orders (organization_id, created_at);
alter table plan_orders enable row level security;
create policy plan_orders_own on plan_orders for select to authenticated using (has_org_role(organization_id, array['owner']::member_role[]));

-- Các gói có thể mua của một cơ sở (đúng loại cơ sở, đang mở bán, không phải gói dùng thử mặc định)
create function list_purchasable_plans(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t org_type;
begin
  if not has_org_role(p_org, array['owner']::member_role[]) then raise exception 'FORBIDDEN: Chỉ chủ cơ sở xem và mua gói dịch vụ.'; end if;
  select type into t from organizations where id = p_org;
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'max_cycles', p.max_cycles, 'price_per_quarter', p.price_per_quarter) order by p.price_per_quarter, p.name)
                     from plan_tiers p where p.org_type = t and p.is_active and not p.is_trial_default), '[]'::jsonb);
end $$;

-- Tạo yêu cầu mua (gọi bằng quyền người dùng, từ Edge Function plan-order). Mỗi cơ sở tối đa 3 yêu cầu đang chờ.
create function create_plan_order(p_org uuid, p_plan uuid, p_quarters integer, p_name text, p_phone text, p_address text, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare t plan_tiers; org_t org_type; oid uuid;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED: Cần đăng nhập'; end if;
  if not has_org_role(p_org, array['owner']::member_role[]) then raise exception 'FORBIDDEN: Chỉ chủ cơ sở được mua gói dịch vụ.'; end if;
  select type into org_t from organizations where id = p_org;
  select * into t from plan_tiers where id = p_plan;
  if t.id is null or not t.is_active or t.is_trial_default or t.org_type <> org_t then
    raise exception 'INVALID_PLAN: Gói này không có cho loại cơ sở của bạn hoặc đã ngừng bán. Hãy chọn gói khác.';
  end if;
  if p_quarters is null or p_quarters < 1 or p_quarters > 8 then raise exception 'INVALID_QUARTERS: Số quý mua từ 1 đến 8.'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'INVALID_NAME: Hãy nhập họ tên.'; end if;
  if length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 9 then raise exception 'INVALID_PHONE: Hãy nhập số điện thoại để chúng tôi liên hệ.'; end if;
  if length(trim(coalesce(p_address, ''))) < 3 then raise exception 'INVALID_ADDRESS: Hãy nhập địa chỉ.'; end if;
  if (select count(*) from plan_orders o where o.organization_id = p_org and o.status = 'pending') >= 3 then
    raise exception 'TOO_MANY: Bạn đang có 3 yêu cầu mua chờ xử lý. Hãy đợi Agricovi liên hệ rồi mua tiếp.';
  end if;
  insert into plan_orders (organization_id, requested_by, plan_tier_id, plan_name, quarters, price_per_quarter, amount, full_name, phone, address, note)
    values (p_org, auth.uid(), t.id, t.name, p_quarters, t.price_per_quarter, t.price_per_quarter * p_quarters, trim(p_name), trim(p_phone), trim(p_address), nullif(trim(coalesce(p_note, '')), ''))
    returning id into oid;
  return oid;
end $$;

-- Yêu cầu mua của cơ sở tôi (để xem đã gửi gì và trạng thái)
create function my_plan_orders(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_org_role(p_org, array['owner']::member_role[]) then raise exception 'FORBIDDEN: Chỉ chủ cơ sở xem yêu cầu mua gói.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'plan_name', o.plan_name, 'quarters', o.quarters, 'amount', o.amount, 'status', o.status,
                                                       'admin_note', o.admin_note, 'created_at', o.created_at) order by o.created_at desc)
                     from (select * from plan_orders where organization_id = p_org order by created_at desc limit 20) o), '[]'::jsonb);
end $$;

-- Edge Function ghi kết quả gửi email thông báo
create function plan_order_email_result(p_id uuid, p_status text) returns void
language sql security definer set search_path = public as $$
  update plan_orders set email_status = p_status where id = p_id;
$$;

-- Dữ liệu để soạn email thông báo (chỉ Edge Function)
create function plan_order_mail_data(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('plan_name', o.plan_name, 'quarters', o.quarters, 'amount', o.amount, 'full_name', o.full_name, 'phone', o.phone, 'address', o.address,
                            'note', o.note, 'org_name', g.name, 'org_type', g.type, 'user_email', u.email,
                            'to_email', (select value #>> '{email}' from platform_settings where key = 'contact_info'))
    from plan_orders o join organizations g on g.id = o.organization_id join auth.users u on u.id = o.requested_by where o.id = p_id;
$$;

-- ---------------------------------------------------------------------------
-- Quản trị nền tảng
-- ---------------------------------------------------------------------------
create function admin_list_plan_orders(p_status text default 'pending') returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_guard();
  return coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'org_id', o.organization_id, 'org_name', g.name, 'plan_name', o.plan_name, 'quarters', o.quarters,
                                                       'amount', o.amount, 'full_name', o.full_name, 'phone', o.phone, 'address', o.address, 'note', o.note,
                                                       'status', o.status, 'admin_note', o.admin_note, 'email_status', o.email_status, 'created_at', o.created_at,
                                                       'decided_at', o.decided_at) order by o.created_at desc)
                     from plan_orders o join organizations g on g.id = o.organization_id where p_status is null or o.status = p_status), '[]'::jsonb);
end $$;

-- Duyệt: ghi nhận thanh toán và kích hoạt/gia hạn gói cho cơ sở (số tiền, số quý mặc định theo đơn, quản trị sửa được); Từ chối: cần lý do
create function admin_decide_plan_order(p_id uuid, p_approve boolean, p_amount bigint default null, p_quarters integer default null, p_method text default null, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare o plan_orders; sid uuid;
begin
  perform admin_guard();
  select * into o from plan_orders where id = p_id for update;
  if o.id is null then raise exception 'NOT_FOUND: Không tìm thấy đơn mua.'; end if;
  if o.status <> 'pending' then raise exception 'ALREADY_DECIDED: Đơn này đã được xử lý.'; end if;
  if p_approve then
    sid := admin_record_payment(o.organization_id, coalesce(p_amount, o.amount), current_date, coalesce(nullif(trim(coalesce(p_method, '')), ''), 'Mua gói trong app'),
                                coalesce(nullif(trim(coalesce(p_note, '')), ''), 'Đơn mua gói ' || o.plan_name), coalesce(p_quarters, o.quarters), o.plan_tier_id);
    update plan_orders set status = 'approved', subscription_id = sid, decided_at = now(), decided_by = auth.uid(), admin_note = nullif(trim(coalesce(p_note, '')), '') where id = p_id;
    perform admin_audit(o.organization_id, 'approve_plan_order', 'plan_orders', p_id::text, null, jsonb_build_object('plan', o.plan_name, 'amount', coalesce(p_amount, o.amount)), p_note);
    return sid;
  end if;
  if length(trim(coalesce(p_note, ''))) < 3 then raise exception 'REASON_REQUIRED: Hãy ghi lý do từ chối (hiện cho chủ cơ sở).'; end if;
  update plan_orders set status = 'rejected', decided_at = now(), decided_by = auth.uid(), admin_note = left(trim(p_note), 300) where id = p_id;
  perform admin_audit(o.organization_id, 'reject_plan_order', 'plan_orders', p_id::text, null, jsonb_build_object('plan', o.plan_name), p_note);
  return null;
end $$;

revoke execute on function list_purchasable_plans(uuid), create_plan_order(uuid, uuid, integer, text, text, text, text), my_plan_orders(uuid),
  admin_list_plan_orders(text), admin_decide_plan_order(uuid, boolean, bigint, integer, text, text) from public, anon;
grant execute on function list_purchasable_plans(uuid), create_plan_order(uuid, uuid, integer, text, text, text, text), my_plan_orders(uuid),
  admin_list_plan_orders(text), admin_decide_plan_order(uuid, boolean, bigint, integer, text, text) to authenticated;
revoke execute on function plan_order_email_result(uuid, text), plan_order_mail_data(uuid) from public, anon, authenticated;
grant execute on function plan_order_email_result(uuid, text), plan_order_mail_data(uuid) to service_role;
