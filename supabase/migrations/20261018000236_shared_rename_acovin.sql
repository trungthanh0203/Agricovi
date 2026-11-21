-- D226: đổi thương hiệu sang Acovin (docs/PLAN_DOI_TEN_ACOVINA.md). Hệ thống đang chạy thử nên đổi luôn tên miền email ẩn đăng nhập.
--  1. login_email_domain: agricovi.com -> acovin.com; đổi email ẩn của mọi tài khoản đăng nhập bằng số điện thoại, máy chấm công cho khớp.
--     (Máy chấm công đã ghép đôi cần "ghép lại" nếu đang lưu email cũ.)
--  2. Chữ thương hiệu cũ nằm trong dữ liệu cấu hình/nội dung website do quản trị nhập: đổi sang Acovin.
-- Không sửa dữ liệu vận hành (nhật ký, vụ, kho...) và không sửa các migration đã áp dụng.

create or replace function pg_temp.rb(t text) returns text language sql immutable as $$
  select case when t is null then null else replace(replace(replace(replace(replace(t, 'agricovi.com', 'acovin.com'), 'AgriCoVi', 'Acovin'), 'Agricovi', 'Acovin'), 'AgriConnect', 'Acovin'), 'AGRICOVI', 'ACOVIN') end;
$$;

-- 1. Tên miền email ẩn
update platform_settings set value = '"acovin.com"'::jsonb where key = 'login_email_domain' and value = '"agricovi.com"'::jsonb;

update auth.users
   set email = regexp_replace(email, '@(sdt|kiosk)\.agricovi\.com$', '@\1.acovin.com', 'i')
 where email ~* '@(sdt|kiosk)\.agricovi\.com$';

do $$
begin
  if to_regclass('auth.identities') is not null then
    execute $q$
      update auth.identities
         set identity_data = jsonb_set(identity_data, '{email}', to_jsonb(regexp_replace(identity_data->>'email', '@(sdt|kiosk)\.agricovi\.com$', '@\1.acovin.com', 'i')))
       where identity_data->>'email' ~* '@(sdt|kiosk)\.agricovi\.com$'
    $q$;
    -- provider_id của đăng nhập email = chính email ở một số phiên bản Supabase
    execute $q$
      update auth.identities
         set provider_id = regexp_replace(provider_id, '@(sdt|kiosk)\.agricovi\.com$', '@\1.acovin.com', 'i')
       where provider = 'email' and provider_id ~* '@(sdt|kiosk)\.agricovi\.com$'
    $q$;
  end if;
end $$;

update staff_accounts set auth_email = regexp_replace(auth_email, '@(sdt|kiosk)\.agricovi\.com$', '@\1.acovin.com', 'i')
 where auth_email ~* '@(sdt|kiosk)\.agricovi\.com$';
update owner_signups set auth_email = regexp_replace(auth_email, '@(sdt|kiosk)\.agricovi\.com$', '@\1.acovin.com', 'i')
 where auth_email ~* '@(sdt|kiosk)\.agricovi\.com$';

-- 2. Chữ thương hiệu trong cấu hình và nội dung do quản trị nhập
update platform_settings set value = pg_temp.rb(value::text)::jsonb
 where key = 'contact_info' and value::text ~ '(?i)agricovi|agriconnect';

update site_settings set value = pg_temp.rb(value::text)::jsonb
 where value::text ~ '(?i)agricovi|agriconnect';

update site_menus set items = pg_temp.rb(items::text)::jsonb
 where items::text ~ '(?i)agricovi|agriconnect';

update site_banners set title = pg_temp.rb(title), subtitle = pg_temp.rb(subtitle)
 where title ~* 'agricovi|agriconnect' or coalesce(subtitle, '') ~* 'agricovi|agriconnect';

update site_pages set title = pg_temp.rb(title), description = pg_temp.rb(description), body = pg_temp.rb(body)
 where title ~* 'agricovi|agriconnect' or coalesce(description, '') ~* 'agricovi|agriconnect' or body ~* 'agricovi|agriconnect';
