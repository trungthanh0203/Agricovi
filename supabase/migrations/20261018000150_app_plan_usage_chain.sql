-- D144: Trang chủ báo "đã hết hạn" dù gói còn đến 2031. Nguyên nhân: org_plan_usage lấy dòng gói có ngày hết hạn xa nhất,
-- mà gói gia hạn bắt đầu ở TƯƠNG LAI nên "đang dùng" = sai. Sửa: ưu tiên gói đang hiệu lực (tên gói, số vụ tối đa),
-- ngày hết hạn là cuối chuỗi các kỳ liền nhau/đã mua; còn hiệu lực khi có kỳ đang chạy.
create or replace function org_plan_usage(p_org uuid) returns table (
  plan_name text, status subscription_status, max_cycles integer, used_cycles integer,
  period_end timestamptz, price_per_quarter bigint, is_current boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_org_role(p_org, array['owner']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở xem được gói dịch vụ.';
  end if;
  return query
    with cur as (
      select s.* from subscriptions s
       where s.organization_id = p_org and s.status in ('trial', 'active') and now() >= s.period_start and now() < s.period_end
       order by s.period_end desc limit 1),
    pick as (
      select * from cur
      union all
      select * from (select s2.* from subscriptions s2 where s2.organization_id = p_org order by s2.period_end desc limit 1) l
       where not exists (select 1 from cur)
      limit 1)
    select pt.name, p.status, p.max_cycles,
           (select count(*)::int from production_cycles c where c.owner_org_id = p_org and c.status in ('active', 'paused')),
           greatest(p.period_end, (select max(s3.period_end) from subscriptions s3 where s3.organization_id = p_org and s3.status in ('trial', 'active'))),
           p.price_per_quarter,
           exists (select 1 from cur)
      from pick p join plan_tiers pt on pt.id = p.plan_tier_id;
end $$;
