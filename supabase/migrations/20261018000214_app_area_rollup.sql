-- D177: TỔNG HỢP THEO KHU TÍNH SẴN Ở MÁY CHỦ (màn Tổng kết vụ → theo phân khu).
-- Trước đây app tải số liệu TỪNG VỤ về rồi tự cộng theo phân khu; cơ sở nhiều vụ thì nặng. Hàm này cộng sẵn theo từng khu (ô sản xuất hoặc phân khu) nên kết quả chỉ vài chục
-- dòng dù có hàng trăm vụ. Cách cộng giống màn hình cũ: chi phí và doanh thu cộng mọi vụ trong phạm vi; lãi/lỗ chỉ cộng vụ đã kết thúc hoặc đã có doanh thu
-- (vụ chưa bán, vật nuôi xuất dở, vườn cây đã có vụ mùa không cộng lãi/lỗ; D170, D176). Phần tiền theo quyền "Tổng kết vụ", thu hoạch theo quyền Thu hoạch.
-- p_statuses: danh sách trạng thái (null = mọi trạng thái trừ đã hủy). p_ended_from/p_ended_to: chỉ giới hạn các vụ ĐÃ KẾT THÚC theo ngày kết thúc
-- (ngày kết thúc thật, nếu chưa có thì ngày dự kiến, rồi ngày bắt đầu); vụ trạng thái khác không bị giới hạn bởi hai ngày này.

create or replace function get_area_rollup(p_org uuid, p_statuses text[] default null, p_ended_from date default null, p_ended_to date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare money_ok boolean; harvest_ok boolean;
begin
  if auth.uid() is null or not is_org_member(p_org) then raise exception 'FORBIDDEN: Bạn không thuộc cơ sở này.'; end if;
  money_ok := has_perm(p_org, 'summary', 'view');
  harvest_ok := has_perm(p_org, 'harvest', 'view') or money_ok;
  return jsonb_build_object('can_money', money_ok, 'can_harvest', harvest_ok, 'generated_at', now(), 'rows', coalesce((
    select jsonb_agg(jsonb_build_object('area_id', t.area_id, 'cycles', t.n, 'running', t.run,
                                        'cost', case when money_ok then t.cost end, 'harvest', case when harvest_ok then t.harv end,
                                        'revenue', case when money_ok then t.rev end, 'profit', case when money_ok then t.prof end))
      from (
        select cy.area_id, count(*)::int n, (count(*) filter (where cy.status = 'active'))::int run,
               sum(x.total) cost, sum(x.net) harv, sum(x.rev) rev, sum(x.total_profit) filter (where not x.pending) prof
          from (
            select pc.id, pc.area_id, pc.status, pc.cycle_mode
              from production_cycles pc
             where pc.owner_org_id = p_org and pc.status <> 'cancelled' and can_read_cycle(pc.id)
               and (p_statuses is null or pc.status::text = any (p_statuses))
               and (pc.status <> 'ended' or ((p_ended_from is null or coalesce(pc.end_date, pc.expected_end_date, pc.start_date) >= p_ended_from)
                                            and (p_ended_to is null or coalesce(pc.end_date, pc.expected_end_date, pc.start_date) <= p_ended_to)))
          ) cy
          cross join lateral (select case when money_ok then get_cycle_summary(cy.id) end sm) s
          cross join lateral (
            select (s.sm->>'total_cost')::numeric total,
                   (select sum(h.quantity - coalesce(h.loss_quantity, 0)) from harvest_records h where h.cycle_id = cy.id and h.voided_at is null) net,
                   (s.sm->>'revenue_recorded')::numeric rev,
                   (s.sm->>'revenue_recorded')::numeric - (s.sm->>'total_cost')::numeric total_profit,
                   (cy.cycle_mode = 'perennial' and coalesce((s.sm->>'seasons')::integer, 0) > 0)
                     or (cy.status <> 'ended' and (coalesce((s.sm->>'partial_out')::boolean, false) or coalesce((s.sm->>'revenue_recorded')::numeric, 0) <= 0)) pending
          ) x
         group by cy.area_id
      ) t), '[]'::jsonb));
end $$;
revoke execute on function get_area_rollup(uuid, text[], date, date) from public, anon;
grant execute on function get_area_rollup(uuid, text[], date, date) to authenticated, service_role;
