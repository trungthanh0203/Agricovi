-- D199: BẢNG CHẤM CÔNG GIẤY, lớp C (docs/PLAN_BANG_CHAM_CONG_GIAY.md). Khi in bảng, hệ thống LƯU một bản chụp của bảng đã phát hành
-- (mã bảng, kỳ từ ngày–đến ngày, danh sách người theo đúng thứ tự đã in, ca mặc định, kiểu ghi) để lớp A (nhập số liệu) dựng lưới đúng như tờ giấy.
-- Chỉ ghi qua hàm. Chủ/quản lý tạo bảng cho mọi người; tổ trưởng chỉ cho người trong tổ mình (và không cho chính mình).

create table timesheet_sheets (
  id uuid primary key,                                              -- UUID tạo ở thiết bị: bấm lặp không tạo trùng
  organization_id uuid not null references organizations(id) on delete cascade,
  code text not null,                                               -- BC-AAMM-NNNN, tuần tự theo cơ sở và tháng tạo
  from_date date not null,
  to_date date not null,
  mode text not null check (mode in ('shift', 'hours')),            -- đánh dấu ca / ghi số giờ
  shift_start time not null,
  shift_end time not null,
  break_minutes integer not null default 0 check (break_minutes between 0 and 480),
  workers jsonb not null,                                           -- [{worker_id, name, team}] đúng thứ tự đã in
  note text check (note is null or length(note) <= 300),
  status text not null default 'printed' check (status in ('printed', 'entered')),
  entered_at timestamptz,
  entered_by uuid references auth.users(id),
  version integer not null default 1,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (organization_id, code),
  check (to_date >= from_date and to_date - from_date <= 30),
  check (shift_end > shift_start),
  check (jsonb_typeof(workers) = 'array' and jsonb_array_length(workers) between 1 and 200)
);
create index on timesheet_sheets (organization_id, created_at desc);

alter table timesheet_sheets enable row level security;
create policy timesheet_sheets_read on timesheet_sheets for select to authenticated
  using (is_workforce_admin(organization_id) or created_by = auth.uid());
revoke insert, update, delete on timesheet_sheets from authenticated, anon;

-- Tạo (phát hành) một bảng. p_workers là danh sách mã người ĐÚNG THỨ TỰ sẽ in (app sắp theo tổ rồi tên).
create or replace function create_timesheet_sheet(
  p_id uuid, p_org uuid, p_from date, p_to date, p_mode text, p_start time, p_end time, p_break integer, p_workers uuid[], p_note text default null
) returns timesheet_sheets
language plpgsql security definer set search_path = public as $$
declare r timesheet_sheets; v_admin boolean; v_list jsonb; v_n integer; v_code text; v_ym text; w uuid; wp worker_profiles;
begin
  if auth.uid() is null then raise exception 'FORBIDDEN: Bạn cần đăng nhập.'; end if;
  select * into r from timesheet_sheets where id = p_id;
  if r.id is not null then
    if r.organization_id <> p_org then raise exception 'FORBIDDEN: Mã bảng đã tồn tại ở nơi khác.'; end if;
    return r;                                                       -- bấm lặp không tạo trùng
  end if;
  v_admin := is_workforce_admin(p_org);
  if p_from is null or p_to is null or p_to < p_from then raise exception 'INVALID_DATE: Ngày kết thúc không được trước ngày bắt đầu.'; end if;
  if p_to - p_from > 30 then raise exception 'INVALID_DATE: Một bảng tối đa 31 ngày. Hãy chia thành nhiều bảng.'; end if;
  if p_mode not in ('shift', 'hours') then raise exception 'INVALID_ARGUMENT: Kiểu ghi chưa đúng.'; end if;
  if p_start is null or p_end is null or p_end <= p_start then raise exception 'INVALID_TIME: Giờ ra của ca mặc định phải sau giờ vào.'; end if;
  if coalesce(p_break, 0) < 0 or coalesce(p_break, 0) > 480 then raise exception 'INVALID_ARGUMENT: Nghỉ giữa ca từ 0 đến 480 phút.'; end if;
  if p_workers is null or cardinality(p_workers) = 0 then raise exception 'INVALID_ARGUMENT: Hãy chọn ít nhất một người.'; end if;
  if cardinality(p_workers) > 200 then raise exception 'INVALID_ARGUMENT: Một bảng tối đa 200 người. Hãy chia theo tổ.'; end if;

  v_list := '[]'::jsonb;
  foreach w in array p_workers loop
    select * into wp from worker_profiles where id = w;
    if wp.id is null or wp.organization_id <> p_org then raise exception 'NOT_FOUND: Có người không thuộc cơ sở này.'; end if;
    if not v_admin and not (is_team_leader_of(w) and not is_worker_self(w)) then
      raise exception 'FORBIDDEN: Tổ trưởng chỉ tạo bảng cho người trong tổ của mình.';
    end if;
    v_list := v_list || jsonb_build_array(jsonb_build_object('worker_id', w, 'name', wp.full_name, 'team',
      (select t.name from worker_team_memberships m join worker_teams t on t.id = m.team_id and t.is_active
        where m.worker_id = w and m.valid_to is null order by t.name limit 1)));
  end loop;

  -- mã bảng tuần tự theo cơ sở và tháng (giờ Việt Nam); khóa theo cơ sở để hai người tạo cùng lúc không trùng mã
  perform pg_advisory_xact_lock(hashtext('timesheet:' || p_org::text));
  v_ym := to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYMM');
  select count(*) + 1 into v_n from timesheet_sheets where organization_id = p_org and code like 'BC-' || v_ym || '-%';
  v_code := 'BC-' || v_ym || '-' || lpad(v_n::text, 4, '0');

  insert into timesheet_sheets (id, organization_id, code, from_date, to_date, mode, shift_start, shift_end, break_minutes, workers, note)
  values (p_id, p_org, v_code, p_from, p_to, p_mode, p_start, p_end, coalesce(p_break, 0), v_list, nullif(btrim(coalesce(p_note, '')), ''))
  returning * into r;
  insert into audit_events (organization_id, actor_id, action, entity, entity_id, after)
  values (p_org, auth.uid(), 'create_timesheet_sheet', 'timesheet_sheet', r.id::text, jsonb_build_object('code', v_code, 'from', p_from, 'to', p_to, 'people', cardinality(p_workers)));
  return r;
end $$;

-- Đánh dấu một bảng đã nhập xong / chưa nhập xong (chủ, quản lý, hoặc người tạo bảng)
create or replace function mark_timesheet_entered(p_id uuid, p_version integer, p_entered boolean) returns timesheet_sheets
language plpgsql security definer set search_path = public as $$
declare r timesheet_sheets;
begin
  select * into r from timesheet_sheets where id = p_id for update;
  if r.id is null then raise exception 'NOT_FOUND: Không tìm thấy bảng.'; end if;
  if not (is_workforce_admin(r.organization_id) or r.created_by = auth.uid()) then raise exception 'FORBIDDEN: Bạn không có quyền với bảng này.'; end if;
  if r.version <> p_version then raise exception 'CONFLICT: Bảng vừa được người khác sửa. Hãy tải lại bản mới.'; end if;
  update timesheet_sheets set status = case when p_entered then 'entered' else 'printed' end,
         entered_at = case when p_entered then now() end, entered_by = case when p_entered then auth.uid() end, version = version + 1
   where id = p_id returning * into r;
  return r;
end $$;

revoke execute on function create_timesheet_sheet(uuid, uuid, date, date, text, time, time, integer, uuid[], text) from public, anon;
revoke execute on function mark_timesheet_entered(uuid, integer, boolean) from public, anon;
grant execute on function create_timesheet_sheet(uuid, uuid, date, date, text, time, time, integer, uuid[], text) to authenticated;
grant execute on function mark_timesheet_entered(uuid, integer, boolean) to authenticated;
