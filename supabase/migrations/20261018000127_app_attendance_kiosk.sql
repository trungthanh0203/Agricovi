-- Máy chấm công (D111): một điện thoại cố định ở phân khu, do chủ liên kết. Người làm nhập số điện thoại + PIN riêng, bấm Vào ca / Ra ca,
-- máy chụp ảnh kèm theo để chủ đối chiếu. Máy dùng một TÀI KHOẢN THIẾT BỊ không có vai trò nào trong cơ sở: chỉ gọi được các hàm kiosk_* bên dưới,
-- nên người quản lý cầm máy cũng không vào được giao diện quản lý.

alter type attendance_source add value if not exists 'kiosk';

-- ---------------------------------------------------------------------------
-- 1. Máy chấm công (mỗi máy một tài khoản thiết bị)
-- ---------------------------------------------------------------------------
create table attendance_kiosks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  area_id uuid references production_areas(id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 60),
  user_id uuid not null unique references auth.users(id),
  active boolean not null default true,
  photo_consent_at timestamptz not null,       -- chủ xác nhận đã báo và được người làm đồng ý chụp ảnh chấm công
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table attendance_kiosks enable row level security;
create policy kiosks_read on attendance_kiosks for select to authenticated
  using (is_workforce_admin(organization_id) or user_id = auth.uid());

-- PIN và mã đặt PIN của người làm: không ai đọc trực tiếp (không có chính sách), chỉ các hàm bên dưới.
create table worker_kiosk_pins (
  worker_id uuid primary key references worker_profiles(id) on delete cascade,
  pin_salt text,
  pin_hash text,
  set_at timestamptz,
  code_hash text,
  code_expires_at timestamptz,
  failed_count integer not null default 0,
  locked_until timestamptz
);
alter table worker_kiosk_pins enable row level security;

-- Ảnh chụp lúc Vào/Ra ca (ảnh nhỏ, mã hóa base64 JPEG; giữ 60 ngày, xem purge_attendance_photos)
create table attendance_photos (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  attendance_id uuid not null references attendance_records(id) on delete cascade,
  worker_id uuid not null references worker_profiles(id) on delete cascade,
  kiosk_id uuid references attendance_kiosks(id) on delete set null,
  kind text not null check (kind in ('in', 'out')),
  photo text not null check (length(photo) between 100 and 90000),
  face_ok boolean,                              -- máy thấy đúng 1 khuôn mặt (null = máy không kiểm được)
  taken_at timestamptz not null default now()
);
create index on attendance_photos (organization_id, taken_at);
create index on attendance_photos (kiosk_id, taken_at);
create index on attendance_photos (attendance_id);
alter table attendance_photos enable row level security;
create policy attendance_photos_read on attendance_photos for select to authenticated using (is_workforce_admin(organization_id));

alter table attendance_records
  add column kiosk_id uuid references attendance_kiosks(id) on delete set null,
  add column area_id uuid references production_areas(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 2. Hàm nội bộ (không cấp cho ai gọi trực tiếp)
-- ---------------------------------------------------------------------------
create function kiosk_hash(p_salt text, p_worker uuid, p_secret text) returns text
language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(coalesce(p_salt, '') || ':' || p_worker::text || ':' || coalesce(p_secret, ''), 'utf8')), 'hex');
$$;

-- Người làm đang hoạt động của cơ sở có số điện thoại này (chỉ khi duy nhất một người)
create function kiosk_find_worker(p_org uuid, p_phone text) returns uuid
language sql stable security definer set search_path = public as $$
  select case when count(*) = 1 then (array_agg(w.id))[1] end
    from worker_profiles w
   where w.organization_id = p_org and w.status = 'active'
     and normalize_vn_phone(p_phone) is not null and normalize_vn_phone(w.phone) = normalize_vn_phone(p_phone);
$$;

-- Ghi nhận một lần nhập sai (PIN hoặc mã); sai 5 lần thì khóa 15 phút. Trả về true nếu vừa bị khóa.
-- Các hàm kiosk_* trả kết quả bằng JSON (không raise) để bộ đếm này được lưu lại.
create function kiosk_count_failure(p_worker uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare locked timestamptz;
begin
  update worker_kiosk_pins
     set locked_until = case when failed_count + 1 >= 5 then now() + interval '15 minutes' else locked_until end,
         failed_count = case when failed_count + 1 >= 5 then 0 else failed_count + 1 end
   where worker_id = p_worker returning locked_until into locked;
  return locked is not null and locked > now();
end $$;

create function kiosk_fail(p_code text, p_message text) returns jsonb
language sql immutable as $$ select jsonb_build_object('ok', false, 'code', p_code, 'message', p_message); $$;

-- Xác thực: máy hợp lệ + số điện thoại + PIN. Thành công trả { ok, worker_id, kiosk_id, org, area }.
create function kiosk_authenticate(p_phone text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k attendance_kiosks; w uuid; p worker_kiosk_pins; bad constant text := 'Số điện thoại hoặc PIN chưa đúng.';
begin
  select * into k from attendance_kiosks where user_id = auth.uid() and active;
  if k.id is null then return kiosk_fail('NO_KIOSK', 'Thiết bị này chưa được liên kết làm máy chấm công.'); end if;
  w := kiosk_find_worker(k.organization_id, p_phone);
  if w is null then return kiosk_fail('BAD_LOGIN', bad); end if;
  select * into p from worker_kiosk_pins where worker_id = w for update;
  if p.worker_id is null or p.pin_hash is null then
    return kiosk_fail('NO_PIN', 'Bạn chưa đặt PIN. Hãy bấm "Đặt PIN lần đầu" và nhập mã do chủ cơ sở cấp.');
  end if;
  if p.locked_until is not null and p.locked_until > now() then
    return kiosk_fail('LOCKED', 'Nhập sai quá nhiều lần. Hãy thử lại sau ' || to_char(p.locked_until at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI') || ' hoặc nhờ chủ cơ sở cấp mã mới.');
  end if;
  if p.pin_hash <> kiosk_hash(p.pin_salt, w, trim(coalesce(p_pin, ''))) then
    if kiosk_count_failure(w) then
      return kiosk_fail('LOCKED', 'Nhập sai quá nhiều lần. Số này bị khóa 15 phút, hoặc nhờ chủ cơ sở cấp mã mới.');
    end if;
    return kiosk_fail('BAD_LOGIN', bad);
  end if;
  update worker_kiosk_pins set failed_count = 0, locked_until = null where worker_id = w and (failed_count <> 0 or locked_until is not null);
  return jsonb_build_object('ok', true, 'worker_id', w, 'kiosk_id', k.id, 'org', k.organization_id, 'area', k.area_id);
end $$;

-- ---------------------------------------------------------------------------
-- 3. Hàm cho máy chấm công (tài khoản thiết bị)
-- ---------------------------------------------------------------------------
-- Máy này là máy chấm công của cơ sở nào, phân khu nào (null nếu không phải máy chấm công)
create function kiosk_me() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('kiosk_id', k.id, 'organization_id', k.organization_id, 'org_name', o.name,
                            'area_id', k.area_id, 'area_name', a.name, 'name', k.name)
    from attendance_kiosks k
    join organizations o on o.id = k.organization_id
    left join production_areas a on a.id = k.area_id
   where k.user_id = auth.uid() and k.active;
$$;

-- Bước 1: nhập số điện thoại + PIN -> cho biết đang ở trong ca hay chưa (để hiện đúng MỘT nút)
create function kiosk_check(p_phone text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a jsonb := kiosk_authenticate(p_phone, p_pin); w uuid; o attendance_records;
begin
  if not (a ->> 'ok')::boolean then return a; end if;
  w := (a ->> 'worker_id')::uuid;
  select * into o from attendance_records where worker_id = w and ended_at is null and status <> 'rejected' order by started_at desc limit 1;
  return jsonb_build_object('ok', true, 'name', (select full_name from worker_profiles where id = w),
                            'state', case when o.id is null then 'out' else 'in' end,
                            'since', o.started_at, 'stale', o.id is not null and o.work_date < vn_today());
end $$;

-- Bước 2: Vào ca / Ra ca kèm ảnh. p_id do máy tạo (bấm lặp không nhân đôi).
create function kiosk_punch(p_phone text, p_pin text, p_action text, p_id uuid, p_photo text, p_face_ok boolean default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a jsonb := kiosk_authenticate(p_phone, p_pin); w uuid; k uuid; ar uuid; org uuid; o attendance_records; att uuid; nm text; stale boolean := false;
begin
  if not (a ->> 'ok')::boolean then return a; end if;
  w := (a ->> 'worker_id')::uuid; k := (a ->> 'kiosk_id')::uuid; ar := nullif(a ->> 'area', '')::uuid; org := (a ->> 'org')::uuid;
  select full_name into nm from worker_profiles where id = w;
  if p_action not in ('in', 'out') then return kiosk_fail('INVALID_ARGUMENT', 'Thao tác không hợp lệ.'); end if;
  if p_photo is null or length(p_photo) < 100 then return kiosk_fail('NO_PHOTO', 'Chưa chụp được ảnh. Hãy cho phép dùng camera rồi thử lại.'); end if;
  if length(p_photo) > 90000 then return kiosk_fail('PHOTO_TOO_BIG', 'Ảnh quá lớn, hãy thử lại.'); end if;
  if exists (select 1 from attendance_photos where id = p_id) then   -- bấm lặp
    return jsonb_build_object('ok', true, 'action', p_action, 'name', nm, 'at', now(), 'duplicate', true);
  end if;
  select * into o from attendance_records where worker_id = w and ended_at is null and status <> 'rejected' order by started_at desc limit 1;
  begin
    if p_action = 'in' then
      if o.id is not null then
        return kiosk_fail('ALREADY_IN', 'Bạn đã vào ca lúc ' || to_char(o.started_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI') || ' rồi. Hãy bấm Ra ca khi xong việc.');
      end if;
      insert into attendance_records (id, worker_id, work_date, started_at, source, device_recorded_at, kiosk_id, area_id)
        values (p_id, w, vn_today(), now(), 'kiosk', now(), k, ar) returning id into att;
    else
      if o.id is null then return kiosk_fail('NOT_IN', 'Bạn chưa vào ca nên chưa Ra ca được.'); end if;
      stale := o.work_date < vn_today();
      update attendance_records
         set ended_at = now(), status = 'needs_confirmation',
             exception_reason = case when stale then 'Quên ra ca hôm trước (ra ca ở máy chấm công), cần chủ xem lại giờ' else exception_reason end
       where id = o.id returning id into att;
    end if;
    insert into attendance_photos (id, organization_id, attendance_id, worker_id, kiosk_id, kind, photo, face_ok)
      values (p_id, org, att, w, k, p_action, p_photo, p_face_ok);
  exception when others then
    return kiosk_fail('ERROR', 'Không ghi được: ' || regexp_replace(sqlerrm, '^[A-Z_]+: ', ''));
  end;
  return jsonb_build_object('ok', true, 'action', p_action, 'name', nm, 'at', now(), 'stale', stale);
end $$;

-- Đặt PIN lần đầu / sau khi quên: nhập số điện thoại + mã chủ cấp + PIN mới (4–6 số)
create function kiosk_set_pin(p_phone text, p_code text, p_new_pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k attendance_kiosks; w uuid; p worker_kiosk_pins; pin text := trim(coalesce(p_new_pin, '')); salt text;
begin
  select * into k from attendance_kiosks where user_id = auth.uid() and active;
  if k.id is null then return kiosk_fail('NO_KIOSK', 'Thiết bị này chưa được liên kết làm máy chấm công.'); end if;
  w := kiosk_find_worker(k.organization_id, p_phone);
  select * into p from worker_kiosk_pins where worker_id = w for update;
  if w is null or p.worker_id is null or p.code_hash is null or p.code_expires_at < now() then
    return kiosk_fail('BAD_CODE', 'Số điện thoại hoặc mã chưa đúng, hoặc mã đã hết hạn. Hãy nhờ chủ cơ sở cấp mã mới.');
  end if;
  if p.locked_until is not null and p.locked_until > now() then
    return kiosk_fail('LOCKED', 'Nhập sai quá nhiều lần. Hãy thử lại sau ' || to_char(p.locked_until at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI') || '.');
  end if;
  if p.code_hash <> kiosk_hash('code', w, trim(coalesce(p_code, ''))) then
    if kiosk_count_failure(w) then return kiosk_fail('LOCKED', 'Nhập sai quá nhiều lần. Số này bị khóa 15 phút.'); end if;
    return kiosk_fail('BAD_CODE', 'Số điện thoại hoặc mã chưa đúng, hoặc mã đã hết hạn. Hãy nhờ chủ cơ sở cấp mã mới.');
  end if;
  if pin !~ '^[0-9]{4,6}$' then return kiosk_fail('BAD_PIN', 'PIN gồm 4 đến 6 chữ số.'); end if;
  if pin ~ '^(.)\1+$' or pin in ('1234', '4321', '12345', '54321', '123456', '654321', '0123', '01234', '012345')
     or normalize_vn_phone(p_phone) like '%' || pin then
    return kiosk_fail('WEAK_PIN', 'PIN này dễ đoán (số lặp, dãy số, hoặc trùng đuôi số điện thoại). Hãy chọn PIN khác.');
  end if;
  salt := gen_random_uuid()::text;
  update worker_kiosk_pins set pin_salt = salt, pin_hash = kiosk_hash(salt, w, pin), set_at = now(),
         code_hash = null, code_expires_at = null, failed_count = 0, locked_until = null where worker_id = w;
  return jsonb_build_object('ok', true);
end $$;

-- Chủ đang đứng ở máy này (đăng nhập bằng tài khoản khác) có phải chủ cơ sở không: dùng khi thoát chế độ máy chấm công
create function kiosk_can_exit(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select has_org_role(p_org, array['owner']::member_role[]);
$$;

-- ---------------------------------------------------------------------------
-- 4. Hàm cho chủ / quản lý
-- ---------------------------------------------------------------------------
-- Cấp mã đặt PIN dùng một lần (6 số, hạn 24 giờ). Trả về mã MỘT LẦN; hệ thống chỉ lưu bản băm nên chủ không xem lại được.
create function issue_pin_code(p_worker uuid) returns text
language plpgsql security definer set search_path = public as $$
declare org uuid := worker_org(p_worker); code text;
begin
  if org is null or not is_workforce_admin(org) then
    raise exception 'FORBIDDEN: Chỉ chủ hoặc quản lý được cấp mã đặt PIN.';
  end if;
  if not exists (select 1 from worker_profiles where id = p_worker and status = 'active' and normalize_vn_phone(phone) is not null) then
    raise exception 'INVALID_PHONE: Người này cần có số điện thoại hợp lệ trong hồ sơ để dùng máy chấm công.';
  end if;
  code := lpad(((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 7))::bit(28)::int) % 1000000)::text, 6, '0');
  insert into worker_kiosk_pins (worker_id, code_hash, code_expires_at, failed_count, locked_until)
    values (p_worker, kiosk_hash('code', p_worker, code), now() + interval '24 hours', 0, null)
  on conflict (worker_id) do update
    set code_hash = excluded.code_hash, code_expires_at = excluded.code_expires_at, failed_count = 0, locked_until = null;
  return code;
end $$;

-- Ai đã có PIN, ai đang chờ đặt PIN, ai đang bị khóa (không lộ PIN)
create function list_kiosk_pin_status(p_org uuid) returns table (wid uuid, has_pin boolean, code_pending boolean, is_locked boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_workforce_admin(p_org) then raise exception 'FORBIDDEN: Bạn không có quyền xem mục này.'; end if;
  return query
    select p.worker_id, p.pin_hash is not null, (p.code_hash is not null and p.code_expires_at > now()),
           (p.locked_until is not null and p.locked_until > now())
      from worker_kiosk_pins p join worker_profiles w on w.id = p.worker_id where w.organization_id = p_org;
end $$;

-- Ảnh chấm công để chủ đối chiếu, kèm dấu hiệu bất thường
create function attendance_photo_review(p_org uuid, p_from date, p_to date)
returns table (ph_id uuid, att_id uuid, wk_id uuid, wk_name text, ph_kind text, ph_at timestamptz, ph_photo text, ph_face_ok boolean,
               ph_flags text[], kiosk_name text, area_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_workforce_admin(p_org) then raise exception 'FORBIDDEN: Bạn không có quyền xem ảnh chấm công.'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 31 then
    raise exception 'INVALID_ARGUMENT: Hãy chọn khoảng ngày không quá 31 ngày.';
  end if;
  return query
    select p.id, p.attendance_id, p.worker_id, w.full_name, p.kind, p.taken_at, p.photo, p.face_ok,
           array_remove(array[
             case when p.face_ok is false then 'no_face' end,
             case when p.face_ok is null then 'unchecked' end,
             case when exists (select 1 from attendance_photos q where q.kiosk_id = p.kiosk_id and q.worker_id <> p.worker_id
                                  and abs(extract(epoch from q.taken_at - p.taken_at)) <= 20) then 'fast_pair' end,
             case when p.kind = 'out' and a.exception_reason is not null then 'forgot_out' end
           ], null),
           k.name, ar.name
      from attendance_photos p
      join worker_profiles w on w.id = p.worker_id
      join attendance_records a on a.id = p.attendance_id
      left join attendance_kiosks k on k.id = p.kiosk_id
      left join production_areas ar on ar.id = a.area_id
     where p.organization_id = p_org
       and (p.taken_at at time zone 'Asia/Ho_Chi_Minh')::date between p_from and p_to
     order by p.taken_at desc
     limit 300;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Hàm cho Edge Function (khóa quản trị) và dọn ảnh cũ
-- ---------------------------------------------------------------------------
create function kiosk_precheck(p_actor uuid, p_org uuid, p_area uuid, p_name text, p_consent boolean)
returns table (auth_email text)
language plpgsql security definer set search_path = public as $$
declare dom text;
begin
  if not exists (select 1 from organization_memberships m where m.organization_id = p_org and m.user_id = p_actor
                    and 'owner' = any (m.roles) and m.status = 'active') then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở được liên kết máy chấm công.';
  end if;
  if coalesce(p_name, '') = '' or length(trim(p_name)) > 60 then raise exception 'INVALID_NAME: Hãy đặt tên máy (ví dụ "Máy cổng nhà màng").'; end if;
  if not coalesce(p_consent, false) then
    raise exception 'CONSENT_REQUIRED: Cần xác nhận đã báo và được người làm đồng ý cho chụp ảnh khi chấm công.';
  end if;
  if p_area is not null and not exists (select 1 from production_areas a where a.id = p_area and a.organization_id = p_org) then
    raise exception 'INVALID_AREA: Phân khu không thuộc cơ sở này.';
  end if;
  if (select count(*) from attendance_kiosks where organization_id = p_org and active) >= 5 then
    raise exception 'LIMIT: Mỗi cơ sở có tối đa 5 máy chấm công đang dùng. Hãy ngừng một máy trước.';
  end if;
  select value #>> '{}' into dom from platform_settings where key = 'login_email_domain';
  return query select 'kiosk-' || replace(gen_random_uuid()::text, '-', '') || '@kiosk.' || coalesce(dom, 'agricovi.com');
end $$;

create function kiosk_finalize(p_actor uuid, p_org uuid, p_area uuid, p_user uuid, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare kid uuid;
begin
  if not exists (select 1 from organization_memberships m where m.organization_id = p_org and m.user_id = p_actor
                    and 'owner' = any (m.roles) and m.status = 'active') then
    raise exception 'FORBIDDEN';
  end if;
  insert into attendance_kiosks (organization_id, area_id, name, user_id, photo_consent_at, created_by)
    values (p_org, p_area, trim(p_name), p_user, now(), p_actor) returning id into kid;
  return kid;
end $$;

-- Ngừng một máy: trả về tài khoản thiết bị để Edge Function khóa đăng nhập
create function kiosk_revoke(p_actor uuid, p_kiosk uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare k attendance_kiosks;
begin
  select * into k from attendance_kiosks where id = p_kiosk;
  if k.id is null or not exists (select 1 from organization_memberships m where m.organization_id = k.organization_id and m.user_id = p_actor
                                   and 'owner' = any (m.roles) and m.status = 'active') then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở được ngừng máy chấm công.';
  end if;
  update attendance_kiosks set active = false where id = p_kiosk;
  return k.user_id;
end $$;

create function purge_attendance_photos(p_days integer default 60) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from attendance_photos where taken_at < now() - make_interval(days => greatest(p_days, 7));
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Quyền thực thi
-- ---------------------------------------------------------------------------
revoke execute on function kiosk_hash(text, uuid, text), kiosk_find_worker(uuid, text), kiosk_count_failure(uuid),
  kiosk_fail(text, text), kiosk_authenticate(text, text) from public, anon, authenticated;
revoke execute on function kiosk_me(), kiosk_check(text, text), kiosk_punch(text, text, text, uuid, text, boolean),
  kiosk_set_pin(text, text, text), kiosk_can_exit(uuid), issue_pin_code(uuid), list_kiosk_pin_status(uuid),
  attendance_photo_review(uuid, date, date) from public, anon;
grant execute on function kiosk_me(), kiosk_check(text, text), kiosk_punch(text, text, text, uuid, text, boolean),
  kiosk_set_pin(text, text, text), kiosk_can_exit(uuid), issue_pin_code(uuid), list_kiosk_pin_status(uuid),
  attendance_photo_review(uuid, date, date) to authenticated;
revoke execute on function kiosk_precheck(uuid, uuid, uuid, text, boolean), kiosk_finalize(uuid, uuid, uuid, uuid, text),
  kiosk_revoke(uuid, uuid), purge_attendance_photos(integer) from public, anon, authenticated;
grant execute on function kiosk_precheck(uuid, uuid, uuid, text, boolean), kiosk_finalize(uuid, uuid, uuid, uuid, text),
  kiosk_revoke(uuid, uuid), purge_attendance_photos(integer) to service_role;
