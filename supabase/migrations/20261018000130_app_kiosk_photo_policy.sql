-- Máy chấm công (D114): (1) chỉ LƯU ẢNH khi máy nghi ngờ (không thấy mặt, không khớp/khớp chưa chắc, chụp lại nhiều lần, quên Ra ca, chưa có mẫu hoặc không so được);
-- đúng người thì không giữ ảnh, chỉ giữ dòng số liệu (khoảng cách khuôn mặt) để hiệu chỉnh ngưỡng. Nhẹ dữ liệu và ít xâm phạm hơn.
-- (2) Hỏi VỤ khi Vào ca là tùy chọn theo từng máy, mặc định TẮT (nhiều người làm không theo một vụ; chi phí nhân công tính chung ở cấp cơ sở).

alter table attendance_photos alter column photo drop not null;
alter table attendance_photos drop constraint attendance_photos_photo_check;
alter table attendance_photos add constraint attendance_photos_photo_check check (photo is null or length(photo) between 100 and 90000);

alter table attendance_kiosks add column ask_cycle boolean not null default false;

create function set_kiosk_ask_cycle(p_kiosk uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare org uuid;
begin
  select organization_id into org from attendance_kiosks where id = p_kiosk;
  if org is null or not has_org_role(org, array['owner']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở được đổi cài đặt máy chấm công.';
  end if;
  update attendance_kiosks set ask_cycle = coalesce(p_on, false) where id = p_kiosk;
end $$;

-- Máy không hỏi vụ thì không có lựa chọn nào (Vào ca ghi là việc chung)
create or replace function kiosk_cycles() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare k attendance_kiosks;
begin
  select * into k from attendance_kiosks where user_id = auth.uid() and active;
  if k.id is null or not k.ask_cycle then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', o.cid, 'name', o.cname, 'in_area', o.in_area)) from kiosk_cycle_options(k) o), '[]'::jsonb);
end $$;

drop function kiosk_punch(text, text, text, uuid, text, boolean, jsonb, integer, uuid);
create function kiosk_punch(p_phone text, p_pin text, p_action text, p_id uuid, p_photo text, p_face_ok boolean default null,
                            p_descriptor jsonb default null, p_attempts integer default 1, p_cycle uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a jsonb := kiosk_authenticate(p_phone, p_pin); w uuid; k uuid; ar uuid; org uuid; o attendance_records; att uuid; nm text; stale boolean := false; fs record; kr attendance_kiosks; keep boolean;
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
    -- Chỉ giữ ảnh khi có điều đáng xem; khớp rõ ràng thì bỏ ảnh, giữ dòng số liệu
    keep := p_face_ok is false or fs.state <> 'match' or coalesce(p_attempts, 1) >= 3 or stale;
    insert into attendance_photos (id, organization_id, attendance_id, worker_id, kiosk_id, kind, photo, face_ok, face_distance, face_attempts)
      values (p_id, org, att, w, k, p_action, case when keep then p_photo end, p_face_ok, fs.dist, least(greatest(coalesce(p_attempts, 1), 1), 9));
  exception when others then
    return kiosk_fail('ERROR', 'Không ghi được: ' || regexp_replace(sqlerrm, '^[A-Z_]+: ', ''));
  end;
  return jsonb_build_object('ok', true, 'action', p_action, 'name', nm, 'at', now(), 'stale', stale, 'face', fs.state);
end $$;

-- Màn Ảnh chấm công chỉ liệt kê dòng có ảnh (dòng khớp rõ ràng không còn ảnh); so sánh "hai người bấm sát nhau" dùng điều kiện khoảng thời gian để dùng được chỉ mục
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
                                  and q.taken_at between p.taken_at - interval '20 seconds' and p.taken_at + interval '20 seconds') then 'fast_pair' end,
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
     where p.organization_id = p_org and p.photo is not null
       and (p.taken_at at time zone 'Asia/Ho_Chi_Minh')::date between p_from and p_to
     order by p.taken_at desc
     limit 300;
end $$;

revoke execute on function set_kiosk_ask_cycle(uuid, boolean), kiosk_cycles(), kiosk_punch(text, text, text, uuid, text, boolean, jsonb, integer, uuid),
  attendance_photo_review(uuid, date, date) from public, anon;
grant execute on function set_kiosk_ask_cycle(uuid, boolean), kiosk_cycles(), kiosk_punch(text, text, text, uuid, text, boolean, jsonb, integer, uuid),
  attendance_photo_review(uuid, date, date) to authenticated;
