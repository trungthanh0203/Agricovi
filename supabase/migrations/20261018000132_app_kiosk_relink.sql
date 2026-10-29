-- Liên kết lại một máy chấm công đã có (D116): chủ chọn máy cũ rồi bấm liên kết, không phải nhập lại tên/phân khu/đồng ý.
-- Hàm cho Edge Function: kiểm tra chủ, bật lại máy nếu đã ngừng (còn trong hạn mức 20 máy), trả về tài khoản thiết bị để đặt mật khẩu mới.

create function kiosk_relink(p_actor uuid, p_kiosk uuid) returns table (device_user uuid, auth_email text, kiosk_name text)
language plpgsql security definer set search_path = public as $$
declare k attendance_kiosks;
begin
  select * into k from attendance_kiosks where id = p_kiosk;
  if k.id is null or not exists (select 1 from organization_memberships m where m.organization_id = k.organization_id and m.user_id = p_actor
                                   and 'owner' = any (m.roles) and m.status = 'active') then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở được liên kết lại máy chấm công.';
  end if;
  if not k.active then
    if (select count(*) from attendance_kiosks where organization_id = k.organization_id and active) >= 20 then
      raise exception 'LIMIT: Mỗi cơ sở có tối đa 20 máy chấm công đang dùng. Hãy ngừng một máy trước.';
    end if;
    update attendance_kiosks set active = true where id = p_kiosk;
  end if;
  return query select k.user_id, (select u.email::text from auth.users u where u.id = k.user_id), k.name;
end $$;

revoke execute on function kiosk_relink(uuid, uuid) from public, anon, authenticated;
grant execute on function kiosk_relink(uuid, uuid) to service_role;
