-- P3 gọn (D100): SỐ LIỆU THÔ để tính TĂNG TRỌNG (ADG) và FCR của lứa nuôi, lấy từ việc "Cân heo" và cám đã xuất cho vụ.
-- Hàm chỉ trả dữ liệu thô theo ngày (các lần cân; cám đã xuất theo ngày, đã quy ra kg); việc tính ADG/FCR nằm ở app (lib/growthLogic.ts) để
-- đổi cách tính không cần đổi CSDL. Không ghi gì, không bảng mới.
--   - Lần cân: nhật ký của vụ có loại việc tên "Cân heo…", đọc trường pigs (số con cân) và avg_kg (cân nặng TB); bỏ nhật ký đã hủy.
--   - Cám đã xuất: giao dịch xuất của vật tư nhóm "thức ăn" (feed) cho vụ, bỏ giao dịch đã bị đảo; quy về kg (kg, g, tấn). Đơn vị khác (bao, thùng…)
--     không quy được, ghi cờ other_unit. Người không có quyền xem Kho thì không thấy cám từ kho (can_view = false).
--   - Dự phòng: tổng "lượng cho ăn" (feed_kg) ghi tay ở việc "Cho ăn", để dùng khi chưa quản lý cám trong kho.

create or replace function get_cycle_growth(p_cycle uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_org uuid; v_weigh jsonb; v_stock jsonb; v_logs jsonb; v_can boolean; v_other boolean := false;
begin
  select owner_org_id into v_org from production_cycles where id = p_cycle;
  if v_org is null or not can_read_cycle(p_cycle) then raise exception 'NOT_FOUND: Không tìm thấy vụ hoặc bạn không có quyền xem.'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('date', x.d, 'pigs', x.pigs, 'avg_kg', x.avg) order by x.d, x.ts), '[]'::jsonb) into v_weigh
    from (select (l.performed_at at time zone 'Asia/Ho_Chi_Minh')::date d, l.performed_at ts,
                 case when l.data->>'pigs' ~ '^[0-9]+(\.[0-9]+)?$' then (l.data->>'pigs')::numeric end pigs,
                 case when l.data->>'avg_kg' ~ '^[0-9]+(\.[0-9]+)?$' then (l.data->>'avg_kg')::numeric end avg
            from activity_logs l join work_types w on w.id = l.work_type_id
           where l.cycle_id = p_cycle and l.voided_at is null and w.name ilike 'cân heo%') x
   where x.avg is not null and x.avg > 0;

  select coalesce(jsonb_agg(jsonb_build_object('date', y.d, 'kg', y.kg) order by y.d), '[]'::jsonb) into v_logs
    from (select (l.performed_at at time zone 'Asia/Ho_Chi_Minh')::date d, sum((l.data->>'feed_kg')::numeric) kg
            from activity_logs l
           where l.cycle_id = p_cycle and l.voided_at is null and l.data->>'feed_kg' ~ '^[0-9]+(\.[0-9]+)?$'
           group by 1) y;

  v_can := has_perm(v_org, 'inventory', 'view');
  if v_can then
    select coalesce(jsonb_agg(jsonb_build_object('date', z.d, 'kg', z.kg) order by z.d), '[]'::jsonb), coalesce(bool_or(z.unknown), false) into v_stock, v_other
      from (select t.txn_date d, sum(case when f.factor is null then 0 else -t.quantity_delta * f.factor end) kg, bool_or(f.factor is null) unknown
              from inventory_transactions t
              join materials m on m.id = t.material_id and m.material_group = 'feed'
              join units_of_measure u on u.id = m.base_unit_id
              cross join lateral (select case u.code when 'kg' then 1::numeric when 'g' then 0.001 when 'ton' then 1000::numeric end as factor) f
             where t.cycle_id = p_cycle and t.txn_type = 'issue'
               and not exists (select 1 from inventory_transactions x where x.reverses_txn_id = t.id)
             group by t.txn_date) z;
  else
    v_stock := '[]'::jsonb;
  end if;

  return jsonb_build_object('weighings', v_weigh, 'feed', jsonb_build_object('can_view', v_can, 'stock_by_date', v_stock, 'other_unit', v_other, 'logs_by_date', v_logs));
end $$;
revoke execute on function get_cycle_growth(uuid) from public, anon;
grant execute on function get_cycle_growth(uuid) to authenticated, service_role;
