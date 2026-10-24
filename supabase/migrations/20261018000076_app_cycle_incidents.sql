-- D95 (Đợt 1, T3): SỰ CỐ và VIỆC KHẮC PHỤC của vụ (sâu bệnh, hao hụt, thời tiết, khiếu nại, khác).
-- Ai ghi được nhật ký của vụ thì báo được sự cố; người quản lý vụ giao việc khắc phục và đóng sự cố.
-- Sự cố chỉ đóng khi mọi việc khắc phục đã xong. Không xóa: hủy = đánh dấu (kèm lý do). Mọi ghi qua hàm máy chủ (có kiểm quyền).

create table cycle_incidents (
  id uuid primary key,
  cycle_id uuid not null references production_cycles(id) on delete cascade,
  organization_id uuid not null references organizations(id),
  kind text not null check (kind in ('pest', 'loss', 'weather', 'complaint', 'other')),
  incident_date date not null,
  stage_id uuid references production_stages(id) on delete set null,
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high')),
  description text not null check (length(trim(description)) between 1 and 1000),
  loss_quantity numeric(14, 3) check (loss_quantity is null or loss_quantity >= 0),
  loss_amount numeric(16, 2) check (loss_amount is null or loss_amount >= 0),
  image text,
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  close_note text check (close_note is null or length(close_note) <= 500),
  voided_at timestamptz,
  void_reason text,
  version integer not null default 1,
  created_by uuid not null references auth.users(id) default auth.uid(),
  author_name text,
  created_at timestamptz not null default now()
);
create index on cycle_incidents (cycle_id, incident_date desc);
create index on cycle_incidents (organization_id) where status = 'open' and voided_at is null;

create table incident_actions (
  id uuid primary key,
  incident_id uuid not null references cycle_incidents(id) on delete cascade,
  cycle_id uuid not null references production_cycles(id) on delete cascade,
  organization_id uuid not null references organizations(id),
  content text not null check (length(trim(content)) between 1 and 300),
  assignee_id uuid references auth.users(id),
  assignee_name text,
  due_date date,
  done boolean not null default false,
  done_at timestamptz,
  done_by uuid references auth.users(id),
  created_by uuid not null references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index on incident_actions (incident_id);
create index on incident_actions (organization_id, due_date) where not done;

create trigger cycle_incidents_a_org before insert or update of cycle_id on cycle_incidents
  for each row execute function sync_org_from_cycle();
create trigger cycle_incidents_bump before update on cycle_incidents
  for each row execute function bump_version();
create or replace function cycle_incidents_author() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.author_name := author_display_name(new.created_by, new.organization_id, null);
  return new;
end $$;
create trigger cycle_incidents_b_author before insert on cycle_incidents for each row execute function cycle_incidents_author();

-- chính sách đọc dựa vào CỘT của hàng (cycle_id); không có chính sách ghi: chỉ ghi qua hàm bên dưới
alter table cycle_incidents enable row level security;
alter table incident_actions enable row level security;
create policy cycle_incidents_read on cycle_incidents for select to authenticated using (can_read_cycle(cycle_id));
create policy incident_actions_read on incident_actions for select to authenticated using (can_read_cycle(cycle_id));
revoke insert, update, delete on cycle_incidents, incident_actions from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Báo sự cố (nhân viên của vụ trở lên). Gửi lặp cùng id thì trả bản đã có, không nhân đôi.
-- ---------------------------------------------------------------------------
create or replace function report_incident(
  p_id uuid, p_cycle uuid, p_kind text, p_date date, p_stage uuid, p_severity text, p_desc text,
  p_loss_qty numeric default null, p_loss_amount numeric default null, p_image text default null)
returns cycle_incidents
language plpgsql security definer set search_path = public as $$
declare r cycle_incidents; v_desc text := nullif(trim(p_desc), '');
begin
  select * into r from cycle_incidents where id = p_id;
  if r.id is not null then
    if r.cycle_id = p_cycle and can_read_cycle(p_cycle) then return r; end if;
    raise exception 'FORBIDDEN: Bạn không có quyền với sự cố này.';
  end if;
  if not exists (select 1 from production_cycles where id = p_cycle) or not can_log_cycle(p_cycle) then
    raise exception 'FORBIDDEN: Bạn không có quyền báo sự cố cho vụ này.';
  end if;
  if p_kind not in ('pest', 'loss', 'weather', 'complaint', 'other') then raise exception 'INVALID_KIND: Hãy chọn loại sự cố.'; end if;
  if p_severity not in ('low', 'medium', 'high') then raise exception 'INVALID_SEVERITY: Hãy chọn mức độ.'; end if;
  if v_desc is null then raise exception 'INVALID_DESC: Hãy mô tả ngắn sự cố.'; end if;
  if length(v_desc) > 1000 then raise exception 'INVALID_DESC: Mô tả tối đa 1000 ký tự.'; end if;
  if p_date is null or p_date > (now() at time zone 'Asia/Ho_Chi_Minh')::date + 1 then
    raise exception 'INVALID_DATE: Ngày xảy ra không được ở tương lai.';
  end if;
  if coalesce(p_loss_qty, 0) < 0 or coalesce(p_loss_amount, 0) < 0 then
    raise exception 'INVALID_AMOUNT: Thiệt hại không được âm.';
  end if;
  if p_stage is not null and not exists (select 1 from production_stages where id = p_stage and cycle_id = p_cycle) then
    raise exception 'INVALID_STAGE: Giai đoạn không thuộc vụ này.';
  end if;
  insert into cycle_incidents (id, cycle_id, kind, incident_date, stage_id, severity, description, loss_quantity, loss_amount, image)
    values (p_id, p_cycle, p_kind, p_date, p_stage, p_severity, v_desc, p_loss_qty, p_loss_amount, nullif(p_image, ''))
    returning * into r;
  return r;
end $$;

-- ---------------------------------------------------------------------------
-- Sửa sự cố (người báo hoặc người quản lý vụ; chỉ khi đang mở). Có kiểm tra phiên bản.
-- ---------------------------------------------------------------------------
create or replace function update_incident(p_id uuid, p_expected_version integer, p_changes jsonb)
returns cycle_incidents
language plpgsql security definer set search_path = public as $$
declare cur cycle_incidents; r cycle_incidents; v_desc text;
begin
  select * into cur from cycle_incidents where id = p_id;
  if cur.id is null or not can_read_cycle(cur.cycle_id) then raise exception 'NOT_FOUND: Không tìm thấy sự cố.'; end if;
  if not (cur.created_by = auth.uid() or can_manage_cycle(cur.cycle_id)) then
    raise exception 'FORBIDDEN: Chỉ người báo hoặc người quản lý vụ mới sửa được sự cố.';
  end if;
  if cur.voided_at is not null then raise exception 'VOIDED: Sự cố đã hủy nên không sửa được.'; end if;
  if cur.status = 'closed' then raise exception 'CLOSED: Sự cố đã đóng. Hãy mở lại trước khi sửa.'; end if;
  if cur.version <> p_expected_version then
    raise exception 'CONFLICT: Sự cố đã được người khác thay đổi (phiên bản máy chủ %, bạn đang sửa phiên bản %).', cur.version, p_expected_version;
  end if;
  v_desc := case when p_changes ? 'description' then nullif(trim(p_changes->>'description'), '') else cur.description end;
  if v_desc is null or length(v_desc) > 1000 then raise exception 'INVALID_DESC: Hãy mô tả ngắn sự cố (tối đa 1000 ký tự).'; end if;
  update cycle_incidents set
    kind          = case when p_changes ? 'kind' then p_changes->>'kind' else kind end,
    severity      = case when p_changes ? 'severity' then p_changes->>'severity' else severity end,
    incident_date = case when p_changes ? 'incident_date' then (p_changes->>'incident_date')::date else incident_date end,
    stage_id      = case when p_changes ? 'stage_id' then nullif(p_changes->>'stage_id', '')::uuid else stage_id end,
    description   = v_desc,
    loss_quantity = case when p_changes ? 'loss_quantity' then nullif(p_changes->>'loss_quantity', '')::numeric else loss_quantity end,
    loss_amount   = case when p_changes ? 'loss_amount' then nullif(p_changes->>'loss_amount', '')::numeric else loss_amount end,
    image         = case when p_changes ? 'image' then nullif(p_changes->>'image', '') else image end
  where id = p_id returning * into r;
  if r.incident_date > (now() at time zone 'Asia/Ho_Chi_Minh')::date + 1 then
    raise exception 'INVALID_DATE: Ngày xảy ra không được ở tương lai.';
  end if;
  if r.stage_id is not null and not exists (select 1 from production_stages where id = r.stage_id and cycle_id = r.cycle_id) then
    raise exception 'INVALID_STAGE: Giai đoạn không thuộc vụ này.';
  end if;
  return r;
end $$;

-- ---------------------------------------------------------------------------
-- Giao việc khắc phục (người quản lý vụ). Người phụ trách phải là thành viên đang hoạt động của cơ sở.
-- ---------------------------------------------------------------------------
create or replace function add_incident_action(p_id uuid, p_incident uuid, p_content text, p_assignee uuid default null, p_due date default null)
returns incident_actions
language plpgsql security definer set search_path = public as $$
declare i cycle_incidents; r incident_actions; v_c text := nullif(trim(p_content), '');
begin
  select * into r from incident_actions where id = p_id;
  if r.id is not null then
    if r.incident_id = p_incident and can_read_cycle(r.cycle_id) then return r; end if;
    raise exception 'FORBIDDEN: Bạn không có quyền với việc này.';
  end if;
  select * into i from cycle_incidents where id = p_incident;
  if i.id is null or not can_manage_cycle(i.cycle_id) then raise exception 'FORBIDDEN: Chỉ người quản lý vụ mới giao việc khắc phục.'; end if;
  if i.voided_at is not null then raise exception 'VOIDED: Sự cố đã hủy.'; end if;
  if i.status = 'closed' then raise exception 'CLOSED: Sự cố đã đóng. Hãy mở lại trước khi thêm việc.'; end if;
  if v_c is null or length(v_c) > 300 then raise exception 'INVALID_DESC: Hãy ghi việc cần làm (tối đa 300 ký tự).'; end if;
  if p_assignee is not null and not exists (
       select 1 from organization_memberships m
        where m.user_id = p_assignee and m.status = 'active'
          and m.organization_id in (cycle_owner_org(i.cycle_id), cycle_area_org(i.cycle_id))) then
    raise exception 'INVALID_ASSIGNEE: Người phụ trách phải là thành viên đang hoạt động của cơ sở.';
  end if;
  insert into incident_actions (id, incident_id, cycle_id, organization_id, content, assignee_id, assignee_name, due_date)
    values (p_id, i.id, i.cycle_id, i.organization_id, v_c, p_assignee,
            case when p_assignee is null then null else author_display_name(p_assignee, i.organization_id, null) end, p_due)
    returning * into r;
  return r;
end $$;

-- Đánh dấu xong / chưa xong (người được giao hoặc người quản lý vụ)
create or replace function set_incident_action_done(p_action uuid, p_done boolean) returns incident_actions
language plpgsql security definer set search_path = public as $$
declare a incident_actions; i cycle_incidents; r incident_actions;
begin
  select * into a from incident_actions where id = p_action;
  if a.id is null or not can_read_cycle(a.cycle_id) then raise exception 'NOT_FOUND: Không tìm thấy việc khắc phục.'; end if;
  if not (a.assignee_id = auth.uid() or can_manage_cycle(a.cycle_id)) then
    raise exception 'FORBIDDEN: Chỉ người được giao hoặc người quản lý vụ mới đánh dấu được.';
  end if;
  select * into i from cycle_incidents where id = a.incident_id;
  if i.voided_at is not null then raise exception 'VOIDED: Sự cố đã hủy.'; end if;
  if i.status = 'closed' then raise exception 'CLOSED: Sự cố đã đóng. Hãy mở lại trước khi đổi.'; end if;
  update incident_actions set done = coalesce(p_done, false),
         done_at = case when p_done then now() end, done_by = case when p_done then auth.uid() end
   where id = p_action returning * into r;
  return r;
end $$;

create or replace function delete_incident_action(p_action uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a incident_actions; i cycle_incidents;
begin
  select * into a from incident_actions where id = p_action;
  if a.id is null then return; end if;
  if not can_manage_cycle(a.cycle_id) then raise exception 'FORBIDDEN: Chỉ người quản lý vụ mới xóa được việc khắc phục.'; end if;
  select * into i from cycle_incidents where id = a.incident_id;
  if i.status = 'closed' or i.voided_at is not null then raise exception 'CLOSED: Sự cố đã đóng hoặc đã hủy nên không xóa việc được.'; end if;
  if a.done then raise exception 'HAS_DATA: Việc đã làm xong nên giữ lại làm lịch sử.'; end if;
  delete from incident_actions where id = p_action;
end $$;

-- ---------------------------------------------------------------------------
-- Đóng / mở lại / hủy sự cố
-- ---------------------------------------------------------------------------
create or replace function close_incident(p_id uuid, p_note text default null) returns cycle_incidents
language plpgsql security definer set search_path = public as $$
declare i cycle_incidents; r cycle_incidents; n integer;
begin
  select * into i from cycle_incidents where id = p_id;
  if i.id is null or not can_manage_cycle(i.cycle_id) then raise exception 'FORBIDDEN: Chỉ người quản lý vụ mới đóng được sự cố.'; end if;
  if i.voided_at is not null then raise exception 'VOIDED: Sự cố đã hủy.'; end if;
  if i.status = 'closed' then return i; end if;
  select count(*) into n from incident_actions where incident_id = p_id and not done;
  if n > 0 then raise exception 'OPEN_ACTIONS: Còn % việc khắc phục chưa xong nên chưa đóng được sự cố.', n; end if;
  if length(coalesce(p_note, '')) > 500 then raise exception 'INVALID_DESC: Ghi chú kết quả tối đa 500 ký tự.'; end if;
  update cycle_incidents set status = 'closed', closed_at = now(), closed_by = auth.uid(), close_note = nullif(trim(p_note), '')
   where id = p_id returning * into r;
  return r;
end $$;

create or replace function reopen_incident(p_id uuid) returns cycle_incidents
language plpgsql security definer set search_path = public as $$
declare i cycle_incidents; r cycle_incidents;
begin
  select * into i from cycle_incidents where id = p_id;
  if i.id is null or not can_manage_cycle(i.cycle_id) then raise exception 'FORBIDDEN: Chỉ người quản lý vụ mới mở lại được sự cố.'; end if;
  if i.voided_at is not null then raise exception 'VOIDED: Sự cố đã hủy.'; end if;
  update cycle_incidents set status = 'open', closed_at = null, closed_by = null where id = p_id returning * into r;
  return r;
end $$;

create or replace function void_incident(p_id uuid, p_reason text) returns cycle_incidents
language plpgsql security definer set search_path = public as $$
declare i cycle_incidents; r cycle_incidents; v_r text := nullif(trim(p_reason), '');
begin
  select * into i from cycle_incidents where id = p_id;
  if i.id is null or not can_read_cycle(i.cycle_id) then raise exception 'NOT_FOUND: Không tìm thấy sự cố.'; end if;
  if not (i.created_by = auth.uid() or can_manage_cycle(i.cycle_id)) then raise exception 'FORBIDDEN: Chỉ người báo hoặc người quản lý vụ mới hủy được sự cố.'; end if;
  if i.voided_at is not null then return i; end if;
  if v_r is null or length(v_r) < 3 then raise exception 'REASON_REQUIRED: Hãy ghi lý do hủy (ví dụ: báo nhầm).'; end if;
  update cycle_incidents set voided_at = now(), void_reason = v_r where id = p_id returning * into r;
  return r;
end $$;

revoke execute on function cycle_incidents_author() from public, anon, authenticated;
revoke execute on function
  report_incident(uuid, uuid, text, date, uuid, text, text, numeric, numeric, text), update_incident(uuid, integer, jsonb),
  add_incident_action(uuid, uuid, text, uuid, date), set_incident_action_done(uuid, boolean), delete_incident_action(uuid),
  close_incident(uuid, text), reopen_incident(uuid), void_incident(uuid, text) from public, anon;
grant execute on function
  report_incident(uuid, uuid, text, date, uuid, text, text, numeric, numeric, text), update_incident(uuid, integer, jsonb),
  add_incident_action(uuid, uuid, text, uuid, date), set_incident_action_done(uuid, boolean), delete_incident_action(uuid),
  close_incident(uuid, text), reopen_incident(uuid), void_incident(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Số sự cố đang mở và việc khắc phục quá hạn: thêm vào số liệu vụ (get_cycles_stats) và điểm cần chú ý của Báo cáo tuần.
-- ---------------------------------------------------------------------------
do $$
declare d text; k text := '''target_yield_kg'', c.target_yield_kg,';
begin
  d := pg_get_functiondef('get_cycles_stats(uuid)'::regprocedure);
  if position(k in d) = 0 then raise exception 'get_cycles_stats: không tìm thấy đoạn cần thay'; end if;
  d := replace(d, k, k || chr(10)
    || '      ''open_incidents'', (select count(*)::int from cycle_incidents i where i.cycle_id = c.id and i.status = ''open'' and i.voided_at is null),' || chr(10)
    || '      ''overdue_actions'', (select count(*)::int from incident_actions a join cycle_incidents i on i.id = a.incident_id where a.cycle_id = c.id and not a.done and i.status = ''open'' and i.voided_at is null and a.due_date < (now() at time zone ''Asia/Ho_Chi_Minh'')::date),');
  execute d;
end $$;

do $$
declare d text; k text := '''late_cycles'',';
begin
  d := pg_get_functiondef('get_weekly_report(uuid, date)'::regprocedure);
  if position(k in d) = 0 then raise exception 'get_weekly_report: không tìm thấy đoạn cần thay'; end if;
  d := replace(d, k,
       '''open_incidents'', (select count(*)::int from cycle_incidents i join production_cycles c on c.id = i.cycle_id where c.owner_org_id = p_org and i.status = ''open'' and i.voided_at is null),' || chr(10)
    || '    ''overdue_actions'', (select count(*)::int from incident_actions a join cycle_incidents i on i.id = a.incident_id join production_cycles c on c.id = a.cycle_id where c.owner_org_id = p_org and not a.done and i.status = ''open'' and i.voided_at is null and a.due_date < today),' || chr(10)
    || '    ' || k);
  execute d;
end $$;
