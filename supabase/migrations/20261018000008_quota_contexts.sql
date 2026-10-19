-- Ngữ cảnh ghi vụ của một hộ: "hộ riêng" và "HTX đang tham gia" cùng mức dùng hạn mức (v1.2 mục 4.1).
-- Cần hàm riêng vì hộ không đọc được bảng organizations của HTX (RLS) và không phải thành viên HTX.

create or replace function quota_contexts(p_household uuid) returns table (
  kind text, org_id uuid, org_name text, plan_name text,
  max_cycles integer, used_cycles integer, is_current boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  -- chỉ người có quyền tạo vụ trong hộ này được xem
  if not has_org_role(p_household, array['owner', 'manager']::member_role[]) then
    raise exception 'FORBIDDEN';
  end if;

  return query
  with ctx as (
    select 'own'::text as kind, o.id as org_id, o.name as org_name
      from organizations o where o.id = p_household
    union all
    select 'cooperative', c.id, c.name
      from cooperative_memberships cm join organizations c on c.id = cm.cooperative_org_id
     where cm.household_org_id = p_household and cm.status = 'active'
  )
  select ctx.kind, ctx.org_id, ctx.org_name,
         pt.name,
         s.max_cycles,
         (select count(*)::int from production_cycles pc
           where pc.owner_org_id = ctx.org_id and pc.status in ('active', 'paused')),
         coalesce(s.status in ('trial', 'active') and now() >= s.period_start and now() < s.period_end, false)
    from ctx
    left join lateral (select * from subscriptions s2 where s2.organization_id = ctx.org_id
                        order by s2.period_end desc limit 1) s on true
    left join plan_tiers pt on pt.id = s.plan_tier_id
   order by (ctx.kind = 'own') desc;
end $$;

revoke execute on function quota_contexts(uuid) from public, anon;
grant execute on function quota_contexts(uuid) to authenticated;
