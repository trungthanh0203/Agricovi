-- Đổi quy trình mẫu của vụ KHI CHƯA BẮT ĐẦU (docs/PLAN_TAO_VU_2_BUOC.md): sửa lỗi chọn nhầm quy trình mà không phải hủy vụ.
-- Điều kiện (máy chủ ép): người có quyền quản lý giai đoạn; vụ chưa kết thúc/hủy; mọi việc còn "chưa bắt đầu" và không phải "làm trước khi dùng app";
-- chưa có nhật ký hay phiếu thu hoạch; quy trình mới cùng sản phẩm, thuộc cơ sở sở hữu vụ, còn dùng và có việc.
-- Các việc và mốc an toàn được tạo lại từ quy trình mới theo ĐÚNG ngày bắt đầu hiện tại, cùng quy tắc ngày với lúc tạo vụ.

-- Sao việc và mốc của một quy trình vào vụ (nội bộ). Trả về tổng số ngày của quy trình.
create or replace function cycle_instantiate_from_template(p_cycle uuid, p_org uuid, p_template uuid, p_start date) returns integer
language plpgsql security definer set search_path = public as $$
declare total integer := 0; cur integer := 1; st integer; en integer; s record;
begin
  -- lượt 1: tổng số ngày = ngày kết thúc muộn nhất
  for s in select start_day, duration_days from template_stages where template_id = p_template order by seq loop
    st := coalesce(s.start_day, cur); en := st + s.duration_days - 1;
    total := greatest(total, en);
    if s.start_day is null then cur := en + 1; end if;
  end loop;
  if total = 0 then raise exception 'INVALID_TEMPLATE: Quy trình chưa có việc nào.'; end if;

  insert into cycle_milestones (cycle_id, organization_id, title, anchor, offset_days, note)
    select p_cycle, p_org, m.title, m.anchor, m.offset_days, m.note from template_milestones m where m.template_id = p_template order by m.created_at, m.id;

  -- lượt 2: sao từng việc với ngày kế hoạch
  cur := 1;
  for s in
    select t.*, p.code as p_code, p.name as p_name
      from template_stages t left join template_phases p on p.id = t.phase_id
     where t.template_id = p_template order by t.seq
  loop
    st := coalesce(s.start_day, cur); en := st + s.duration_days - 1;
    insert into production_stages (cycle_id, organization_id, name, seq, planned_start, planned_end,
                                   work_type_id, template_stage_id, duration_days, note, phase_code, phase_name, importance, repeat_every_days, guide, materials)
      values (p_cycle, p_org, s.name, s.seq, p_start + st - 1, p_start + en - 1, s.work_type_id, s.id, s.duration_days, s.note, s.p_code, s.p_name, s.importance, s.repeat_every_days, s.guide, s.materials);
    if s.start_day is null then cur := en + 1; end if;
  end loop;
  return total;
end $$;
revoke execute on function cycle_instantiate_from_template(uuid, uuid, uuid, date) from public, anon, authenticated;

create or replace function change_cycle_template(p_cycle uuid, p_template uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c production_cycles; tpl cycle_templates; total integer; start_d date;
begin
  select * into c from production_cycles where id = p_cycle;
  if c.id is null or not can_manage_stages(p_cycle) then raise exception 'FORBIDDEN: Bạn không có quyền đổi quy trình của vụ này.'; end if;
  if c.status in ('ended', 'cancelled') then raise exception 'INVALID_STATE: Vụ đã kết thúc hoặc đã hủy nên không đổi quy trình được.'; end if;
  select * into tpl from cycle_templates where id = p_template;
  if tpl.id is null or tpl.organization_id <> c.owner_org_id then raise exception 'INVALID_TEMPLATE: Quy trình phải thuộc cơ sở sở hữu vụ.'; end if;
  if not tpl.is_active then raise exception 'INVALID_TEMPLATE: Quy trình này đã ngừng dùng.'; end if;
  if tpl.crop_type_id <> c.crop_type_id then raise exception 'INVALID_TEMPLATE: Quy trình phải cùng sản phẩm với vụ.'; end if;
  if c.template_id = p_template then raise exception 'SAME_TEMPLATE: Vụ đang dùng quy trình này rồi.'; end if;
  if exists (select 1 from production_stages where cycle_id = p_cycle and (status <> 'pending' or source = 'pre_app')) then
    raise exception 'STAGE_STARTED: Vụ đã có việc bắt đầu hoặc đã làm trước khi dùng app nên không đổi quy trình được.';
  end if;
  if exists (select 1 from activity_logs where cycle_id = p_cycle and voided_at is null) or exists (select 1 from harvest_records where cycle_id = p_cycle and voided_at is null) then
    raise exception 'HAS_RECORDS: Vụ đã có nhật ký hoặc phiếu thu hoạch nên không đổi quy trình được.';
  end if;
  start_d := coalesce(c.start_date, vn_today());

  begin
    delete from production_stages where cycle_id = p_cycle;
  exception when foreign_key_violation then
    raise exception 'HAS_RECORDS: Các việc của vụ đang được dùng ở nơi khác nên không đổi quy trình được.';
  end;
  delete from cycle_milestones where cycle_id = p_cycle and done_at is null;
  total := cycle_instantiate_from_template(p_cycle, c.owner_org_id, p_template, start_d);
  update production_cycles set template_id = tpl.id, template_name = tpl.name, template_version = tpl.version, expected_end_date = start_d + total - 1 where id = p_cycle;
  insert into audit_events (organization_id, actor_id, action, entity, entity_id, before, after, reason)
    values (c.owner_org_id, auth.uid(), 'change_template', 'production_cycle', p_cycle::text,
            jsonb_build_object('template_id', c.template_id, 'template_name', c.template_name), jsonb_build_object('template_id', tpl.id, 'template_name', tpl.name), null);
end $$;
revoke execute on function change_cycle_template(uuid, uuid) from public, anon;
grant execute on function change_cycle_template(uuid, uuid) to authenticated, service_role;
