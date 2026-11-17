-- D187: thông tin bổ sung của cơ sở (hộ/HTX) sau khi đăng ký. Riêng tư; không tự đưa lên website (website dùng hồ sơ thương mại riêng).
-- Đọc: chủ và quản lý. Ghi: chỉ chủ, qua hàm có phiên bản (không ghi đè âm thầm).

create table org_details (
  organization_id uuid primary key references organizations(id) on delete cascade,
  rep_name text check (rep_name is null or length(rep_name) <= 120),            -- người đại diện / chủ hộ
  rep_position text check (rep_position is null or length(rep_position) <= 80), -- chức danh (HTX: chủ nhiệm, giám đốc…)
  phone text check (phone is null or length(phone) <= 30),
  province text check (province is null or length(province) <= 80),
  ward text check (ward is null or length(ward) <= 80),
  address text check (address is null or length(address) <= 200),
  tax_code text check (tax_code is null or length(tax_code) <= 30),             -- mã số thuế
  registration_no text check (registration_no is null or length(registration_no) <= 60), -- số đăng ký HTX / giấy phép kinh doanh
  started_year integer check (started_year is null or started_year between 1900 and 2100),
  main_products text check (main_products is null or length(main_products) <= 300),
  certificates text check (certificates is null or length(certificates) <= 300),
  total_area_m2 numeric check (total_area_m2 is null or total_area_m2 >= 0),
  note text check (note is null or length(note) <= 500),
  version integer not null default 1,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table org_details enable row level security;
create policy org_details_read on org_details for select to authenticated
  using (has_org_role(organization_id, array['owner', 'manager']::member_role[]));
-- ghi chỉ qua hàm set_org_details

-- Lưu thông tin cơ sở. p_version = phiên bản đang xem (null khi chưa có bản nào). Trả về phiên bản mới.
create or replace function set_org_details(p_org uuid, p_data jsonb, p_version integer default null) returns integer
language plpgsql security definer set search_path = public as $$
declare cur org_details; txt text[] := array['rep_name','rep_position','phone','province','ward','address','tax_code','registration_no','main_products','certificates','note'];
  k text; v_year integer; v_area numeric;
begin
  if not has_org_role(p_org, array['owner']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở được cập nhật thông tin cơ sở.';
  end if;
  v_year := nullif(btrim(p_data->>'started_year'), '')::integer;
  v_area := nullif(btrim(p_data->>'total_area_m2'), '')::numeric;
  if v_year is not null and v_year not between 1900 and 2100 then raise exception 'INVALID_ARGUMENT: Năm bắt đầu chưa đúng.'; end if;
  if v_area is not null and v_area < 0 then raise exception 'INVALID_ARGUMENT: Diện tích phải là số không âm.'; end if;
  foreach k in array txt loop
    if length(coalesce(p_data->>k, '')) > 300 and k <> 'note' then raise exception 'INVALID_ARGUMENT: Nội dung quá dài.'; end if;
  end loop;

  select * into cur from org_details where organization_id = p_org for update;
  if cur.organization_id is null then
    if p_version is not null then raise exception 'CONFLICT: Thông tin đã thay đổi, hãy tải lại.'; end if;
    insert into org_details (organization_id, rep_name, rep_position, phone, province, ward, address, tax_code, registration_no,
                             started_year, main_products, certificates, total_area_m2, note, updated_by)
    values (p_org, nullif(btrim(p_data->>'rep_name'), ''), nullif(btrim(p_data->>'rep_position'), ''), nullif(btrim(p_data->>'phone'), ''),
            nullif(btrim(p_data->>'province'), ''), nullif(btrim(p_data->>'ward'), ''), nullif(btrim(p_data->>'address'), ''),
            nullif(btrim(p_data->>'tax_code'), ''), nullif(btrim(p_data->>'registration_no'), ''), v_year,
            nullif(btrim(p_data->>'main_products'), ''), nullif(btrim(p_data->>'certificates'), ''), v_area,
            nullif(btrim(p_data->>'note'), ''), auth.uid());
    return 1;
  end if;
  if p_version is distinct from cur.version then
    raise exception 'CONFLICT: Thông tin đã thay đổi, hãy tải lại.';
  end if;
  update org_details set
    rep_name = nullif(btrim(p_data->>'rep_name'), ''), rep_position = nullif(btrim(p_data->>'rep_position'), ''),
    phone = nullif(btrim(p_data->>'phone'), ''), province = nullif(btrim(p_data->>'province'), ''),
    ward = nullif(btrim(p_data->>'ward'), ''), address = nullif(btrim(p_data->>'address'), ''),
    tax_code = nullif(btrim(p_data->>'tax_code'), ''), registration_no = nullif(btrim(p_data->>'registration_no'), ''),
    started_year = v_year, main_products = nullif(btrim(p_data->>'main_products'), ''),
    certificates = nullif(btrim(p_data->>'certificates'), ''), total_area_m2 = v_area, note = nullif(btrim(p_data->>'note'), ''),
    version = cur.version + 1, updated_by = auth.uid(), updated_at = now()
   where organization_id = p_org;
  return cur.version + 1;
end $$;
revoke execute on function set_org_details(uuid, jsonb, integer) from public, anon;
grant execute on function set_org_details(uuid, jsonb, integer) to authenticated;
