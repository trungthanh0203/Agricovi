-- D83 (tiếp): PHẠM VI THEO TRANG TRẠI. Mỗi thành viên (không phải chủ) có thể được giao một số trang trại; chỉ thấy và ghi vụ,
-- nhật ký, thu hoạch của các trang trại đó. Một người làm được nhiều trang trại. Mặc định (area_ids rỗng/null) = tất cả trang trại.
-- Dữ liệu toàn cơ sở (Kho, Chi phí, Doanh thu, Khách hàng, Khai báo, Nhân sự) không chia theo trang trại, vẫn theo quyền từng mục.
-- Ép ở CSDL qua các hàm truy cập vụ (can_read_cycle, can_log_cycle, can_manage_cycle, can_create_cycle, can_read_area).

alter table organization_memberships add column area_ids uuid[];   -- null = mọi trang trại của cơ sở này

-- Người đang đăng nhập có được làm việc ở trang trại này (theo tư cách thành viên của cơ sở p_org) không.
-- Chỉ hạn chế với trang trại thuộc chính cơ sở p_org (trang trại của hộ khác, ví dụ hộ ghi theo HTX, không bị hạn chế ở đây).
create or replace function scope_ok(p_org uuid, p_area uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
             when 'owner' = any (m.roles) or m.area_ids is null then true
             when (select a.organization_id from production_areas a where a.id = p_area) is distinct from p_org then true
             else p_area = any (m.area_ids)
           end
      from organization_memberships m
     where m.organization_id = p_org and m.user_id = auth.uid() and m.status = 'active'), false);
$$;

create or replace function cycle_area(c uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select area_id from production_cycles where id = c;
$$;

create or replace function can_read_cycle(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (is_org_member(cycle_owner_org(c)) and scope_ok(cycle_owner_org(c), cycle_area(c)))
      or (is_org_member(cycle_area_org(c)) and scope_ok(cycle_area_org(c), cycle_area(c)));
$$;

create or replace function can_log_cycle(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (has_org_role(cycle_owner_org(c), array['owner','manager','worker']::member_role[]) and scope_ok(cycle_owner_org(c), cycle_area(c)))
      or (has_org_role(cycle_area_org(c), array['owner','manager','worker']::member_role[]) and scope_ok(cycle_area_org(c), cycle_area(c)));
$$;

create or replace function can_manage_cycle(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (has_org_role(cycle_owner_org(c), array['owner','manager']::member_role[]) and scope_ok(cycle_owner_org(c), cycle_area(c)))
      or (has_org_role(cycle_area_org(c), array['owner','manager']::member_role[]) and scope_ok(cycle_area_org(c), cycle_area(c)));
$$;

create or replace function can_create_cycle(owner_org uuid, area uuid) returns boolean
language sql stable security definer set search_path = public as $$
  with a as (select organization_id as area_org from production_areas where id = area)
  select exists (
    select 1 from a where scope_ok(a.area_org, area) and (
      (owner_org = a.area_org and has_org_role(owner_org, array['owner','manager']::member_role[]))
      or (has_org_role(a.area_org, array['owner','manager']::member_role[])
          and exists (select 1 from cooperative_memberships cm
                      where cm.household_org_id = a.area_org and cm.cooperative_org_id = owner_org and cm.status = 'active'))
    )
  );
$$;

create or replace function can_read_area(area uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (is_org_member(a.organization_id) and scope_ok(a.organization_id, area))
      or exists (select 1 from production_cycles pc
                 where pc.area_id = area and is_org_member(pc.owner_org_id) and scope_ok(pc.owner_org_id, area))
  from production_areas a where a.id = area;
$$;

-- Chủ giao trang trại cho người (null hoặc rỗng = tất cả trang trại)
create or replace function set_member_areas(p_org uuid, p_user uuid, p_area_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare r member_role[]; bad integer; ids uuid[] := p_area_ids;
begin
  if not has_org_role(p_org, array['owner']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở được giao trang trại.';
  end if;
  select roles into r from organization_memberships where organization_id = p_org and user_id = p_user and status in ('active', 'suspended');
  if r is null then raise exception 'NOT_FOUND: Không tìm thấy thành viên này.'; end if;
  if 'owner' = any (r) then raise exception 'INVALID_TARGET: Chủ cơ sở luôn thấy mọi trang trại.'; end if;
  if ids is not null and cardinality(ids) = 0 then ids := null; end if;
  if ids is not null then
    select count(*) into bad from unnest(ids) x
     where not exists (select 1 from production_areas a where a.id = x and a.organization_id = p_org);
    if bad > 0 then raise exception 'INVALID_AREA: Có trang trại không thuộc cơ sở này.'; end if;
  end if;
  update organization_memberships set area_ids = ids where organization_id = p_org and user_id = p_user;
end $$;
revoke execute on function scope_ok(uuid, uuid), cycle_area(uuid), set_member_areas(uuid, uuid, uuid[]) from public, anon;
grant execute on function scope_ok(uuid, uuid), cycle_area(uuid), set_member_areas(uuid, uuid, uuid[]) to authenticated, service_role;

-- Chính sách xem khu trồng và vụ (dựa vào cột của chính hàng, xem bẫy số 1 trong CLAUDE.md) có tính phạm vi
drop policy cycles_read on production_cycles;
create policy cycles_read on production_cycles for select to authenticated
  using ((is_org_member(owner_org_id) and scope_ok(owner_org_id, area_id))
      or (is_org_member(area_org(area_id)) and scope_ok(area_org(area_id), area_id)));

drop policy areas_read on production_areas;
create policy areas_read on production_areas for select to authenticated
  using ((is_org_member(organization_id) and scope_ok(organization_id, id)) or can_read_area(id));
