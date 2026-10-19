-- Bước C2: nhân viên ghi "xuất dùng" qua hàng đợi offline bằng INSERT ... ON CONFLICT DO NOTHING.
-- PostgreSQL kiểm cả chính sách SELECT với hàng vừa thêm khi có ON CONFLICT, nên người chỉ có quyền ghi mà không đọc
-- được sẽ bị lỗi RLS (xem CLAUDE.md, bẫy 1). Cho phép đọc CHÍNH giao dịch xuất do mình ghi (dựa vào cột của chính hàng).
-- Nhân viên vẫn không đọc được nhập kho, điều chỉnh, giá vốn, tồn của cơ sở.
create policy inv_txn_read_own_issue on inventory_transactions for select to authenticated
  using (txn_type = 'issue' and recorded_by = auth.uid());

-- Tồn kho chỉ hiện cho vai trò được xem kho; nếu không, nhân viên sẽ thấy tồn "âm" chỉ gồm các lần xuất của chính mình.
create or replace view inventory_balances with (security_invoker = true) as
select t.organization_id, t.location_id, t.material_id, m.name as material_name,
       sum(t.quantity_delta) as balance,
       sum(t.quantity_delta) < 0 as is_negative,
       count(*) filter (where t.unit_cost is null and t.txn_type = 'receipt') as receipts_missing_cost
from inventory_transactions t join materials m on m.id = t.material_id
where has_org_role(t.organization_id, array['owner','manager','inventory_finance']::member_role[])
group by t.organization_id, t.location_id, t.material_id, m.name;
