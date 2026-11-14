-- Mục 9 báo cáo đối thủ: BẢN ĐỒ THỬA — vẽ ranh khu/ô trên bản đồ, lưu tọa độ, tính diện tích (điều kiện cho truy xuất, EUDR, vùng nguyên liệu).
-- Thiết kế để KHÔNG làm rối cơ sở nhỏ:
--  * Là tính năng nâng cao, MẶC ĐỊNH TẮT: chủ cơ sở bật ở Tài khoản → Tính năng nâng cao (bảng org_features dùng chung cho các mục nâng cao sau: hồ sơ xuất khẩu, cảm biến, hóa đơn điện tử).
--  * Ranh giới nằm ở bảng RIÊNG (area_geo), không thêm cột vào production_areas: màn tải danh sách khu không nặng thêm, bảng khu không đổi.
--  * Dữ liệu riêng tư theo cơ sở; website không đọc. Ghi chỉ qua hàm có kiểm quyền (chủ/quản lý); diện tích do MÁY CHỦ tính lại từ tọa độ, không tin số của máy khách.

create table org_features (
  organization_id uuid not null references organizations(id) on delete cascade,
  feature text not null check (feature ~ '^[a-z_]{1,30}$'),
  enabled boolean not null default false,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (organization_id, feature)
);
alter table org_features enable row level security;
create policy org_features_read on org_features for select to authenticated using (is_org_member(organization_id));
revoke insert, update, delete on org_features from authenticated, anon;

create or replace function set_org_feature(p_org uuid, p_feature text, p_enabled boolean) returns org_features
language plpgsql security definer set search_path = public as $$
declare r org_features;
begin
  if not has_org_role(p_org, array['owner']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở bật hoặc tắt được tính năng nâng cao.';
  end if;
  if p_feature is null or p_feature !~ '^[a-z_]{1,30}$' then raise exception 'INVALID_FEATURE: Tính năng không hợp lệ.'; end if;
  insert into org_features (organization_id, feature, enabled, updated_by, updated_at)
  values (p_org, p_feature, coalesce(p_enabled, false), auth.uid(), now())
  on conflict (organization_id, feature) do update set enabled = excluded.enabled, updated_by = excluded.updated_by, updated_at = now()
  returning * into r;
  return r;
end $$;
revoke execute on function set_org_feature(uuid, text, boolean) from public, anon;
grant execute on function set_org_feature(uuid, text, boolean) to authenticated, service_role;

-- Ranh giới của một khu/ô: vòng khép kín [[vĩ độ, kinh độ], ...] (3–200 điểm, không cần lặp điểm đầu ở cuối)
create table area_geo (
  area_id uuid primary key references production_areas(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  ring jsonb not null,
  point_count integer not null check (point_count between 3 and 200),
  area_m2 numeric not null check (area_m2 >= 0),
  center_lat double precision not null,
  center_lng double precision not null,
  source text not null default 'draw' check (source in ('draw', 'gps', 'mixed')),   -- chạm trên bản đồ / lấy GPS tại góc / cả hai
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
create index on area_geo (organization_id);
alter table area_geo enable row level security;
create policy area_geo_read on area_geo for select to authenticated using (is_org_member(organization_id));
revoke insert, update, delete on area_geo from authenticated, anon;

create or replace function set_area_boundary(p_area uuid, p_ring jsonb, p_source text default 'draw') returns area_geo
language plpgsql security definer set search_path = public as $$
declare
  org uuid; n int; i int; r area_geo;
  lat double precision; lng double precision; lat0 double precision := 0;
  xs double precision[] := '{}'; ys double precision[] := '{}';
  sum_lat double precision := 0; sum_lng double precision := 0; acc double precision := 0;
  k constant double precision := 6371008.8 * pi() / 180;   -- mét trên một độ
begin
  select organization_id into org from production_areas where id = p_area;
  if org is null then raise exception 'NOT_FOUND: Không tìm thấy khu.'; end if;
  if not has_org_role(org, array['owner','manager']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở hoặc quản lý vẽ được ranh khu.';
  end if;
  if p_source not in ('draw', 'gps', 'mixed') then raise exception 'INVALID_GEO: Nguồn tọa độ không hợp lệ.'; end if;
  if p_ring is null or jsonb_typeof(p_ring) <> 'array' then raise exception 'INVALID_GEO: Ranh khu không hợp lệ.'; end if;
  n := jsonb_array_length(p_ring);
  if n < 3 or n > 200 then raise exception 'INVALID_GEO: Ranh khu cần từ 3 đến 200 điểm.'; end if;
  for i in 0 .. n - 1 loop
    if jsonb_typeof(p_ring -> i) <> 'array' or jsonb_array_length(p_ring -> i) <> 2
       or jsonb_typeof(p_ring -> i -> 0) <> 'number' or jsonb_typeof(p_ring -> i -> 1) <> 'number' then
      raise exception 'INVALID_GEO: Mỗi điểm cần có vĩ độ và kinh độ.';
    end if;
    lat := (p_ring -> i ->> 0)::double precision; lng := (p_ring -> i ->> 1)::double precision;
    if lat < -90 or lat > 90 or lng < -180 or lng > 180 then raise exception 'INVALID_GEO: Tọa độ nằm ngoài phạm vi hợp lệ.'; end if;
    sum_lat := sum_lat + lat; sum_lng := sum_lng + lng;
  end loop;
  lat0 := sum_lat / n;
  -- chiếu phẳng cục bộ (đủ chính xác cho thửa đất), rồi công thức đa giác (shoelace)
  for i in 0 .. n - 1 loop
    xs := xs || ((p_ring -> i ->> 1)::double precision * k * cos(radians(lat0)));
    ys := ys || ((p_ring -> i ->> 0)::double precision * k);
  end loop;
  for i in 1 .. n loop
    acc := acc + xs[i] * ys[(i % n) + 1] - xs[(i % n) + 1] * ys[i];
  end loop;
  insert into area_geo (area_id, organization_id, ring, point_count, area_m2, center_lat, center_lng, source, updated_by, updated_at)
  values (p_area, org, p_ring, n, round((abs(acc) / 2)::numeric, 1), sum_lat / n, sum_lng / n, p_source, auth.uid(), now())
  on conflict (area_id) do update set ring = excluded.ring, point_count = excluded.point_count, area_m2 = excluded.area_m2,
    center_lat = excluded.center_lat, center_lng = excluded.center_lng, source = excluded.source, updated_by = excluded.updated_by, updated_at = now()
  returning * into r;
  return r;
end $$;
revoke execute on function set_area_boundary(uuid, jsonb, text) from public, anon;
grant execute on function set_area_boundary(uuid, jsonb, text) to authenticated, service_role;

create or replace function clear_area_boundary(p_area uuid) returns void
language plpgsql security definer set search_path = public as $$
declare org uuid;
begin
  select organization_id into org from production_areas where id = p_area;
  if org is null then raise exception 'NOT_FOUND: Không tìm thấy khu.'; end if;
  if not has_org_role(org, array['owner','manager']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở hoặc quản lý xóa được ranh khu.';
  end if;
  delete from area_geo where area_id = p_area;
end $$;
revoke execute on function clear_area_boundary(uuid) from public, anon;
grant execute on function clear_area_boundary(uuid) to authenticated, service_role;
