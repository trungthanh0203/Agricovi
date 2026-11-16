-- D175: chia chi phí chung cho các vụ ở MỌI CẤP: một ô, một phân khu (gồm các ô con) hoặc cả cơ sở (p_area = null).
-- Trước đây chỉ chia được cho vụ nằm đúng một ô; chi phí của phân khu hay cả cơ sở (thuê đất, khấu hao chuồng, quản lý...) không về vụ nào.
-- Trọng số = diện tích × số ngày vụ chạy trong kỳ. Diện tích lấy từ vụ (planted_area_m2); chưa khai thì lấy diện tích của ô sản xuất (m² hoặc ha); cả hai chưa có thì vụ
-- chưa được chia (báo riêng). Phương pháp số dư lớn nhất nên tổng các phần đúng bằng số tiền. Hàm cũ theo ô vẫn giữ.

create or replace function cost_scope_shares(p_org uuid, p_area uuid, p_from date, p_to date, p_amount bigint)
returns table (cycle_id uuid, cycle_name text, area_m2 numeric, days integer, amount bigint)
language sql stable security definer set search_path = public as $$
  with cy as (
    select c.id, coalesce(nullif(c.name, ''), c.code, 'Vụ') nm,
           coalesce(nullif(c.planted_area_m2, 0), case when a.area_size > 0 then a.area_size * (case a.area_unit when 'ha' then 10000 else 1 end) end) am,
           greatest(0, least(coalesce(c.end_date, c.expected_end_date, p_to), p_to) - greatest(coalesce(c.start_date, p_from), p_from) + 1) d
      from production_cycles c join production_areas a on a.id = c.area_id
     where c.owner_org_id = p_org and c.status in ('active', 'paused', 'ended')
       and (p_area is null or c.area_id = p_area or a.parent_id = p_area)
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
revoke execute on function cost_scope_shares(uuid, uuid, date, date, bigint) from public, anon, authenticated;

create or replace function preview_shared_expense(p_org uuid, p_area uuid, p_from date, p_to date, p_amount bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not has_perm(p_org, 'expenses', 'view') then raise exception 'FORBIDDEN: Bạn không có quyền xem chi phí.'; end if;
  if p_area is not null and not exists (select 1 from production_areas where id = p_area and organization_id = p_org) then raise exception 'NOT_FOUND: Không tìm thấy khu của cơ sở.'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'INVALID_DATE: Khoảng ngày chưa đúng.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT: Hãy nhập số tiền lớn hơn 0.'; end if;
  return jsonb_build_object(
    'shares', coalesce((select jsonb_agg(jsonb_build_object('cycle_id', cycle_id, 'name', cycle_name, 'area_m2', area_m2, 'days', days, 'amount', amount) order by cycle_name)
                          from cost_scope_shares(p_org, p_area, p_from, p_to, p_amount)), '[]'::jsonb),
    'skipped', coalesce((select jsonb_agg(jsonb_build_object('cycle_id', c.id, 'name', coalesce(nullif(c.name, ''), c.code, 'Vụ'), 'reason', 'chưa khai diện tích'))
                           from production_cycles c join production_areas a on a.id = c.area_id
                          where c.owner_org_id = p_org and c.status in ('active', 'paused', 'ended')
                            and (p_area is null or c.area_id = p_area or a.parent_id = p_area)
                            and coalesce(nullif(c.planted_area_m2, 0), nullif(a.area_size, 0)) is null
                            and least(coalesce(c.end_date, c.expected_end_date, p_to), p_to) >= greatest(coalesce(c.start_date, p_from), p_from)), '[]'::jsonb));
end $$;
revoke execute on function preview_shared_expense(uuid, uuid, date, date, bigint) from public, anon;
grant execute on function preview_shared_expense(uuid, uuid, date, date, bigint) to authenticated, service_role;

create or replace function allocate_shared_expense(p_org uuid, p_area uuid, p_from date, p_to date, p_amount bigint, p_category expense_category, p_note text, p_op uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a production_areas; s record; n integer := 0; total bigint := 0; eid uuid; txt text; scope_txt text;
begin
  if auth.uid() is null or not has_perm(p_org, 'expenses', 'edit') then raise exception 'FORBIDDEN: Bạn không có quyền ghi chi phí.'; end if;
  if p_op is null then raise exception 'INVALID_ARGUMENT: Thiếu mã thao tác.'; end if;
  if p_area is not null then
    select * into a from production_areas where id = p_area and organization_id = p_org;
    if a.id is null then raise exception 'NOT_FOUND: Không tìm thấy khu của cơ sở.'; end if;
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to > vn_today() then raise exception 'INVALID_DATE: Khoảng ngày chưa đúng (không được ở tương lai).'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT: Hãy nhập số tiền lớn hơn 0.'; end if;
  if exists (select 1 from expense_records e where e.id in (select md5(p_op::text || ':' || c.id::text)::uuid from production_cycles c where c.owner_org_id = p_org)) then
    return jsonb_build_object('created', 0, 'already', true);                                  -- đã ghi rồi
  end if;
  scope_txt := case when p_area is null then 'của cả cơ sở' else 'của "' || a.name || '"' end;
  for s in select * from cost_scope_shares(p_org, p_area, p_from, p_to, p_amount) loop
    eid := md5(p_op::text || ':' || s.cycle_id::text)::uuid;
    txt := left('Phân bổ chi phí chung ' || scope_txt || ' từ ' || to_char(p_from, 'DD/MM/YYYY') || ' đến ' || to_char(p_to, 'DD/MM/YYYY')
           || ' theo diện tích × số ngày (' || round(s.area_m2) || ' m² × ' || s.days || ' ngày). Tổng ' || p_amount || ' đ.'
           || case when nullif(trim(coalesce(p_note, '')), '') is not null then ' ' || trim(p_note) else '' end, 500);
    insert into expense_records (id, organization_id, cycle_id, category, kind, amount, expense_date, note, source, created_by)
      values (eid, p_org, s.cycle_id, p_category, 'allocated', s.amount, p_to, txt, 'online', auth.uid());
    n := n + 1; total := total + s.amount;
  end loop;
  if n = 0 then raise exception 'NO_CYCLES: Trong kỳ này không có vụ nào đã khai diện tích để chia chi phí.'; end if;
  return jsonb_build_object('created', n, 'total', total, 'already', false);
end $$;
revoke execute on function allocate_shared_expense(uuid, uuid, date, date, bigint, expense_category, text, uuid) from public, anon;
grant execute on function allocate_shared_expense(uuid, uuid, date, date, bigint, expense_category, text, uuid) to authenticated, service_role;
