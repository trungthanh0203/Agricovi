-- Đợt 1A (D138): kiểm quyền xem vụ MỘT LẦN cho cả câu truy vấn thay vì mỗi dòng.
-- Trước đây mỗi dòng giai đoạn/nhật ký/thu hoạch... gọi can_read_cycle() (kéo theo ~6 hàm con) nên đồng bộ chậm khi dữ liệu lớn.
-- Quyền KHÔNG đổi: vẫn đúng can_read_cycle() / cycle_has_perm(); chỉ đổi cách tính (tập vụ được xem tính một lần rồi so khớp).

create or replace function readable_cycle_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  with my_orgs as (
    select m.organization_id from organization_memberships m where m.user_id = auth.uid()
  )
  select c.id
  from production_cycles c
  left join production_areas a on a.id = c.area_id
  where (c.owner_org_id in (select organization_id from my_orgs) or a.organization_id in (select organization_id from my_orgs))
    and can_read_cycle(c.id);
$$;

create or replace function readable_cycle_ids_perm(p_module text, p_need text default 'view') returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from readable_cycle_ids() id where cycle_has_perm(id, p_module, p_need);
$$;

revoke execute on function readable_cycle_ids() from public, anon;
revoke execute on function readable_cycle_ids_perm(text, text) from public, anon;
grant execute on function readable_cycle_ids() to authenticated;
grant execute on function readable_cycle_ids_perm(text, text) to authenticated;

drop policy logs_read on activity_logs;
create policy logs_read on activity_logs for select to authenticated
  using (case when cycle_id is not null then cycle_id in (select readable_cycle_ids()) else is_org_member(organization_id) end);

drop policy harvest_read on harvest_records;
create policy harvest_read on harvest_records for select to authenticated
  using (cycle_id in (select readable_cycle_ids_perm('harvest', 'view')));

drop policy stages_read on production_stages;
create policy stages_read on production_stages for select to authenticated using (cycle_id in (select readable_cycle_ids()));
drop policy count_events_read on cycle_count_events;
create policy count_events_read on cycle_count_events for select to authenticated using (cycle_id in (select readable_cycle_ids()));
drop policy cycle_feed_read on cycle_feed_entries;
create policy cycle_feed_read on cycle_feed_entries for select to authenticated using (cycle_id in (select readable_cycle_ids()));
drop policy cycle_incidents_read on cycle_incidents;
create policy cycle_incidents_read on cycle_incidents for select to authenticated using (cycle_id in (select readable_cycle_ids()));
drop policy cycle_milestones_read on cycle_milestones;
create policy cycle_milestones_read on cycle_milestones for select to authenticated using (cycle_id in (select readable_cycle_ids()));
drop policy cycle_notes_read on cycle_notes;
create policy cycle_notes_read on cycle_notes for select to authenticated using (cycle_id in (select readable_cycle_ids()));
drop policy cycle_weighings_read on cycle_weighings;
create policy cycle_weighings_read on cycle_weighings for select to authenticated using (cycle_id in (select readable_cycle_ids()));
drop policy cycle_withdrawal_read on cycle_withdrawal;
create policy cycle_withdrawal_read on cycle_withdrawal for select to authenticated using (cycle_id in (select readable_cycle_ids()));
drop policy incident_actions_read on incident_actions;
create policy incident_actions_read on incident_actions for select to authenticated using (cycle_id in (select readable_cycle_ids()));
drop policy tasks_read on production_tasks;
create policy tasks_read on production_tasks for select to authenticated using (cycle_id in (select readable_cycle_ids()));
