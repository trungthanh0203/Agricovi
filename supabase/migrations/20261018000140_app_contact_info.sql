-- Thông tin liên hệ của đơn vị vận hành, do quản trị nền tảng sửa (D130): tên công ty, địa chỉ, điện thoại, Zalo, website, email, Facebook, YouTube.
-- Hiện ở trang đăng nhập/đăng ký (kể cả khi app đã cài), màn "Hỗ trợ & Chia sẻ" trong app và màn chờ duyệt. Lưu ở platform_settings khóa 'contact_info'.
-- Người chưa đăng nhập cũng cần đọc (trang đăng nhập) nên có hàm đọc công khai public_contact_info(); đây là hàm DUY NHẤT thêm vào bề mặt khách (anon).
-- Dữ liệu mẫu bên dưới chỉ là mẫu để thay; quản trị nền tảng sửa ở trang quản trị → Cấu hình → Thông tin liên hệ.

insert into platform_settings (key, value, description) values (
  'contact_info',
  '{"company": "CÔNG TY TNHH AGRICOVI (mẫu, hãy thay)",
    "address": "[Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành] (mẫu, hãy thay)",
    "phone": "0989.099.454",
    "zalo": "0989.099.454",
    "website": "https://agricovi.com",
    "email": "lienhe@agricovi.com",
    "facebook": "https://www.facebook.com/agricovi",
    "youtube": "https://www.youtube.com/@agricovi"}'::jsonb,
  'Thông tin liên hệ hiện cho người dùng (trang đăng nhập, Hỗ trợ & Chia sẻ)')
on conflict (key) do nothing;

create or replace function public_contact_info() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select value from platform_settings where key = 'contact_info'), '{}'::jsonb);
$$;
revoke execute on function public_contact_info() from public;
grant execute on function public_contact_info() to anon, authenticated;

create or replace function admin_set_setting(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare prev jsonb; e record;
begin
  perform admin_guard();
  if p_key not in ('trial_days', 'ranking', 'login_email_domain', 'staff_temp_password_days', 'expiry_reminder_days', 'contact_info') then
    raise exception 'INVALID_KEY: Cấu hình này không được sửa ở đây.';
  end if;
  if p_key = 'contact_info' then
    if jsonb_typeof(p_value) <> 'object' then raise exception 'INVALID_VALUE: Thông tin liên hệ phải là một bộ các mục.'; end if;
    for e in select key, value from jsonb_each(p_value) loop
      if e.key not in ('company', 'address', 'phone', 'zalo', 'website', 'email', 'facebook', 'youtube') then
        raise exception 'INVALID_VALUE: Mục "%" không hợp lệ.', e.key;
      end if;
      if jsonb_typeof(e.value) <> 'string' or length(e.value #>> '{}') > 300 then
        raise exception 'INVALID_VALUE: Mục "%" phải là chữ, tối đa 300 ký tự.', e.key;
      end if;
      if e.key in ('website', 'facebook', 'youtube') and (e.value #>> '{}') <> '' and (e.value #>> '{}') !~* '^https?://\S+$' then
        raise exception 'INVALID_VALUE: Đường dẫn "%" phải bắt đầu bằng http:// hoặc https://.', e.key;
      end if;
      if e.key = 'email' and (e.value #>> '{}') <> '' and (e.value #>> '{}') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        raise exception 'INVALID_VALUE: Email chưa đúng dạng.';
      end if;
    end loop;
  end if;
  select value into prev from platform_settings where key = p_key;
  insert into platform_settings (key, value) values (p_key, p_value)
    on conflict (key) do update set value = excluded.value;
  perform admin_audit(null, 'set_setting', 'platform_setting', p_key, to_jsonb(prev), p_value, null);
end $$;

-- Hàm trigger của khu cấp 2 (migration 0136/0138) không được gọi trực tiếp từ API công khai (test anon_surface)
revoke execute on function area_parent_guard() from public, anon, authenticated;
