-- Đối chiếu khuôn mặt cho Máy chấm công (D112, Đợt 3). Chỉ GẮN CỜ, không chặn chấm công.
-- Điện thoại tính "dấu vân khuôn mặt" (128 số) ngay trên máy; MÁY CHỦ so với mẫu đã đăng ký và quyết định mức khớp.
-- Mẫu 128 số không ai đọc được (không có chính sách đọc); chủ chỉ thấy 1 ảnh mẫu nhỏ để nhìn cạnh ảnh chấm công.
-- Người làm tự đồng ý lưu dữ liệu khuôn mặt khi đăng ký (có thời điểm đồng ý); chỉ đăng ký/đăng ký lại được bằng mã do chủ cấp.

insert into platform_settings (key, value, description) values
  ('face_maybe_distance', '0.5', 'Khoảng cách khuôn mặt từ mức này trở lên: cờ "khớp chưa chắc" (Máy chấm công)'),
  ('face_mismatch_distance', '0.6', 'Khoảng cách khuôn mặt từ mức này trở lên: cờ "có thể không phải đúng người" (Máy chấm công)')
on conflict (key) do nothing;

create table worker_face_profiles (
  worker_id uuid primary key references worker_profiles(id) on delete cascade,
  consent_at timestamptz not null,
  enrolled_at timestamptz not null default now(),
  photo text not null check (length(photo) between 100 and 90000)   -- ảnh mẫu nhỏ (JPEG base64) cho chủ đối chiếu bằng mắt
);
alter table worker_face_profiles enable row level security;
create policy face_profiles_read on worker_face_profiles for select to authenticated using (is_workforce_admin(worker_org(worker_id)));

create table worker_face_refs (
  worker_id uuid not null references worker_profiles(id) on delete cascade,
  idx smallint not null check (idx between 1 and 3),
  descriptor float8[] not null check (array_length(descriptor, 1) = 128),
  primary key (worker_id, idx)
);
alter table worker_face_refs enable row level security;   -- không có chính sách: chỉ các hàm bên dưới đọc được

alter table attendance_photos
  add column face_distance real,                          -- khoảng cách tới mẫu gần nhất (null = không so được)
  add column face_attempts smallint not null default 1;   -- số lần chụp trước khi ghi

create function face_distance(a float8[], b float8[]) returns float8
language sql immutable set search_path = public as $$
  select sqrt(sum(power(x - y, 2))) from unnest(a, b) as t(x, y);
$$;

-- Kiểm tra mảng 128 số từ JSON, trả về mảng hoặc null nếu sai dạng
create function face_vec(p jsonb) returns float8[]
language plpgsql immutable set search_path = public as $$
declare v float8[];
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) <> 128 then return null; end if;
  select array_agg(e::float8) into v from jsonb_array_elements_text(p) e;
  if exists (select 1 from unnest(v) x where x = 'NaN'::float8 or abs(x) > 10) then return null; end if;
  return v;
exception when others then return null;
end $$;

-- Mức khớp của một dấu vân với mẫu của người làm: match | maybe | mismatch | no_ref | none (không có dấu vân hợp lệ)
create function kiosk_face_state(p_worker uuid, p_vec float8[], out state text, out dist real)
language plpgsql stable security definer set search_path = public as $$
declare lo float8 := coalesce((select (value #>> '{}')::float8 from platform_settings where key = 'face_maybe_distance'), 0.5);
        hi float8 := coalesce((select (value #>> '{}')::float8 from platform_settings where key = 'face_mismatch_distance'), 0.6);
begin
  if p_vec is null then state := 'none'; return; end if;
  select min(face_distance(r.descriptor, p_vec))::real into dist from worker_face_refs r where r.worker_id = p_worker;
  state := case when dist is null then 'no_ref' when dist >= hi then 'mismatch' when dist >= lo then 'maybe' else 'match' end;
end $$;

-- Xóa dữ liệu khuôn mặt khi người làm nghỉ việc
create function worker_face_cleanup() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'active' then
    delete from worker_face_profiles where worker_id = new.id;
    delete from worker_face_refs where worker_id = new.id;
  end if;
  return new;
end $$;
create trigger worker_face_cleanup_trg after update of status on worker_profiles for each row execute function worker_face_cleanup();

-- ---------------------------------------------------------------------------
-- Hàm cho máy chấm công
-- ---------------------------------------------------------------------------
-- Bước chụp: cho biết mức khớp (không ghi gì) để máy cho chụp lại khi "không khớp"
create function kiosk_face_check(p_phone text, p_pin text, p_descriptor jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a jsonb := kiosk_authenticate(p_phone, p_pin); s record;
begin
  if not (a ->> 'ok')::boolean then return a; end if;
  select * into s from kiosk_face_state((a ->> 'worker_id')::uuid, face_vec(p_descriptor));
  return jsonb_build_object('ok', true, 'state', s.state);
end $$;

drop function kiosk_punch(text, text, text, uuid, text, boolean);
create function kiosk_punch(p_phone text, p_pin text, p_action text, p_id uuid, p_photo text, p_face_ok boolean default null,
                            p_descriptor jsonb default null, p_attempts integer default 1) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a jsonb := kiosk_authenticate(p_phone, p_pin); w uuid; k uuid; ar uuid; org uuid; o attendance_records; att uuid; nm text; stale boolean := false; fs record;
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
  select * into fs from kiosk_face_state(w, face_vec(p_descriptor));
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
    insert into attendance_photos (id, organization_id, attendance_id, worker_id, kiosk_id, kind, photo, face_ok, face_distance, face_attempts)
      values (p_id, org, att, w, k, p_action, p_photo, p_face_ok, fs.dist, least(greatest(coalesce(p_attempts, 1), 1), 9));
  exception when others then
    return kiosk_fail('ERROR', 'Không ghi được: ' || regexp_replace(sqlerrm, '^[A-Z_]+: ', ''));
  end;
  return jsonb_build_object('ok', true, 'action', p_action, 'name', nm, 'at', now(), 'stale', stale, 'face', fs.state);
end $$;

-- Đặt PIN (+ đăng ký khuôn mặt nếu gửi kèm dấu vân): cần mã chủ cấp. Đăng ký khuôn mặt cần người làm tự đồng ý.
drop function kiosk_set_pin(text, text, text);
create function kiosk_set_pin(p_phone text, p_code text, p_new_pin text, p_descriptors jsonb default null, p_photo text default null,
                              p_consent boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k attendance_kiosks; w uuid; p worker_kiosk_pins; pin text := trim(coalesce(p_new_pin, '')); salt text; i integer;
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
  -- khuôn mặt (không bắt buộc ở máy chủ, nhưng nếu gửi thì phải hợp lệ và có đồng ý)
  if p_descriptors is not null then
    if not coalesce(p_consent, false) then return kiosk_fail('CONSENT_REQUIRED', 'Cần bạn đồng ý cho lưu dữ liệu khuôn mặt để chấm công.'); end if;
    if jsonb_typeof(p_descriptors) <> 'array' or jsonb_array_length(p_descriptors) not between 1 and 3 or p_photo is null or length(p_photo) not between 100 and 90000 then
      return kiosk_fail('BAD_FACE', 'Dữ liệu khuôn mặt chưa hợp lệ, hãy chụp lại.');
    end if;
    for i in 0 .. jsonb_array_length(p_descriptors) - 1 loop
      if face_vec(p_descriptors -> i) is null then return kiosk_fail('BAD_FACE', 'Dữ liệu khuôn mặt chưa hợp lệ, hãy chụp lại.'); end if;
    end loop;
  end if;
  salt := gen_random_uuid()::text;
  update worker_kiosk_pins set pin_salt = salt, pin_hash = kiosk_hash(salt, w, pin), set_at = now(),
         code_hash = null, code_expires_at = null, failed_count = 0, locked_until = null where worker_id = w;
  if p_descriptors is not null then
    delete from worker_face_refs where worker_id = w;
    for i in 0 .. jsonb_array_length(p_descriptors) - 1 loop
      insert into worker_face_refs (worker_id, idx, descriptor) values (w, i + 1, face_vec(p_descriptors -> i));
    end loop;
    insert into worker_face_profiles (worker_id, consent_at, enrolled_at, photo) values (w, now(), now(), p_photo)
      on conflict (worker_id) do update set consent_at = now(), enrolled_at = now(), photo = excluded.photo;
  end if;
  return jsonb_build_object('ok', true, 'face', p_descriptors is not null);
end $$;

-- ---------------------------------------------------------------------------
-- Hàm cho chủ / quản lý
-- ---------------------------------------------------------------------------
drop function list_kiosk_pin_status(uuid);
create function list_kiosk_pin_status(p_org uuid) returns table (wid uuid, has_pin boolean, code_pending boolean, is_locked boolean, has_face boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_workforce_admin(p_org) then raise exception 'FORBIDDEN: Bạn không có quyền xem mục này.'; end if;
  return query
    select w.id, coalesce(p.pin_hash is not null, false), coalesce(p.code_hash is not null and p.code_expires_at > now(), false),
           coalesce(p.locked_until is not null and p.locked_until > now(), false),
           exists (select 1 from worker_face_profiles f where f.worker_id = w.id)
      from worker_profiles w left join worker_kiosk_pins p on p.worker_id = w.id
     where w.organization_id = p_org and w.status = 'active';
end $$;

create function delete_worker_face(p_worker uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if worker_org(p_worker) is null or not is_workforce_admin(worker_org(p_worker)) then
    raise exception 'FORBIDDEN: Chỉ chủ hoặc quản lý được xóa dữ liệu khuôn mặt.';
  end if;
  delete from worker_face_profiles where worker_id = p_worker;
  delete from worker_face_refs where worker_id = p_worker;
end $$;

drop function attendance_photo_review(uuid, date, date);
create function attendance_photo_review(p_org uuid, p_from date, p_to date)
returns table (ph_id uuid, att_id uuid, wk_id uuid, wk_name text, ph_kind text, ph_at timestamptz, ph_photo text, ph_face_ok boolean,
               ph_flags text[], kiosk_name text, area_name text, ph_distance real)
language plpgsql stable security definer set search_path = public as $$
declare lo float8 := coalesce((select (value #>> '{}')::float8 from platform_settings where key = 'face_maybe_distance'), 0.5);
        hi float8 := coalesce((select (value #>> '{}')::float8 from platform_settings where key = 'face_mismatch_distance'), 0.6);
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
             case when p.kind = 'out' and a.exception_reason is not null then 'forgot_out' end,
             case when p.face_distance >= hi then 'face_mismatch' when p.face_distance >= lo then 'face_maybe' end,
             case when not exists (select 1 from worker_face_profiles f where f.worker_id = p.worker_id) then 'no_ref'
                  when p.face_distance is null then 'no_descriptor' end,
             case when p.face_attempts >= 3 then 'retries' end
           ], null),
           k.name, ar.name, p.face_distance
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
-- Quyền thực thi
-- ---------------------------------------------------------------------------
revoke execute on function face_distance(float8[], float8[]), face_vec(jsonb), kiosk_face_state(uuid, float8[]), worker_face_cleanup()
  from public, anon, authenticated;
revoke execute on function kiosk_face_check(text, text, jsonb), kiosk_punch(text, text, text, uuid, text, boolean, jsonb, integer),
  kiosk_set_pin(text, text, text, jsonb, text, boolean), list_kiosk_pin_status(uuid), delete_worker_face(uuid),
  attendance_photo_review(uuid, date, date) from public, anon;
grant execute on function kiosk_face_check(text, text, jsonb), kiosk_punch(text, text, text, uuid, text, boolean, jsonb, integer),
  kiosk_set_pin(text, text, text, jsonb, text, boolean), list_kiosk_pin_status(uuid), delete_worker_face(uuid),
  attendance_photo_review(uuid, date, date) to authenticated;
