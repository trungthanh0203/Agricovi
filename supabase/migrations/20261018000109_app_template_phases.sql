-- Quy trình mẫu 2 cấp: QUY TRÌNH → CÔNG ĐOẠN (số thứ tự/mã, tên, mô tả) → VIỆC (chọn từ danh mục, số ngày, mức độ quan trọng, ghi chú).
-- Mỗi "việc" vẫn là một hàng template_stages (giữ nguyên cách tạo vụ, lịch, tiến độ); công đoạn chỉ là nhóm đặt phía trên.
-- Đồng thời: Việc (work_types) có danh sách vật tư sử dụng gợi ý (material_ids), bản chỉnh của cơ sở cho việc dùng chung cũng có.

create table template_phases (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references cycle_templates(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  seq integer not null check (seq >= 1),
  code text check (code is null or length(code) <= 20),
  name text not null check (length(trim(name)) > 0 and length(name) <= 120),
  description text check (description is null or length(description) <= 500),
  created_at timestamptz not null default now()
);
create index on template_phases (template_id, seq);

alter table template_stages
  add column phase_id uuid references template_phases(id) on delete set null,
  add column importance text not null default 'normal' check (importance in ('high', 'normal', 'low'));
create index on template_stages (phase_id) where phase_id is not null;

create or replace function template_phase_prepare() returns trigger language plpgsql security definer set search_path = public as $$
begin
  select organization_id into new.organization_id from cycle_templates where id = new.template_id;
  if new.organization_id is null then raise exception 'NOT_FOUND: Không tìm thấy mẫu.'; end if;
  if tg_op = 'INSERT' and (new.seq is null or new.seq < 1) then
    select coalesce(max(seq), 0) + 1 into new.seq from template_phases where template_id = new.template_id;
  end if;
  if tg_op = 'UPDATE' and new.template_id <> old.template_id then
    raise exception 'IMMUTABLE_FIELD: Không chuyển công đoạn sang quy trình khác.';
  end if;
  return new;
end $$;
create trigger template_phases_prepare before insert or update on template_phases for each row execute function template_phase_prepare();

-- Việc chỉ được xếp vào công đoạn của chính quy trình đó
create or replace function template_stage_phase_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.phase_id is not null and not exists (select 1 from template_phases p where p.id = new.phase_id and p.template_id = new.template_id) then
    raise exception 'INVALID_PHASE: Công đoạn không thuộc quy trình này.';
  end if;
  return new;
end $$;
create trigger template_stages_phase_guard before insert or update on template_stages for each row execute function template_stage_phase_guard();

-- Sửa công đoạn cũng tăng phiên bản của quy trình
create or replace function template_phase_touch() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update cycle_templates set version = version + 1 where id = coalesce(new.template_id, old.template_id);
  return null;
end $$;
create trigger template_phases_touch after insert or update or delete on template_phases for each row execute function template_phase_touch();

revoke execute on function template_phase_prepare(), template_stage_phase_guard(), template_phase_touch() from public, anon;

alter table template_phases enable row level security;
create policy tpl_phase_read on template_phases for select to authenticated using (can_read_org_config(organization_id));
create policy tpl_phase_write on template_phases for all to authenticated
  using (can_configure(organization_id)) with check (can_configure(organization_id));

-- Nhân bản quy trình: giữ cả công đoạn, mức độ quan trọng
create or replace function duplicate_cycle_template(p_template uuid, p_name text) returns uuid
language plpgsql security invoker set search_path = public as $$
declare src cycle_templates; new_id uuid; s record; ph record; new_stage uuid; new_phase uuid; pmap jsonb := '{}'::jsonb;
begin
  select * into src from cycle_templates where id = p_template;
  if src.id is null then raise exception 'NOT_FOUND: Không tìm thấy mẫu.'; end if;
  perform set_config('agri.copying_template', '1', true);
  insert into cycle_templates (organization_id, crop_type_id, name, note)
    values (src.organization_id, src.crop_type_id, trim(p_name), src.note) returning id into new_id;
  for ph in select * from template_phases where template_id = p_template order by seq loop
    insert into template_phases (template_id, seq, code, name, description)
      values (new_id, ph.seq, ph.code, ph.name, ph.description) returning id into new_phase;
    pmap := pmap || jsonb_build_object(ph.id::text, new_phase);
  end loop;
  for s in select * from template_stages where template_id = p_template order by seq loop
    insert into template_stages (template_id, seq, work_type_id, name, duration_days, note, importance, phase_id)
      values (new_id, s.seq, s.work_type_id, s.name, s.duration_days, s.note, s.importance,
              case when s.phase_id is null then null else (pmap ->> s.phase_id::text)::uuid end) returning id into new_stage;
    insert into template_tasks (stage_id, work_type_id, title, start_day, repeat_every_days, is_required, note)
      select new_stage, t.work_type_id, t.title, t.start_day, t.repeat_every_days, t.is_required, t.note
        from template_tasks t where t.stage_id = s.id;
  end loop;
  perform set_config('agri.copying_template', '', true);
  return new_id;
end $$;

-- Vụ: mỗi việc của vụ nhớ công đoạn và mức độ quan trọng lúc tạo (bản chụp, sửa mẫu về sau không đổi vụ)
alter table production_stages
  add column phase_code text,
  add column phase_name text,
  add column importance text not null default 'normal' check (importance in ('high', 'normal', 'low'));

create or replace function create_cycle_from_template(
  p_id uuid, p_owner_org uuid, p_area uuid, p_template uuid, p_start date,
  p_status cycle_status default 'preparing', p_name text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare tpl cycle_templates; total integer; d date; s record; start_d date := coalesce(p_start, current_date);
begin
  if p_id is null then raise exception 'INVALID_ARGUMENT: Thiếu mã vụ.'; end if;
  if exists (select 1 from production_cycles where id = p_id) then
    if (select created_by from production_cycles where id = p_id) = auth.uid() then return p_id; end if;
    raise exception 'DUPLICATE_ID: Mã vụ đã tồn tại.';
  end if;
  if not can_create_cycle(p_owner_org, p_area) then
    raise exception 'FORBIDDEN: Bạn không có quyền tạo vụ ở cơ sở hoặc khu trồng này.';
  end if;
  if p_status not in ('preparing', 'active') then
    raise exception 'INVALID_STATUS: Vụ mới chỉ ở trạng thái Chuẩn bị hoặc Đang sản xuất.';
  end if;
  if not exists (select 1 from production_areas a where a.id = p_area and a.is_active) then
    raise exception 'INVALID_AREA: Khu trồng đã dừng hoặc không tồn tại.';
  end if;
  select * into tpl from cycle_templates where id = p_template;
  if tpl.id is null or tpl.organization_id <> p_owner_org then
    raise exception 'INVALID_TEMPLATE: Quy trình mẫu phải thuộc cơ sở sở hữu vụ.';
  end if;
  if not tpl.is_active then raise exception 'INVALID_TEMPLATE: Quy trình này đã ngừng dùng.'; end if;
  select coalesce(sum(duration_days), 0) into total from template_stages where template_id = tpl.id;
  if total = 0 then raise exception 'INVALID_TEMPLATE: Quy trình chưa có việc nào. Hãy thêm công đoạn và việc ở tab Khai báo.'; end if;

  insert into production_cycles (id, owner_org_id, area_id, crop_type_id, status, start_date, expected_end_date,
                                 name, template_id, template_name, template_version, created_by)
    values (p_id, p_owner_org, p_area, tpl.crop_type_id, p_status, start_d, start_d + total - 1,
            nullif(trim(p_name), ''), tpl.id, tpl.name, tpl.version, auth.uid());

  d := start_d;
  for s in
    select t.*, p.code as p_code, p.name as p_name
      from template_stages t left join template_phases p on p.id = t.phase_id
     where t.template_id = tpl.id order by t.seq
  loop
    insert into production_stages (cycle_id, organization_id, name, seq, planned_start, planned_end,
                                   work_type_id, template_stage_id, duration_days, note, phase_code, phase_name, importance)
      values (p_id, p_owner_org, s.name, s.seq, d, d + s.duration_days - 1, s.work_type_id, s.id, s.duration_days, s.note, s.p_code, s.p_name, s.importance);
    d := d + s.duration_days;
  end loop;
  return p_id;
end $$;

-- Việc (work_types): vật tư sử dụng gợi ý khi ghi việc; bản chỉnh của cơ sở cho việc dùng chung (null = không chỉnh)
alter table work_types add column material_ids uuid[] not null default '{}';
alter table org_catalog_overrides add column material_ids uuid[];
