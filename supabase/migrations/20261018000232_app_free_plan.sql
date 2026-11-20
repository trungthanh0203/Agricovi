-- D218: gói Khởi đầu miễn phí 12 tháng (docs/PLAN_GOI_MIEN_PHI.md, đợt A).
-- Dùng lại gói dùng thử có phạm vi (0220, is_scoped_trial): kéo dài 365 ngày, thêm hạn mức số phân khu,
-- số ô và số nhân viên; đăng ký mới tự duyệt; hồ sơ thương mại được gửi duyệt lên website (vụ công khai và tin giao thương vẫn chặn).
-- Ép ở CSDL (trigger). Cơ sở đang dùng thử từ trước không bị đổi hạn.

insert into platform_settings (key, value, description) values
  ('free_max_areas', '1'::jsonb, 'Gói Khởi đầu: số phân khu tối đa'),
  ('free_max_cells', '1'::jsonb, 'Gói Khởi đầu: số ô sản xuất tối đa'),
  ('free_max_staff', '1'::jsonb, 'Gói Khởi đầu: số nhân viên tối đa (ngoài chủ)'),
  ('signup_auto_approve', 'true'::jsonb, 'Đăng ký mới (chủ hộ/HTX) tự duyệt, không chờ quản trị')
  on conflict (key) do nothing;

-- Thời hạn gói Khởi đầu: 12 tháng
update platform_settings set value = '365'::jsonb, description = 'Số ngày dùng gói Khởi đầu (miễn phí) khi đăng ký mới'
 where key = 'trial_days';

-- Hạn mức phân khu / ô / nhân viên của gói Khởi đầu
create or replace function enforce_free_plan_caps() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  lim integer;
  used integer;
  j jsonb := to_jsonb(new);
begin
  if tg_table_name = 'production_areas' then
    if not org_scoped_trial(new.organization_id) then return new; end if;
    if new.parent_id is null then
      select coalesce((value #>> '{}')::integer, 1) into lim from platform_settings where key = 'free_max_areas';
      select count(*) into used from production_areas
       where organization_id = new.organization_id and parent_id is null and is_active and id <> new.id;
      if used >= coalesce(lim, 1) then
        raise exception 'FREE_AREA_LIMIT: Gói Khởi đầu (miễn phí) chỉ có % phân khu. Muốn thêm phân khu: vào Cơ sở của tôi → Gói dịch vụ để nâng cấp.', coalesce(lim, 1)
          using errcode = 'P0001';
      end if;
    else
      select coalesce((value #>> '{}')::integer, 1) into lim from platform_settings where key = 'free_max_cells';
      select count(*) into used from production_areas
       where organization_id = new.organization_id and parent_id is not null and is_active and id <> new.id;
      if used >= coalesce(lim, 1) then
        raise exception 'FREE_CELL_LIMIT: Gói Khởi đầu (miễn phí) chỉ có % ô sản xuất. Muốn thêm ô: vào Cơ sở của tôi → Gói dịch vụ để nâng cấp.', coalesce(lim, 1)
          using errcode = 'P0001';
      end if;
    end if;
    return new;
  end if;

  -- organization_memberships: chỉ đếm người không phải chủ
  if 'owner' = any (new.roles) or new.status <> 'active' then return new; end if;
  if not org_scoped_trial(new.organization_id) then return new; end if;
  select coalesce((value #>> '{}')::integer, 1) into lim from platform_settings where key = 'free_max_staff';
  select count(*) into used from organization_memberships m
   where m.organization_id = new.organization_id and m.status = 'active' and not ('owner' = any (m.roles))
     and m.user_id <> new.user_id;
  if used >= coalesce(lim, 1) then
    raise exception 'FREE_STAFF_LIMIT: Gói Khởi đầu (miễn phí) chỉ thêm được % nhân viên. Muốn thêm người: vào Cơ sở của tôi → Gói dịch vụ để nâng cấp.', coalesce(lim, 1)
      using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger production_areas_free_caps before insert on production_areas
  for each row execute function enforce_free_plan_caps();
create trigger org_memberships_free_caps before insert on organization_memberships
  for each row execute function enforce_free_plan_caps();

-- Hồ sơ thương mại của gói Khởi đầu được gửi duyệt lên website (kiểm duyệt viên vẫn duyệt tay);
-- vụ công khai và tin giao thương vẫn chặn như 0220.
create or replace function block_scoped_trial_publish() returns trigger
language plpgsql security definer set search_path = public as $$
declare publishing boolean; j jsonb := to_jsonb(new);
begin
  if new.organization_id is null or not org_scoped_trial(new.organization_id) then
    return new;
  end if;
  publishing := case tg_table_name
    when 'public_cycles' then (j->>'is_visible')::boolean
    when 'trade_posts' then j->>'status' in ('pending', 'published')
    else false end;
  if publishing then
    raise exception 'TRIAL_NO_PUBLISH: Gói Khởi đầu (miễn phí) chưa công khai vụ và tin giao thương. Hồ sơ cơ sở thì gửi duyệt được. Nâng cấp để công khai thêm.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Đăng ký mới tự duyệt: tạo cơ sở ngay khi ghi đăng ký (cùng việc admin_decide_signup làm khi duyệt)
create or replace function owner_signup_finalize(p_user uuid, p_phone text, p_auth_email text, p_name text, p_org_name text, p_type org_type, p_ip_hash text, p_ref text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid; auto boolean; new_org uuid; v_ref text;
begin
  insert into owner_signups (user_id, phone, auth_email, full_name, org_name, org_type, ip_hash, ref_code)
    values (p_user, p_phone, p_auth_email, trim(p_name), trim(p_org_name), p_type, p_ip_hash,
            case when referral_code_valid(p_ref) then upper(trim(p_ref)) end) returning id, ref_code into sid, v_ref;   -- mã sai: không lưu
  select coalesce((value #>> '{}')::boolean, false) into auto from platform_settings where key = 'signup_auto_approve';
  if coalesce(auto, false) then
    insert into organizations (type, name, created_by) values (p_type, trim(p_org_name), p_user) returning id into new_org;  -- trigger tạo gói và gán chủ
    if v_ref is not null then
      begin perform referral_attach(new_org, v_ref); exception when others then null; end;
    end if;
    update owner_signups set status = 'approved', organization_id = new_org, decided_at = now() where id = sid;
  end if;
  return sid;
end $$;
revoke execute on function owner_signup_finalize(uuid, text, text, text, text, org_type, text, text) from public, anon, authenticated;
grant execute on function owner_signup_finalize(uuid, text, text, text, text, org_type, text, text) to service_role;
