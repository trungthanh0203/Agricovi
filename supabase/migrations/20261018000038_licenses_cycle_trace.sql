-- D50: Giấy phép, chứng chỉ của cơ sở (hiện ở Hồ sơ) và dữ liệu truy xuất của vụ để tạo mã QR.

-- ---------------------------------------------------------------------------
-- Giấy phép, chứng chỉ: mọi thành viên xem; chủ và quản lý thêm/sửa/xóa
-- ---------------------------------------------------------------------------
create table org_licenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 120),
  issuer text check (issuer is null or length(issuer) <= 160),          -- nơi cấp
  number text check (number is null or length(number) <= 80),           -- số giấy
  issued_date date,
  expires_date date,
  image text check (image is null or length(image) <= 400000),
  note text check (note is null or length(note) <= 500),
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (expires_date is null or issued_date is null or expires_date >= issued_date)
);
create index on org_licenses (organization_id, expires_date);
alter table org_licenses enable row level security;
create policy org_licenses_read on org_licenses for select to authenticated using (is_org_member(organization_id));
create policy org_licenses_write on org_licenses for all to authenticated
  using (has_org_role(organization_id, array['owner', 'manager']::member_role[]))
  with check (has_org_role(organization_id, array['owner', 'manager']::member_role[]));

-- ---------------------------------------------------------------------------
-- Thông tin truy xuất của vụ (để tạo mã QR): tên vụ, nơi trồng, thời gian, vật tư đã dùng (không kèm giá)
-- Người đọc được vụ thì lấy được; không lộ chi phí hay số liệu tài chính.
-- ---------------------------------------------------------------------------
create or replace function get_cycle_trace(p_cycle uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c production_cycles; a production_areas; org_name text; crop text; mats jsonb;
begin
  select * into c from production_cycles where id = p_cycle;
  if c.id is null or not can_read_cycle(p_cycle) then
    raise exception 'FORBIDDEN: Bạn không có quyền xem vụ này.';
  end if;
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
revoke execute on function get_cycle_trace(uuid) from public, anon;
grant execute on function get_cycle_trace(uuid) to authenticated, service_role;
