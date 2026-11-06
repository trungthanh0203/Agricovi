-- Nhiều vụ song song trong một ô sản xuất theo DIỆN TÍCH (docs/PLAN_NHIEU_VU_TRONG_MOT_O.md, GĐ1).
-- Mỗi vụ chiếm một phần diện tích của ô trong một khoảng thời gian; tổng diện tích các vụ chạy cùng lúc không vượt diện tích ô (trừ trồng xen).
-- Vượt thì CẢNH BÁO: chỉ chủ cơ sở xác nhận mới tạo được (vì diện tích ô khai có thể chưa chính xác). Tên vụ, giống, diện tích, số lượng là bắt buộc khi tạo vụ mới.

alter table production_cycles
  add column intercrop boolean not null default false,      -- trồng xen: dùng chung diện tích với vụ khác, không tính vào chỗ đã dùng
  add column over_capacity boolean not null default false;  -- vụ được tạo khi vượt chỗ trống (chủ đã xác nhận)

-- Sức chứa của ô (m²): diện tích riêng của ô; ô cấp cha chưa khai thì cộng các ô con đang dùng. null = chưa khai.
create or replace function area_capacity_m2(p_area uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif(case when a.area_unit = 'ha' then a.area_size * 10000 else a.area_size end, 0),
    (select nullif(sum(case when c.area_unit = 'ha' then c.area_size * 10000 else c.area_size end), 0)
       from production_areas c where c.parent_id = a.id and c.is_active))
  from production_areas a where a.id = p_area;
$$;
revoke execute on function area_capacity_m2(uuid) from public, anon;

-- Chỗ trống của ô trong khoảng p_from..p_to: sức chứa, các vụ đang chiếm chỗ, mức dùng cao nhất và diện tích trống nhỏ nhất trong khoảng đó.
-- Tính các vụ Chuẩn bị, Đang sản xuất, Tạm dừng; vụ trồng xen không tính; vụ chưa khai diện tích tính 0 và được đếm riêng.
create or replace function area_free_m2(p_area uuid, p_from date, p_to date, p_exclude uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a production_areas; cap numeric; f date := coalesce(p_from, vn_today()); t date := coalesce(p_to, coalesce(p_from, vn_today()) + 365); res jsonb;
begin
  select * into a from production_areas where id = p_area;
  if a.id is null or auth.uid() is null or not is_org_member(a.organization_id) then raise exception 'FORBIDDEN: Bạn không xem được ô sản xuất này.'; end if;
  cap := area_capacity_m2(p_area);
  with cy as (
    select c.id, coalesce(nullif(c.name, ''), c.code) nm, c.planted_area_m2 am, c.status::text st, c.intercrop ic,
           coalesce(c.start_date, vn_today()) s, coalesce(c.expected_end_date, 'infinity'::date) e
      from production_cycles c
     where c.area_id = p_area and c.status in ('preparing', 'active', 'paused') and c.id is distinct from p_exclude
       and coalesce(c.start_date, vn_today()) <= t and coalesce(c.expected_end_date, 'infinity'::date) >= f
  ), pts as (
    select f d union select s from cy where s > f and s <= t
  ), pk as (
    select coalesce(max(u), 0) peak from (select d, (select coalesce(sum(am), 0) from cy where not ic and s <= d and e >= d) u from pts) z
  )
  select jsonb_build_object(
    'capacity_m2', cap, 'peak_used_m2', (select peak from pk),
    'free_m2', case when cap is null then null else greatest(0, cap - (select peak from pk)) end,
    'unknown_area_cycles', (select count(*) from cy where am is null),
    'cycles', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', nm, 'area_m2', am, 'status', st, 'intercrop', ic, 'start', s,
                                         'end', case when e = 'infinity'::date then null else e end) order by s) from cy), '[]'::jsonb))
    into res;
  return res;
end $$;
revoke execute on function area_free_m2(uuid, date, date, uuid) from public, anon;
grant execute on function area_free_m2(uuid, date, date, uuid) to authenticated, service_role;

-- Tạo vụ có kiểm tra: tên, giống, diện tích, số lượng bắt buộc; kiểm tra chỗ trống của ô; p_current_tpl có giá trị thì bắt đầu từ giữa chừng (0178).
create or replace function create_cycle_checked(
  p_id uuid, p_owner_org uuid, p_area uuid, p_template uuid, p_start date, p_status cycle_status,
  p_name text, p_variety text, p_area_m2 numeric, p_count integer,
  p_intercrop boolean default false, p_confirm_over boolean default false,
  p_current_tpl uuid default null, p_done_tpl uuid[] default null, p_current_start date default null, p_origin text default null, p_origin_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare f date := coalesce(p_start, vn_today()); days integer; r jsonb; cap numeric; peak numeric; over boolean := false;
begin
  if exists (select 1 from production_cycles where id = p_id) then return p_id; end if;      -- gọi lặp không tạo trùng
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'INVALID_CYCLE_NAME: Hãy nhập tên vụ (ít nhất 2 ký tự).'; end if;
  if length(trim(coalesce(p_variety, ''))) < 1 then raise exception 'INVALID_VARIETY: Hãy nhập giống (chưa rõ thì ghi "Chưa rõ giống").'; end if;
  if p_area_m2 is null or p_area_m2 <= 0 then raise exception 'INVALID_AMOUNT: Hãy nhập diện tích của vụ (lớn hơn 0).'; end if;
  if p_count is null or p_count <= 0 then raise exception 'INVALID_AMOUNT: Hãy nhập số lượng (cây, con…) lớn hơn 0.'; end if;

  select coalesce(sum(duration_days), 0) into days from template_stages where template_id = p_template;
  if not coalesce(p_intercrop, false) then
    r := area_free_m2(p_area, f, f + least(greatest(days, 1), 3650), null);
    cap := (r ->> 'capacity_m2')::numeric; peak := (r ->> 'peak_used_m2')::numeric;
    if cap is not null and peak + p_area_m2 > cap + 0.5 then
      if not coalesce(p_confirm_over, false) then
        raise exception 'OVER_CAPACITY: Ô chỉ còn trống % m² trong thời gian này, vụ cần % m². Giảm diện tích, tích "Trồng xen" nếu trồng chung diện tích, hoặc chủ cơ sở xác nhận tạo vượt.',
          round(greatest(0, cap - peak)), round(p_area_m2);
      end if;
      if not has_org_role(p_owner_org, array['owner']::member_role[]) then
        raise exception 'FORBIDDEN: Chỉ chủ cơ sở được xác nhận tạo vụ vượt diện tích còn trống của ô.';
      end if;
      over := true;
    end if;
  end if;

  if p_current_tpl is null then
    perform create_cycle_from_template(p_id, p_owner_org, p_area, p_template, p_start, p_status, trim(p_name));
  else
    perform create_cycle_midstart(p_id, p_owner_org, p_area, p_template, p_start, trim(p_name), p_current_tpl, p_done_tpl, p_current_start, p_origin, p_origin_note);
  end if;
  update production_cycles set variety_name = left(trim(p_variety), 120), planted_area_m2 = p_area_m2, plant_count = p_count,
         intercrop = coalesce(p_intercrop, false), over_capacity = over
   where id = p_id;
  return p_id;
end $$;
revoke execute on function create_cycle_checked(uuid, uuid, uuid, uuid, date, cycle_status, text, text, numeric, integer, boolean, boolean, uuid, uuid[], date, text, text) from public, anon;
grant execute on function create_cycle_checked(uuid, uuid, uuid, uuid, date, cycle_status, text, text, numeric, integer, boolean, boolean, uuid, uuid[], date, text, text) to authenticated, service_role;
