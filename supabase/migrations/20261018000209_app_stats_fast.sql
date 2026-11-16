-- D172: tăng tốc số liệu tóm tắt của vụ (get_cycles_stats gọi get_cycle_summary cho từng vụ, trong đó view inventory_issue_costs là chỗ nặng nhất).
-- Nguyên nhân đo được: với MỖI dòng xuất kho, view luôn tính "giá nhập bình quân" (quét mọi phiếu nhập của vật tư đó) kể cả khi dòng xuất đã có giá vốn riêng,
-- trong khi giá bình quân chỉ dùng khi dòng xuất KHÔNG có giá (coalesce). Thêm điều kiện "t.unit_cost is null" vào phép tính phụ để máy chủ bỏ qua khi đã có giá.
-- Kết quả không đổi (cùng công thức, chỉ bỏ phép tính không dùng đến).

create or replace view inventory_issue_costs with (security_invoker = true) as
select t.id as txn_id, t.organization_id, t.material_id, t.cycle_id, t.activity_log_id, t.txn_date,
       -t.quantity_delta as quantity,
       coalesce(t.unit_cost, a.avg_cost) as unit_cost_used,
       coalesce(t.unit_cost, a.avg_cost) is not null as cost_known,
       (t.unit_cost is null and a.avg_cost is not null) as cost_from_average,
       round(-t.quantity_delta * coalesce(t.unit_cost, a.avg_cost))::bigint as cost
from inventory_transactions t
left join lateral (
  select sum(r.quantity_delta * r.unit_cost) / nullif(sum(r.quantity_delta), 0) as avg_cost
  from inventory_transactions r
  where t.unit_cost is null
    and r.organization_id = t.organization_id and r.material_id = t.material_id
    and r.txn_type = 'receipt' and r.unit_cost is not null and r.txn_date <= t.txn_date
) a on true
where t.txn_type = 'issue'
  and not exists (select 1 from inventory_transactions x where x.reverses_txn_id = t.id)
union all
select t.id, t.organization_id, t.material_id, t.cycle_id, null::uuid, t.txn_date,
       -t.quantity_delta,
       t.unit_cost,
       t.unit_cost is not null,
       false,
       -round(t.quantity_delta * t.unit_cost)::bigint
from inventory_transactions t
where t.is_return
  and not exists (select 1 from inventory_transactions x where x.reverses_txn_id = t.id);
