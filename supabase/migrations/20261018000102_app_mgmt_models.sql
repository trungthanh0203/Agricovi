-- Mô hình quản lý THEO VỤ (docs/PLAN_MO_HINH_QUAN_LY.md): 4 mô hình + gói Chuẩn VietGAP.
--   family  = Tự làm trong gia đình          monthly = Chủ và người làm công tháng
--   managed = Có người quản lý điều hành      staffed = Có nhiều nhân viên, mỗi người một tài khoản
-- Vụ có mô hình riêng; vụ để trống thì theo mô hình mặc định của cơ sở; cả hai trống thì app dùng cách hiển thị hiện có (không đổi hành vi cũ).
-- Chỉ là cách HIỆN và gợi ý: quyền và dữ liệu vẫn do CSDL ép như trước.

alter table organizations
  add column mgmt_model text check (mgmt_model is null or mgmt_model in ('family', 'monthly', 'managed', 'staffed')),
  add column mgmt_vietgap boolean not null default false;
alter table production_cycles
  add column mgmt_model text check (mgmt_model is null or mgmt_model in ('family', 'monthly', 'managed', 'staffed')),
  add column mgmt_vietgap boolean;   -- null = theo cơ sở

create function set_org_model(p_org uuid, p_model text, p_vietgap boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_org_role(p_org, array['owner']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở được đặt mô hình quản lý mặc định.';
  end if;
  if p_model is not null and p_model not in ('family', 'monthly', 'managed', 'staffed') then
    raise exception 'INVALID_MODEL: Mô hình quản lý không hợp lệ.';
  end if;
  update organizations set mgmt_model = p_model, mgmt_vietgap = coalesce(p_vietgap, false) where id = p_org;
end $$;

create function set_cycle_model(p_cycle uuid, p_model text, p_vietgap boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_cycle(p_cycle) then
    raise exception 'FORBIDDEN: Chỉ chủ hoặc quản lý được đặt mô hình quản lý của vụ.';
  end if;
  if p_model is not null and p_model not in ('family', 'monthly', 'managed', 'staffed') then
    raise exception 'INVALID_MODEL: Mô hình quản lý không hợp lệ.';
  end if;
  update production_cycles set mgmt_model = p_model, mgmt_vietgap = p_vietgap where id = p_cycle;
  if not found then raise exception 'NOT_FOUND: Không tìm thấy vụ.'; end if;
end $$;
revoke execute on function set_org_model(uuid, text, boolean), set_cycle_model(uuid, text, boolean) from public, anon;
grant execute on function set_org_model(uuid, text, boolean), set_cycle_model(uuid, text, boolean) to authenticated, service_role;

-- Người làm KHÔNG tài khoản, lương tháng cố định, không chấm công (mô hình "Chủ và người làm công tháng"):
-- không cần thuộc tổ có tổ trưởng; lương lấy từ đơn giá theo tháng của người đó như bình thường.
alter table worker_profiles drop constraint worker_profiles_work_mode_check;
alter table worker_profiles add constraint worker_profiles_work_mode_check
  check (work_mode in ('self_hourly', 'leader_hourly', 'leader_output', 'mixed', 'monthly_salary'));

create or replace function create_worker_without_account(p_org uuid, p_name text, p_phone text, p_work_mode text, p_team uuid)
returns uuid language plpgsql security invoker set search_path = public as $$
declare wid uuid;
begin
  if p_name is null or length(trim(p_name)) < 2 then raise exception 'INVALID_NAME: Hãy nhập họ tên'; end if;
  if p_work_mode is null or not (p_work_mode like 'leader\_%' or p_work_mode = 'monthly_salary') then
    raise exception 'INVALID_MODE: Người không có tài khoản chỉ dùng kiểu do tổ trưởng chấm công/ghi sản lượng, hoặc lương tháng cố định.';
  end if;
  if p_work_mode like 'leader\_%' and (p_team is null or not exists (
       select 1 from worker_teams t where t.id = p_team and t.organization_id = p_org and t.is_active)) then
    raise exception 'TEAM_REQUIRED: Cần chọn một tổ.';
  end if;
  insert into worker_profiles (organization_id, full_name, phone, work_mode)
    values (p_org, trim(p_name), nullif(trim(coalesce(p_phone, '')), ''), p_work_mode) returning id into wid;
  if p_team is not null and exists (select 1 from worker_teams t where t.id = p_team and t.organization_id = p_org and t.is_active) then
    insert into worker_team_memberships (team_id, worker_id) values (p_team, wid);
  end if;
  return wid;
end $$;
