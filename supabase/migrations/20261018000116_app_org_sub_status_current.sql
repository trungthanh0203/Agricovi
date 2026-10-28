-- Trạng thái gói của cơ sở (trang quản trị): khi dòng gói có hạn muộn nhất đã bị đánh dấu "hết hạn" (ví dụ gói bắt đầu ở tương lai bị thay khi đổi gói)
-- nhưng cơ sở đang có một gói khác còn hiệu lực, thì hiện trạng thái của gói đang hiệu lực. Trước đây vẫn hiện "Hết hạn" dù gói mới còn hạn tới nhiều năm.
create or replace function org_sub_status(p_org uuid) returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select s.status::text from subscriptions s
      where s.organization_id = p_org and s.status in ('trial', 'active')
        and now() >= s.period_start and now() < s.period_end
        and (select l.status from subscriptions l where l.organization_id = p_org order by l.period_end desc limit 1) = 'expired'
      order by s.period_end desc limit 1),
    (select case when s.status in ('trial', 'active') and now() >= s.period_end then 'expired' else s.status::text end
       from subscriptions s where s.organization_id = p_org order by s.period_end desc limit 1),
    'none');
$$;
