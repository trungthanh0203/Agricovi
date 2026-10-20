-- D36: vật tư có thêm thông tin mở rộng (thương hiệu, hướng dẫn, cảnh báo, thời gian cách ly...) và được TẠO SẴN danh sách
-- vật tư phổ biến cho mỗi cơ sở; chủ cơ sở sửa/dừng/thêm theo nhu cầu như mọi vật tư khác.

alter table materials
  add column brand text check (brand is null or length(brand) <= 120),
  add column usage_guide text check (usage_guide is null or length(usage_guide) <= 1000),
  add column usage_method text check (usage_method is null or length(usage_method) <= 1000),
  add column safety_warning text check (safety_warning is null or length(safety_warning) <= 1000),
  add column quality_specs text check (quality_specs is null or length(quality_specs) <= 1000),
  add column limit_elements text check (limit_elements is null or length(limit_elements) <= 1000),
  add column withdrawal_days integer check (withdrawal_days is null or withdrawal_days >= 0);

insert into units_of_measure (code, name) values ('ton', 'Tấn') on conflict do nothing;

-- Danh sách vật tư mặc định (không ghi đè vật tư trùng tên đã có)
create or replace function seed_default_materials_internal(p_org uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with defaults(name, category, unit_code, descr) as (values
    ('NPK 30-11-10 TE',        'Phân bón vô cơ',  'kg',   'Phân tổng hợp đạm – lân – kali tỉ lệ 30-11-10, có bổ sung vi lượng.'),
    ('Phân hữu cơ vi sinh',    'Phân bón hữu cơ', 'kg',   'Phân hữu cơ có bổ sung vi sinh vật có ích, cải tạo đất.'),
    ('Phân trung vi lượng',    'Phân bón vô cơ',  'kg',   'Bổ sung các nguyên tố trung và vi lượng cho cây.'),
    ('Vôi',                    'Phân bón vô cơ',  'ton',  'Cải tạo đất, khử chua, bổ sung canxi.'),
    ('Phân MgSO4',             'Phân bón vô cơ',  'bag',  'Magie sunphat, bổ sung magie và lưu huỳnh (bao 25 kg).'),
    ('Phân MKP',               'Phân bón vô cơ',  'bag',  'Mono kali phosphat, cung cấp lân và kali (bao 25 kg).'),
    ('Phân vi lượng',          'Phân bón vô cơ',  'bag',  'Bổ sung vi lượng cho cây (bao 25 kg).'),
    ('Urê',                    'Phân bón vô cơ',  'bag',  'Phân đạm (bao 25 kg).'),
    ('Phân canxi nitrat (CAN)','Phân bón vô cơ',  'bag',  'Bổ sung canxi và đạm nitrat (bao 25 kg).'),
    ('Phân kali nitrat (KNO3)','Phân bón vô cơ',  'bag',  'Cung cấp kali và đạm nitrat (bao 25 kg).'),
    ('Phân kali sulphate (SOP)','Phân bón vô cơ', 'bag',  'Kali sunphat, cung cấp kali và lưu huỳnh (bao 25 kg).')
  ), ins as (
    insert into materials (organization_id, name, category, base_unit_id, description, brand)
    select p_org, d.name, d.category,
           (select id from units_of_measure u where u.code = d.unit_code and u.organization_id is null), d.descr, 'Việt Nam'
      from defaults d
    on conflict (organization_id, name) do nothing
    returning 1
  )
  select count(*) into n from ins;
  return n;
end $$;

-- Cơ sở mới được tạo sẵn vật tư mặc định
create or replace function organizations_seed_materials() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform seed_default_materials_internal(new.id);
  return new;
end $$;
create trigger organizations_seed_materials after insert on organizations for each row execute function organizations_seed_materials();

-- Cơ sở đã có: bổ sung cho cơ sở chưa có vật tư nào
do $$
declare o record;
begin
  for o in select id from organizations where not exists (select 1 from materials m where m.organization_id = organizations.id) loop
    perform seed_default_materials_internal(o.id);
  end loop;
end $$;

-- Nút "Thêm vật tư mẫu" cho người có quyền sửa Kho (bổ sung các mục còn thiếu, không đụng mục đã có)
create or replace function add_default_materials(p_org uuid) returns integer
language plpgsql security definer set search_path = public as $$
begin
  if not has_perm(p_org, 'inventory', 'edit') then
    raise exception 'FORBIDDEN: Bạn không có quyền thêm vật tư.';
  end if;
  return seed_default_materials_internal(p_org);
end $$;

revoke execute on function seed_default_materials_internal(uuid), organizations_seed_materials() from public, anon, authenticated;
revoke execute on function add_default_materials(uuid) from public, anon;
grant execute on function add_default_materials(uuid) to authenticated, service_role;
