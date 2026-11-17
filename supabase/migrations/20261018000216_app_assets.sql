-- H9 (D180): sổ tài sản (nhà màng, chuồng, máy bơm, quạt, hệ thống tưới...), khấu hao đường thẳng theo tháng và nhắc bảo dưỡng.
-- Khấu hao KHÔNG tự ghi: chủ xem trước rồi bấm "Ghi khấu hao tháng"; hàm chia vào các vụ bằng allocate_shared_expense (D175, diện tích × số ngày),
-- nhóm theo nơi đặt tài sản (phân khu/ô, hoặc cả cơ sở). Mỗi (tài sản, tháng) chỉ ghi một lần. Quyền theo mục chi phí (expenses view/edit).

create table assets (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  area_id uuid references production_areas(id),                         -- null = dùng chung cả cơ sở
  name text not null check (length(trim(name)) between 1 and 80),
  kind text not null default 'other' check (kind in ('greenhouse', 'barn', 'pump', 'irrigation', 'fan', 'vehicle', 'machine', 'other')),
  purchase_date date not null,
  cost bigint not null check (cost > 0 and cost < 100000000000),
  life_years numeric(4,1) not null check (life_years >= 0.5 and life_years <= 50),
  salvage bigint not null default 0 check (salvage >= 0),
  status text not null default 'active' check (status in ('active', 'disposed')),
  disposed_date date,
  maintain_every_months integer check (maintain_every_months is null or maintain_every_months between 1 and 120),
  last_maintained_on date,
  note text check (note is null or length(note) <= 300),
  version integer not null default 1,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (salvage <= cost),
  check ((status = 'disposed') = (disposed_date is not null))
);
create index on assets (organization_id, status);

create table asset_depreciation_posts (
  asset_id uuid not null references assets(id) on delete cascade,
  month date not null check (month = date_trunc('month', month)::date),
  organization_id uuid not null references organizations(id) on delete cascade,
  amount bigint not null,
  posted_by uuid references auth.users(id) default auth.uid(),
  posted_at timestamptz not null default now(),
  primary key (asset_id, month)
);

create table asset_maintenance (
  id uuid primary key,
  asset_id uuid not null references assets(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  done_on date not null,
  note text check (note is null or length(note) <= 300),
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index on asset_maintenance (asset_id, done_on desc);

alter table assets enable row level security;
alter table asset_depreciation_posts enable row level security;
alter table asset_maintenance enable row level security;
create policy assets_read on assets for select to authenticated using (has_perm(organization_id, 'expenses', 'view'));
create policy asset_posts_read on asset_depreciation_posts for select to authenticated using (has_perm(organization_id, 'expenses', 'view'));
create policy asset_maint_read on asset_maintenance for select to authenticated using (has_perm(organization_id, 'expenses', 'view'));
revoke insert, update, delete on assets, asset_depreciation_posts, asset_maintenance from authenticated, anon;

-- Số tiền khấu hao của một tài sản trong một tháng (tháng đầu = tháng SAU tháng mua; tháng cuối gánh phần dư; tháng thanh lý trở đi không tính)
create or replace function asset_month_amount(a assets, m date) returns bigint language sql immutable as $$
  select case
    when a.status = 'disposed' and m >= date_trunc('month', a.disposed_date)::date then 0
    when i < 1 or i > n then 0
    when i = n then (a.cost - a.salvage) - (n - 1) * ((a.cost - a.salvage) / n)
    else (a.cost - a.salvage) / n
  end
  from (select ceil(a.life_years * 12)::integer n,
               ((extract(year from m)::integer - extract(year from a.purchase_date)::integer) * 12
                + extract(month from m)::integer - extract(month from a.purchase_date)::integer) i) x;
$$;

create or replace function asset_guard_manage(p_org uuid) returns void language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not has_perm(p_org, 'expenses', 'edit') then raise exception 'FORBIDDEN: Bạn không có quyền quản lý tài sản (cần quyền sửa mục Chi phí).'; end if;
end $$;
revoke execute on function asset_guard_manage(uuid) from public, anon;

create or replace function create_asset(p_id uuid, p_org uuid, p_name text, p_kind text, p_area uuid, p_date date, p_cost bigint, p_life numeric, p_salvage bigint,
                                        p_every integer, p_note text) returns assets
language plpgsql security definer set search_path = public as $$
declare r assets;
begin
  perform asset_guard_manage(p_org);
  select * into r from assets where id = p_id;
  if r.id is not null then
    if r.organization_id <> p_org then raise exception 'FORBIDDEN: Mã tài sản đã tồn tại ở nơi khác.'; end if;
    return r;                                                                                           -- bấm lặp không nhân đôi
  end if;
  if p_area is not null and not exists (select 1 from production_areas where id = p_area and organization_id = p_org) then raise exception 'NOT_FOUND: Không tìm thấy khu của cơ sở.'; end if;
  if p_date is null or p_date > vn_today() then raise exception 'INVALID_DATE: Ngày mua không được ở tương lai.'; end if;
  if coalesce(p_salvage, 0) > p_cost then raise exception 'INVALID_AMOUNT: Giá trị thanh lý không được lớn hơn giá mua.'; end if;
  insert into assets (id, organization_id, area_id, name, kind, purchase_date, cost, life_years, salvage, maintain_every_months, note)
  values (p_id, p_org, p_area, trim(p_name), coalesce(p_kind, 'other'), p_date, p_cost, p_life, coalesce(p_salvage, 0), p_every, nullif(trim(coalesce(p_note, '')), ''))
  returning * into r;
  insert into audit_events (organization_id, actor_id, action, entity, entity_id, after)
  values (p_org, auth.uid(), 'create_asset', 'asset', r.id::text, jsonb_build_object('name', r.name, 'cost', r.cost));
  return r;
end $$;

create or replace function update_asset(p_id uuid, p_version integer, p_name text, p_kind text, p_area uuid, p_date date, p_cost bigint, p_life numeric,
                                        p_salvage bigint, p_every integer, p_note text) returns assets
language plpgsql security definer set search_path = public as $$
declare r assets;
begin
  select * into r from assets where id = p_id for update;
  if r.id is null then raise exception 'NOT_FOUND: Không tìm thấy tài sản.'; end if;
  perform asset_guard_manage(r.organization_id);
  if r.version <> p_version then raise exception 'CONFLICT: Tài sản vừa được người khác sửa. Hãy tải lại bản mới.'; end if;
  if p_area is not null and not exists (select 1 from production_areas where id = p_area and organization_id = r.organization_id) then raise exception 'NOT_FOUND: Không tìm thấy khu của cơ sở.'; end if;
  if (p_cost <> r.cost or p_life <> r.life_years or coalesce(p_salvage, 0) <> r.salvage or p_date <> r.purchase_date)
     and exists (select 1 from asset_depreciation_posts where asset_id = p_id) then
    raise exception 'LOCKED: Tài sản đã ghi khấu hao nên không đổi được giá mua, ngày mua, số năm dùng và giá trị thanh lý.';
  end if;
  if p_date > vn_today() then raise exception 'INVALID_DATE: Ngày mua không được ở tương lai.'; end if;
  if coalesce(p_salvage, 0) > p_cost then raise exception 'INVALID_AMOUNT: Giá trị thanh lý không được lớn hơn giá mua.'; end if;
  update assets set name = trim(p_name), kind = coalesce(p_kind, 'other'), area_id = p_area, purchase_date = p_date, cost = p_cost, life_years = p_life,
         salvage = coalesce(p_salvage, 0), maintain_every_months = p_every, note = nullif(trim(coalesce(p_note, '')), ''), version = version + 1
   where id = p_id returning * into r;
  insert into audit_events (organization_id, actor_id, action, entity, entity_id, after)
  values (r.organization_id, auth.uid(), 'update_asset', 'asset', r.id::text, jsonb_build_object('name', r.name, 'cost', r.cost));
  return r;
end $$;

-- Thanh lý (ngừng tính khấu hao từ tháng thanh lý)
create or replace function dispose_asset(p_id uuid, p_version integer, p_date date) returns assets
language plpgsql security definer set search_path = public as $$
declare r assets;
begin
  select * into r from assets where id = p_id for update;
  if r.id is null then raise exception 'NOT_FOUND: Không tìm thấy tài sản.'; end if;
  perform asset_guard_manage(r.organization_id);
  if r.version <> p_version then raise exception 'CONFLICT: Tài sản vừa được người khác sửa. Hãy tải lại bản mới.'; end if;
  if r.status = 'disposed' then return r; end if;
  if p_date is null or p_date < r.purchase_date or p_date > vn_today() then raise exception 'INVALID_DATE: Ngày thanh lý chưa đúng.'; end if;
  update assets set status = 'disposed', disposed_date = p_date, version = version + 1 where id = p_id returning * into r;
  insert into audit_events (organization_id, actor_id, action, entity, entity_id) values (r.organization_id, auth.uid(), 'dispose_asset', 'asset', r.id::text);
  return r;
end $$;

-- Xóa tài sản nhập nhầm: chỉ khi chưa ghi khấu hao
create or replace function delete_asset(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r assets;
begin
  select * into r from assets where id = p_id;
  if r.id is null then return; end if;
  perform asset_guard_manage(r.organization_id);
  if exists (select 1 from asset_depreciation_posts where asset_id = p_id) then raise exception 'LOCKED: Tài sản đã ghi khấu hao nên không xóa được; hãy thanh lý.'; end if;
  delete from assets where id = p_id;
  insert into audit_events (organization_id, actor_id, action, entity, entity_id, after)
  values (r.organization_id, auth.uid(), 'delete_asset', 'asset', r.id::text, jsonb_build_object('name', r.name));
end $$;

-- Xem trước khấu hao một tháng (chỉ tháng đã qua hết)
create or replace function preview_asset_depreciation(p_org uuid, p_month date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m date := date_trunc('month', p_month)::date;
begin
  if auth.uid() is null or not has_perm(p_org, 'expenses', 'view') then raise exception 'FORBIDDEN: Bạn không có quyền xem chi phí.'; end if;
  if (m + interval '1 month')::date - 1 > vn_today() then raise exception 'INVALID_DATE: Chỉ ghi khấu hao cho tháng đã qua hết.'; end if;
  return jsonb_build_object(
    'month', m,
    'manual_exists', exists (select 1 from expense_records e join production_cycles c on c.id = e.cycle_id
                              where c.owner_org_id = p_org and e.category = 'depreciation' and e.kind <> 'allocated' and e.voided_at is null
                                and e.expense_date >= m and e.expense_date < (m + interval '1 month')::date),
    'items', coalesce((select jsonb_agg(jsonb_build_object('asset_id', a.id, 'name', a.name, 'area_id', a.area_id, 'area_name', pa.name,
                         'amount', asset_month_amount(a, m), 'posted', p.asset_id is not null) order by a.name)
                         from assets a left join production_areas pa on pa.id = a.area_id
                         left join asset_depreciation_posts p on p.asset_id = a.id and p.month = m
                        where a.organization_id = p_org and asset_month_amount(a, m) > 0), '[]'::jsonb));
end $$;
revoke execute on function preview_asset_depreciation(uuid, date) from public, anon;
grant execute on function preview_asset_depreciation(uuid, date) to authenticated, service_role;

-- Ghi khấu hao một tháng: chia vào các vụ theo nơi đặt tài sản. Nhóm không có vụ nào chạy ở đó trong tháng thì để lại (chưa ghi), báo riêng.
create or replace function post_asset_depreciation(p_org uuid, p_month date, p_op uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m date := date_trunc('month', p_month)::date; g record; res jsonb; created integer := 0; assets_done integer := 0; skipped integer := 0; names text;
begin
  perform asset_guard_manage(p_org);
  if p_op is null then raise exception 'INVALID_ARGUMENT: Thiếu mã thao tác.'; end if;
  if (m + interval '1 month')::date - 1 > vn_today() then raise exception 'INVALID_DATE: Chỉ ghi khấu hao cho tháng đã qua hết.'; end if;
  for g in
    select a.area_id, sum(asset_month_amount(a, m))::bigint total, string_agg(a.name, ', ' order by a.name) nm, array_agg(a.id) ids, array_agg(asset_month_amount(a, m)) amts
      from assets a
     where a.organization_id = p_org and asset_month_amount(a, m) > 0
       and not exists (select 1 from asset_depreciation_posts p where p.asset_id = a.id and p.month = m)
     group by a.area_id
  loop
    names := left(g.nm, 120);
    begin
      res := allocate_shared_expense(p_org, g.area_id, m, ((m + interval '1 month')::date - 1), g.total, 'depreciation', 'Khấu hao tài sản: ' || names,
                                     md5(p_op::text || ':' || coalesce(g.area_id::text, 'all'))::uuid);
    exception when others then
      if sqlerrm like 'NO_CYCLES%' then skipped := skipped + 1; continue; end if;
      raise;
    end;
    for i in 1 .. array_length(g.ids, 1) loop
      insert into asset_depreciation_posts (asset_id, month, organization_id, amount) values (g.ids[i], m, p_org, g.amts[i]) on conflict do nothing;
      assets_done := assets_done + 1;
    end loop;
    created := created + coalesce((res->>'created')::integer, 0);
  end loop;
  insert into audit_events (organization_id, actor_id, action, entity, entity_id, after)
  values (p_org, auth.uid(), 'post_asset_depreciation', 'asset', m::text, jsonb_build_object('assets', assets_done, 'skipped_groups', skipped));
  return jsonb_build_object('assets', assets_done, 'created', created, 'skipped_groups', skipped);
end $$;
revoke execute on function post_asset_depreciation(uuid, date, uuid) from public, anon;
grant execute on function post_asset_depreciation(uuid, date, uuid) to authenticated, service_role;

-- Ghi một lần bảo dưỡng (thêm mới, bấm lặp không nhân đôi)
create or replace function record_asset_maintenance(p_id uuid, p_asset uuid, p_date date, p_note text) returns assets
language plpgsql security definer set search_path = public as $$
declare r assets;
begin
  select * into r from assets where id = p_asset for update;
  if r.id is null then raise exception 'NOT_FOUND: Không tìm thấy tài sản.'; end if;
  perform asset_guard_manage(r.organization_id);
  if p_date is null or p_date > vn_today() or p_date < r.purchase_date then raise exception 'INVALID_DATE: Ngày bảo dưỡng chưa đúng.'; end if;
  insert into asset_maintenance (id, asset_id, organization_id, done_on, note) values (p_id, p_asset, r.organization_id, p_date, nullif(trim(coalesce(p_note, '')), ''))
  on conflict (id) do nothing;
  update assets set last_maintained_on = greatest(coalesce(last_maintained_on, p_date), p_date) where id = p_asset returning * into r;
  return r;
end $$;

revoke execute on function create_asset(uuid, uuid, text, text, uuid, date, bigint, numeric, bigint, integer, text) from public, anon;
revoke execute on function update_asset(uuid, integer, text, text, uuid, date, bigint, numeric, bigint, integer, text) from public, anon;
revoke execute on function dispose_asset(uuid, integer, date) from public, anon;
revoke execute on function delete_asset(uuid) from public, anon;
revoke execute on function record_asset_maintenance(uuid, uuid, date, text) from public, anon;
grant execute on function create_asset(uuid, uuid, text, text, uuid, date, bigint, numeric, bigint, integer, text) to authenticated, service_role;
grant execute on function update_asset(uuid, integer, text, text, uuid, date, bigint, numeric, bigint, integer, text) to authenticated, service_role;
grant execute on function dispose_asset(uuid, integer, date) to authenticated, service_role;
grant execute on function delete_asset(uuid) to authenticated, service_role;
grant execute on function record_asset_maintenance(uuid, uuid, date, text) to authenticated, service_role;
