-- P4 gọn (D100): MỐC NHẮC VIỆC AN TOÀN của quy trình. Mỗi mốc có tiêu đề và một "điểm neo":
--   anchor = 'end'   : N ngày TRƯỚC ngày thu/xuất dự kiến của vụ (ngưng phân, ngưng tưới, ngưng thuốc...). Đổi ngày thu dự kiến thì mốc tự dời.
--   anchor = 'start' : N ngày SAU ngày bắt đầu vụ (tiêm vaccine, tẩy giun theo ngày tuổi...).
-- Quy trình mẫu có template_milestones; khi tạo vụ, các mốc được sao sang cycle_milestones (người quản lý vụ thêm/bớt riêng cho từng vụ, ví dụ
-- lịch vaccine do thú y của trại chốt cho từng lứa). Ngày đến hạn KHÔNG lưu mà tính từ ngày của vụ. Đánh dấu "đã làm" ghi người và thời điểm.
-- Không có mốc nào thì không có gì thay đổi: phần này chỉ hiện khi quy trình hoặc vụ có mốc.

create table template_milestones (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references cycle_templates(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  title text not null check (length(trim(title)) between 2 and 160),
  anchor text not null check (anchor in ('start', 'end')),
  offset_days integer not null check (offset_days between 0 and 3650),
  note text check (note is null or length(note) <= 300),
  created_at timestamptz not null default now()
);
create index on template_milestones (template_id);
create or replace function template_milestone_org() returns trigger language plpgsql security definer set search_path = public as $$
begin
  select organization_id into new.organization_id from cycle_templates where id = new.template_id;
  return new;
end $$;
create trigger template_milestones_org before insert on template_milestones for each row execute function template_milestone_org();
alter table template_milestones enable row level security;
create policy tpl_milestone_read on template_milestones for select to authenticated using (can_read_org_config(organization_id));
create policy tpl_milestone_write on template_milestones for all to authenticated
  using (can_configure(organization_id)) with check (can_configure(organization_id));

create table cycle_milestones (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references production_cycles(id) on delete cascade,
  organization_id uuid not null references organizations(id),
  title text not null check (length(trim(title)) between 2 and 160),
  anchor text not null check (anchor in ('start', 'end')),
  offset_days integer not null check (offset_days between 0 and 3650),
  note text check (note is null or length(note) <= 300),
  done_at timestamptz,
  done_by uuid references auth.users(id),
  done_name text,
  created_at timestamptz not null default now()
);
create index on cycle_milestones (cycle_id);
create trigger cycle_milestones_org before insert on cycle_milestones for each row execute function sync_org_from_cycle();
alter table cycle_milestones enable row level security;
create policy cycle_milestones_read on cycle_milestones for select to authenticated using (can_read_cycle(cycle_id));
revoke insert, update, delete on cycle_milestones from authenticated, anon;   -- chỉ ghi qua hàm bên dưới

-- Tạo vụ theo mẫu thì sao các mốc của mẫu sang vụ (thêm một đoạn vào hàm cũ, trước khi lập lịch giai đoạn)
do $$
declare d text; k text := '  d := start_d;';
begin
  d := pg_get_functiondef('create_cycle_from_template(uuid, uuid, uuid, uuid, date, cycle_status, text)'::regprocedure);
  if position(k in d) = 0 then raise exception 'create_cycle_from_template: không tìm thấy đoạn cần thay'; end if;
  d := replace(d, k, '  insert into cycle_milestones (cycle_id, organization_id, title, anchor, offset_days, note)' || chr(10)
    || '    select p_id, p_owner_org, m.title, m.anchor, m.offset_days, m.note from template_milestones m where m.template_id = tpl.id order by m.created_at, m.id;' || chr(10) || k);
  execute d;
end $$;

-- Nhân bản mẫu thì nhân bản cả mốc
do $$
declare d text; k text := '  return new_id;';
begin
  d := pg_get_functiondef('duplicate_cycle_template(uuid, text)'::regprocedure);
  if position(k in d) = 0 then raise exception 'duplicate_cycle_template: không tìm thấy đoạn cần thay'; end if;
  d := replace(d, k, '  insert into template_milestones (template_id, title, anchor, offset_days, note)' || chr(10)
    || '    select new_id, m.title, m.anchor, m.offset_days, m.note from template_milestones m where m.template_id = p_template;' || chr(10) || k);
  execute d;
end $$;

-- Người quản lý vụ thêm một mốc riêng cho vụ này
create or replace function add_cycle_milestone(p_cycle uuid, p_title text, p_anchor text, p_offset integer, p_note text) returns cycle_milestones
language plpgsql security definer set search_path = public as $$
declare r cycle_milestones;
begin
  if not exists (select 1 from production_cycles where id = p_cycle) or not can_manage_cycle(p_cycle) then
    raise exception 'FORBIDDEN: Chỉ người quản lý vụ mới thêm mốc nhắc.';
  end if;
  if length(trim(coalesce(p_title, ''))) < 2 then raise exception 'INVALID_TITLE: Hãy nhập nội dung mốc nhắc.'; end if;
  if p_anchor not in ('start', 'end') or p_offset is null or p_offset < 0 then raise exception 'INVALID_ARGUMENT: Mốc nhắc không hợp lệ.'; end if;
  insert into cycle_milestones (cycle_id, title, anchor, offset_days, note)
    values (p_cycle, trim(p_title), p_anchor, p_offset, nullif(trim(coalesce(p_note, '')), '')) returning * into r;
  return r;
end $$;

create or replace function delete_cycle_milestone(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m cycle_milestones;
begin
  select * into m from cycle_milestones where id = p_id;
  if m.id is null or not can_manage_cycle(m.cycle_id) then raise exception 'FORBIDDEN: Chỉ người quản lý vụ mới xóa mốc nhắc.'; end if;
  delete from cycle_milestones where id = p_id;
end $$;

-- Ai ghi được nhật ký của vụ thì đánh dấu "đã làm" / bỏ đánh dấu được
create or replace function set_milestone_done(p_id uuid, p_done boolean) returns cycle_milestones
language plpgsql security definer set search_path = public as $$
declare m cycle_milestones;
begin
  select * into m from cycle_milestones where id = p_id;
  if m.id is null or not can_log_cycle(m.cycle_id) then raise exception 'FORBIDDEN: Bạn không có quyền với mốc nhắc này.'; end if;
  if p_done then
    update cycle_milestones set done_at = coalesce(done_at, now()), done_by = coalesce(done_by, auth.uid()),
           done_name = coalesce(done_name, author_display_name(auth.uid(), organization_id, null))
     where id = p_id returning * into m;
  else
    update cycle_milestones set done_at = null, done_by = null, done_name = null where id = p_id returning * into m;
  end if;
  return m;
end $$;

revoke execute on function add_cycle_milestone(uuid, text, text, integer, text), delete_cycle_milestone(uuid), set_milestone_done(uuid, boolean) from public, anon;
grant execute on function add_cycle_milestone(uuid, text, text, integer, text), delete_cycle_milestone(uuid), set_milestone_done(uuid, boolean) to authenticated, service_role;
