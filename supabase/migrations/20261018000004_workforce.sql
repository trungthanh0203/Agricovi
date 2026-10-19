-- Chấm công và tiền công. Tham chiếu: v1.1 mục 16; v1.2 mục 7 (tính theo GIỜ + SẢN LƯỢNG, bỏ quy đổi ngày công).
-- Nguyên tắc: GPS chỉ lấy tại thời điểm chấm; ngoại lệ không tự loại công; kỳ đã khóa không đổi âm thầm.

create type worker_status as enum ('active', 'inactive');

create table worker_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references auth.users(id),  -- null = lao động không dùng app
  full_name text not null check (length(trim(full_name)) > 0),
  phone text,
  status worker_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index worker_user_per_org on worker_profiles (organization_id, user_id) where user_id is not null;
create trigger worker_profiles_updated before update on worker_profiles for each row execute function set_updated_at();

create table worker_teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  leader_worker_id uuid references worker_profiles(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table worker_team_memberships (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references worker_teams(id) on delete cascade,
  worker_id uuid not null references worker_profiles(id) on delete cascade,
  valid_from date not null default current_date,
  valid_to date,
  check (valid_to is null or valid_to >= valid_from)
);
create index on worker_team_memberships (worker_id);

-- Điểm chấm công. Bán kính/ngưỡng chính xác là cấu hình, KHÔNG có giá trị mặc định cứng (v1.1 16.14).
create table work_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  radius_m integer check (radius_m is null or radius_m > 0),
  max_accuracy_m integer check (max_accuracy_m is null or max_accuracy_m > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Hàm quyền
create or replace function worker_org(w uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select organization_id from worker_profiles where id = w;
$$;

create or replace function is_worker_self(w uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from worker_profiles where id = w and user_id = auth.uid() and status = 'active');
$$;

-- Tổ trưởng của người lao động w (theo tổ hiện tại)
create or replace function is_team_leader_of(w uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from worker_team_memberships m
    join worker_teams t on t.id = m.team_id and t.is_active
    join worker_profiles lead on lead.id = t.leader_worker_id and lead.user_id = auth.uid() and lead.status = 'active'
    where m.worker_id = w
      and m.valid_from <= current_date and (m.valid_to is null or m.valid_to >= current_date));
$$;

create or replace function is_workforce_admin(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select has_org_role(org, array['owner','manager']::member_role[]);
$$;

-- ---------------------------------------------------------------------------
-- Chấm công
-- ---------------------------------------------------------------------------
create type attendance_source as enum ('self', 'team_leader', 'admin');
create type attendance_status as enum ('open', 'needs_confirmation', 'confirmed', 'rejected');

create table attendance_records (
  id uuid primary key,                           -- UUID tạo ở thiết bị => đồng bộ lặp không trùng
  organization_id uuid not null references organizations(id),
  worker_id uuid not null references worker_profiles(id),
  work_date date not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  -- vị trí tại thời điểm chấm (không theo dõi nền)
  start_lat double precision, start_lng double precision, start_accuracy_m double precision,
  end_lat double precision, end_lng double precision, end_accuracy_m double precision,
  location_id uuid references work_locations(id),
  source attendance_source not null default 'self',
  recorded_by uuid references auth.users(id) default auth.uid(),
  device_recorded_at timestamptz,                -- giờ trên thiết bị khi ghi
  received_at timestamptz not null default now(), -- giờ máy chủ nhận
  entered_late boolean not null default false,
  status attendance_status not null default 'open',
  break_minutes integer not null default 0 check (break_minutes >= 0),
  declared_minutes integer,                      -- giờ được khai báo (tính từ vào/ra - nghỉ)
  approved_minutes integer check (approved_minutes is null or approved_minutes >= 0), -- giờ đã duyệt
  exception_reason text,
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz,
  note text,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  check (ended_at is null or ended_at > started_at),
  check (status <> 'confirmed' or approved_minutes is not null)
);
-- Không có hai ca đang mở cho cùng một người (v1.1 16.4.2)
create unique index one_open_shift_per_worker on attendance_records (worker_id)
  where ended_at is null and status <> 'rejected';
create index on attendance_records (organization_id, work_date);
create index on attendance_records (worker_id, work_date);
create trigger attendance_bump before update on attendance_records for each row execute function bump_version();
create trigger attendance_updated before update on attendance_records for each row execute function stamp_updated_at();

create or replace function attendance_defaults() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.organization_id := worker_org(new.worker_id);
  if new.organization_id is null then raise exception 'Người lao động không tồn tại'; end if;
  if new.ended_at is not null then
    new.declared_minutes := greatest(0, (extract(epoch from (new.ended_at - new.started_at)) / 60)::int - new.break_minutes);
  end if;
  -- ngoại lệ không tự loại công: chuyển sang chờ xác nhận
  if tg_op = 'INSERT' and new.status = 'open'
     and (new.exception_reason is not null or new.source <> 'self' and new.entered_late) then
    new.status := 'needs_confirmation';
  end if;
  return new;
end $$;
create trigger attendance_defaults_trg before insert or update on attendance_records
  for each row execute function attendance_defaults();

create type adjustment_status as enum ('pending', 'approved', 'rejected');

-- Yêu cầu sửa công: sự kiện điều chỉnh, giữ giá trị trước/sau (v1.1 16.9)
create table attendance_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  attendance_id uuid not null references attendance_records(id),
  requested_by uuid not null references auth.users(id) default auth.uid(),
  problem_type text not null,
  proposed jsonb not null default '{}'::jsonb,   -- giá trị đề nghị
  before_values jsonb,
  after_values jsonb,
  reason text not null,
  status adjustment_status not null default 'pending',
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index on attendance_adjustments (attendance_id);

-- ---------------------------------------------------------------------------
-- Đơn giá và sản lượng
-- ---------------------------------------------------------------------------
-- MVP: chỉ 'hour' và 'quantity'. Đơn giá ngày công là LATER (v1.2 mục 7.2).
create type rate_type as enum ('hour', 'quantity');

create table work_rates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  rate_type rate_type not null,
  worker_id uuid references worker_profiles(id),
  team_id uuid references worker_teams(id),
  work_type_id uuid references work_types(id),
  unit text,                                     -- đơn vị đo cho 'quantity' (kg, giỏ, cây, luống...)
  amount numeric not null check (amount >= 0),   -- VND / giờ hoặc / đơn vị
  valid_from date not null,
  valid_to date,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from),
  check ((rate_type = 'hour' and unit is null) or (rate_type = 'quantity' and unit is not null)),
  check (worker_id is null or team_id is null)
);
create index on work_rates (organization_id, rate_type, valid_from);

create type output_status as enum ('draft', 'confirmed', 'approved', 'rejected');

create table work_output_records (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  work_date date not null,
  worker_id uuid not null references worker_profiles(id),
  team_id uuid references worker_teams(id),
  cycle_id uuid references production_cycles(id),
  work_type_id uuid references work_types(id),
  quantity numeric not null check (quantity > 0),
  unit text not null,
  source attendance_source not null default 'team_leader',
  recorded_by uuid references auth.users(id) default auth.uid(),
  status output_status not null default 'draft',
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz,
  note text,
  received_at timestamptz not null default now(),
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
create index on work_output_records (organization_id, work_date);
create index on work_output_records (worker_id, work_date);
create trigger output_bump before update on work_output_records for each row execute function bump_version();
create trigger output_updated before update on work_output_records for each row execute function stamp_updated_at();

create or replace function output_defaults() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.organization_id := worker_org(new.worker_id);
  if new.organization_id is null then raise exception 'Người lao động không tồn tại'; end if;
  return new;
end $$;
create trigger output_defaults_trg before insert on work_output_records
  for each row execute function output_defaults();

-- ---------------------------------------------------------------------------
-- Kỳ trả công, bảng chi tiết, khoản cộng/trừ
-- ---------------------------------------------------------------------------
create type payroll_status as enum ('draft', 'pending_confirmation', 'reviewed', 'pending_approval', 'locked');

create table payroll_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  status payroll_status not null default 'draft',
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  locked_at timestamptz,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index on payroll_periods (organization_id, start_date);

create table worker_pay_statements (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references payroll_periods(id) on delete cascade,
  organization_id uuid not null references organizations(id),
  worker_id uuid not null references worker_profiles(id),
  total_estimated numeric not null default 0,
  total_approved numeric,
  created_at timestamptz not null default now(),
  unique (period_id, worker_id)
);

create type pay_line_type as enum ('hours', 'output');

-- Mỗi dòng truy ngược được tới bản ghi công/sản lượng, đơn giá và cách tính (FR-ATT-10).
create table pay_statement_lines (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references worker_pay_statements(id) on delete cascade,
  organization_id uuid not null references organizations(id),
  line_type pay_line_type not null,
  attendance_id uuid references attendance_records(id),
  output_id uuid references work_output_records(id),
  quantity numeric not null,            -- giờ hoặc số lượng ĐÃ DUYỆT
  unit text not null,                   -- 'hour' hoặc đơn vị sản lượng
  rate_id uuid not null references work_rates(id),
  rate_amount numeric not null,         -- BẢN CHỤP đơn giá áp dụng (đổi giá sau không làm đổi kỳ cũ)
  amount numeric not null,
  explanation text not null,            -- ví dụ "8.5 giờ × 25.000"
  check ((line_type = 'hours' and attendance_id is not null and output_id is null)
      or (line_type = 'output' and output_id is not null and attendance_id is null))
);
-- Chống tính trùng: một lượt công / một sản lượng chỉ xuất hiện trong MỘT dòng
create unique index one_line_per_attendance on pay_statement_lines (attendance_id) where attendance_id is not null;
create unique index one_line_per_output on pay_statement_lines (output_id) where output_id is not null;

create type pay_adjustment_kind as enum ('bonus', 'deduction', 'advance');

create table pay_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  worker_id uuid not null references worker_profiles(id),
  period_id uuid references payroll_periods(id),
  kind pay_adjustment_kind not null,
  amount numeric not null check (amount > 0),   -- luôn dương; dấu do kind quyết định
  reason text not null check (length(trim(reason)) > 0),
  created_by uuid references auth.users(id) default auth.uid(),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Bảo vệ kỳ đã khóa: không đổi âm thầm. Mở khóa = chuyển kỳ khỏi 'locked' (chỉ owner, có audit).
-- ---------------------------------------------------------------------------
create or replace function period_is_locked(org uuid, d date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from payroll_periods
                  where organization_id = org and status = 'locked' and d between start_date and end_date);
$$;

-- Đọc trường qua jsonb để một hàm dùng chung được cho nhiều bảng (plpgsql không cho tham chiếu cột không tồn tại).
create or replace function block_locked_period_edit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rows_ jsonb[] := array[]::jsonb[];
  r jsonb; d date; period uuid; locked boolean := false;
begin
  if tg_op <> 'INSERT' then rows_ := rows_ || to_jsonb(old); end if;
  if tg_op <> 'DELETE' then rows_ := rows_ || to_jsonb(new); end if;

  foreach r in array rows_ loop
    if tg_table_name in ('attendance_records', 'work_output_records') then
      d := (r->>'work_date')::date;
      locked := locked or period_is_locked((r->>'organization_id')::uuid, d);
    elsif tg_table_name in ('pay_adjustments', 'worker_pay_statements') then
      period := (r->>'period_id')::uuid;
      if period is not null then
        locked := locked or exists (select 1 from payroll_periods p where p.id = period and p.status = 'locked');
      end if;
    elsif tg_table_name = 'pay_statement_lines' then
      locked := locked or exists (
        select 1 from worker_pay_statements s join payroll_periods p on p.id = s.period_id
         where s.id = (r->>'statement_id')::uuid and p.status = 'locked');
    end if;
  end loop;

  if locked then
    raise exception 'PERIOD_LOCKED: Kỳ trả công đã khóa. Cần mở khóa (có quyền và lý do) trước khi sửa.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger attendance_lock before insert or update or delete on attendance_records
  for each row execute function block_locked_period_edit();
create trigger output_lock before insert or update or delete on work_output_records
  for each row execute function block_locked_period_edit();
create trigger pay_adj_lock before insert or update or delete on pay_adjustments
  for each row execute function block_locked_period_edit();
create trigger pay_lines_lock before insert or update or delete on pay_statement_lines
  for each row execute function block_locked_period_edit();
create trigger pay_statements_lock before insert or update or delete on worker_pay_statements
  for each row execute function block_locked_period_edit();

-- Khóa kỳ chỉ owner được duyệt; người tạo kỳ không tự duyệt nếu cơ sở yêu cầu tách nhiệm vụ (kiểm tra ở app)
create or replace function payroll_period_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.status = 'locked' and old.status <> 'locked' then
    new.locked_at := now();
    new.approved_by := coalesce(new.approved_by, auth.uid());
    new.approved_at := coalesce(new.approved_at, now());
  end if;
  if tg_op = 'UPDATE' and old.status = 'locked' and new.status <> 'locked' then
    new.locked_at := null; -- mở khóa: audit_events ghi lại ai/khi nào
  end if;
  return new;
end $$;
create trigger payroll_period_guard_trg before update on payroll_periods
  for each row execute function payroll_period_guard();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table worker_profiles enable row level security;
alter table worker_teams enable row level security;
alter table worker_team_memberships enable row level security;
alter table work_locations enable row level security;
alter table attendance_records enable row level security;
alter table attendance_adjustments enable row level security;
alter table work_rates enable row level security;
alter table work_output_records enable row level security;
alter table payroll_periods enable row level security;
alter table worker_pay_statements enable row level security;
alter table pay_statement_lines enable row level security;
alter table pay_adjustments enable row level security;

-- Hồ sơ lao động: quản lý xem tất cả; người lao động xem mình; tổ trưởng xem người trong tổ
create policy wp_read on worker_profiles for select to authenticated
  using (is_workforce_admin(organization_id) or user_id = auth.uid() or is_team_leader_of(id));
create policy wp_write on worker_profiles for all to authenticated
  using (is_workforce_admin(organization_id)) with check (is_workforce_admin(organization_id));

create policy teams_read on worker_teams for select to authenticated
  using (is_workforce_admin(organization_id)
         or (leader_worker_id is not null and is_worker_self(leader_worker_id))
         or exists (select 1 from worker_team_memberships m where m.team_id = worker_teams.id and is_worker_self(m.worker_id)));
create policy teams_write on worker_teams for all to authenticated
  using (is_workforce_admin(organization_id)) with check (is_workforce_admin(organization_id));

create policy tm_read on worker_team_memberships for select to authenticated
  using (is_workforce_admin(worker_org(worker_id)) or is_worker_self(worker_id) or is_team_leader_of(worker_id));
create policy tm_write on worker_team_memberships for all to authenticated
  using (is_workforce_admin(worker_org(worker_id))) with check (is_workforce_admin(worker_org(worker_id)));

create policy loc_read on work_locations for select to authenticated using (is_org_member(organization_id));
create policy loc_write on work_locations for all to authenticated
  using (is_workforce_admin(organization_id)) with check (is_workforce_admin(organization_id));

-- Chấm công: tự chấm (đúng chính mình), tổ trưởng chấm hộ người trong tổ, quản lý chấm hộ mọi người
create policy att_read on attendance_records for select to authenticated
  using (is_workforce_admin(organization_id) or is_worker_self(worker_id) or is_team_leader_of(worker_id));
create policy att_insert on attendance_records for insert to authenticated
  with check (
    (source = 'self' and is_worker_self(worker_id))
    or (source = 'team_leader' and is_team_leader_of(worker_id))
    or (source = 'admin' and is_workforce_admin(worker_org(worker_id))));
-- Cập nhật: chính chủ kết thúc ca MỞ của mình; tổ trưởng/quản lý xác nhận & sửa
create policy att_update on attendance_records for update to authenticated
  using ((is_worker_self(worker_id) and ended_at is null)
         or is_team_leader_of(worker_id) or is_workforce_admin(organization_id))
  with check ((is_worker_self(worker_id) and status in ('open','needs_confirmation'))
         or is_team_leader_of(worker_id) or is_workforce_admin(organization_id));
-- không có policy delete

create policy adj_read on attendance_adjustments for select to authenticated
  using (is_workforce_admin(organization_id) or requested_by = auth.uid()
         or is_team_leader_of((select worker_id from attendance_records a where a.id = attendance_id)));
create policy adj_insert on attendance_adjustments for insert to authenticated
  with check (requested_by = auth.uid() and organization_id = (select organization_id from attendance_records a where a.id = attendance_id)
              and (is_worker_self((select worker_id from attendance_records a where a.id = attendance_id))
                   or is_team_leader_of((select worker_id from attendance_records a where a.id = attendance_id))
                   or is_workforce_admin(organization_id)));
create policy adj_decide on attendance_adjustments for update to authenticated
  using (is_workforce_admin(organization_id)) with check (is_workforce_admin(organization_id));

-- Đơn giá: quản lý + kho/tài chính xem; chỉ quản lý sửa
create policy rates_read on work_rates for select to authenticated
  using (has_org_role(organization_id, array['owner','manager','inventory_finance']::member_role[]));
create policy rates_write on work_rates for all to authenticated
  using (is_workforce_admin(organization_id)) with check (is_workforce_admin(organization_id));

create policy out_read on work_output_records for select to authenticated
  using (is_workforce_admin(organization_id) or is_worker_self(worker_id) or is_team_leader_of(worker_id));
create policy out_insert on work_output_records for insert to authenticated
  with check ((source = 'team_leader' and is_team_leader_of(worker_id))
              or (source = 'admin' and is_workforce_admin(worker_org(worker_id)))
              or (source = 'self' and is_worker_self(worker_id)));
create policy out_update on work_output_records for update to authenticated
  using (is_team_leader_of(worker_id) or is_workforce_admin(organization_id))
  with check (is_team_leader_of(worker_id) or is_workforce_admin(organization_id));

-- Tiền công: NHẠY CẢM. Chỉ quản lý, kho/tài chính và chính người lao động. Tổ trưởng KHÔNG xem tiền công người khác.
create policy period_read on payroll_periods for select to authenticated
  using (has_org_role(organization_id, array['owner','manager','inventory_finance']::member_role[])
         or exists (select 1 from worker_pay_statements s where s.period_id = payroll_periods.id and is_worker_self(s.worker_id)));
create policy period_write on payroll_periods for all to authenticated
  using (has_org_role(organization_id, array['owner','manager']::member_role[]))
  with check (has_org_role(organization_id, array['owner','manager']::member_role[]));

create policy stmt_read on worker_pay_statements for select to authenticated
  using (has_org_role(organization_id, array['owner','manager','inventory_finance']::member_role[]) or is_worker_self(worker_id));
create policy stmt_write on worker_pay_statements for all to authenticated
  using (has_org_role(organization_id, array['owner','manager']::member_role[]))
  with check (has_org_role(organization_id, array['owner','manager']::member_role[]));

create policy lines_read on pay_statement_lines for select to authenticated
  using (has_org_role(organization_id, array['owner','manager','inventory_finance']::member_role[])
         or is_worker_self((select s.worker_id from worker_pay_statements s where s.id = statement_id)));
create policy lines_write on pay_statement_lines for all to authenticated
  using (has_org_role(organization_id, array['owner','manager']::member_role[]))
  with check (has_org_role(organization_id, array['owner','manager']::member_role[]));

create policy padj_read on pay_adjustments for select to authenticated
  using (has_org_role(organization_id, array['owner','manager','inventory_finance']::member_role[]) or is_worker_self(worker_id));
create policy padj_write on pay_adjustments for all to authenticated
  using (has_org_role(organization_id, array['owner','manager']::member_role[]))
  with check (has_org_role(organization_id, array['owner','manager']::member_role[]));
