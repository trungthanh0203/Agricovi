-- Nhiều vụ song song trong một ô, GĐ2 (docs/PLAN_NHIEU_VU_TRONG_MOT_O.md):
--  (1) CHIA CHI PHÍ CHUNG của ô (điện, nước, công chung...) cho các vụ theo diện tích × số ngày chạy trong kỳ, thành các khoản chi phí loại "phân bổ" (có ghi giả định);
--  (2) BÁO CÁO THEO Ô: mỗi ô một dòng (số vụ, diện tích đã dùng, chi phí, doanh thu, lãi/lỗ, sản lượng, lãi trên 1.000 m²).
-- Việc ghi nhật ký chung cho nhiều vụ không cần máy chủ: app tạo một nhật ký cho mỗi vụ (vẫn ghi được khi mất mạng, theo D24).

-- Phần chia (nội bộ): trọng số = diện tích vụ × số ngày vụ chạy trong kỳ; dùng phương pháp số dư lớn nhất nên tổng các phần đúng bằng số tiền.
-- Chỉ tính vụ của chính cơ sở, trạng thái Đang sản xuất / Tạm dừng / Đã kết thúc; vụ chưa khai diện tích không có phần (được báo riêng).
create or replace function area_cost_shares(p_org uuid, p_area uuid, p_from date, p_to date, p_amount bigint)
returns table (cycle_id uuid, cycle_name text, area_m2 numeric, days integer, amount bigint)
language sql stable security definer set search_path = public as $$
  with cy as (
    select c.id, coalesce(nullif(c.name, ''), c.code, 'Vụ') nm, c.planted_area_m2 am,
           greatest(0, least(coalesce(c.end_date, c.expected_end_date, p_to), p_to) - greatest(coalesce(c.start_date, p_from), p_from) + 1) d
      from production_cycles c
     where c.area_id = p_area and c.owner_org_id = p_org and c.status in ('active', 'paused', 'ended')
  ), w as (
    select id, nm, am, d, am * d wt from cy where d > 0 and am > 0
  ), tot as (select sum(wt) t from w),
  base as (
    select w.id, w.nm, w.am, w.d, floor(p_amount * w.wt / (select t from tot)) fl,
           (p_amount * w.wt / (select t from tot)) - floor(p_amount * w.wt / (select t from tot)) frac
      from w
  ), ranked as (
    select base.*, p_amount - sum(fl) over () rest, row_number() over (order by frac desc, id) rn from base
  )
  select id, nm, am, d, (fl + case when rn <= rest then 1 else 0 end)::bigint from ranked order by nm;
$$;
revoke execute on function area_cost_shares(uuid, uuid, date, date, bigint) from public, anon, authenticated;

create or replace function preview_area_expense(p_org uuid, p_area uuid, p_from date, p_to date, p_amount bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not has_perm(p_org, 'expenses', 'view') then raise exception 'FORBIDDEN: Bạn không có quyền xem chi phí.'; end if;
  if not exists (select 1 from production_areas where id = p_area and organization_id = p_org) then raise exception 'NOT_FOUND: Không tìm thấy ô sản xuất của cơ sở.'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'INVALID_DATE: Khoảng ngày chưa đúng.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT: Hãy nhập số tiền lớn hơn 0.'; end if;
  return jsonb_build_object(
    'shares', coalesce((select jsonb_agg(jsonb_build_object('cycle_id', cycle_id, 'name', cycle_name, 'area_m2', area_m2, 'days', days, 'amount', amount) order by cycle_name)
                          from area_cost_shares(p_org, p_area, p_from, p_to, p_amount)), '[]'::jsonb),
    'skipped', coalesce((select jsonb_agg(jsonb_build_object('cycle_id', c.id, 'name', coalesce(nullif(c.name, ''), c.code, 'Vụ'), 'reason', 'chưa khai diện tích'))
                           from production_cycles c
                          where c.area_id = p_area and c.owner_org_id = p_org and c.status in ('active', 'paused', 'ended') and coalesce(c.planted_area_m2, 0) <= 0
                            and least(coalesce(c.end_date, c.expected_end_date, p_to), p_to) >= greatest(coalesce(c.start_date, p_from), p_from)), '[]'::jsonb));
end $$;
revoke execute on function preview_area_expense(uuid, uuid, date, date, bigint) from public, anon;
grant execute on function preview_area_expense(uuid, uuid, date, date, bigint) to authenticated, service_role;

-- Ghi nhận: mỗi vụ một khoản chi phí loại "phân bổ" (kèm cách chia ở ghi chú). Gọi lặp cùng p_op không tạo trùng.
create or replace function allocate_area_expense(p_org uuid, p_area uuid, p_from date, p_to date, p_amount bigint, p_category expense_category, p_note text, p_op uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a production_areas; s record; n integer := 0; total bigint := 0; eid uuid; txt text;
begin
  if auth.uid() is null or not has_perm(p_org, 'expenses', 'edit') then raise exception 'FORBIDDEN: Bạn không có quyền ghi chi phí.'; end if;
  if p_op is null then raise exception 'INVALID_ARGUMENT: Thiếu mã thao tác.'; end if;
  select * into a from production_areas where id = p_area and organization_id = p_org;
  if a.id is null then raise exception 'NOT_FOUND: Không tìm thấy ô sản xuất của cơ sở.'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to > vn_today() then raise exception 'INVALID_DATE: Khoảng ngày chưa đúng (không được ở tương lai).'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT: Hãy nhập số tiền lớn hơn 0.'; end if;
  if exists (select 1 from expense_records e where e.id in (select md5(p_op::text || ':' || c.id::text)::uuid from production_cycles c where c.area_id = p_area)) then
    return jsonb_build_object('created', 0, 'already', true);                                  -- đã ghi rồi
  end if;
  for s in select * from area_cost_shares(p_org, p_area, p_from, p_to, p_amount) loop
    eid := md5(p_op::text || ':' || s.cycle_id::text)::uuid;
    txt := left('Phân bổ chi phí chung của ô "' || a.name || '" từ ' || to_char(p_from, 'DD/MM/YYYY') || ' đến ' || to_char(p_to, 'DD/MM/YYYY')
           || ' theo diện tích × số ngày (' || round(s.area_m2) || ' m² × ' || s.days || ' ngày). Tổng ' || p_amount || ' đ.'
           || case when nullif(trim(coalesce(p_note, '')), '') is not null then ' ' || trim(p_note) else '' end, 500);
    insert into expense_records (id, organization_id, cycle_id, category, kind, amount, expense_date, note, source, created_by)
      values (eid, p_org, s.cycle_id, p_category, 'allocated', s.amount, p_to, txt, 'online', auth.uid());
    n := n + 1; total := total + s.amount;
  end loop;
  if n = 0 then raise exception 'NO_CYCLES: Trong kỳ này ô không có vụ nào đã khai diện tích để chia chi phí.'; end if;
  return jsonb_build_object('created', n, 'total', total, 'already', false);
end $$;
revoke execute on function allocate_area_expense(uuid, uuid, date, date, bigint, expense_category, text, uuid) from public, anon;
grant execute on function allocate_area_expense(uuid, uuid, date, date, bigint, expense_category, text, uuid) to authenticated, service_role;

-- Báo cáo theo ô: các vụ có thời gian chạy giao với kỳ; số liệu là tổng kết hiện tại của từng vụ (không cắt theo ngày).
alter table saved_reports drop constraint saved_reports_report_type_check;
alter table saved_reports add constraint saved_reports_report_type_check
  check (report_type in ('expenses', 'sales', 'harvest', 'stock', 'labor', 'cycles', 'purchases', 'customers', 'procurement', 'areas'));

create or replace function report_by_area(p_org uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare f date := coalesce(p_from, vn_today() - 365); t date := coalesce(p_to, vn_today()); st jsonb; rows jsonb;
begin
  if auth.uid() is null or not has_perm(p_org, 'summary', 'view') then raise exception 'FORBIDDEN: Bạn không có quyền xem tổng kết.'; end if;
  st := get_cycles_stats(p_org) -> 'cycles';
  select coalesce(jsonb_agg(r order by r ->> 'label'), '[]'::jsonb) into rows from (
    select jsonb_build_object(
      'label', case when pa.parent_id is not null then (select pp.name from production_areas pp where pp.id = pa.parent_id) || ' › ' || pa.name else pa.name end,
      'cycles', count(*),
      'area_used_m2', round(coalesce(sum(case when not c.intercrop then c.planted_area_m2 end), 0)),
      'capacity_m2', round(area_capacity_m2(pa.id)),
      'cost', round(coalesce(sum((x ->> 'cost_total')::numeric), 0)),
      'revenue', round(coalesce(sum((x ->> 'revenue')::numeric), 0)),
      'profit', round(coalesce(sum((x ->> 'profit')::numeric), 0)),
      'harvest_kg', round(coalesce(sum((x ->> 'harvest_net')::numeric), 0)),
      'profit_per_1000m2', case when coalesce(sum(c.planted_area_m2), 0) > 0 then round(coalesce(sum((x ->> 'profit')::numeric), 0) / sum(c.planted_area_m2) * 1000) end
    ) r
      from jsonb_array_elements(st) x
      join production_cycles c on c.id = (x ->> 'cycle_id')::uuid and c.status <> 'cancelled'
      join production_areas pa on pa.id = c.area_id
     where coalesce(c.start_date, f) <= t and coalesce(c.end_date, c.expected_end_date, t) >= f
     group by pa.id, pa.parent_id, pa.name
  ) q;
  return jsonb_build_object('type', 'areas', 'title', 'Tổng hợp theo ô sản xuất', 'from', f, 'to', t, 'group', '', 'generated_at', now(),
    'columns', jsonb_build_array(
      jsonb_build_object('key', 'label', 'label', 'Ô sản xuất', 'kind', 'text'),
      jsonb_build_object('key', 'cycles', 'label', 'Số vụ', 'kind', 'int', 'sum', true),
      jsonb_build_object('key', 'area_used_m2', 'label', 'Diện tích đã dùng (m²)', 'kind', 'int'),
      jsonb_build_object('key', 'capacity_m2', 'label', 'Diện tích ô (m²)', 'kind', 'int'),
      jsonb_build_object('key', 'harvest_kg', 'label', 'Sản lượng (kg)', 'kind', 'num', 'sum', true),
      jsonb_build_object('key', 'cost', 'label', 'Chi phí', 'kind', 'money', 'sum', true),
      jsonb_build_object('key', 'revenue', 'label', 'Doanh thu', 'kind', 'money', 'sum', true),
      jsonb_build_object('key', 'profit', 'label', 'Lãi / lỗ', 'kind', 'money', 'sum', true),
      jsonb_build_object('key', 'profit_per_1000m2', 'label', 'Lãi / 1.000 m²', 'kind', 'money')),
    'rows', rows);
end $$;
revoke execute on function report_by_area(uuid, date, date) from public, anon;
grant execute on function report_by_area(uuid, date, date) to authenticated, service_role;
