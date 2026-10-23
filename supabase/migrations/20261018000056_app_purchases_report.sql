-- G2-2 P4 (D76): báo cáo "Mua theo nhà cung ứng" trong Báo cáo theo nhu cầu (D48). Quyền xem = mục Chi phí (xem), như công nợ.
-- Không sao chép lại hàm run_report cũ: đổi tên thành run_report_base (chỉ nội bộ) và dựng run_report mới xử lý loại 'purchases',
-- các loại còn lại chuyển nguyên cho hàm cũ nên hành vi của chúng không đổi.

alter table saved_reports drop constraint saved_reports_report_type_check;
alter table saved_reports add constraint saved_reports_report_type_check
  check (report_type in ('expenses', 'sales', 'harvest', 'stock', 'labor', 'cycles', 'purchases'));

create or replace function report_allowed(p_org uuid, p_type text) returns boolean
language sql stable security definer set search_path = public as $$
  select case p_type
    when 'expenses' then has_perm(p_org, 'expenses', 'view')
    when 'purchases' then has_perm(p_org, 'expenses', 'view')
    when 'sales'    then has_perm(p_org, 'sales', 'view')
    when 'harvest'  then has_perm(p_org, 'harvest', 'view')
    when 'stock'    then has_perm(p_org, 'inventory', 'view')
    when 'cycles'   then has_perm(p_org, 'summary', 'view')
    when 'labor'    then has_org_role(p_org, array['owner', 'manager']::member_role[])
    else false end;
$$;

alter function run_report(uuid, text, jsonb) rename to run_report_base;
revoke execute on function run_report_base(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function run_report_base(uuid, text, jsonb) to service_role;

create or replace function run_report(p_org uuid, p_type text, p_params jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  f date := coalesce(nullif(p_params ->> 'from', '')::date, current_date - 30);
  t date := coalesce(nullif(p_params ->> 'to', '')::date, current_date);
  grp text := coalesce(nullif(p_params ->> 'group', ''), 'partner');
  cols jsonb; rows jsonb; title text;
begin
  if p_type <> 'purchases' then
    return run_report_base(p_org, p_type, p_params);
  end if;
  if not report_allowed(p_org, p_type) then
    raise exception 'FORBIDDEN: Bạn không có quyền xem loại báo cáo này.';
  end if;
  if t < f then raise exception 'INVALID_DATE: Ngày kết thúc không thể trước ngày bắt đầu.'; end if;
  if t - f > 800 then raise exception 'INVALID_DATE: Khoảng thời gian tối đa khoảng 2 năm.'; end if;

  title := 'Mua hàng theo nhà cung ứng';
  if grp = 'material' then
    -- theo vật tư: số lượng và tiền các dòng nhập kho thuộc hóa đơn chưa hủy
    cols := '[{"key":"label","label":"Vật tư","kind":"text"},{"key":"qty","label":"Số lượng nhập","kind":"num","sum":true},{"key":"amount","label":"Thành tiền","kind":"money","sum":true}]';
    select coalesce(jsonb_agg(jsonb_build_object('label', g, 'qty', q, 'amount', a) order by g), '[]') into rows from (
      select coalesce(m.name, '—') as g, sum(x.quantity_delta) as q, sum(round(x.quantity_delta * coalesce(x.unit_cost, 0))) as a
        from inventory_transactions x
        join purchase_bills b on b.id = x.bill_id and b.voided_at is null
        join materials m on m.id = x.material_id
       where x.organization_id = p_org and x.bill_id is not null and b.bill_date between f and t
       group by 1) y;
  else
    -- theo nhà cung ứng (mặc định) hoặc theo tháng: số hóa đơn, tổng tiền, đã trả, còn nợ
    cols := '[{"key":"label","label":"' || case grp when 'month' then 'Tháng' else 'Nhà cung ứng' end || '","kind":"text"},{"key":"count","label":"Số hóa đơn","kind":"int","sum":true},{"key":"total","label":"Tổng tiền","kind":"money","sum":true},{"key":"paid","label":"Đã trả","kind":"money","sum":true},{"key":"owed","label":"Còn nợ","kind":"money","sum":true}]';
    select coalesce(jsonb_agg(jsonb_build_object('label', g, 'count', n, 'total', tot, 'paid', paid, 'owed', tot - paid) order by g), '[]') into rows from (
      select case grp when 'month' then to_char(b.bill_date, 'YYYY-MM') else coalesce(pr.name, '—') end as g,
             count(*) as n, sum(b.total_amount) as tot,
             sum(coalesce((select sum(bp.amount) from bill_payments bp where bp.bill_id = b.id and bp.voided_at is null), 0)) as paid
        from purchase_bills b join partners pr on pr.id = b.partner_id
       where b.organization_id = p_org and b.voided_at is null and b.bill_date between f and t
       group by 1) y;
  end if;
  return jsonb_build_object('type', p_type, 'title', title, 'from', f, 'to', t, 'group', grp, 'columns', cols, 'rows', rows, 'generated_at', now());
end $$;

revoke execute on function run_report(uuid, text, jsonb) from public, anon;
grant execute on function run_report(uuid, text, jsonb) to authenticated, service_role;
