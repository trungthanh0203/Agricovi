-- Giai đoạn của quy trình mẫu được CHỌN TỪ DANH MỤC VIỆC (D31): tên giai đoạn là tên việc đã chọn, kèm số ngày.
-- (Bảng template_tasks của migration 0020 giữ nguyên nhưng giao diện không còn dùng; việc chi tiết trong giai đoạn để sau nếu cần.)

alter table template_stages add column work_type_id uuid references work_types(id);

create or replace function template_stage_prepare() returns trigger language plpgsql security definer set search_path = public as $$
declare wt_org uuid; wt_name text; wt_found boolean;
begin
  select organization_id into new.organization_id from cycle_templates where id = new.template_id;
  if new.organization_id is null then raise exception 'NOT_FOUND: Không tìm thấy mẫu.'; end if;

  -- ngoại lệ duy nhất: nhân bản mẫu cũ (tạo từ trước khi có quy tắc này) mà giai đoạn chưa gắn việc
  if tg_op = 'INSERT' and new.work_type_id is null and coalesce(current_setting('agri.copying_template', true), '') <> '1' then
    raise exception 'INVALID_WORK_TYPE: Giai đoạn phải chọn từ danh mục việc.';
  end if;
  if new.work_type_id is not null then
    select true, w.organization_id, w.name into wt_found, wt_org, wt_name from work_types w where w.id = new.work_type_id;
    if wt_found is null then raise exception 'INVALID_WORK_TYPE: Không tìm thấy việc trong danh mục.'; end if;
    if wt_org is not null and wt_org <> new.organization_id then
      raise exception 'INVALID_WORK_TYPE: Việc này không thuộc cơ sở.';
    end if;
    new.name := wt_name;   -- tên giai đoạn luôn là tên việc đã chọn (bản chụp lúc chọn)
  end if;

  if tg_op = 'INSERT' and (new.seq is null or new.seq < 1) then
    select coalesce(max(seq), 0) + 1 into new.seq from template_stages where template_id = new.template_id;
  end if;
  if tg_op = 'UPDATE' and new.template_id <> old.template_id then
    raise exception 'IMMUTABLE_FIELD: Không chuyển giai đoạn sang mẫu khác.';
  end if;
  if tg_op = 'UPDATE' and new.duration_days < old.duration_days
     and exists (select 1 from template_tasks t where t.stage_id = new.id and t.start_day > new.duration_days) then
    raise exception 'INVALID_DURATION: Giai đoạn còn việc bắt đầu sau ngày thứ %. Hãy sửa ngày bắt đầu của việc trước.', new.duration_days;
  end if;
  return new;
end $$;

-- Sắp xếp lại toàn bộ giai đoạn một lần (kéo thả): p_order là danh sách mã giai đoạn theo thứ tự mới
create or replace function reorder_template_stages(p_template uuid, p_order uuid[]) returns void
language plpgsql security invoker set search_path = public as $$
declare n integer; updated integer;
begin
  select count(*) into n from template_stages where template_id = p_template;
  if n = 0 or cardinality(p_order) <> n
     or (select count(distinct x) from unnest(p_order) x) <> n
     or (select count(*) from template_stages where template_id = p_template and id = any (p_order)) <> n then
    raise exception 'INVALID_ARGUMENT: Danh sách giai đoạn không khớp với mẫu.';
  end if;
  update template_stages s set seq = o.ord
    from unnest(p_order) with ordinality as o(id, ord)
   where s.id = o.id and s.template_id = p_template;
  get diagnostics updated = row_count;
  if updated <> n then raise exception 'FORBIDDEN: Bạn không có quyền sắp xếp lại quy trình này.'; end if;
end $$;
revoke execute on function reorder_template_stages(uuid, uuid[]) from public, anon;
grant execute on function reorder_template_stages(uuid, uuid[]) to authenticated, service_role;

-- Nhân bản giữ cả loại việc của giai đoạn
create or replace function duplicate_cycle_template(p_template uuid, p_name text) returns uuid
language plpgsql security invoker set search_path = public as $$
declare src cycle_templates; new_id uuid; s record; new_stage uuid;
begin
  select * into src from cycle_templates where id = p_template;
  if src.id is null then raise exception 'NOT_FOUND: Không tìm thấy mẫu.'; end if;
  perform set_config('agri.copying_template', '1', true);
  insert into cycle_templates (organization_id, crop_type_id, name, note)
    values (src.organization_id, src.crop_type_id, trim(p_name), src.note) returning id into new_id;
  for s in select * from template_stages where template_id = p_template order by seq loop
    insert into template_stages (template_id, seq, work_type_id, name, duration_days, note)
      values (new_id, s.seq, s.work_type_id, s.name, s.duration_days, s.note) returning id into new_stage;
    insert into template_tasks (stage_id, work_type_id, title, start_day, repeat_every_days, is_required, note)
      select new_stage, t.work_type_id, t.title, t.start_day, t.repeat_every_days, t.is_required, t.note
        from template_tasks t where t.stage_id = s.id;
  end loop;
  perform set_config('agri.copying_template', '', true);
  return new_id;
end $$;
