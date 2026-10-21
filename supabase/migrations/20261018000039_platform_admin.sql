-- D53: TRANG QUẢN TRỊ NỀN TẢNG (giai đoạn 1) + CÔNG KHAI VỤ LÊN WEBSITE (chủ cơ sở tự bấm, không tự công khai).
-- Quản trị viên chỉ xem số liệu tổng hợp và thông tin cơ sở (tên, chủ, gói, số vụ, số người, hoạt động gần nhất), KHÔNG đọc nhật ký,
-- chi phí, tiền công của nhà vườn. Mọi thao tác ghi đều qua hàm có kiểm quyền và ghi nhật ký kiểm toán (audit_events).

create or replace function admin_guard() returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'FORBIDDEN: Chỉ quản trị viên nền tảng được thực hiện.'; end if;
end $$;

create or replace function admin_audit(p_org uuid, p_action text, p_entity text, p_entity_id text, p_before jsonb, p_after jsonb, p_reason text) returns void
language sql security definer set search_path = public as $$
  insert into audit_events (organization_id, actor_id, action, entity, entity_id, before, after, reason)
  values (p_org, auth.uid(), p_action, p_entity, p_entity_id, p_before, p_after, p_reason);
$$;

-- Quản trị viên nền tảng đồng thời là kiểm duyệt viên (một người điều hành); có thể tách bằng bảng platform_reviewers sau này
create or replace function is_platform_reviewer() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_reviewers where user_id = auth.uid()) or is_platform_admin();
$$;

-- Trạng thái gói hiệu lực của một cơ sở: trial / active / expired / suspended / none
create or replace function org_sub_status(p_org uuid) returns text language sql stable security definer set search_path = public as $$
  select coalesce((select case when s.status in ('trial', 'active') and now() >= s.period_end then 'expired' else s.status::text end
                     from subscriptions s where s.organization_id = p_org order by s.period_end desc limit 1), 'none');
$$;

-- ---------------------------------------------------------------------------
-- Tổng quan
-- ---------------------------------------------------------------------------
create or replace function admin_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_guard();
  return jsonb_build_object(
    'orgs_total', (select count(*) from organizations),
    'orgs_new_30d', (select count(*) from organizations where created_at >= now() - interval '30 days'),
    'by_status', coalesce((select jsonb_object_agg(s, n) from (select org_sub_status(o.id) s, count(*) n from organizations o group by 1) x), '{}'),
    'cycles_active', (select count(*) from production_cycles where status = 'active'),
    'users_total', (select count(distinct user_id) from organization_memberships where status = 'active'),
    'expiring', coalesce((select jsonb_agg(jsonb_build_object('org_id', e.id, 'name', e.name, 'status', e.st, 'period_end', e.pe) order by e.pe)
                            from (select o.id, o.name, org_sub_status(o.id) st,
                                         (select s.period_end from subscriptions s where s.organization_id = o.id order by s.period_end desc limit 1) pe
                                    from organizations o) e
                           where e.st in ('trial', 'active') and e.pe < now() + interval '14 days'), '[]'),
    'revenue_by_month', coalesce((select jsonb_agg(jsonb_build_object('month', m, 'amount', a) order by m)
                                    from (select to_char(paid_at, 'YYYY-MM') m, sum(amount) a from payment_records
                                           where paid_at >= current_date - 365 group by 1) r), '[]'),
    'public_cycles', (select count(*) from public_cycles where is_visible),
    'pending_reviews', (select count(*) from business_profiles where status = 'pending_review')
  );
end $$;

-- ---------------------------------------------------------------------------
-- Cơ sở
-- ---------------------------------------------------------------------------
create or replace function admin_list_orgs(p_search text default null, p_status text default null, p_limit integer default 50, p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare q text := nullif(trim(coalesce(p_search, '')), ''); total integer; rows jsonb;
begin
  perform admin_guard();
  select count(*) into total from organizations o
   where (q is null or o.name ilike '%' || q || '%'
          or exists (select 1 from organization_memberships m join auth.users u on u.id = m.user_id
                      where m.organization_id = o.id and 'owner' = any (m.roles) and u.email ilike '%' || q || '%'))
     and (p_status is null or org_sub_status(o.id) = p_status);
  select coalesce(jsonb_agg(r order by r ->> 'created_at' desc), '[]') into rows from (
    select jsonb_build_object(
      'id', o.id, 'name', o.name, 'type', o.type, 'created_at', o.created_at,
      'owner_email', (select u.email from organization_memberships m join auth.users u on u.id = m.user_id
                       where m.organization_id = o.id and 'owner' = any (m.roles) order by m.created_at limit 1),
      'status', org_sub_status(o.id),
      'plan', (select t.name from subscriptions s join plan_tiers t on t.id = s.plan_tier_id where s.organization_id = o.id order by s.period_end desc limit 1),
      'period_end', (select s.period_end from subscriptions s where s.organization_id = o.id order by s.period_end desc limit 1),
      'max_cycles', (select s.max_cycles from subscriptions s where s.organization_id = o.id order by s.period_end desc limit 1),
      'used_cycles', (select count(*) from production_cycles c where c.owner_org_id = o.id and c.status in ('active', 'paused')),
      'members', (select count(*) from organization_memberships m where m.organization_id = o.id and m.status in ('active', 'suspended'))
    ) r
      from organizations o
     where (q is null or o.name ilike '%' || q || '%'
            or exists (select 1 from organization_memberships m join auth.users u on u.id = m.user_id
                        where m.organization_id = o.id and 'owner' = any (m.roles) and u.email ilike '%' || q || '%'))
       and (p_status is null or org_sub_status(o.id) = p_status)
     order by o.created_at desc limit greatest(1, least(coalesce(p_limit, 50), 200)) offset greatest(0, coalesce(p_offset, 0))
  ) x;
  return jsonb_build_object('total', total, 'rows', rows);
end $$;

create or replace function admin_org_detail(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_guard();
  if not exists (select 1 from organizations where id = p_org) then raise exception 'NOT_FOUND: Không tìm thấy cơ sở.'; end if;
  return jsonb_build_object(
    'org', (select to_jsonb(o) - 'created_by' from organizations o where o.id = p_org),
    'owner_email', (select u.email from organization_memberships m join auth.users u on u.id = m.user_id
                     where m.organization_id = p_org and 'owner' = any (m.roles) order by m.created_at limit 1),
    'status', org_sub_status(p_org),
    'members', (select count(*) from organization_memberships where organization_id = p_org and status = 'active'),
    'members_suspended', (select count(*) from organization_memberships where organization_id = p_org and status = 'suspended'),
    'staff_accounts', (select count(*) from staff_accounts where organization_id = p_org),
    'cycles', coalesce((select jsonb_object_agg(status, n) from (select status::text, count(*) n from production_cycles where owner_org_id = p_org group by 1) c), '{}'),
    'last_activity', (select max(received_at) from activity_logs where organization_id = p_org),
    'subscriptions', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'plan', t.name, 'status', s.status, 'max_cycles', s.max_cycles,
                                  'price_per_quarter', s.price_per_quarter, 'period_start', s.period_start, 'period_end', s.period_end) order by s.period_end desc)
                                from subscriptions s join plan_tiers t on t.id = s.plan_tier_id where s.organization_id = p_org), '[]'),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'amount', p.amount, 'paid_at', p.paid_at, 'method', p.method, 'note', p.note) order by p.paid_at desc)
                            from payment_records p join subscriptions s on s.id = p.subscription_id where s.organization_id = p_org), '[]'),
    'published_profile', (select jsonb_build_object('status', b.status, 'slug', b.slug) from business_profiles b where b.organization_id = p_org)
  );
end $$;

-- Đổi gói / đặt hạn cho một cơ sở (tạo đăng ký gói mới, kết thúc gói đang chạy)
create or replace function admin_set_org_plan(p_org uuid, p_plan uuid, p_period_end timestamptz, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare t plan_tiers; o organizations; sid uuid; prev subscriptions;
begin
  perform admin_guard();
  if p_reason is null or length(trim(p_reason)) < 5 then raise exception 'REASON_REQUIRED: Hãy ghi lý do (ít nhất 5 ký tự).'; end if;
  select * into o from organizations where id = p_org;
  select * into t from plan_tiers where id = p_plan;
  if o.id is null or t.id is null then raise exception 'NOT_FOUND: Không tìm thấy cơ sở hoặc gói.'; end if;
  if t.org_type <> o.type then raise exception 'INVALID_PLAN: Gói này dành cho loại cơ sở khác.'; end if;
  if p_period_end is null or p_period_end <= now() then raise exception 'INVALID_DATE: Hạn dùng phải ở tương lai.'; end if;
  select * into prev from subscriptions where organization_id = p_org order by period_end desc limit 1;
  update subscriptions set period_end = case when period_start > now() then period_end else now() end,
             status = case when period_start > now() then 'expired'::subscription_status else status end
       where organization_id = p_org and period_end > now();
  insert into subscriptions (organization_id, plan_tier_id, status, max_cycles, price_per_quarter, ranking_weight, period_start, period_end, activated_by)
    values (p_org, t.id, 'active', t.max_cycles, t.price_per_quarter, t.ranking_weight, now(), p_period_end, auth.uid()) returning id into sid;
  perform admin_audit(p_org, 'set_plan', 'subscription', sid::text, to_jsonb(prev), jsonb_build_object('plan', t.name, 'period_end', p_period_end), trim(p_reason));
  return sid;
end $$;

-- Ghi nhận thu tiền thủ công và gia hạn p_quarters quý (nối tiếp hạn hiện tại; đang dùng thử thì tính từ hôm nay)
create or replace function admin_record_payment(p_org uuid, p_amount bigint, p_paid_at date, p_method text, p_note text, p_quarters integer, p_plan uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare prev subscriptions; t plan_tiers; v_start timestamptz; sid uuid; plan_id uuid;
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
    values (sid, p_amount, p_paid_at, nullif(trim(coalesce(p_method, '')), ''), nullif(trim(coalesce(p_note, '')), ''), auth.uid());
  perform admin_audit(p_org, 'record_payment', 'subscription', sid::text, null,
                      jsonb_build_object('amount', p_amount, 'quarters', p_quarters, 'plan', t.name, 'paid_at', p_paid_at), null);
  return sid;
end $$;

create or replace function admin_set_org_suspended(p_org uuid, p_suspended boolean, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare prev subscriptions;
begin
  perform admin_guard();
  if p_reason is null or length(trim(p_reason)) < 5 then raise exception 'REASON_REQUIRED: Hãy ghi lý do (ít nhất 5 ký tự).'; end if;
  select * into prev from subscriptions where organization_id = p_org order by period_end desc limit 1;
  if prev.id is null then raise exception 'NOT_FOUND: Cơ sở chưa có gói nào.'; end if;
  update subscriptions set status = case when p_suspended then 'suspended'::subscription_status
                                         when exists (select 1 from payment_records p where p.subscription_id = prev.id) then 'active'::subscription_status
                                         else 'trial'::subscription_status end
   where id = prev.id;
  perform admin_audit(p_org, case when p_suspended then 'suspend_org' else 'unsuspend_org' end, 'subscription', prev.id::text,
                      jsonb_build_object('status', prev.status), jsonb_build_object('suspended', p_suspended), trim(p_reason));
end $$;

-- ---------------------------------------------------------------------------
-- Gói, cấu hình, nhật ký kiểm toán
-- ---------------------------------------------------------------------------
create or replace function admin_save_plan(p_id uuid, p_org_type org_type, p_name text, p_max_cycles integer, p_price bigint, p_weight numeric, p_trial_default boolean, p_active boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := coalesce(p_id, gen_random_uuid()); prev plan_tiers;
begin
  perform admin_guard();
  if p_name is null or length(trim(p_name)) < 2 then raise exception 'INVALID_NAME: Tên gói cần ít nhất 2 ký tự.'; end if;
  if p_max_cycles is null or p_max_cycles < 1 then raise exception 'INVALID_LIMIT: Số vụ tối đa phải từ 1.'; end if;
  if p_price is null or p_price < 0 then raise exception 'INVALID_PRICE: Giá không hợp lệ.'; end if;
  if p_id is not null then select * into prev from plan_tiers where id = p_id; end if;
  if coalesce(p_trial_default, false) then update plan_tiers set is_trial_default = false where org_type = p_org_type and id <> v_id; end if;
  insert into plan_tiers (id, org_type, name, max_cycles, price_per_quarter, ranking_weight, is_trial_default, is_active)
    values (v_id, p_org_type, trim(p_name), p_max_cycles, p_price, coalesce(p_weight, 0), coalesce(p_trial_default, false), coalesce(p_active, true))
  on conflict (id) do update set org_type = excluded.org_type, name = excluded.name, max_cycles = excluded.max_cycles, price_per_quarter = excluded.price_per_quarter,
    ranking_weight = excluded.ranking_weight, is_trial_default = excluded.is_trial_default, is_active = excluded.is_active;
  perform admin_audit(null, case when p_id is null then 'create_plan' else 'update_plan' end, 'plan_tier', v_id::text, to_jsonb(prev),
                      jsonb_build_object('name', p_name, 'max_cycles', p_max_cycles, 'price', p_price, 'weight', p_weight, 'active', p_active), null);
  return v_id;
end $$;

create or replace function admin_set_setting(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare prev jsonb;
begin
  perform admin_guard();
  if p_key not in ('trial_days', 'ranking', 'login_email_domain', 'staff_temp_password_days', 'expiry_reminder_days') then
    raise exception 'INVALID_KEY: Cấu hình này không được sửa ở đây.';
  end if;
  select value into prev from platform_settings where key = p_key;
  insert into platform_settings (key, value) values (p_key, p_value)
    on conflict (key) do update set value = excluded.value;
  perform admin_audit(null, 'set_setting', 'platform_setting', p_key, to_jsonb(prev), p_value, null);
end $$;

create or replace function admin_list_audit(p_limit integer default 100) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_guard();
  return coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'at', a.created_at, 'actor', u.email, 'org', o.name, 'action', a.action,
                                    'entity', a.entity, 'entity_id', a.entity_id, 'before', a.before, 'after', a.after, 'reason', a.reason) order by a.id desc)
                     from (select * from audit_events order by id desc limit greatest(1, least(coalesce(p_limit, 100), 500))) a
                     left join auth.users u on u.id = a.actor_id left join organizations o on o.id = a.organization_id), '[]');
end $$;

-- Hồ sơ chờ duyệt / đang công khai (duyệt dùng approve_and_publish, review_profile, hide_profile có sẵn)
create or replace function admin_list_profiles(p_status text default 'pending_review') returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_guard();
  return coalesce((select jsonb_agg(jsonb_build_object('profile_id', b.id, 'org', o.name, 'display_name', b.display_name, 'province', b.province,
                                    'status', b.status, 'slug', b.slug, 'changed_at', b.status_changed_at) order by b.status_changed_at desc)
                     from business_profiles b join organizations o on o.id = b.organization_id
                    where b.status::text = p_status), '[]');
end $$;

-- ---------------------------------------------------------------------------
-- Công khai vụ lên website: chủ cơ sở tự bấm; website chỉ đọc bản chụp này
-- ---------------------------------------------------------------------------
create or replace function cycle_trace_json(p_cycle uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c production_cycles; a production_areas; org_name text; crop text; mats jsonb;
begin
  select * into c from production_cycles where id = p_cycle;
  select * into a from production_areas where id = c.area_id;
  select name into org_name from organizations where id = c.owner_org_id;
  select name into crop from crop_types where id = c.crop_type_id;
  select coalesce(jsonb_agg(jsonb_build_object('name', x.name, 'category', x.category, 'unit', x.unit, 'quantity', x.qty,
                                               'first', x.first_date, 'last', x.last_date) order by x.name), '[]') into mats
    from (
      select m.name, m.category, u.name as unit, sum(-t.quantity_delta) as qty, min(t.txn_date) filter (where t.txn_type = 'issue') as first_date,
             max(t.txn_date) filter (where t.txn_type = 'issue') as last_date
        from inventory_transactions t
        join materials m on m.id = t.material_id join units_of_measure u on u.id = m.base_unit_id
       where t.cycle_id = p_cycle and (t.txn_type = 'issue' or (t.txn_type = 'adjustment' and t.reverses_txn_id is not null))
       group by m.name, m.category, u.name
      having sum(-t.quantity_delta) > 0
    ) x;
  return jsonb_build_object(
    'cycle_id', c.id, 'name', cycle_label(c.id), 'crop', crop, 'org', org_name, 'status', c.status,
    'farm', a.name, 'location', a.location, 'area_size', a.area_size, 'area_unit', a.area_unit,
    'start_date', c.start_date, 'expected_end_date', c.expected_end_date, 'end_date', c.end_date,
    'template', c.template_name, 'materials', mats, 'generated_at', now());
end $$;

create or replace function get_cycle_trace(p_cycle uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from production_cycles where id = p_cycle) or not can_read_cycle(p_cycle) then
    raise exception 'FORBIDDEN: Bạn không có quyền xem vụ này.';
  end if;
  return cycle_trace_json(p_cycle);
end $$;

create table public_cycles (
  cycle_id uuid primary key references production_cycles(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  code text not null unique,
  snapshot jsonb not null,
  is_visible boolean not null default true,
  hidden_by_admin boolean not null default false,
  published_by uuid references auth.users(id) default auth.uid(),
  published_at timestamptz not null default now(),
  version integer not null default 1
);
alter table public_cycles enable row level security;
create policy public_cycles_public_read on public_cycles for select to anon, authenticated using (is_visible);
create policy public_cycles_owner_read on public_cycles for select to authenticated using (has_org_role(organization_id, array['owner']::member_role[]));
grant select on public_cycles to anon;

create or replace function publish_cycle(p_cycle uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c production_cycles; snap jsonb; v_code text; pc public_cycles;
begin
  select * into c from production_cycles where id = p_cycle;
  if c.id is null or not has_org_role(c.owner_org_id, array['owner']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở sở hữu vụ được công khai vụ lên website.';
  end if;
  select * into pc from public_cycles where cycle_id = p_cycle;
  if pc.cycle_id is not null and pc.hidden_by_admin then
    raise exception 'ADMIN_HIDDEN: Vụ này đã bị quản trị viên tạm ẩn. Hãy liên hệ để được xem xét.';
  end if;
  snap := cycle_trace_json(p_cycle) || jsonb_build_object('licenses', (
    select coalesce(jsonb_agg(jsonb_build_object('name', l.name, 'issuer', l.issuer, 'expires', l.expires_date) order by l.name), '[]')
      from org_licenses l where l.organization_id = c.owner_org_id and (l.expires_date is null or l.expires_date >= current_date)));
  v_code := 'VU-' || upper(substr(replace(p_cycle::text, '-', ''), 1, 8));
  insert into public_cycles (cycle_id, organization_id, code, snapshot) values (p_cycle, c.owner_org_id, v_code, snap)
  on conflict (cycle_id) do update set snapshot = excluded.snapshot, is_visible = true, published_at = now(), published_by = auth.uid(),
    version = public_cycles.version + 1;
  return jsonb_build_object('code', v_code);
end $$;

create or replace function unpublish_cycle(p_cycle uuid) returns void
language plpgsql security definer set search_path = public as $$
declare org uuid;
begin
  select organization_id into org from public_cycles where cycle_id = p_cycle;
  if org is null or not has_org_role(org, array['owner']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở được ngừng công khai vụ.';
  end if;
  update public_cycles set is_visible = false where cycle_id = p_cycle;
end $$;

create or replace function admin_list_public_cycles() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_guard();
  return coalesce((select jsonb_agg(jsonb_build_object('cycle_id', p.cycle_id, 'code', p.code, 'name', p.snapshot ->> 'name', 'org', o.name,
                                    'visible', p.is_visible, 'hidden_by_admin', p.hidden_by_admin, 'published_at', p.published_at) order by p.published_at desc)
                     from public_cycles p join organizations o on o.id = p.organization_id), '[]');
end $$;

create or replace function admin_hide_public_cycle(p_cycle uuid, p_hide boolean, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare pc public_cycles;
begin
  perform admin_guard();
  if p_reason is null or length(trim(p_reason)) < 5 then raise exception 'REASON_REQUIRED: Hãy ghi lý do (ít nhất 5 ký tự).'; end if;
  select * into pc from public_cycles where cycle_id = p_cycle;
  if pc.cycle_id is null then raise exception 'NOT_FOUND: Vụ chưa được công khai.'; end if;
  update public_cycles set hidden_by_admin = p_hide, is_visible = case when p_hide then false else is_visible end where cycle_id = p_cycle;
  perform admin_audit(pc.organization_id, case when p_hide then 'hide_public_cycle' else 'unhide_public_cycle' end, 'public_cycle', p_cycle::text,
                      jsonb_build_object('visible', pc.is_visible, 'hidden', pc.hidden_by_admin), jsonb_build_object('hidden', p_hide), trim(p_reason));
end $$;

revoke execute on function admin_guard(), admin_audit(uuid, text, text, text, jsonb, jsonb, text), org_sub_status(uuid), cycle_trace_json(uuid),
  admin_overview(), admin_list_orgs(text, text, integer, integer), admin_org_detail(uuid), admin_set_org_plan(uuid, uuid, timestamptz, text),
  admin_record_payment(uuid, bigint, date, text, text, integer, uuid), admin_set_org_suspended(uuid, boolean, text),
  admin_save_plan(uuid, org_type, text, integer, bigint, numeric, boolean, boolean), admin_set_setting(text, jsonb), admin_list_audit(integer),
  admin_list_profiles(text), publish_cycle(uuid), unpublish_cycle(uuid), admin_list_public_cycles(), admin_hide_public_cycle(uuid, boolean, text),
  get_cycle_trace(uuid) from public, anon;
revoke execute on function admin_audit(uuid, text, text, text, jsonb, jsonb, text), cycle_trace_json(uuid) from authenticated;
grant execute on function admin_overview(), admin_list_orgs(text, text, integer, integer), admin_org_detail(uuid), admin_set_org_plan(uuid, uuid, timestamptz, text),
  admin_record_payment(uuid, bigint, date, text, text, integer, uuid), admin_set_org_suspended(uuid, boolean, text),
  admin_save_plan(uuid, org_type, text, integer, bigint, numeric, boolean, boolean), admin_set_setting(text, jsonb), admin_list_audit(integer),
  admin_list_profiles(text), publish_cycle(uuid), unpublish_cycle(uuid), admin_list_public_cycles(), admin_hide_public_cycle(uuid, boolean, text),
  get_cycle_trace(uuid) to authenticated, service_role;
