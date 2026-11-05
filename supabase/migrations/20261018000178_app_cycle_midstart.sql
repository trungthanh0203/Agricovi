-- Bắt đầu vụ GIỮA CHỪNG (docs/PLAN_VU_BAT_DAU_GIUA_CHUNG.md, GĐ1): vụ đang chạy dở khi cơ sở bắt đầu dùng app, hoặc nhận giống/con giống đã qua vài công đoạn từ nơi khác.
-- Các việc trước điểm bắt đầu được ghi nhận TRUNG THỰC là "đã làm trước khi dùng app" (source = 'pre_app'): trạng thái xong, KHÔNG đòi nhật ký, KHÔNG có ngày thực tế.
-- Việc hiện tại chuyển sang "đang làm", lịch các việc sau dời theo. Quyền như tạo vụ / quản lý giai đoạn; mọi thao tác ghi nhật ký kiểm toán.

alter table production_stages add column source text not null default 'app' check (source in ('app', 'pre_app'));
alter table production_cycles
  add column tracked_from date,                                                        -- ngày bắt đầu theo dõi trong app (khác ngày vụ bắt đầu thật)
  add column origin text not null default 'own' check (origin in ('own', 'resume', 'transfer')),  -- tự làm từ đầu / đang chạy dở khi vào app / nhận từ nơi khác
  add column origin_note text check (origin_note is null or length(origin_note) <= 300);

-- Phần dùng chung (không cấp cho người dùng gọi trực tiếp): đánh dấu các việc đã làm, bắt đầu việc hiện tại, dời lịch các việc sau.
create or replace function cycle_apply_midstart(p_cycle uuid, p_current uuid, p_done uuid[], p_cur_start date, p_origin text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare cur production_stages; d date := coalesce(p_cur_start, vn_today()); dur integer; bad integer; org uuid;
begin
  select * into cur from production_stages where id = p_current and cycle_id = p_cycle;
  if cur.id is null or cur.status <> 'pending' then
    raise exception 'INVALID_STAGE: Việc được chọn không còn ở trạng thái chưa bắt đầu.';
  end if;
  if p_done is not null and cardinality(p_done) > 0 then
    if p_current = any (p_done) then raise exception 'INVALID_STAGE: Việc đang làm không thể nằm trong các việc đã làm trước đó.'; end if;
    select count(*) into bad from unnest(p_done) x
     where not exists (select 1 from production_stages s where s.id = x and s.cycle_id = p_cycle and s.status = 'pending')
        or exists (select 1 from activity_logs l where l.stage_id = x and l.voided_at is null);
    if bad > 0 then raise exception 'INVALID_STAGE: Có việc đã bắt đầu hoặc đã có nhật ký nên không đánh dấu "làm trước khi dùng app" được.'; end if;
    update production_stages set status = 'done', source = 'pre_app', actual_start = null, actual_end = null where id = any (p_done);
  end if;

  dur := greatest(1, coalesce(cur.duration_days, case when cur.planned_start is not null and cur.planned_end is not null then (cur.planned_end - cur.planned_start) + 1 end, 1));
  update production_stages set status = 'in_progress', actual_start = d, planned_start = d, planned_end = d + dur - 1 where id = p_current;
  if cur.planned_end is not null and (d + dur - 1) <> cur.planned_end then
    perform shift_later_stages(p_cycle, cur.seq, (d + dur - 1) - cur.planned_end);
  end if;
  perform sync_cycle_end(p_cycle);

  update production_cycles set tracked_from = coalesce(tracked_from, vn_today()),
         origin = case when origin = 'own' then coalesce(nullif(p_origin, ''), 'resume') else origin end,
         origin_note = coalesce(nullif(left(trim(coalesce(p_note, '')), 300), ''), origin_note)
   where id = p_cycle returning owner_org_id into org;
  insert into audit_events (organization_id, actor_id, action, entity, entity_id, before, after, reason)
    values (org, auth.uid(), 'cycle_midstart', 'production_cycle', p_cycle::text, null,
            jsonb_build_object('current_stage', p_current, 'done_before', coalesce(cardinality(p_done), 0), 'current_start', d, 'origin', p_origin), nullif(left(trim(coalesce(p_note, '')), 300), ''));
end $$;
revoke execute on function cycle_apply_midstart(uuid, uuid, uuid[], date, text, text) from public, anon, authenticated;

-- Tạo vụ từ quy trình mẫu và bắt đầu từ giữa. p_start = ngày vụ bắt đầu THẬT (có thể trong quá khứ); p_current_tpl = việc của quy trình mẫu đang làm;
-- p_done_tpl = các việc của quy trình mẫu đã làm trước đó; p_current_start = ngày việc hiện tại bắt đầu (mặc định hôm nay).
create or replace function create_cycle_midstart(
  p_id uuid, p_owner_org uuid, p_area uuid, p_template uuid, p_start date, p_name text,
  p_current_tpl uuid, p_done_tpl uuid[], p_current_start date, p_origin text, p_origin_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare cur_stage uuid; done_ids uuid[];
begin
  if p_origin is null or p_origin not in ('resume', 'transfer') then raise exception 'INVALID_ARGUMENT: Cách bắt đầu không hợp lệ.'; end if;
  if p_start is not null and p_start > vn_today() then raise exception 'INVALID_DATE: Ngày vụ bắt đầu thật không được ở tương lai.'; end if;
  if p_current_start is not null and p_current_start > vn_today() then raise exception 'INVALID_DATE: Ngày bắt đầu việc hiện tại không được ở tương lai.'; end if;
  if exists (select 1 from production_cycles where id = p_id) then return p_id; end if;       -- gọi lặp không tạo trùng
  perform create_cycle_from_template(p_id, p_owner_org, p_area, p_template, coalesce(p_start, vn_today()), 'active', p_name);
  if not can_manage_stages(p_id) then raise exception 'FORBIDDEN: Bạn không có quyền đặt điểm bắt đầu của vụ.'; end if;
  select id into cur_stage from production_stages where cycle_id = p_id and template_stage_id = p_current_tpl;
  if cur_stage is null then raise exception 'INVALID_STAGE: Không tìm thấy việc được chọn trong quy trình.'; end if;
  select coalesce(array_agg(id), '{}') into done_ids from production_stages where cycle_id = p_id and template_stage_id = any (coalesce(p_done_tpl, '{}'));
  perform cycle_apply_midstart(p_id, cur_stage, done_ids, p_current_start, p_origin, p_origin_note);
  return p_id;
end $$;

-- Vụ đã tạo (đang sản xuất) mà thực tế đang ở giữa: chuyển tới một việc, các việc trước chưa có nhật ký được đánh dấu "làm trước khi dùng app".
create or replace function jump_cycle_to_stage(p_cycle uuid, p_stage uuid, p_done uuid[], p_date date, p_origin_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare c production_cycles;
begin
  select * into c from production_cycles where id = p_cycle;
  if c.id is null or not can_manage_stages(p_cycle) then raise exception 'FORBIDDEN: Bạn không có quyền thay đổi giai đoạn của vụ này.'; end if;
  if c.status <> 'active' then raise exception 'CYCLE_NOT_ACTIVE: Hãy bắt đầu sản xuất vụ trước khi chuyển tới việc khác.'; end if;
  if p_date is not null and p_date > vn_today() then raise exception 'INVALID_DATE: Ngày bắt đầu không được ở tương lai.'; end if;
  if exists (select 1 from production_stages where cycle_id = p_cycle and status = 'in_progress') then
    raise exception 'STAGE_RUNNING: Đang có việc đang làm. Hãy bấm Xong việc đó trước khi chuyển.';
  end if;
  perform cycle_apply_midstart(p_cycle, p_stage, p_done, p_date, 'resume', p_origin_note);
end $$;

revoke execute on function create_cycle_midstart(uuid, uuid, uuid, uuid, date, text, uuid, uuid[], date, text, text), jump_cycle_to_stage(uuid, uuid, uuid[], date, text) from public, anon;
grant execute on function create_cycle_midstart(uuid, uuid, uuid, uuid, date, text, uuid, uuid[], date, text, text), jump_cycle_to_stage(uuid, uuid, uuid[], date, text) to authenticated, service_role;
