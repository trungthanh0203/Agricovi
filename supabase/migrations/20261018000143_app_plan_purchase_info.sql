-- "Đã mua: …" ở khung Gói đang dùng (D132): tổng số quý và số tiền đã mua của gói hiện tại, cộng cả các lần gia hạn nối tiếp cùng gói.
create function my_plan_purchase(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare cur subscriptions; r jsonb;
begin
  if not has_org_role(p_org, array['owner']::member_role[]) then raise exception 'FORBIDDEN: Chỉ chủ cơ sở xem thông tin gói đã mua.'; end if;
  select * into cur from current_subscription(p_org);
  if cur.id is null or cur.status <> 'active' then return jsonb_build_object('purchased', false); end if;
  with recursive back as (
    select s.id, s.plan_tier_id, s.period_start, s.period_end from subscriptions s where s.id = cur.id
    union all
    select p.id, p.plan_tier_id, p.period_start, p.period_end
      from subscriptions p join back c on p.organization_id = p_org and p.plan_tier_id = c.plan_tier_id and p.period_end = c.period_start and p.status = 'active'
  ), fwd as (
    select s.id, s.plan_tier_id, s.period_start, s.period_end from subscriptions s where s.id = cur.id
    union all
    select n.id, n.plan_tier_id, n.period_start, n.period_end
      from subscriptions n join fwd c on n.organization_id = p_org and n.plan_tier_id = c.plan_tier_id and n.period_start = c.period_end and n.status = 'active'
  ), chain as (select * from back union select * from fwd)
  select jsonb_build_object('purchased', true,
           'quarters', coalesce(sum(round(extract(epoch from (c.period_end - c.period_start)) / 86400 / 91.31)), 0)::int,
           'amount', coalesce((select sum(pr.amount) from payment_records pr where pr.subscription_id in (select id from chain)), 0),
           'since', min(c.period_start), 'until', max(c.period_end))
    into r from chain c;
  return r;
end $$;
revoke execute on function my_plan_purchase(uuid) from public, anon;
grant execute on function my_plan_purchase(uuid) to authenticated;
