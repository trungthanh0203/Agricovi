-- Chuẩn VietGAP thành MÔ HÌNH số 5 (thay cho "gói thêm"): bỏ cột/tham số gói, mô hình nhận thêm giá trị 'vietgap'.
alter table organizations drop constraint organizations_mgmt_model_check;
alter table organizations add constraint organizations_mgmt_model_check check (mgmt_model is null or mgmt_model in ('family', 'monthly', 'managed', 'staffed', 'vietgap'));
alter table production_cycles drop constraint production_cycles_mgmt_model_check;
alter table production_cycles add constraint production_cycles_mgmt_model_check check (mgmt_model is null or mgmt_model in ('family', 'monthly', 'managed', 'staffed', 'vietgap'));
alter table organizations drop column mgmt_vietgap;
alter table production_cycles drop column mgmt_vietgap;

drop function set_org_model(uuid, text, boolean);
drop function set_cycle_model(uuid, text, boolean);

create function set_org_model(p_org uuid, p_model text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_org_role(p_org, array['owner']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở được đặt mô hình quản lý mặc định.';
  end if;
  if p_model is not null and p_model not in ('family', 'monthly', 'managed', 'staffed', 'vietgap') then
    raise exception 'INVALID_MODEL: Mô hình quản lý không hợp lệ.';
  end if;
  update organizations set mgmt_model = p_model where id = p_org;
end $$;

create function set_cycle_model(p_cycle uuid, p_model text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_cycle(p_cycle) then
    raise exception 'FORBIDDEN: Chỉ chủ hoặc quản lý được đặt mô hình quản lý của vụ.';
  end if;
  if p_model is not null and p_model not in ('family', 'monthly', 'managed', 'staffed', 'vietgap') then
    raise exception 'INVALID_MODEL: Mô hình quản lý không hợp lệ.';
  end if;
  update production_cycles set mgmt_model = p_model where id = p_cycle;
  if not found then raise exception 'NOT_FOUND: Không tìm thấy vụ.'; end if;
end $$;
revoke execute on function set_org_model(uuid, text), set_cycle_model(uuid, text) from public, anon;
grant execute on function set_org_model(uuid, text), set_cycle_model(uuid, text) to authenticated, service_role;
