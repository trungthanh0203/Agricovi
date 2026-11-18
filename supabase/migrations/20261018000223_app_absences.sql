-- D189: ghi nghỉ việc theo chấm công (docs/PLAN_GHI_NGHI.md, bước 1). Người làm ít dùng app nên chủ/quản lý (tổ trưởng với người trong tổ) GHI HỘ;
-- không có luồng nhân viên gửi đơn hay chờ duyệt. Chỉ ghi nhận, chưa nối vào phiếu lương. Hủy = đánh dấu, sửa có phiên bản.

create table worker_absences (
  id uuid primary key,                                              -- UUID tạo ở thiết bị: bấm lặp không nhân đôi
  organization_id uuid not null references organizations(id) on delete cascade,
  worker_id uuid not null references worker_profiles(id) on delete cascade,
  from_date date not null,
  to_date date not null,
  half_day boolean not null default false,                          -- chỉ khi nghỉ đúng một ngày
  kind text not null check (kind in ('annual', 'sick', 'family', 'unpaid', 'no_notice', 'other')),
  notice text not null default 'before' check (notice in ('before', 'after', 'none')),   -- xin trước / báo sau / không báo
  channel text check (channel is null or channel in ('in_person', 'phone', 'zalo', 'other')),
  noticed_on date,                                                  -- ngày được báo
  reason text check (reason is null or length(reason) <= 200),
  paid boolean not null default false,                              -- chỉ ghi nhận, chưa nối phiếu lương
  file text,                                                        -- ảnh giấy khám, tin nhắn…
  note text check (note is null or length(note) <= 300),
  status text not null default 'active' check (status in ('active', 'cancelled')),
  version integer not null default 1,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (to_date >= from_date and to_date - from_date <= 89),
  check (not half_day or from_date = to_date)
);
create index on worker_absences (organization_id, from_date);
create index on worker_absences (worker_id, from_date);

alter table worker_absences enable row level security;
create policy worker_absences_read on worker_absences for select to authenticated
  using (is_workforce_admin(organization_id) or is_team_leader_of(worker_id) or is_worker_self(worker_id));
revoke insert, update, delete on worker_absences from authenticated, anon;

-- Chủ/quản lý ghi cho mọi người; tổ trưởng chỉ cho người trong tổ và không cho chính mình
create or replace function absence_guard(p_worker uuid) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v_org uuid := worker_org(p_worker);
begin
  if v_org is null then raise exception 'NOT_FOUND: Không tìm thấy người lao động.'; end if;
  if auth.uid() is null then raise exception 'FORBIDDEN: Bạn cần đăng nhập.'; end if;
  if is_workforce_admin(v_org) then return v_org; end if;
  if is_team_leader_of(p_worker) and not is_worker_self(p_worker) then return v_org; end if;
  raise exception 'FORBIDDEN: Chỉ chủ, quản lý hoặc tổ trưởng của người này được ghi nghỉ.';
end $$;
revoke execute on function absence_guard(uuid) from public, anon;

create or replace function absence_validate(p_worker uuid, p_id uuid, p_from date, p_to date, p_half boolean, p_kind text, p_notice text, p_channel text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if p_from is null or p_to is null then raise exception 'INVALID_DATE: Hãy nhập ngày nghỉ.'; end if;
  if p_to < p_from then raise exception 'INVALID_DATE: Ngày nghỉ đến không được trước ngày nghỉ từ.'; end if;
  if p_to - p_from > 89 then raise exception 'INVALID_DATE: Mỗi lần ghi tối đa 90 ngày.'; end if;
  if coalesce(p_half, false) and p_from <> p_to then raise exception 'INVALID_DATE: Nghỉ nửa ngày chỉ áp dụng khi nghỉ đúng một ngày.'; end if;
  if p_kind not in ('annual', 'sick', 'family', 'unpaid', 'no_notice', 'other') then raise exception 'INVALID_ARGUMENT: Loại nghỉ chưa đúng.'; end if;
  if p_notice not in ('before', 'after', 'none') then raise exception 'INVALID_ARGUMENT: Hãy chọn có xin phép hay không.'; end if;
  if p_channel is not null and p_channel not in ('in_person', 'phone', 'zalo', 'other') then raise exception 'INVALID_ARGUMENT: Cách xin nghỉ chưa đúng.'; end if;
  if exists (select 1 from worker_absences a where a.worker_id = p_worker and a.status = 'active' and a.id <> p_id and a.from_date <= p_to and a.to_date >= p_from) then
    raise exception 'OVERLAP: Người này đã có ghi nghỉ trùng các ngày vừa chọn. Hãy sửa hoặc hủy ghi nghỉ cũ.';
  end if;
end $$;
revoke execute on function absence_validate(uuid, uuid, date, date, boolean, text, text, text) from public, anon;

create or replace function create_worker_absence(
  p_id uuid, p_worker uuid, p_from date, p_to date, p_half boolean, p_kind text, p_notice text, p_channel text, p_noticed_on date,
  p_reason text, p_paid boolean, p_file text, p_note text) returns worker_absences
language plpgsql security definer set search_path = public as $$
declare v_org uuid; r worker_absences;
begin
  v_org := absence_guard(p_worker);
  select * into r from worker_absences where id = p_id;
  if r.id is not null then
    if r.organization_id <> v_org then raise exception 'FORBIDDEN: Mã ghi nghỉ đã tồn tại ở nơi khác.'; end if;
    return r;
  end if;
  perform 1 from worker_profiles where id = p_worker for update;                    -- tuần tự hóa kiểm trùng ngày của cùng một người
  perform absence_validate(p_worker, p_id, p_from, p_to, p_half, p_kind, p_notice, p_channel);
  insert into worker_absences (id, organization_id, worker_id, from_date, to_date, half_day, kind, notice, channel, noticed_on, reason, paid, file, note)
  values (p_id, v_org, p_worker, p_from, p_to, coalesce(p_half, false), p_kind, p_notice, p_channel, p_noticed_on,
          nullif(btrim(coalesce(p_reason, '')), ''), coalesce(p_paid, false), nullif(p_file, ''), nullif(btrim(coalesce(p_note, '')), ''))
  returning * into r;
  insert into audit_events (organization_id, actor_id, action, entity, entity_id, after)
  values (v_org, auth.uid(), 'create_worker_absence', 'worker_absence', r.id::text, jsonb_build_object('worker_id', p_worker, 'from', p_from, 'to', p_to, 'kind', p_kind));
  return r;
end $$;

create or replace function update_worker_absence(
  p_id uuid, p_version integer, p_from date, p_to date, p_half boolean, p_kind text, p_notice text, p_channel text, p_noticed_on date,
  p_reason text, p_paid boolean, p_file text, p_note text) returns worker_absences
language plpgsql security definer set search_path = public as $$
declare r worker_absences;
begin
  select * into r from worker_absences where id = p_id for update;
  if r.id is null then raise exception 'NOT_FOUND: Không tìm thấy ghi nghỉ.'; end if;
  perform absence_guard(r.worker_id);
  if r.version <> p_version then raise exception 'CONFLICT: Ghi nghỉ vừa được người khác sửa. Hãy tải lại bản mới.'; end if;
  if r.status = 'cancelled' then raise exception 'LOCKED: Ghi nghỉ đã hủy nên không sửa được.'; end if;
  perform 1 from worker_profiles where id = r.worker_id for update;
  perform absence_validate(r.worker_id, p_id, p_from, p_to, p_half, p_kind, p_notice, p_channel);
  update worker_absences set from_date = p_from, to_date = p_to, half_day = coalesce(p_half, false), kind = p_kind, notice = p_notice, channel = p_channel,
         noticed_on = p_noticed_on, reason = nullif(btrim(coalesce(p_reason, '')), ''), paid = coalesce(p_paid, false), file = nullif(p_file, ''),
         note = nullif(btrim(coalesce(p_note, '')), ''), version = version + 1
   where id = p_id returning * into r;
  insert into audit_events (organization_id, actor_id, action, entity, entity_id) values (r.organization_id, auth.uid(), 'update_worker_absence', 'worker_absence', r.id::text);
  return r;
end $$;

create or replace function cancel_worker_absence(p_id uuid, p_version integer) returns worker_absences
language plpgsql security definer set search_path = public as $$
declare r worker_absences;
begin
  select * into r from worker_absences where id = p_id for update;
  if r.id is null then raise exception 'NOT_FOUND: Không tìm thấy ghi nghỉ.'; end if;
  perform absence_guard(r.worker_id);
  if r.version <> p_version then raise exception 'CONFLICT: Ghi nghỉ vừa được người khác sửa. Hãy tải lại bản mới.'; end if;
  if r.status = 'cancelled' then return r; end if;
  update worker_absences set status = 'cancelled', version = version + 1 where id = p_id returning * into r;
  insert into audit_events (organization_id, actor_id, action, entity, entity_id) values (r.organization_id, auth.uid(), 'cancel_worker_absence', 'worker_absence', r.id::text);
  return r;
end $$;

revoke execute on function create_worker_absence(uuid, uuid, date, date, boolean, text, text, text, date, text, boolean, text, text) from public, anon;
revoke execute on function update_worker_absence(uuid, integer, date, date, boolean, text, text, text, date, text, boolean, text, text) from public, anon;
revoke execute on function cancel_worker_absence(uuid, integer) from public, anon;
grant execute on function create_worker_absence(uuid, uuid, date, date, boolean, text, text, text, date, text, boolean, text, text) to authenticated;
grant execute on function update_worker_absence(uuid, integer, date, date, boolean, text, text, text, date, text, boolean, text, text) to authenticated;
grant execute on function cancel_worker_absence(uuid, integer) to authenticated;
