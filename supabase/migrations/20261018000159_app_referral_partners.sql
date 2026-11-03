-- D131: MÃ GIỚI THIỆU + ĐỐI TÁC + HOA HỒNG (kế hoạch marketing-kinh doanh).
-- Mỗi đối tác (đại lý vật tư, hội/đoàn thể, HTX, người dùng) có một mã. Khách nhập mã khi đăng ký thì cơ sở được gắn với đối tác MỘT LẦN
-- (không tự sửa được). Khi quản trị nền tảng ghi nhận thanh toán của cơ sở đó, hệ thống tạo dòng hoa hồng = tổng thu x tỷ lệ của đối tác
-- (trong thời hạn hưởng tính từ lần thu đầu; sau đó theo tỷ lệ tái ký). Dòng hoa hồng chờ đủ số ngày xác nhận mới được chi.
-- Một cấp duy nhất: chỉ hưởng trên khách do chính mình giới thiệu. Người dùng thường tự có mã của mình (my_referral).
-- Hai bảng mới không có chính sách đọc: chỉ truy cập qua các hàm bên dưới (quản trị nền tảng, hoặc chủ cơ sở xem phần của mình).

create table referral_partners (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[A-Z0-9-]{3,20}$'),
  kind text not null default 'agent' check (kind in ('agent', 'user', 'association', 'coop', 'other')),
  name text not null check (length(trim(name)) between 2 and 120),
  phone text,
  bank_info text,                                     -- nơi nhận tiền (ngân hàng, số tài khoản): chỉ quản trị nền tảng xem
  organization_id uuid unique references organizations(id) on delete cascade,  -- đối tác loại 'user': cơ sở sở hữu mã
  commission_pct numeric(5,2) not null default 0 check (commission_pct between 0 and 100),   -- trong thời hạn hưởng
  renewal_pct numeric(5,2) not null default 0 check (renewal_pct between 0 and 100),         -- sau thời hạn (khi khách tái ký)
  months_eligible integer not null default 12 check (months_eligible between 0 and 60),
  hold_days integer not null default 30 check (hold_days between 0 and 365),
  active boolean not null default true,
  note text,
  signed_at date,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create unique index referral_partners_code_uq on referral_partners (code);
alter table referral_partners enable row level security;

alter table organizations add column referred_by uuid references referral_partners(id) on delete set null;
alter table organizations add column referred_at timestamptz;
create index on organizations (referred_by) where referred_by is not null;

create table referral_commissions (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references referral_partners(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  payment_id uuid not null unique references payment_records(id) on delete cascade,
  base_amount bigint not null,
  pct numeric(5,2) not null,
  amount bigint not null check (amount >= 0),
  payable_after date not null,
  status text not null default 'open' check (status in ('open', 'paid', 'void')),
  paid_at date, paid_method text, paid_note text, paid_by uuid references auth.users(id),
  void_reason text,
  created_at timestamptz not null default now()
);
create index on referral_commissions (partner_id, status);
alter table referral_commissions enable row level security;

alter table owner_signups add column ref_code text;

-- Chỉ các hàm của hệ thống và quản trị nền tảng được đặt/đổi người giới thiệu của cơ sở
create function organizations_referral_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.referred_by is not null and coalesce(current_setting('agri.ref_ok', true), '') <> '1' and not is_platform_admin() then
      new.referred_by := null; new.referred_at := null;
    end if;
  elsif new.referred_by is distinct from old.referred_by or new.referred_at is distinct from old.referred_at then
    if coalesce(current_setting('agri.ref_ok', true), '') <> '1' and not is_platform_admin() then
      new.referred_by := old.referred_by; new.referred_at := old.referred_at;
    end if;
  end if;
  return new;
end $$;
create trigger organizations_referral_guard before insert or update on organizations
  for each row execute function organizations_referral_guard();
revoke execute on function organizations_referral_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Nội bộ: tra mã -> đối tác (báo lỗi nếu mã sai), gắn mã vào cơ sở, tính hoa hồng
-- ---------------------------------------------------------------------------
create function referral_partner_for(p_code text) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare c text := upper(trim(coalesce(p_code, ''))); pid uuid;
begin
  if c = '' then return null; end if;
  select id into pid from referral_partners where code = c and active;
  if pid is null then raise exception 'INVALID_REF: Mã giới thiệu chưa đúng. Hãy kiểm tra lại, hoặc để trống ô này.'; end if;
  return pid;
end $$;

create function referral_attach(p_org uuid, p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare pid uuid := referral_partner_for(p_code);
begin
  if pid is null then return; end if;
  if exists (select 1 from referral_partners where id = pid and organization_id = p_org) then return; end if;  -- không tự giới thiệu mình
  perform set_config('agri.ref_ok', '1', true);
  update organizations set referred_by = pid, referred_at = now() where id = p_org and referred_by is null;
  perform set_config('agri.ref_ok', '', true);
end $$;

create function referral_accrue(p_org uuid, p_payment uuid, p_amount bigint, p_paid_at date) returns void
language plpgsql security definer set search_path = public as $$
declare pt referral_partners; first_paid date; pct numeric;
begin
  select p.* into pt from organizations o join referral_partners p on p.id = o.referred_by where o.id = p_org and p.active;
  if pt.id is null or p_amount <= 0 then return; end if;
  select min(pr.paid_at) into first_paid from payment_records pr join subscriptions s on s.id = pr.subscription_id where s.organization_id = p_org;
  pct := case when p_paid_at < first_paid + make_interval(months => pt.months_eligible) then pt.commission_pct else pt.renewal_pct end;
  if pct <= 0 then return; end if;
  insert into referral_commissions (partner_id, organization_id, payment_id, base_amount, pct, amount, payable_after)
    values (pt.id, p_org, p_payment, p_amount, pct, round(p_amount * pct / 100), p_paid_at + pt.hold_days)
    on conflict (payment_id) do nothing;
end $$;
revoke execute on function referral_partner_for(text), referral_attach(uuid, text), referral_accrue(uuid, uuid, bigint, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Đăng ký: nhập mã (tùy chọn)
-- ---------------------------------------------------------------------------
drop function create_organization(org_type, text);
create function create_organization(p_type org_type, p_name text, p_ref text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid; pid uuid;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED: Cần đăng nhập'; end if;
  if exists (select 1 from staff_accounts where user_id = auth.uid()) then
    raise exception 'STAFF_ACCOUNT: Tài khoản nhân viên do chủ cơ sở tạo, không tự tạo cơ sở được.';
  end if;
  if exists (select 1 from owner_signups where user_id = auth.uid() and status <> 'approved') then
    raise exception 'PENDING_APPROVAL: Đăng ký của bạn đang chờ Agricovi duyệt. Cơ sở sẽ được tạo ngay khi duyệt xong.';
  end if;
  if p_name is null or length(trim(p_name)) < 2 then
    raise exception 'INVALID_NAME: Tên cơ sở cần ít nhất 2 ký tự';
  end if;
  if exists (select 1 from organization_memberships m
              where m.user_id = auth.uid() and 'owner' = any (m.roles) and m.status = 'active') then
    raise exception 'ORG_LIMIT: Tài khoản này đã có cơ sở. Hộ chỉ có một cơ sở; HTX thêm hộ thành viên trong mục Hộ thành viên.';
  end if;
  pid := referral_partner_for(p_ref);   -- mã sai thì báo, không tạo cơ sở
  insert into organizations (type, name, created_by) values (p_type, trim(p_name), auth.uid())
    returning id into new_id;
  if pid is not null then perform referral_attach(new_id, p_ref); end if;
  return new_id;
end $$;
revoke execute on function create_organization(org_type, text, text) from public, anon;
grant execute on function create_organization(org_type, text, text) to authenticated;

drop function owner_signup_finalize(uuid, text, text, text, text, org_type, text);
create function owner_signup_finalize(p_user uuid, p_phone text, p_auth_email text, p_name text, p_org_name text, p_type org_type, p_ip_hash text, p_ref text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  perform referral_partner_for(p_ref);   -- mã sai thì báo (Edge Function xóa tài khoản vừa tạo)
  insert into owner_signups (user_id, phone, auth_email, full_name, org_name, org_type, ip_hash, ref_code)
    values (p_user, p_phone, p_auth_email, trim(p_name), trim(p_org_name), p_type, p_ip_hash, nullif(upper(trim(coalesce(p_ref, ''))), '')) returning id into sid;
  return sid;
end $$;
revoke execute on function owner_signup_finalize(uuid, text, text, text, text, org_type, text, text) from public, anon, authenticated;
grant execute on function owner_signup_finalize(uuid, text, text, text, text, org_type, text, text) to service_role;

create or replace function admin_decide_signup(p_id uuid, p_approve boolean, p_reason text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare o owner_signups; new_org uuid;
begin
  perform admin_guard();
  select * into o from owner_signups where id = p_id for update;
  if o.id is null then raise exception 'NOT_FOUND: Không tìm thấy đăng ký.'; end if;
  if o.status <> 'pending' then raise exception 'ALREADY_DECIDED: Đăng ký này đã được xử lý.'; end if;
  if p_approve then
    insert into organizations (type, name, created_by) values (o.org_type, o.org_name, o.user_id) returning id into new_org;  -- trigger tạo gói dùng thử và gán chủ
    if o.ref_code is not null then
      begin perform referral_attach(new_org, o.ref_code); exception when others then null; end;   -- mã đã bị khóa trong lúc chờ: bỏ qua, không chặn duyệt
    end if;
    update owner_signups set status = 'approved', organization_id = new_org, decided_at = now(), decided_by = auth.uid() where id = p_id;
    perform admin_audit(new_org, 'approve_signup', 'owner_signups', p_id::text, null, jsonb_build_object('phone', o.phone, 'org', o.org_name), p_reason);
    return new_org;
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'REASON_REQUIRED: Hãy ghi lý do từ chối (hiện cho người đăng ký).'; end if;
  update owner_signups set status = 'rejected', note = left(trim(p_reason), 300), decided_at = now(), decided_by = auth.uid() where id = p_id;
  perform admin_audit(null, 'reject_signup', 'owner_signups', p_id::text, null, jsonb_build_object('phone', o.phone, 'org', o.org_name), p_reason);
  return null;
end $$;

-- admin_list_signups: thêm mã giới thiệu để quản trị thấy khi duyệt
create or replace function admin_list_signups(p_status text default 'pending') returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_guard();
  return coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'phone', o.phone, 'full_name', o.full_name, 'org_name', o.org_name, 'org_type', o.org_type,
                                                       'status', o.status, 'note', o.note, 'created_at', o.created_at, 'decided_at', o.decided_at,
                                                       'organization_id', o.organization_id, 'ref_code', o.ref_code) order by o.created_at desc)
                     from owner_signups o where p_status is null or o.status = p_status), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- Ghi nhận thanh toán: như cũ, thêm bước tính hoa hồng
-- ---------------------------------------------------------------------------
create or replace function admin_record_payment(p_org uuid, p_amount bigint, p_paid_at date, p_method text, p_note text, p_quarters integer, p_plan uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare prev subscriptions; t plan_tiers; v_start timestamptz; sid uuid; plan_id uuid; pid uuid;
begin
  perform admin_guard();
  if p_amount is null or p_amount < 0 then raise exception 'INVALID_AMOUNT: Số tiền không hợp lệ.'; end if;
  if p_quarters is null or p_quarters < 1 or p_quarters > 8 then raise exception 'INVALID_QUARTERS: Số quý gia hạn từ 1 đến 8.'; end if;
  if p_paid_at is null or p_paid_at > current_date then raise exception 'INVALID_DATE: Ngày thu không được sau hôm nay.'; end if;
  if not exists (select 1 from organizations where id = p_org) then raise exception 'NOT_FOUND: Không tìm thấy cơ sở.'; end if;
  select * into prev from subscriptions where organization_id = p_org order by period_end desc limit 1;
  plan_id := coalesce(p_plan, prev.plan_tier_id);
  select * into t from plan_tiers where id = plan_id;
  if t.id is null then raise exception 'NOT_FOUND: Chưa có gói để gia hạn, hãy chọn gói.'; end if;
  if prev.id is not null and prev.status = 'active' and prev.period_end > now() and t.id = prev.plan_tier_id then
    v_start := prev.period_end;                         -- gia hạn nối tiếp
  else
    v_start := now();
    update subscriptions set period_end = case when period_start > now() then period_end else now() end,
             status = case when period_start > now() then 'expired'::subscription_status else status end
       where organization_id = p_org and period_end > now(); -- thay gói dùng thử/đổi gói
  end if;
  insert into subscriptions (organization_id, plan_tier_id, status, max_cycles, price_per_quarter, ranking_weight, period_start, period_end, activated_by)
    values (p_org, t.id, 'active', t.max_cycles, t.price_per_quarter, t.ranking_weight, v_start, v_start + make_interval(months => 3 * p_quarters), auth.uid())
    returning id into sid;
  insert into payment_records (subscription_id, amount, paid_at, method, note, recorded_by)
    values (sid, p_amount, p_paid_at, nullif(trim(coalesce(p_method, '')), ''), nullif(trim(coalesce(p_note, '')), ''), auth.uid())
    returning id into pid;
  perform referral_accrue(p_org, pid, p_amount, p_paid_at);
  perform admin_audit(p_org, 'record_payment', 'subscription', sid::text, null,
                      jsonb_build_object('amount', p_amount, 'quarters', p_quarters, 'plan', t.name, 'paid_at', p_paid_at), null);
  return sid;
end $$;

-- ---------------------------------------------------------------------------
-- Chủ cơ sở: mã giới thiệu của mình (tự tạo lần đầu) và kết quả giới thiệu
-- ---------------------------------------------------------------------------
create function my_referral(p_org uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pt referral_partners; alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; c text; i int;
begin
  if not has_org_role(p_org, array['owner']::member_role[]) then raise exception 'FORBIDDEN: Chỉ chủ cơ sở xem được mã giới thiệu.'; end if;
  select * into pt from referral_partners where organization_id = p_org;
  if pt.id is null then
    loop
      c := 'ND-';
      for i in 1..6 loop c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
      exit when not exists (select 1 from referral_partners where code = c);
    end loop;
    insert into referral_partners (code, kind, name, organization_id, commission_pct, created_by)
      values (c, 'user', (select name from organizations where id = p_org), p_org, 10, auth.uid())
      returning * into pt;
  end if;
  return jsonb_build_object(
    'code', pt.code, 'active', pt.active, 'pct', pt.commission_pct, 'months', pt.months_eligible,
    'referred', (select count(*) from organizations o where o.referred_by = pt.id),
    'paying', (select count(*) from organizations o where o.referred_by = pt.id
                 and exists (select 1 from payment_records pr join subscriptions s on s.id = pr.subscription_id where s.organization_id = o.id)),
    'earned_open', coalesce((select sum(amount) from referral_commissions c2 where c2.partner_id = pt.id and c2.status = 'open'), 0),
    'earned_paid', coalesce((select sum(amount) from referral_commissions c2 where c2.partner_id = pt.id and c2.status = 'paid'), 0));
end $$;

-- ---------------------------------------------------------------------------
-- Quản trị nền tảng
-- ---------------------------------------------------------------------------
create function admin_partner_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_guard();
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'code', p.code, 'kind', p.kind, 'name', p.name, 'phone', p.phone, 'active', p.active,
      'commission_pct', p.commission_pct, 'renewal_pct', p.renewal_pct,
      'referred', (select count(*) from organizations o where o.referred_by = p.id),
      'paying', (select count(*) from organizations o where o.referred_by = p.id
                   and exists (select 1 from payment_records pr join subscriptions s on s.id = pr.subscription_id where s.organization_id = o.id)),
      'revenue', coalesce((select sum(pr.amount) from organizations o join subscriptions s on s.organization_id = o.id
                             join payment_records pr on pr.subscription_id = s.id where o.referred_by = p.id), 0),
      'payable', coalesce((select sum(c.amount) from referral_commissions c where c.partner_id = p.id and c.status = 'open' and c.payable_after <= current_date), 0),
      'waiting', coalesce((select sum(c.amount) from referral_commissions c where c.partner_id = p.id and c.status = 'open' and c.payable_after > current_date), 0),
      'paid', coalesce((select sum(c.amount) from referral_commissions c where c.partner_id = p.id and c.status = 'paid'), 0)
    ) order by p.created_at desc) from referral_partners p), '[]'::jsonb);
end $$;

create function admin_partner_detail(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pt referral_partners;
begin
  perform admin_guard();
  select * into pt from referral_partners where id = p_id;
  if pt.id is null then raise exception 'NOT_FOUND: Không tìm thấy đối tác.'; end if;
  return jsonb_build_object(
    'partner', to_jsonb(pt),
    'orgs', coalesce((select jsonb_agg(jsonb_build_object(
        'id', o.id, 'name', o.name, 'type', o.type, 'referred_at', o.referred_at, 'status', org_sub_status(o.id),
        'paid_total', coalesce((select sum(pr.amount) from subscriptions s join payment_records pr on pr.subscription_id = s.id where s.organization_id = o.id), 0)
      ) order by o.referred_at desc) from organizations o where o.referred_by = pt.id), '[]'::jsonb),
    'commissions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'org_name', o.name, 'paid_at', pr.paid_at, 'base_amount', c.base_amount, 'pct', c.pct, 'amount', c.amount,
        'payable_after', c.payable_after,
        'status', case when c.status = 'open' and c.payable_after > current_date then 'waiting' when c.status = 'open' then 'payable' else c.status end,
        'paid_on', c.paid_at, 'paid_method', c.paid_method, 'void_reason', c.void_reason
      ) order by c.created_at desc) from referral_commissions c join organizations o on o.id = c.organization_id
                                   join payment_records pr on pr.id = c.payment_id where c.partner_id = pt.id), '[]'::jsonb));
end $$;

create function admin_partner_save(p_id uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare d jsonb := coalesce(p_data, '{}'::jsonb); v_code text; v_id uuid := p_id; v_kind text; v_name text; v_pct numeric; v_ren numeric; v_months int; v_hold int; prev referral_partners;
begin
  perform admin_guard();
  v_code := upper(trim(coalesce(d ->> 'code', '')));
  v_kind := coalesce(d ->> 'kind', 'agent');
  v_name := trim(coalesce(d ->> 'name', ''));
  v_pct := coalesce(nullif(d ->> 'commission_pct', ''), '0')::numeric;
  v_ren := coalesce(nullif(d ->> 'renewal_pct', ''), '0')::numeric;
  v_months := coalesce(nullif(d ->> 'months_eligible', ''), '12')::int;
  v_hold := coalesce(nullif(d ->> 'hold_days', ''), '30')::int;
  if v_code !~ '^[A-Z0-9-]{3,20}$' then raise exception 'INVALID_CODE: Mã gồm 3–20 ký tự chữ không dấu, số hoặc dấu gạch ngang (ví dụ DL-HUNG).'; end if;
  if v_kind not in ('agent', 'user', 'association', 'coop', 'other') then raise exception 'INVALID_VALUE: Loại đối tác không hợp lệ.'; end if;
  if length(v_name) < 2 then raise exception 'INVALID_NAME: Hãy nhập tên đối tác.'; end if;
  if v_pct < 0 or v_pct > 100 or v_ren < 0 or v_ren > 100 then raise exception 'INVALID_VALUE: Tỷ lệ hoa hồng từ 0 đến 100 phần trăm.'; end if;
  if v_months < 0 or v_months > 60 or v_hold < 0 or v_hold > 365 then raise exception 'INVALID_VALUE: Thời hạn hưởng 0–60 tháng, số ngày chờ 0–365.'; end if;
  if exists (select 1 from referral_partners where code = v_code and id is distinct from p_id) then raise exception 'CODE_IN_USE: Mã này đã có người dùng.'; end if;
  if p_id is null then
    insert into referral_partners (code, kind, name, phone, bank_info, commission_pct, renewal_pct, months_eligible, hold_days, active, note, signed_at, created_by)
      values (v_code, v_kind, v_name, nullif(trim(coalesce(d ->> 'phone', '')), ''), nullif(trim(coalesce(d ->> 'bank_info', '')), ''), v_pct, v_ren, v_months, v_hold,
              coalesce((d ->> 'active')::boolean, true), nullif(trim(coalesce(d ->> 'note', '')), ''), nullif(d ->> 'signed_at', '')::date, auth.uid())
      returning id into v_id;
    perform admin_audit(null, 'create_partner', 'referral_partners', v_id::text, null, jsonb_build_object('code', v_code, 'name', v_name, 'pct', v_pct), null);
  else
    select * into prev from referral_partners where id = p_id for update;
    if prev.id is null then raise exception 'NOT_FOUND: Không tìm thấy đối tác.'; end if;
    update referral_partners set code = v_code, kind = v_kind, name = v_name, phone = nullif(trim(coalesce(d ->> 'phone', '')), ''),
           bank_info = nullif(trim(coalesce(d ->> 'bank_info', '')), ''), commission_pct = v_pct, renewal_pct = v_ren, months_eligible = v_months, hold_days = v_hold,
           active = coalesce((d ->> 'active')::boolean, active), note = nullif(trim(coalesce(d ->> 'note', '')), ''), signed_at = nullif(d ->> 'signed_at', '')::date
     where id = p_id;
    perform admin_audit(null, 'update_partner', 'referral_partners', p_id::text, to_jsonb(prev), jsonb_build_object('code', v_code, 'pct', v_pct, 'active', coalesce((d ->> 'active')::boolean, prev.active)), null);
  end if;
  return v_id;
end $$;

create function admin_commission_pay(p_ids uuid[], p_paid_at date, p_method text, p_note text) returns integer
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform admin_guard();
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'INVALID_VALUE: Hãy chọn khoản hoa hồng cần chi.'; end if;
  if p_paid_at is null or p_paid_at > current_date then raise exception 'INVALID_DATE: Ngày chi không được sau hôm nay.'; end if;
  update referral_commissions set status = 'paid', paid_at = p_paid_at, paid_method = nullif(trim(coalesce(p_method, '')), ''), paid_note = nullif(trim(coalesce(p_note, '')), ''), paid_by = auth.uid()
   where id = any (p_ids) and status = 'open' and payable_after <= current_date;
  get diagnostics n = row_count;
  if n <> cardinality(p_ids) then raise exception 'NOT_PAYABLE: Có khoản chưa đến hạn chi hoặc đã được xử lý. Hãy tải lại danh sách.'; end if;
  perform admin_audit(null, 'pay_commission', 'referral_commissions', array_to_string(p_ids, ','), null, jsonb_build_object('count', n, 'paid_at', p_paid_at), p_note);
  return n;
end $$;

create function admin_commission_void(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard();
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'REASON_REQUIRED: Hãy ghi lý do (ít nhất 5 ký tự), ví dụ khách đã hoàn tiền.'; end if;
  update referral_commissions set status = 'void', void_reason = left(trim(p_reason), 300) where id = p_id and status = 'open';
  if not found then raise exception 'NOT_FOUND: Khoản này không còn ở trạng thái chờ chi.'; end if;
  perform admin_audit(null, 'void_commission', 'referral_commissions', p_id::text, null, null, p_reason);
end $$;

-- Gắn hoặc đổi đối tác cho một cơ sở đã đăng ký (khách quên nhập mã); mã trống = gỡ. Có lý do và nhật ký kiểm toán.
create function admin_org_set_referral(p_org uuid, p_code text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare pid uuid; prev uuid;
begin
  perform admin_guard();
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'REASON_REQUIRED: Hãy ghi lý do (ít nhất 5 ký tự).'; end if;
  select referred_by into prev from organizations where id = p_org;
  if not found then raise exception 'NOT_FOUND: Không tìm thấy cơ sở.'; end if;
  pid := referral_partner_for(p_code);
  if pid is not null and exists (select 1 from referral_partners where id = pid and organization_id = p_org) then
    raise exception 'INVALID_REF: Không thể gắn cơ sở với chính mã của mình.';
  end if;
  update organizations set referred_by = pid, referred_at = case when pid is null then null else now() end where id = p_org;
  perform admin_audit(p_org, 'set_referral', 'organizations', p_org::text, jsonb_build_object('partner', prev), jsonb_build_object('partner', pid), p_reason);
end $$;

create function admin_org_referral(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_guard();
  return (select jsonb_build_object('code', p.code, 'name', p.name, 'kind', p.kind, 'referred_at', o.referred_at)
            from organizations o join referral_partners p on p.id = o.referred_by where o.id = p_org);
end $$;

revoke execute on function my_referral(uuid), admin_partner_list(), admin_partner_detail(uuid), admin_partner_save(uuid, jsonb),
  admin_commission_pay(uuid[], date, text, text), admin_commission_void(uuid, text), admin_org_set_referral(uuid, text, text), admin_org_referral(uuid) from public, anon;
grant execute on function my_referral(uuid), admin_partner_list(), admin_partner_detail(uuid), admin_partner_save(uuid, jsonb),
  admin_commission_pay(uuid[], date, text, text), admin_commission_void(uuid, text), admin_org_set_referral(uuid, text, text), admin_org_referral(uuid) to authenticated;
revoke execute on function admin_decide_signup(uuid, boolean, text), admin_list_signups(text), admin_record_payment(uuid, bigint, date, text, text, integer, uuid) from public, anon;
