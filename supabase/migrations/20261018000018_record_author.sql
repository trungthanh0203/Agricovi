-- Hiển thị "ai làm, vai trò gì" cạnh nhật ký và giao dịch kho.
-- Lưu BẢN CHỤP tên và vai trò của người ghi ngay khi bản ghi được tạo (máy chủ tự điền, client không giả mạo được):
--  * vai trò là vai trò TẠI THỜI ĐIỂM ghi (sau này đổi vai trò thì lịch sử không đổi theo);
--  * ai xem được bản ghi thì xem được tên và vai trò này, không cần quyền xem danh sách thành viên;
--  * dùng được cả khi offline vì đã nằm sẵn trong bản ghi tải về.
-- Tên: nhân viên = họ tên trong hồ sơ lao động; tài khoản email (chủ, quản lý) = phần trước dấu @ của email [GIẢ ĐỊNH A16].

alter table activity_logs add column author_name text, add column author_roles member_role[];
alter table inventory_transactions add column author_name text, add column author_roles member_role[];

-- Hai hàm riêng (không dùng RETURNS TABLE để khỏi trùng tên cột roles, xem CLAUDE.md bẫy 2)
create or replace function author_display_name(p_user uuid, p_org uuid, p_area_org uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select w.full_name from worker_profiles w
      where w.user_id = p_user and w.organization_id in (p_org, p_area_org)
      order by (w.organization_id = p_org) desc limit 1),
    (select nullif(split_part(u.email, '@', 1), '') from auth.users u where u.id = p_user)
  );
$$;

-- Vai trò của người đó ở cơ sở sở hữu bản ghi; nếu không phải thành viên (hộ ghi theo HTX) thì lấy ở cơ sở sở hữu khu trồng
create or replace function author_roles_in(p_user uuid, p_org uuid, p_area_org uuid) returns member_role[]
language sql stable security definer set search_path = public as $$
  select m.roles from organization_memberships m
   where m.user_id = p_user and m.status = 'active' and m.organization_id in (p_org, p_area_org)
   order by (m.organization_id = p_org) desc limit 1;
$$;
-- hàm nội bộ cho trigger: không để người dùng gọi tra cứu tên/vai trò của người khác
revoke execute on function author_display_name(uuid, uuid, uuid), author_roles_in(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function activity_log_stamp_author() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := coalesce(new.performed_by, new.created_by, auth.uid()); v_org uuid; v_area_org uuid;
begin
  v_org := coalesce(cycle_owner_org(new.cycle_id), new.organization_id);
  v_area_org := coalesce(cycle_area_org(new.cycle_id), (select a.organization_id from production_areas a where a.id = new.area_id));
  new.author_name := author_display_name(v_uid, v_org, v_area_org);   -- luôn ghi đè: giá trị client gửi lên bị bỏ
  new.author_roles := author_roles_in(v_uid, v_org, v_area_org);
  return new;
end $$;
-- chạy sau trigger activity_logs_org (đồng bộ organization_id theo chủ vụ)
create trigger activity_logs_stamp_author before insert on activity_logs
  for each row execute function activity_log_stamp_author();

create or replace function inventory_txn_stamp_author() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := coalesce(new.recorded_by, auth.uid());
begin
  new.author_name := author_display_name(v_uid, new.organization_id, null);
  new.author_roles := author_roles_in(v_uid, new.organization_id, null);
  return new;
end $$;
create trigger inventory_transactions_stamp_author before insert on inventory_transactions
  for each row execute function inventory_txn_stamp_author();

-- Bản chụp bất biến: thêm vào guard của nhật ký (nội dung cũ từ migration 0013 giữ nguyên)
create or replace function activity_log_update_guard() returns trigger language plpgsql as $$
begin
  if new.id <> old.id
     or new.organization_id is distinct from old.organization_id
     or new.cycle_id is distinct from old.cycle_id
     or new.area_id is distinct from old.area_id
     or new.created_by is distinct from old.created_by
     or new.performed_by is distinct from old.performed_by
     or new.source is distinct from old.source
     or new.received_at is distinct from old.received_at
     or new.author_name is distinct from old.author_name
     or new.author_roles is distinct from old.author_roles then
    raise exception 'IMMUTABLE_FIELD: Không đổi được vụ, người ghi hoặc nguồn của nhật ký. Hãy hủy bản ghi và ghi lại.';
  end if;
  if old.voided_at is not null then
    if new.voided_at is null then
      raise exception 'VOIDED: Bản ghi đã hủy, không khôi phục được. Hãy ghi lại một bản ghi mới.';
    end if;
    if new.data is distinct from old.data or new.note is distinct from old.note
       or new.performed_at is distinct from old.performed_at or new.work_type_id is distinct from old.work_type_id then
      raise exception 'VOIDED: Bản ghi đã hủy, không sửa nội dung được.';
    end if;
  end if;
  return new;
end $$;

-- Điền cho các bản ghi đã có (một lần). Tắt trigger người dùng để không tăng phiên bản, không ghi audit, không vướng bất biến.
alter table activity_logs disable trigger user;
update activity_logs l set
  author_name = author_display_name(coalesce(l.performed_by, l.created_by), coalesce(cycle_owner_org(l.cycle_id), l.organization_id),
                  coalesce(cycle_area_org(l.cycle_id), (select a.organization_id from production_areas a where a.id = l.area_id))),
  author_roles = author_roles_in(coalesce(l.performed_by, l.created_by), coalesce(cycle_owner_org(l.cycle_id), l.organization_id),
                  coalesce(cycle_area_org(l.cycle_id), (select a.organization_id from production_areas a where a.id = l.area_id)))
 where l.author_name is null;
alter table activity_logs enable trigger user;

alter table inventory_transactions disable trigger user;
update inventory_transactions t set
  author_name = author_display_name(t.recorded_by, t.organization_id, null),
  author_roles = author_roles_in(t.recorded_by, t.organization_id, null)
 where t.author_name is null and t.recorded_by is not null;
alter table inventory_transactions enable trigger user;
