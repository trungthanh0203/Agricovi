-- Máy chấm công: chọn VỤ khi Vào ca để tính chi phí nhân công theo vụ (D113); chủ cơ sở nhận ra bằng số điện thoại + PIN để cho phép Thoát chế độ máy;
-- chủ/quản lý đặt số điện thoại cho người làm chưa có.

-- Các vụ người làm có thể chọn ở máy này: vụ đang sản xuất của cơ sở; máy có phân khu và phân khu đó có vụ thì chỉ hiện vụ của phân khu.
create function kiosk_cycle_options(p_kiosk attendance_kiosks) returns table (cid uuid, cname text, in_area boolean)
language sql stable security definer set search_path = public as $$
  with c as (
    select pc.id, coalesce(nullif(trim(pc.name), ''), coalesce(ct.name, 'Vụ') || ' ' || to_char(pc.start_date, 'DD/MM')) as nm,
           (p_kiosk.area_id is not null and pc.area_id = p_kiosk.area_id) as ia
      from production_cycles pc left join crop_types ct on ct.id = pc.crop_type_id
     where pc.owner_org_id = p_kiosk.organization_id and pc.status = 'active')
  select c.id, c.nm, c.ia from c
   where c.ia or not exists (select 1 from c c2 where c2.ia)
   order by c.ia desc, c.nm;
$$;
revoke execute on function kiosk_cycle_options(attendance_kiosks) from public, anon, authenticated;

create function kiosk_cycles() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare k attendance_kiosks;
begin
  select * into k from attendance_kiosks where user_id = auth.uid() and active;
  if k.id is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', o.cid, 'name', o.cname, 'in_area', o.in_area)) from kiosk_cycle_options(k) o), '[]'::jsonb);
end $$;

-- kiosk_check: thêm vụ lần trước, vụ của ca đang mở, và cờ "chủ cơ sở"
drop function kiosk_check(text, text);
create function kiosk_check(p_phone text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a jsonb := kiosk_authenticate(p_phone, p_pin); w uuid; o attendance_records; last_cycle uuid; uid uuid; org uuid := (a ->> 'org')::uuid;
begin
  if not (a ->> 'ok')::boolean then return a; end if;
  w := (a ->> 'worker_id')::uuid;
  select * into o from attendance_records where worker_id = w and ended_at is null and status <> 'rejected' order by started_at desc limit 1;
  select cycle_id into last_cycle from attendance_records where worker_id = w and cycle_id is not null order by started_at desc limit 1;
  select user_id into uid from worker_profiles where id = w;
  return jsonb_build_object('ok', true, 'name', (select full_name from worker_profiles where id = w),
                            'state', case when o.id is null then 'out' else 'in' end,
                            'since', o.started_at, 'stale', o.id is not null and o.work_date < vn_today(),
                            'last_cycle', last_cycle,
                            'cycle_name', (select coalesce(nullif(trim(pc.name), ''), coalesce(ct.name, 'Vụ') || ' ' || to_char(pc.start_date, 'DD/MM'))
                                             from production_cycles pc left join crop_types ct on ct.id = pc.crop_type_id where pc.id = o.cycle_id),
                            'is_owner', uid is not null and exists (select 1 from organization_memberships m where m.organization_id = org and m.user_id = uid
                                                                      and 'owner' = any (m.roles) and m.status = 'active'));
end $$;

-- kiosk_punch: Vào ca kèm vụ (null = việc chung, không thuộc vụ nào)
drop function kiosk_punch(text, text, text, uuid, text, boolean, jsonb, integer);
create function kiosk_punch(p_phone text, p_pin text, p_action text, p_id uuid, p_photo text, p_face_ok boolean default null,
                            p_descriptor jsonb default null, p_attempts integer default 1, p_cycle uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a jsonb := kiosk_authenticate(p_phone, p_pin); w uuid; k uuid; ar uuid; org uuid; o attendance_records; att uuid; nm text; stale boolean := false; fs record; kr attendance_kiosks;
begin
  if not (a ->> 'ok')::boolean then return a; end if;
  w := (a ->> 'worker_id')::uuid; k := (a ->> 'kiosk_id')::uuid; ar := nullif(a ->> 'area', '')::uuid; org := (a ->> 'org')::uuid;
  select * into kr from attendance_kiosks where id = k;
  select full_name into nm from worker_profiles where id = w;
  if p_action not in ('in', 'out') then return kiosk_fail('INVALID_ARGUMENT', 'Thao tác không hợp lệ.'); end if;
  if p_photo is null or length(p_photo) < 100 then return kiosk_fail('NO_PHOTO', 'Chưa chụp được ảnh. Hãy cho phép dùng camera rồi thử lại.'); end if;
  if length(p_photo) > 90000 then return kiosk_fail('PHOTO_TOO_BIG', 'Ảnh quá lớn, hãy thử lại.'); end if;
  if exists (select 1 from attendance_photos where id = p_id) then   -- bấm lặp
    return jsonb_build_object('ok', true, 'action', p_action, 'name', nm, 'at', now(), 'duplicate', true);
  end if;
  if p_action = 'in' and p_cycle is not null and not exists (select 1 from kiosk_cycle_options(kr) opt where opt.cid = p_cycle) then
    return kiosk_fail('INVALID_CYCLE', 'Vụ này không có ở máy chấm công này hoặc đã kết thúc. Hãy chọn lại.');
  end if;
  select * into o from attendance_records where worker_id = w and ended_at is null and status <> 'rejected' order by started_at desc limit 1;
  select * into fs from kiosk_face_state(w, face_vec(p_descriptor));
  begin
    if p_action = 'in' then
      if o.id is not null then
        return kiosk_fail('ALREADY_IN', 'Bạn đã vào ca lúc ' || to_char(o.started_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI') || ' rồi. Hãy bấm Ra ca khi xong việc.');
      end if;
      insert into attendance_records (id, worker_id, work_date, started_at, source, device_recorded_at, kiosk_id, area_id, cycle_id)
        values (p_id, w, vn_today(), now(), 'kiosk', now(), k, ar, p_cycle) returning id into att;
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

-- Chủ / quản lý đặt số điện thoại cho người làm (dùng đăng nhập máy chấm công). Không trùng người làm khác đang hoạt động.
create function set_worker_phone(p_worker uuid, p_phone text) returns text
language plpgsql security definer set search_path = public as $$
declare org uuid := worker_org(p_worker); n text := normalize_vn_phone(p_phone);
begin
  if org is null or not is_workforce_admin(org) then raise exception 'FORBIDDEN: Chỉ chủ hoặc quản lý được đặt số điện thoại.'; end if;
  if n is null then raise exception 'INVALID_PHONE: Số điện thoại chưa đúng (cần số di động 10 chữ số, ví dụ 0912345678).'; end if;
  if exists (select 1 from worker_profiles w where w.organization_id = org and w.id <> p_worker and w.status = 'active' and normalize_vn_phone(w.phone) = n) then
    raise exception 'PHONE_IN_USE: Số này đã là của người làm khác trong cơ sở.';
  end if;
  update worker_profiles set phone = n where id = p_worker;
  return n;
end $$;

revoke execute on function kiosk_cycles(), kiosk_check(text, text), kiosk_punch(text, text, text, uuid, text, boolean, jsonb, integer, uuid),
  set_worker_phone(uuid, text) from public, anon;
grant execute on function kiosk_cycles(), kiosk_check(text, text), kiosk_punch(text, text, text, uuid, text, boolean, jsonb, integer, uuid),
  set_worker_phone(uuid, text) to authenticated;
