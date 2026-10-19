-- RPC cho app: tạo tổ chức và xem mức dùng gói. Tham chiếu: FR-ORG-002, FR-PLAN-009.

-- Tạo tổ chức bằng hàm (thay vì INSERT trực tiếp) để người tạo trở thành owner và nhận gói dùng thử
-- trong cùng một giao dịch, tránh vướng RLS khi đọc lại hàng vừa tạo (RETURNING).
create or replace function create_organization(p_type org_type, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED: Cần đăng nhập';
  end if;
  if p_name is null or length(trim(p_name)) < 2 then
    raise exception 'INVALID_NAME: Tên cơ sở cần ít nhất 2 ký tự';
  end if;
  insert into organizations (type, name, created_by)
    values (p_type, trim(p_name), auth.uid())
    returning id into new_id;      -- trigger: owner + gói dùng thử
  return new_id;
end $$;

-- Mức dùng gói của một tổ chức (chỉ thành viên xem được): vụ đang tính hạn mức / tối đa, hạn gói
create or replace function org_plan_usage(p_org uuid) returns table (
  plan_name text, status subscription_status, max_cycles integer, used_cycles integer,
  period_end timestamptz, price_per_quarter bigint, is_current boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_org_member(p_org) then
    raise exception 'FORBIDDEN';
  end if;
  return query
    select pt.name, s.status, s.max_cycles,
           (select count(*)::int from production_cycles c
             where c.owner_org_id = p_org and c.status in ('active', 'paused')),
           s.period_end, s.price_per_quarter,
           (s.status in ('trial', 'active') and now() >= s.period_start and now() < s.period_end)
      from subscriptions s join plan_tiers pt on pt.id = s.plan_tier_id
     where s.organization_id = p_org
     order by s.period_end desc
     limit 1;
end $$;

revoke execute on function create_organization(org_type, text), org_plan_usage(uuid) from public, anon;
grant execute on function create_organization(org_type, text), org_plan_usage(uuid) to authenticated;
