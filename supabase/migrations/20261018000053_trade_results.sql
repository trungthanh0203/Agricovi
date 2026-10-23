-- D73: KẾT QUẢ GIAO THƯƠNG công khai (mục cuối của menu Giao thương). Chỉ gồm tin ĐÃ ĐÓNG mà có báo giá/quan tâm được CHẤP NHẬN (giao dịch đã thành),
-- cùng vài số tổng. Không có người đăng, người phản hồi, giá hay nội dung trao đổi: chỉ tiêu đề tự sinh (loại hàng, số lượng, tỉnh), danh mục, ngày đóng.
create view public_trade_results as
  select p.id, p.kind, p.title, p.category_id, c.name as category_name, p.province, p.quantity, p.unit, p.updated_at as closed_at
    from trade_posts p left join product_categories c on c.id = p.category_id
   where p.status = 'closed' and exists (select 1 from trade_responses r where r.post_id = p.id and r.status = 'accepted');

create view public_trade_stats as
  select (select count(*) from public_trade_results)::int as deals_total,
         (select count(*) from public_trade_results where closed_at > now() - interval '30 days')::int as deals_30d,
         (select count(*) from web_orders where status = 'completed')::int as orders_completed,
         (select count(*) from trade_posts where status = 'published' and expires_at > now())::int as active_posts;

grant select on public_trade_results, public_trade_stats to anon, authenticated;
