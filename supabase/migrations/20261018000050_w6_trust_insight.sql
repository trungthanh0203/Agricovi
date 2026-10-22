-- W6 (D70): NỘI DUNG NÂNG CAO VÀ TIN CẬY.
--  1. Gian hàng vật tư: tối đa 10 vật tư (giai đoạn chưa thu phí).
--  2. H1 truy xuất dạng dòng thời gian: bản chụp vụ có thêm các giai đoạn + ngày thu hoạch (không số lượng, không chi phí).
--  3. H2 huy hiệu tin cậy nhiều mức, TÍNH TỰ ĐỘNG từ dữ kiện có thật (không ai cấp tay, không mua được).
--  4. Giá nông sản tham khảo (tổng hợp từ giá "từ" nhà cung cấp tự khai) và lịch mùa vụ (từ vụ đã công khai).
--  5. E7 thống kê gian hàng (đơn, doanh số đã hoàn tất, sản phẩm bán chạy, thời gian phản hồi, báo giá, đánh giá).
--  6. D6 gợi ý khớp tin giao thương (tin mua ↔ tin bán) và "tin cần mua phù hợp" cho nhà cung cấp.

-- ---------------------------------------------------------------------------
-- 1. Hạn mức vật tư của gian hàng
-- ---------------------------------------------------------------------------
create or replace function shop_material_limit() returns integer language sql immutable as $$ select 10 $$;

create or replace function shop_material_limit_guard() returns trigger language plpgsql as $$
begin
  if new.shop_id is not null and (select count(*) from site_materials where shop_id = new.shop_id) >= shop_material_limit() then
    raise exception 'LIMIT: Gian hàng đăng tối đa % vật tư trong giai đoạn này.', shop_material_limit();
  end if;
  return new;
end $$;
create trigger site_materials_shop_limit before insert on site_materials for each row execute function shop_material_limit_guard();

-- ---------------------------------------------------------------------------
-- 2. Dòng thời gian của vụ trong bản chụp truy xuất
-- ---------------------------------------------------------------------------
create or replace function cycle_trace_json(p_cycle uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c production_cycles; a production_areas; org_name text; crop text; mats jsonb; stg jsonb; hv jsonb;
begin
  select * into c from production_cycles where id = p_cycle;
  select * into a from production_areas where id = c.area_id;
  select name into org_name from organizations where id = c.owner_org_id;
  select name into crop from crop_types where id = c.crop_type_id;
  select coalesce(jsonb_agg(jsonb_build_object('name', x.name, 'category', x.category, 'unit', x.unit, 'quantity', x.qty,
                                               'first', x.first_date, 'last', x.last_date) order by x.name), '[]') into mats
    from (
      select m.name, m.category, u.name as unit, sum(-t.quantity_delta) as qty, min(t.txn_date) filter (where t.txn_type = 'issue') as first_date,
             max(t.txn_date) filter (where t.txn_type = 'issue') as last_date
        from inventory_transactions t
        join materials m on m.id = t.material_id join units_of_measure u on u.id = m.base_unit_id
       where t.cycle_id = p_cycle and (t.txn_type = 'issue' or (t.txn_type = 'adjustment' and t.reverses_txn_id is not null))
       group by m.name, m.category, u.name
      having sum(-t.quantity_delta) > 0
    ) x;
  select coalesce(jsonb_agg(jsonb_build_object('name', s.name, 'status', s.status, 'planned_start', s.planned_start, 'planned_end', s.planned_end,
                                               'actual_start', s.actual_start, 'actual_end', s.actual_end) order by s.seq), '[]') into stg
    from production_stages s where s.cycle_id = p_cycle;
  select jsonb_build_object('count', count(*), 'first', min(h.harvested_at::date), 'last', max(h.harvested_at::date)) into hv
    from harvest_records h where h.cycle_id = p_cycle and h.voided_at is null;
  return jsonb_build_object(
    'cycle_id', c.id, 'name', cycle_label(c.id), 'crop', crop, 'org', org_name, 'status', c.status,
    'farm', a.name, 'location', a.location, 'area_size', a.area_size, 'area_unit', a.area_unit,
    'start_date', c.start_date, 'expected_end_date', c.expected_end_date, 'end_date', c.end_date,
    'template', c.template_name, 'materials', mats, 'stages', stg, 'harvest', hv, 'generated_at', now());
end $$;

-- Vụ đã công khai trước đó: bổ sung dòng thời gian (không đổi phiên bản, không đổi các phần khác)
update public_cycles pc set snapshot = pc.snapshot || jsonb_build_object('stages', t->'stages', 'harvest', t->'harvest')
  from (select cycle_id, cycle_trace_json(cycle_id) as t from public_cycles) x
 where x.cycle_id = pc.cycle_id;

-- ---------------------------------------------------------------------------
-- 3. Huy hiệu tin cậy (tự động, theo dữ kiện)
-- ---------------------------------------------------------------------------
--  profile : hồ sơ đã được kiểm duyệt (mọi cơ sở có trên website)
--  docs    : có giấy tờ/chứng chỉ đã được ban quản trị kiểm tra tài liệu hoặc xác minh
--  trace   : có vụ đang công khai truy xuất nguồn gốc
--  deals   : ≥ 5 đơn hoàn tất từ ≥ 3 người mua khác nhau
--  rating  : ≥ 5 đánh giá từ ≥ 3 người mua khác nhau, trung bình ≥ 4,5 sao
-- Mức: 1 Cơ bản (profile) · 2 Tin cậy (có docs hoặc trace) · 3 Rất tin cậy (docs + trace + deals hoặc rating)
create view public_profile_badges as
  select x.profile_id, x.badges, x.deals_count, x.avg_stars, x.review_count,
         case when 'docs' = any (x.badges) and 'trace' = any (x.badges) and ('deals' = any (x.badges) or 'rating' = any (x.badges)) then 3
              when 'docs' = any (x.badges) or 'trace' = any (x.badges) then 2 else 1 end as level
    from (
      select p.profile_id,
             array_remove(array[
               'profile',
               case when exists (select 1 from certification_records c where c.business_profile_id = p.profile_id and c.status in ('document_checked', 'verified')) then 'docs' end,
               case when exists (select 1 from public_cycles pc where pc.organization_id = p.organization_id and pc.is_visible and not pc.hidden_by_admin) then 'trace' end,
               case when d.orders >= 5 and d.buyers >= 3 then 'deals' end,
               case when r.n >= 5 and r.buyers >= 3 and r.avg >= 4.5 then 'rating' end], null) as badges,
             d.orders as deals_count, round(r.avg, 1) as avg_stars, r.n as review_count
        from public_profiles p
        cross join lateral (select count(*)::int as orders, count(distinct o.buyer_id)::int as buyers from web_orders o where o.profile_id = p.profile_id and o.status = 'completed') d
        cross join lateral (select count(*)::int as n, count(distinct v.buyer_id)::int as buyers, avg(v.stars) as avg from supplier_reviews v where v.profile_id = p.profile_id and v.status = 'visible') r
       where p.is_visible) x;
grant select on public_profile_badges to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Giá nông sản tham khảo và lịch mùa vụ
-- ---------------------------------------------------------------------------
create view public_price_board as
  select (pp.snapshot->>'category_id')::uuid as category_id, c.name as category_name, c.slug as category_slug,
         coalesce(nullif(pp.snapshot->>'unit', ''), '') as unit, coalesce(pr.snapshot->>'province', '') as province,
         count(*)::int as n_products, count(distinct pr.profile_id)::int as n_suppliers,
         min((pp.snapshot->>'price_from')::numeric) as price_min, max((pp.snapshot->>'price_from')::numeric) as price_max,
         round(avg((pp.snapshot->>'price_from')::numeric)) as price_avg, max(pp.supply_updated_on) as updated_on
    from public_products pp
    join public_profiles pr on pr.profile_id = pp.profile_id and pr.is_visible
    join product_categories c on c.id = (pp.snapshot->>'category_id')::uuid and c.is_active
   where pp.is_visible and nullif(pp.snapshot->>'category_id', '') is not null and coalesce(nullif(pp.snapshot->>'price_from', '')::numeric, 0) > 0
     and (pp.supply_status is null or pp.supply_status not in ('out_of_stock', 'paused'))
   group by 1, 2, 3, 4, 5;
grant select on public_price_board to anon, authenticated;

create view public_season_calendar as
  select pc.code, pc.snapshot->>'crop' as crop, pc.snapshot->>'name' as name, pc.snapshot->>'status' as status,
         nullif(pc.snapshot->>'start_date', '')::date as start_date, nullif(pc.snapshot->>'expected_end_date', '')::date as expected_end_date,
         pr.slug, pr.snapshot->>'display_name' as supplier, coalesce(pr.snapshot->>'province', '') as province
    from public_cycles pc join public_profiles pr on pr.organization_id = pc.organization_id and pr.is_visible
   where pc.is_visible and not pc.hidden_by_admin and pc.snapshot->>'status' in ('planned', 'preparing', 'active');
grant select on public_season_calendar to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Thống kê gian hàng (chỉ người quản lý hồ sơ cơ sở)
-- ---------------------------------------------------------------------------
create or replace function shop_stats(p_org uuid, p_days integer default 90) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d integer := least(greatest(coalesce(p_days, 90), 7), 365); since timestamptz;
begin
  perform web_guard();
  if not can_edit_profile(p_org) then raise exception 'FORBIDDEN: Bạn không có quyền xem thống kê này.'; end if;
  since := now() - make_interval(days => d);
  return jsonb_build_object('days', d,
    'orders', (select coalesce(jsonb_object_agg(s, n), '{}') from (select status as s, count(*)::int as n from web_orders where organization_id = p_org and created_at >= since group by status) x),
    'revenue_completed', (select coalesce(sum(order_total(id)), 0) from web_orders where organization_id = p_org and status = 'completed' and completed_at >= since),
    'reply_hours_median', (select round((percentile_cont(0.5) within group (order by extract(epoch from (quoted_at - created_at)) / 3600))::numeric, 1) from web_orders
                            where organization_id = p_org and created_at >= since and quoted_at is not null),
    'by_month', coalesce((select jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'),
                  'orders', (select count(*)::int from web_orders o where o.organization_id = p_org and date_trunc('month', o.created_at) = m),
                  'revenue', (select coalesce(sum(order_total(o.id)), 0) from web_orders o where o.organization_id = p_org and o.status = 'completed' and date_trunc('month', o.completed_at) = m)) order by m)
                  from generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') m), '[]'),
    'top_products', coalesce((select jsonb_agg(to_jsonb(t)) from (
                        select i.name, i.unit, sum(coalesce(i.agreed_quantity, i.quantity)) as quantity, sum(round(coalesce(i.unit_price, 0) * coalesce(i.agreed_quantity, i.quantity))) as amount
                          from web_order_items i join web_orders o on o.id = i.order_id
                         where o.organization_id = p_org and o.status = 'completed' and o.completed_at >= since group by i.name, i.unit order by amount desc, quantity desc limit 5) t), '[]'),
    'quotes', jsonb_build_object('new', (select count(*)::int from quote_requests where organization_id = p_org and status = 'new'),
                                 'period', (select count(*)::int from quote_requests where organization_id = p_org and created_at >= since)),
    'rating', (select jsonb_build_object('avg', round(avg(stars), 1), 'count', count(*)::int) from supplier_reviews where organization_id = p_org and status = 'visible'),
    'favorites', (select count(*)::int from favorite_suppliers f join business_profiles b on b.id = f.profile_id where b.organization_id = p_org));
end $$;

-- ---------------------------------------------------------------------------
-- 6. Gợi ý khớp tin giao thương
-- ---------------------------------------------------------------------------
-- Cho chủ tin: các tin ngược loại (mua ↔ bán) còn hiệu lực, cùng loại sản phẩm; điểm cao hơn khi cùng tỉnh và khoảng giá giao nhau
create or replace function suggest_trade_matches(p_post uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p trade_posts;
begin
  perform web_guard();
  select * into p from trade_posts where id = p_post and user_id = auth.uid();
  if p.id is null then raise exception 'NOT_FOUND: Không tìm thấy tin của bạn.'; end if;
  if p.status <> 'published' or p.expires_at <= now() or p.category_id is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(to_jsonb(x)) from (
    select t.id, t.kind, t.title, t.province, t.quantity, t.unit, t.price_min, t.price_max, t.expires_at,
           (case when lower(t.province) = lower(p.province) then 2 else 0 end
            + case when (p.kind = 'buy' and (t.price_min is null or p.price_max is null or t.price_min <= p.price_max))
                     or (p.kind = 'sell' and (t.price_max is null or p.price_min is null or t.price_max >= p.price_min)) then 2 else 0 end) as score
      from trade_posts t
     where t.status = 'published' and t.expires_at > now() and t.kind <> p.kind and t.category_id = p.category_id and t.user_id <> auth.uid()
       and not exists (select 1 from buyer_profiles b where b.user_id = t.user_id and b.status = 'blocked')
     order by score desc, t.created_at desc limit 5) x), '[]'::jsonb);
end $$;

-- Cho nhà cung cấp: tin cần mua còn hiệu lực thuộc loại sản phẩm cơ sở đang bán (ưu tiên cùng tỉnh)
create or replace function match_buy_posts_for_org(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare prov text;
begin
  perform web_guard();
  if not can_edit_profile(p_org) then raise exception 'FORBIDDEN: Bạn không có quyền xem mục này.'; end if;
  select pr.snapshot->>'province' into prov from public_profiles pr where pr.organization_id = p_org and pr.is_visible limit 1;
  return coalesce((select jsonb_agg(to_jsonb(x)) from (
    select t.id, t.title, t.province, t.quantity, t.unit, t.price_min, t.price_max, t.expires_at, (lower(t.province) = lower(coalesce(prov, ''))) as same_province
      from trade_posts t
     where t.kind = 'buy' and t.status = 'published' and t.expires_at > now() and t.user_id not in (select m.user_id from organization_memberships m where m.organization_id = p_org)
       and t.category_id in (select (pp.snapshot->>'category_id')::uuid from public_products pp join public_profiles pr on pr.profile_id = pp.profile_id
                              where pr.organization_id = p_org and pp.is_visible and nullif(pp.snapshot->>'category_id', '') is not null)
     order by (lower(t.province) = lower(coalesce(prov, ''))) desc, t.created_at desc limit 8) x), '[]'::jsonb);
end $$;

revoke execute on function shop_stats(uuid, integer), suggest_trade_matches(uuid), match_buy_posts_for_org(uuid), shop_material_limit_guard() from public, anon;
grant execute on function shop_stats(uuid, integer), suggest_trade_matches(uuid), match_buy_posts_for_org(uuid) to authenticated;
