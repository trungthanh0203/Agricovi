-- P1 (D28): chủ cơ sở tự khai báo cây trồng, loại việc và QUY TRÌNH MÙA VỤ MẪU của riêng mình.
-- Mỗi hộ/HTX có bộ mẫu riêng (A23). Vụ thật sẽ được tạo theo mẫu ở P2 (sao chép, nên sửa mẫu không đổi vụ đang chạy).
-- Ngày trong mẫu tính theo giai đoạn: giai đoạn dài N ngày; việc bắt đầu ở ngày thứ start_day (1..N) và có thể lặp mỗi
-- repeat_every_days ngày cho tới hết giai đoạn.

-- Ai được khai báo cấu hình của cơ sở (tạm theo vai trò; P3 chuyển sang quyền "Khai báo" theo chức vụ)
create or replace function can_configure(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select has_org_role(org, array['owner', 'manager', 'cooperative_manager']::member_role[]);
$$;

-- Ai đọc được cấu hình của cơ sở: thành viên của cơ sở; và hộ thành viên đang hoạt động của HTX (để chọn mẫu khi ghi vụ theo HTX)
create or replace function can_read_org_config(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_org_member(org)
      or exists (select 1 from cooperative_memberships cm
                  where cm.cooperative_org_id = org and cm.status = 'active' and is_org_member(cm.household_org_id));
$$;

-- ---------------------------------------------------------------------------
-- Cây trồng riêng của cơ sở (organization_id null = cây dùng chung của nền tảng)
-- ---------------------------------------------------------------------------
alter table crop_types add column organization_id uuid references organizations(id) on delete cascade;
alter table crop_types drop constraint crop_types_code_key;
create unique index crop_types_code_global on crop_types (code) where organization_id is null;
create unique index crop_types_code_org on crop_types (organization_id, code) where organization_id is not null;
create unique index crop_types_name_org on crop_types (organization_id, lower(name)) where organization_id is not null;

-- Mã tự sinh khi để trống (người dùng chỉ nhập tên)
create or replace function fill_code() returns trigger language plpgsql as $$
begin
  if new.code is null or length(trim(new.code)) = 0 then
    new.code := 'c' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
  end if;
  return new;
end $$;
create trigger crop_types_fill_code before insert on crop_types for each row execute function fill_code();
create trigger work_types_fill_code before insert on work_types for each row execute function fill_code();

drop policy crop_read on crop_types;
create policy crop_read on crop_types for select to authenticated
  using (organization_id is null or can_read_org_config(organization_id));
create policy crop_org_write on crop_types for all to authenticated
  using (organization_id is not null and can_configure(organization_id))
  with check (organization_id is not null and can_configure(organization_id));

-- ---------------------------------------------------------------------------
-- Loại việc riêng: dùng chung cơ chế work_types có sẵn, mở rộng người đọc/ghi
-- ---------------------------------------------------------------------------
drop policy work_types_read on work_types;
create policy work_types_read on work_types for select to authenticated
  using (organization_id is null or can_read_org_config(organization_id));
drop policy work_types_write on work_types;
create policy work_types_write on work_types for all to authenticated
  using (organization_id is not null and can_configure(organization_id))
  with check (organization_id is not null and can_configure(organization_id));

-- ---------------------------------------------------------------------------
-- Quy trình mẫu
-- ---------------------------------------------------------------------------
create table cycle_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  crop_type_id uuid not null references crop_types(id),
  name text not null check (length(trim(name)) > 0),
  note text,
  version integer not null default 1,               -- tăng mỗi khi mẫu hoặc giai đoạn/việc của mẫu đổi
  is_active boolean not null default true,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);
create index on cycle_templates (organization_id, crop_type_id);
create trigger cycle_templates_updated before update on cycle_templates for each row execute function set_updated_at();

-- Cây của mẫu phải là cây dùng chung hoặc cây của chính cơ sở
create or replace function cycle_template_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare crop_org uuid;
begin
  select organization_id into crop_org from crop_types where id = new.crop_type_id;
  if crop_org is not null and crop_org <> new.organization_id then
    raise exception 'INVALID_CROP: Cây trồng này không thuộc cơ sở. Hãy chọn cây dùng chung hoặc cây do cơ sở khai báo.';
  end if;
  if tg_op = 'UPDATE' and (new.organization_id <> old.organization_id or new.crop_type_id <> old.crop_type_id) then
    raise exception 'IMMUTABLE_FIELD: Không đổi được cây trồng của mẫu. Hãy nhân bản sang mẫu mới.';
  end if;
  return new;
end $$;
create trigger cycle_templates_guard before insert or update on cycle_templates for each row execute function cycle_template_guard();

create table template_stages (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references cycle_templates(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  seq integer not null check (seq >= 1),
  name text not null check (length(trim(name)) > 0),
  duration_days integer not null check (duration_days between 1 and 3650),
  note text,
  created_at timestamptz not null default now(),
  constraint template_stages_seq unique (template_id, seq) deferrable initially deferred
);

create table template_tasks (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references template_stages(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  work_type_id uuid not null references work_types(id),
  title text not null check (length(trim(title)) > 0),
  start_day integer not null default 1 check (start_day >= 1),
  repeat_every_days integer check (repeat_every_days is null or repeat_every_days >= 1),
  is_required boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);
create index on template_tasks (stage_id);

-- organization_id của giai đoạn/việc luôn theo mẫu (client không tự gán được); seq mặc định là cuối danh sách
create or replace function template_stage_prepare() returns trigger language plpgsql security definer set search_path = public as $$
begin
  select organization_id into new.organization_id from cycle_templates where id = new.template_id;
  if new.organization_id is null then raise exception 'NOT_FOUND: Không tìm thấy mẫu.'; end if;
  if tg_op = 'INSERT' and (new.seq is null or new.seq < 1) then
    select coalesce(max(seq), 0) + 1 into new.seq from template_stages where template_id = new.template_id;
  end if;
  if tg_op = 'UPDATE' and new.template_id <> old.template_id then
    raise exception 'IMMUTABLE_FIELD: Không chuyển giai đoạn sang mẫu khác.';
  end if;
  -- rút ngắn giai đoạn không được làm mất việc đã đặt ở ngày sau đó
  if tg_op = 'UPDATE' and new.duration_days < old.duration_days
     and exists (select 1 from template_tasks t where t.stage_id = new.id and t.start_day > new.duration_days) then
    raise exception 'INVALID_DURATION: Giai đoạn còn việc bắt đầu sau ngày thứ %. Hãy sửa ngày bắt đầu của việc trước.', new.duration_days;
  end if;
  return new;
end $$;
-- seq cần mặc định khi bỏ trống: cho phép NULL lúc chèn rồi trigger điền (cột not null kiểm sau trigger BEFORE)
create trigger template_stages_prepare before insert or update on template_stages for each row execute function template_stage_prepare();

create or replace function template_task_prepare() returns trigger language plpgsql security definer set search_path = public as $$
declare st template_stages;
begin
  select * into st from template_stages where id = new.stage_id;
  if st.id is null then raise exception 'NOT_FOUND: Không tìm thấy giai đoạn.'; end if;
  new.organization_id := st.organization_id;
  if new.start_day > st.duration_days then
    raise exception 'INVALID_DAY: Giai đoạn "%" chỉ dài % ngày, việc không thể bắt đầu ở ngày thứ %.', st.name, st.duration_days, new.start_day;
  end if;
  if tg_op = 'UPDATE' and new.stage_id <> old.stage_id then
    raise exception 'IMMUTABLE_FIELD: Không chuyển việc sang giai đoạn khác.';
  end if;
  -- loại việc phải là loại dùng chung hoặc của chính cơ sở
  if exists (select 1 from work_types w where w.id = new.work_type_id and w.organization_id is not null and w.organization_id <> st.organization_id) then
    raise exception 'INVALID_WORK_TYPE: Loại việc này không thuộc cơ sở.';
  end if;
  return new;
end $$;
create trigger template_tasks_prepare before insert or update on template_tasks for each row execute function template_task_prepare();

-- Mỗi thay đổi giai đoạn/việc làm mẫu tăng phiên bản (P2 ghi lại vụ được tạo từ phiên bản nào)
create or replace function template_touch() returns trigger language plpgsql security definer set search_path = public as $$
declare tid uuid;
begin
  if tg_table_name = 'template_stages' then
    tid := coalesce(new.template_id, old.template_id);
  else
    select s.template_id into tid from template_stages s where s.id = coalesce(new.stage_id, old.stage_id);
  end if;
  if tid is not null then update cycle_templates set version = version + 1 where id = tid; end if;
  return null;
end $$;
create trigger template_stages_touch after insert or update or delete on template_stages for each row execute function template_touch();
create trigger template_tasks_touch after insert or update or delete on template_tasks for each row execute function template_touch();

create trigger audit_cycle_templates after insert or update or delete on cycle_templates for each row execute function audit_row_change();

-- ---------------------------------------------------------------------------
-- RLS: mọi thành viên (và hộ của HTX) đọc; người được khai báo ghi
-- ---------------------------------------------------------------------------
alter table cycle_templates enable row level security;
alter table template_stages enable row level security;
alter table template_tasks enable row level security;

create policy tpl_read on cycle_templates for select to authenticated using (can_read_org_config(organization_id));
create policy tpl_write on cycle_templates for all to authenticated
  using (can_configure(organization_id)) with check (can_configure(organization_id));
create policy tpl_stage_read on template_stages for select to authenticated using (can_read_org_config(organization_id));
create policy tpl_stage_write on template_stages for all to authenticated
  using (can_configure(organization_id)) with check (can_configure(organization_id));
create policy tpl_task_read on template_tasks for select to authenticated using (can_read_org_config(organization_id));
create policy tpl_task_write on template_tasks for all to authenticated
  using (can_configure(organization_id)) with check (can_configure(organization_id));

-- ---------------------------------------------------------------------------
-- Hàm tiện ích: đổi chỗ giai đoạn, nhân bản mẫu
-- ---------------------------------------------------------------------------
-- Dời giai đoạn lên (-1) hoặc xuống (+1): đổi chỗ với giai đoạn kề bên
create or replace function move_template_stage(p_stage uuid, p_delta integer) returns void
language plpgsql security invoker set search_path = public as $$
declare cur template_stages; other template_stages;
begin
  if p_delta not in (-1, 1) then raise exception 'INVALID_ARGUMENT: Chỉ dời lên hoặc xuống một bước.'; end if;
  select * into cur from template_stages where id = p_stage;
  if cur.id is null then raise exception 'NOT_FOUND: Không tìm thấy giai đoạn.'; end if;
  select * into other from template_stages
   where template_id = cur.template_id and seq = cur.seq + p_delta;
  if other.id is null then return; end if;  -- đã ở đầu/cuối
  update template_stages set seq = other.seq where id = cur.id;
  update template_stages set seq = cur.seq where id = other.id;
end $$;

-- Nhân bản mẫu (kèm giai đoạn và việc) sang tên mới; người gọi phải có quyền khai báo
create or replace function duplicate_cycle_template(p_template uuid, p_name text) returns uuid
language plpgsql security invoker set search_path = public as $$
declare src cycle_templates; new_id uuid; s record; new_stage uuid;
begin
  select * into src from cycle_templates where id = p_template;
  if src.id is null then raise exception 'NOT_FOUND: Không tìm thấy mẫu.'; end if;
  insert into cycle_templates (organization_id, crop_type_id, name, note)
    values (src.organization_id, src.crop_type_id, trim(p_name), src.note) returning id into new_id;
  for s in select * from template_stages where template_id = p_template order by seq loop
    insert into template_stages (template_id, seq, name, duration_days, note)
      values (new_id, s.seq, s.name, s.duration_days, s.note) returning id into new_stage;
    insert into template_tasks (stage_id, work_type_id, title, start_day, repeat_every_days, is_required, note)
      select new_stage, t.work_type_id, t.title, t.start_day, t.repeat_every_days, t.is_required, t.note
        from template_tasks t where t.stage_id = s.id;
  end loop;
  return new_id;
end $$;

revoke execute on function move_template_stage(uuid, integer), duplicate_cycle_template(uuid, text) from public, anon;
grant execute on function move_template_stage(uuid, integer), duplicate_cycle_template(uuid, text) to authenticated, service_role;
