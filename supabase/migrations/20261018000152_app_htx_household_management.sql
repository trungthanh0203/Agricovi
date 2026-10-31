-- D148: HTX quản lý hộ thành viên (docs/PLAN_HTX_HO.md, chủ sản phẩm đã đồng ý ngày 31/10/2026).
-- (1) Hộ đồng ý chia sẻ dữ liệu sản xuất cho HTX (xem, không sửa); (2) danh mục sản phẩm HTX bao tiêu;
-- (3) hộ thuộc HTX mà chưa có gói trả phí riêng chỉ tạo "vụ theo HTX"; (4) HTX xem tổng quan sản xuất của từng hộ qua hàm riêng.
-- HTX không đọc thẳng bảng của hộ (không đổi chính sách RLS của vụ/nhật ký): chỉ đọc qua hàm coop_household_overview, có kiểm đồng ý và quyền.

-- ---------------------------------------------------------------------------
-- 1. Đồng ý chia sẻ dữ liệu sản xuất (mức 2). Tài chính (mức 3) và ủy quyền nhập hộ làm ở đợt sau.
-- ---------------------------------------------------------------------------
create table coop_data_sharing (
  household_org_id uuid primary key references organizations(id) on delete cascade,
  cooperative_org_id uuid not null references organizations(id) on delete cascade,
  share_production boolean not null default false,
  consented_by uuid references auth.users(id),
  consented_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table coop_data_sharing enable row level security;
create policy coop_sharing_read on coop_data_sharing for select to authenticated
  using (is_org_member(household_org_id) or has_perm(cooperative_org_id, 'coop', 'view'));
-- ghi chỉ qua hàm

-- hộ đã ở trong HTX từ trước: chưa có bằng chứng đồng ý nên mặc định KHÔNG chia sẻ, chờ hộ xác nhận
insert into coop_data_sharing (household_org_id, cooperative_org_id, share_production)
  select cm.household_org_id, cm.cooperative_org_id, false from cooperative_memberships cm where cm.status = 'active'
  on conflict (household_org_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Danh mục sản phẩm HTX bao tiêu
-- ---------------------------------------------------------------------------
create table coop_procurement_items (
  id uuid primary key default gen_random_uuid(),
  cooperative_org_id uuid not null references organizations(id) on delete cascade,
  crop_type_id uuid not null references crop_types(id),
  ref_price_per_kg bigint check (ref_price_per_kg is null or ref_price_per_kg >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (cooperative_org_id, crop_type_id)
);
alter table coop_procurement_items enable row level security;
create policy coop_procure_read on coop_procurement_items for select to authenticated using (has_perm(cooperative_org_id, 'coop', 'view'));

create or replace function save_procurement_item(p_coop uuid, p_crop uuid, p_price bigint, p_active boolean default true) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if (select type from organizations where id = p_coop) is distinct from 'cooperative' then raise exception 'INVALID_ORG: Chỉ HTX có danh mục bao tiêu.'; end if;
  if not has_perm(p_coop, 'coop', 'edit') then raise exception 'FORBIDDEN: Bạn không có quyền sửa danh mục bao tiêu.'; end if;
  if not exists (select 1 from crop_types c where c.id = p_crop and (c.organization_id is null or c.organization_id = p_coop)) then
    raise exception 'INVALID_CROP: Hãy chọn sản phẩm dùng chung hoặc sản phẩm của HTX.';
  end if;
  insert into coop_procurement_items (cooperative_org_id, crop_type_id, ref_price_per_kg, is_active)
    values (p_coop, p_crop, p_price, coalesce(p_active, true))
  on conflict (cooperative_org_id, crop_type_id) do update set ref_price_per_kg = excluded.ref_price_per_kg, is_active = excluded.is_active
  returning id into v_id;
  return v_id;
end $$;

-- hộ xem HTX mình thuộc có bao tiêu những sản phẩm nào
create or replace function my_coop_procurement(p_household uuid) returns table (crop_type_id uuid, crop_name text, ref_price_per_kg bigint, coop_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_org_member(p_household) then raise exception 'FORBIDDEN'; end if;
  return query
    select i.crop_type_id, c.name, i.ref_price_per_kg, o.name
      from cooperative_memberships cm
      join coop_procurement_items i on i.cooperative_org_id = cm.cooperative_org_id and i.is_active
      join crop_types c on c.id = i.crop_type_id
      join organizations o on o.id = cm.cooperative_org_id
     where cm.household_org_id = p_household and cm.status = 'active'
     order by c.name;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Đồng ý chia sẻ: lúc chấp nhận lời mời và sửa sau; bắt buộc nếu HTX có danh mục bao tiêu
-- ---------------------------------------------------------------------------
create or replace function coop_sharing_required(p_coop uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from coop_procurement_items where cooperative_org_id = p_coop and is_active);
$$;

create or replace function accept_coop_invitation(p_id uuid, p_household uuid, p_share_production boolean default true) returns void
language plpgsql security definer set search_path = public as $$
declare inv cooperative_invitations; v_share boolean;
begin
  select * into inv from cooperative_invitations where id = p_id for update;
  if inv.id is null or inv.status <> 'pending' or inv.email is distinct from current_email() then
    raise exception 'FORBIDDEN: Lời mời không còn hiệu lực hoặc không dành cho bạn';
  end if;
  if not has_org_role(p_household, array['owner']::member_role[])
     or (select type from organizations where id = p_household) <> 'household' then
    raise exception 'FORBIDDEN: Chỉ chủ hộ mới chấp nhận lời mời của HTX';
  end if;
  if exists (select 1 from cooperative_memberships where household_org_id = p_household and status = 'active') then
    raise exception 'ALREADY_IN_COOPERATIVE: Hộ đang thuộc một HTX. Mỗi hộ chỉ thuộc một HTX.';
  end if;
  v_share := coalesce(p_share_production, true) or coop_sharing_required(inv.cooperative_org_id);
  insert into cooperative_memberships (household_org_id, cooperative_org_id, status, joined_at)
    values (p_household, inv.cooperative_org_id, 'active', now());
  insert into coop_data_sharing (household_org_id, cooperative_org_id, share_production, consented_by, consented_at)
    values (p_household, inv.cooperative_org_id, v_share, auth.uid(), now())
  on conflict (household_org_id) do update set cooperative_org_id = excluded.cooperative_org_id, share_production = excluded.share_production,
    consented_by = excluded.consented_by, consented_at = excluded.consented_at, updated_at = now();
  update cooperative_invitations set status = 'accepted', decided_at = now() where id = p_id;
end $$;
revoke execute on function accept_coop_invitation(uuid, uuid, boolean) from public, anon;
grant execute on function accept_coop_invitation(uuid, uuid, boolean) to authenticated;
drop function if exists accept_coop_invitation(uuid, uuid);

create or replace function set_coop_sharing(p_household uuid, p_share_production boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_coop uuid;
begin
  if not has_org_role(p_household, array['owner']::member_role[]) then raise exception 'FORBIDDEN: Chỉ chủ hộ đổi được việc chia sẻ dữ liệu.'; end if;
  select cooperative_org_id into v_coop from cooperative_memberships where household_org_id = p_household and status = 'active';
  if v_coop is null then raise exception 'NOT_IN_COOPERATIVE: Hộ chưa thuộc HTX nào.'; end if;
  if not p_share_production and coop_sharing_required(v_coop) then
    raise exception 'SHARING_REQUIRED: HTX có bao tiêu sản phẩm nên cần xem dữ liệu sản xuất của hộ (để truy xuất nguồn gốc). Hãy liên hệ HTX nếu muốn thay đổi.';
  end if;
  insert into coop_data_sharing (household_org_id, cooperative_org_id, share_production, consented_by, consented_at)
    values (p_household, v_coop, p_share_production, auth.uid(), now())
  on conflict (household_org_id) do update set cooperative_org_id = excluded.cooperative_org_id, share_production = excluded.share_production,
    consented_by = excluded.consented_by, consented_at = excluded.consented_at, updated_at = now();
end $$;

-- hộ xem tình trạng chia sẻ của chính mình
create or replace function my_coop_sharing(p_household uuid) returns table (coop_name text, share_production boolean, required boolean, consented_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_org_member(p_household) then raise exception 'FORBIDDEN'; end if;
  return query
    select o.name, coalesce(s.share_production, false), coop_sharing_required(cm.cooperative_org_id), s.consented_at
      from cooperative_memberships cm join organizations o on o.id = cm.cooperative_org_id
      left join coop_data_sharing s on s.household_org_id = cm.household_org_id
     where cm.household_org_id = p_household and cm.status = 'active';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Hạn mức: hộ thuộc HTX chưa có gói trả phí riêng chỉ tạo "vụ theo HTX"
-- ---------------------------------------------------------------------------
create or replace function org_has_paid_plan(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from current_subscription(p_org) s where s.status = 'active' and s.price_per_quarter > 0);
$$;

drop function if exists quota_contexts(uuid);
create or replace function quota_contexts(p_household uuid) returns table (
  kind text, org_id uuid, org_name text, plan_name text,
  max_cycles integer, used_cycles integer, is_current boolean, allowed boolean, is_default boolean)
language plpgsql stable security definer set search_path = public as $$
declare v_in_coop boolean; v_paid boolean;
begin
  if not has_org_role(p_household, array['owner', 'manager']::member_role[]) then
    raise exception 'FORBIDDEN';
  end if;
  v_in_coop := exists (select 1 from cooperative_memberships where household_org_id = p_household and status = 'active');
  v_paid := org_has_paid_plan(p_household);
  return query
  with ctx as (
    select 'own'::text as kind, o.id as org_id, o.name as org_name
      from organizations o where o.id = p_household
    union all
    select 'cooperative', c.id, c.name
      from cooperative_memberships cm join organizations c on c.id = cm.cooperative_org_id
     where cm.household_org_id = p_household and cm.status = 'active'
  )
  select ctx.kind, ctx.org_id, ctx.org_name,
         pt.name,
         s.max_cycles,
         (select count(*)::int from production_cycles pc
           where pc.owner_org_id = ctx.org_id and pc.status in ('active', 'paused')),
         coalesce(s.status in ('trial', 'active') and now() >= s.period_start and now() < s.period_end, false),
         (ctx.kind = 'cooperative' or not v_in_coop or v_paid),
         (case when v_in_coop and not v_paid then ctx.kind = 'cooperative' else ctx.kind = 'own' end)
    from ctx
    left join lateral (select * from subscriptions s2 where s2.organization_id = ctx.org_id
                        order by s2.period_end desc limit 1) s on true
    left join plan_tiers pt on pt.id = s.plan_tier_id
   order by (ctx.kind = 'own') desc;
end $$;
revoke execute on function quota_contexts(uuid) from public, anon;
grant execute on function quota_contexts(uuid) to authenticated;
revoke execute on function org_has_paid_plan(uuid), coop_sharing_required(uuid) from public, anon;

create or replace function cycle_coop_member_rule() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;   -- nạp dữ liệu hệ thống/quản trị
  if new.status in ('active', 'preparing')
     and (select type from organizations where id = new.owner_org_id) = 'household'
     and exists (select 1 from cooperative_memberships where household_org_id = new.owner_org_id and status = 'active')
     and not org_has_paid_plan(new.owner_org_id) then
    raise exception 'COOP_MEMBER_USE_COOP: Hộ đang thuộc HTX và chưa có gói trả phí riêng nên chỉ tạo "vụ theo HTX". Hãy chọn ghi vụ theo HTX.';
  end if;
  return new;
end $$;
create trigger production_cycles_coop_member before insert on production_cycles for each row execute function cycle_coop_member_rule();

-- ---------------------------------------------------------------------------
-- 5. HTX xem tổng quan sản xuất của một hộ (theo đồng ý), không đọc thẳng bảng của hộ
-- ---------------------------------------------------------------------------
create or replace function coop_household_overview(p_coop uuid, p_household uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_shared boolean; v_owner boolean;
begin
  if not has_perm(p_coop, 'coop', 'view') then raise exception 'FORBIDDEN: Bạn không có quyền xem hộ thành viên.'; end if;
  if not exists (select 1 from cooperative_memberships where household_org_id = p_household and cooperative_org_id = p_coop and status = 'active') then
    raise exception 'NOT_MEMBER: Hộ này không thuộc HTX.';
  end if;
  v_owner := has_org_role(p_household, array['owner']::member_role[]);   -- hộ do HTX tạo: HTX là chủ
  select coalesce(s.share_production, false) into v_shared from coop_data_sharing s where s.household_org_id = p_household and s.cooperative_org_id = p_coop;
  if not (v_owner or coalesce(v_shared, false)) then
    return jsonb_build_object('shared', false, 'cycles', '[]'::jsonb);
  end if;
  return jsonb_build_object('shared', true, 'cycles', coalesce((
    select jsonb_agg(x order by (x->>'status') = 'active' desc, x->>'start_date' desc) from (
      select jsonb_build_object(
        'id', c.id, 'kind', case when c.owner_org_id = p_coop then 'coop' else 'own' end,
        'name', coalesce(nullif(c.name, ''), nullif(c.template_name, ''), 'Vụ'), 'code', c.code, 'crop', cr.name, 'area', a.name,
        'status', c.status, 'start_date', c.start_date, 'expected_end_date', c.expected_end_date,
        'stages_total', (select count(*) from production_stages s where s.cycle_id = c.id),
        'stages_done', (select count(*) from production_stages s where s.cycle_id = c.id and s.status = 'done'),
        'last_log_at', (select max(l.performed_at) from activity_logs l where l.cycle_id = c.id and l.voided_at is null),
        'logs_30d', (select count(*) from activity_logs l where l.cycle_id = c.id and l.voided_at is null and l.performed_at > now() - interval '30 days'),
        'open_incidents', (select count(*) from cycle_incidents i where i.cycle_id = c.id and i.status = 'open' and i.voided_at is null),
        'harvest_kg', coalesce((select sum(h.quantity) from harvest_records h where h.cycle_id = c.id and h.voided_at is null), 0)) as x
        from production_cycles c
        join production_areas a on a.id = c.area_id
        join crop_types cr on cr.id = c.crop_type_id
       where a.organization_id = p_household
    ) q), '[]'::jsonb));
end $$;

revoke execute on function save_procurement_item(uuid, uuid, bigint, boolean), my_coop_procurement(uuid), set_coop_sharing(uuid, boolean),
  my_coop_sharing(uuid), coop_household_overview(uuid, uuid) from public, anon;
grant execute on function save_procurement_item(uuid, uuid, bigint, boolean), my_coop_procurement(uuid), set_coop_sharing(uuid, boolean),
  my_coop_sharing(uuid), coop_household_overview(uuid, uuid) to authenticated;
revoke execute on function cycle_coop_member_rule() from public, anon;
