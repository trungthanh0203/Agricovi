-- Áp ma trận quyền đã chốt (docs/ROLES.md, quyết định D16–D18) và thêm quản lý Tổ lao động / tổ trưởng.
-- Nguyên tắc: tổ trưởng là CHỈ ĐỊNH theo tổ, không phải vai trò cấp cơ sở. Chủ bao gồm mọi vai trò.

-- ---------------------------------------------------------------------------
-- 1. Đơn giá lương: chỉ chủ đặt/sửa; quản lý, kho-tài chính chỉ xem
-- ---------------------------------------------------------------------------
drop policy rates_write on work_rates;
create policy rates_write on work_rates for all to authenticated
  using (has_org_role(organization_id, array['owner']::member_role[]))
  with check (has_org_role(organization_id, array['owner']::member_role[]));

-- ---------------------------------------------------------------------------
-- 2. Kho, chi phí, doanh thu: ghi là việc của chủ và vai trò Kho & chi phí; quản lý chỉ xem
--    (quản lý/nhân viên vẫn ghi "xuất dùng" vật tư khi ghi việc)
-- ---------------------------------------------------------------------------
drop policy units_write on units_of_measure;
create policy units_write on units_of_measure for all to authenticated
  using (organization_id is not null and has_org_role(organization_id, array['inventory_finance']::member_role[]))
  with check (organization_id is not null and has_org_role(organization_id, array['inventory_finance']::member_role[]));

drop policy materials_write on materials;
create policy materials_write on materials for all to authenticated
  using (has_org_role(organization_id, array['inventory_finance']::member_role[]))
  with check (has_org_role(organization_id, array['inventory_finance']::member_role[]));

drop policy conv_write on unit_conversions;
create policy conv_write on unit_conversions for all to authenticated
  using (has_org_role(organization_id, array['inventory_finance']::member_role[]))
  with check (has_org_role(organization_id, array['inventory_finance']::member_role[]));

drop policy locations_write on inventory_locations;
create policy locations_write on inventory_locations for all to authenticated
  using (has_org_role(organization_id, array['inventory_finance']::member_role[]))
  with check (has_org_role(organization_id, array['inventory_finance']::member_role[]));

drop policy inv_txn_insert on inventory_transactions;
create policy inv_txn_insert on inventory_transactions for insert to authenticated
  with check (
    has_org_role(organization_id, array['inventory_finance']::member_role[])
    or (txn_type = 'issue' and has_org_role(organization_id, array['manager', 'worker']::member_role[])));

drop policy expense_insert on expense_records;
drop policy expense_update on expense_records;
create policy expense_insert on expense_records for insert to authenticated
  with check (has_org_role(organization_id, array['inventory_finance']::member_role[]));
create policy expense_update on expense_records for update to authenticated
  using (has_org_role(organization_id, array['inventory_finance']::member_role[]))
  with check (has_org_role(organization_id, array['inventory_finance']::member_role[]));

drop policy sales_insert on sales_records;
drop policy sales_update on sales_records;
create policy sales_insert on sales_records for insert to authenticated
  with check (has_org_role(organization_id, array['inventory_finance']::member_role[]));
create policy sales_update on sales_records for update to authenticated
  using (has_org_role(organization_id, array['inventory_finance']::member_role[]))
  with check (has_org_role(organization_id, array['inventory_finance']::member_role[]));

-- ---------------------------------------------------------------------------
-- 3. Bảng lương: quản lý rà soát và xác nhận; CHỈ CHỦ duyệt, khóa và mở khóa kỳ
-- ---------------------------------------------------------------------------
create or replace function payroll_period_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and auth.uid() is not null
     and ((new.status = 'locked' and old.status <> 'locked') or (old.status = 'locked' and new.status <> 'locked'))
     and not has_org_role(new.organization_id, array['owner']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở được duyệt, khóa hoặc mở khóa kỳ lương.';
  end if;
  if tg_op = 'UPDATE' and new.status = 'locked' and old.status <> 'locked' then
    new.locked_at := now();
    new.approved_by := coalesce(new.approved_by, auth.uid());
    new.approved_at := coalesce(new.approved_at, now());
  end if;
  if tg_op = 'UPDATE' and old.status = 'locked' and new.status <> 'locked' then
    new.locked_at := null; -- mở khóa: audit_events ghi lại ai/khi nào
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Tổ trưởng không tự xác nhận công/sản lượng của chính mình (v1.1 mục 16.3)
-- ---------------------------------------------------------------------------
drop policy att_insert on attendance_records;
create policy att_insert on attendance_records for insert to authenticated
  with check (
    (source = 'self' and is_worker_self(worker_id))
    or (source = 'team_leader' and is_team_leader_of(worker_id) and not is_worker_self(worker_id))
    or (source = 'admin' and is_workforce_admin(worker_org(worker_id))));

drop policy att_update on attendance_records;
create policy att_update on attendance_records for update to authenticated
  using ((is_worker_self(worker_id) and ended_at is null)
         or (is_team_leader_of(worker_id) and not is_worker_self(worker_id))
         or is_workforce_admin(organization_id))
  with check ((is_worker_self(worker_id) and status in ('open', 'needs_confirmation'))
         or (is_team_leader_of(worker_id) and not is_worker_self(worker_id))
         or is_workforce_admin(organization_id));

drop policy out_insert on work_output_records;
create policy out_insert on work_output_records for insert to authenticated
  with check ((source = 'team_leader' and is_team_leader_of(worker_id) and not is_worker_self(worker_id))
              or (source = 'admin' and is_workforce_admin(worker_org(worker_id)))
              or (source = 'self' and is_worker_self(worker_id)));

drop policy out_update on work_output_records;
create policy out_update on work_output_records for update to authenticated
  using ((is_team_leader_of(worker_id) and not is_worker_self(worker_id)) or is_workforce_admin(organization_id))
  with check ((is_team_leader_of(worker_id) and not is_worker_self(worker_id)) or is_workforce_admin(organization_id));

-- ---------------------------------------------------------------------------
-- 5. Tổ lao động và tổ trưởng
-- ---------------------------------------------------------------------------
-- Tổ trưởng phải là người lao động CÓ TÀI KHOẢN thuộc cùng cơ sở (để tự chấm công hộ trên điện thoại của họ)
create or replace function team_leader_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare lw worker_profiles;
begin
  if new.leader_worker_id is not null then
    select * into lw from worker_profiles where id = new.leader_worker_id;
    if lw.id is null or lw.organization_id <> new.organization_id then
      raise exception 'INVALID_LEADER: Tổ trưởng phải là người lao động của cùng cơ sở.';
    end if;
    if lw.user_id is null then
      raise exception 'INVALID_LEADER: Tổ trưởng cần có tài khoản đăng nhập (để chấm công hộ trên điện thoại).';
    end if;
    if lw.status <> 'active' then
      raise exception 'INVALID_LEADER: Người này đã ngừng làm việc.';
    end if;
  end if;
  return new;
end $$;
create trigger worker_teams_leader_guard before insert or update of leader_worker_id on worker_teams
  for each row execute function team_leader_guard();

-- Mỗi người ở tối đa một tổ tại một thời điểm
create unique index one_active_team_per_worker on worker_team_memberships (worker_id) where valid_to is null;

-- Người "kiểu tổ trưởng chấm" mà chưa thuộc tổ có tổ trưởng: báo để chủ xử lý
create view workers_without_leader with (security_invoker = true) as
select wp.organization_id, wp.id as worker_id, wp.full_name, wp.work_mode, t.name as team_name
from worker_profiles wp
left join worker_team_memberships m on m.worker_id = wp.id and m.valid_to is null
left join worker_teams t on t.id = m.team_id and t.is_active
where wp.status = 'active'
  and wp.work_mode like 'leader\_%'
  and (t.id is null or t.leader_worker_id is null);

create or replace function create_team(p_org uuid, p_name text, p_leader uuid default null) returns uuid
language plpgsql security invoker set search_path = public as $$
declare new_id uuid;
begin
  if p_name is null or length(trim(p_name)) < 1 then raise exception 'INVALID_NAME: Hãy nhập tên tổ'; end if;
  insert into worker_teams (organization_id, name, leader_worker_id) values (p_org, trim(p_name), p_leader)
    returning id into new_id;
  return new_id;
end $$;

create or replace function set_team_leader(p_team uuid, p_leader uuid) returns void
language plpgsql security invoker set search_path = public as $$
begin
  update worker_teams set leader_worker_id = p_leader where id = p_team;
  if not found then raise exception 'FORBIDDEN: Không tìm thấy tổ hoặc bạn không có quyền sửa.'; end if;
end $$;

-- Thêm một người vào tổ (chuyển tổ nếu đang ở tổ khác)
create or replace function assign_worker_to_team(p_worker uuid, p_team uuid) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if not exists (select 1 from worker_teams t join worker_profiles w on w.organization_id = t.organization_id
                  where t.id = p_team and w.id = p_worker) then
    raise exception 'FORBIDDEN: Người lao động và tổ phải thuộc cùng cơ sở.';
  end if;
  update worker_team_memberships set valid_to = current_date where worker_id = p_worker and valid_to is null;
  insert into worker_team_memberships (team_id, worker_id, valid_from) values (p_team, p_worker, current_date);
end $$;

-- Người KHÔNG có tài khoản/smartphone: chỉ là hồ sơ do tổ trưởng chấm hộ (quyết định D14, D17)
create or replace function create_worker_without_account(p_org uuid, p_name text, p_phone text, p_work_mode text, p_team uuid)
returns uuid language plpgsql security invoker set search_path = public as $$
declare wid uuid;
begin
  if p_name is null or length(trim(p_name)) < 2 then raise exception 'INVALID_NAME: Hãy nhập họ tên'; end if;
  if p_work_mode is null or p_work_mode not like 'leader\_%' then
    raise exception 'INVALID_MODE: Người không có tài khoản chỉ dùng kiểu phân hệ do tổ trưởng chấm công hoặc ghi sản lượng.';
  end if;
  if p_team is null or not exists (select 1 from worker_teams t where t.id = p_team and t.organization_id = p_org
                                    and t.is_active and t.leader_worker_id is not null) then
    raise exception 'TEAM_REQUIRED: Cần chọn một tổ đã có tổ trưởng.';
  end if;
  insert into worker_profiles (organization_id, full_name, phone, work_mode)
    values (p_org, trim(p_name), nullif(trim(coalesce(p_phone, '')), ''), p_work_mode) returning id into wid;
  insert into worker_team_memberships (team_id, worker_id) values (p_team, wid);
  return wid;
end $$;

revoke execute on function create_team(uuid, text, uuid), set_team_leader(uuid, uuid), assign_worker_to_team(uuid, uuid),
  create_worker_without_account(uuid, text, text, text, uuid) from public, anon;
grant execute on function create_team(uuid, text, uuid), set_team_leader(uuid, uuid), assign_worker_to_team(uuid, uuid),
  create_worker_without_account(uuid, text, text, text, uuid) to authenticated, service_role;
