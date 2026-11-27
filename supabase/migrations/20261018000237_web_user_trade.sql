-- Quản trị website: xem người đăng ký kèm tin giao thương của họ (trang "Người dùng website").
-- Chỉ tổng biên tập / quản trị (như site_list_users ở 0045); thao tác duyệt/ẩn tin vẫn dùng site_review_trade_post (0046).

create or replace function site_list_users(p_search text default null, p_limit integer default 100) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare q text := nullif(trim(coalesce(p_search, '')), '');
begin
  perform site_guard(array['chief_editor']);
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
    select b.user_id, b.full_name, b.buyer_kind, b.company, b.tax_code, b.phone, b.login_kind, b.status, b.blocked_reason, b.created_at,
           case when b.login_kind = 'email' then u.email end as email,
           (select count(*) from favorite_suppliers f where f.user_id = b.user_id) as favorites,
           (select count(*) from trade_posts t where t.user_id = b.user_id) as posts,
           (select count(*) from trade_posts t where t.user_id = b.user_id and t.status = 'pending') as posts_pending
      from buyer_profiles b left join auth.users u on u.id = b.user_id
     where q is null or fold_vi(b.full_name) like '%' || fold_vi(q) || '%' or lower(coalesce(u.email, '')) like '%' || lower(q) || '%' or coalesce(b.phone, '') like '%' || q || '%'
     order by b.created_at desc limit least(coalesce(p_limit, 100), 300)) x), '[]');
end $$;

create or replace function site_user_detail(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u jsonb;
begin
  perform site_guard(array['chief_editor']);
  if not exists (select 1 from buyer_profiles where user_id = p_user) then raise exception 'NOT_FOUND: Không tìm thấy người dùng.'; end if;
  select to_jsonb(x) into u from auth.users x where x.id = p_user;
  return jsonb_build_object(
    'email_verified', u->>'email_confirmed_at' is not null,
    'orgs', coalesce((select jsonb_agg(o.name order by o.name) from organization_memberships m join organizations o on o.id = m.organization_id
                       where m.user_id = p_user and m.status = 'active'), '[]'),
    'addresses', coalesce((select jsonb_agg(jsonb_build_object('label', a.label, 'recipient', a.recipient, 'phone', a.phone,
                       'address', concat_ws(', ', a.address, a.district, a.province)) order by a.is_default desc, a.created_at)
                       from buyer_addresses a where a.user_id = p_user), '[]'),
    'reports_open', (select count(*) from abuse_reports a where a.status = 'open'
                       and ((a.target_type = 'user' and a.target_id = p_user)
                         or (a.target_type = 'trade_post' and a.target_id in (select id from trade_posts where user_id = p_user)))),
    'responses_sent', (select count(*) from trade_responses r where r.user_id = p_user),
    'posts', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
        select p.id, p.kind, p.title, p.status, p.review_note, p.quantity, p.unit, p.price_min, p.price_max, p.province, p.district, p.when_date, p.quality,
               p.description, p.images, p.expires_at, p.created_at, (p.expires_at <= now()) as expired,
               (select name from product_categories c where c.id = p.category_id) as category_name,
               (select o.name from organizations o where o.id = p.organization_id) as org_name,
               (select count(*) from trade_responses r where r.post_id = p.id) as responses,
               (select count(*) from abuse_reports a where a.target_type = 'trade_post' and a.target_id = p.id and a.status = 'open') as open_reports
          from trade_posts p where p.user_id = p_user order by p.created_at desc limit 100) x), '[]'));
end $$;

revoke execute on function site_user_detail(uuid) from public, anon;
grant execute on function site_user_detail(uuid) to authenticated;
