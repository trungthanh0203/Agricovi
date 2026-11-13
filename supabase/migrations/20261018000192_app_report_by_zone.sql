-- Báo cáo "Tổng hợp theo phân khu và ô": thêm tham số p_group ('area' = theo ô như cũ, 'zone' = gộp theo phân khu cấp 1).
drop function if exists report_by_area(uuid, date, date);

create or replace function report_by_area(p_org uuid, p_from date, p_to date, p_group text default 'area') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare f date := coalesce(p_from, vn_today() - 365); t date := coalesce(p_to, vn_today()); st jsonb; rows jsonb; zone boolean := coalesce(p_group, 'area') = 'zone';
begin
  if auth.uid() is null or not has_perm(p_org, 'summary', 'view') then raise exception 'FORBIDDEN: Bạn không có quyền xem tổng kết.'; end if;
  st := get_cycles_stats(p_org) -> 'cycles';
  select coalesce(jsonb_agg(r order by r ->> 'label'), '[]'::jsonb) into rows from (
    select jsonb_build_object(
      'label', case when zone then g.name
                    when g.parent_id is not null then (select pp.name from production_areas pp where pp.id = g.parent_id) || ' › ' || g.name
                    else g.name end,
      'cycles', sum(g.cycles),
      'area_used_m2', round(coalesce(sum(g.used), 0)),
      'capacity_m2', round(case when zone then area_capacity_m2(g.gid) else max(g.cap) end),
      'cost', round(coalesce(sum(g.cost), 0)),
      'revenue', round(coalesce(sum(g.revenue), 0)),
      'profit', round(coalesce(sum(g.profit), 0)),
      'harvest_kg', round(coalesce(sum(g.harvest), 0)),
      'profit_per_1000m2', case when coalesce(sum(g.planted), 0) > 0 then round(coalesce(sum(g.profit), 0) / sum(g.planted) * 1000) end
    ) r
      from (
        select case when zone then coalesce(pa.parent_id, pa.id) else pa.id end gid,
               case when zone then coalesce(zp.name, pa.name) else pa.name end as name,
               case when zone then null else pa.parent_id end as parent_id,
               count(*) cycles,
               sum(case when not c.intercrop then c.planted_area_m2 end) used,
               area_capacity_m2(pa.id) cap,
               sum((x ->> 'cost_total')::numeric) cost,
               sum((x ->> 'revenue')::numeric) revenue,
               sum((x ->> 'profit')::numeric) profit,
               sum((x ->> 'harvest_net')::numeric) harvest,
               sum(c.planted_area_m2) planted
          from jsonb_array_elements(st) x
          join production_cycles c on c.id = (x ->> 'cycle_id')::uuid and c.status <> 'cancelled'
          join production_areas pa on pa.id = c.area_id
          left join production_areas zp on zp.id = pa.parent_id
         where coalesce(c.start_date, f) <= t and coalesce(c.end_date, c.expected_end_date, t) >= f
         group by case when zone then coalesce(pa.parent_id, pa.id) else pa.id end,
                  case when zone then coalesce(zp.name, pa.name) else pa.name end,
                  case when zone then null else pa.parent_id end, pa.id
      ) g
     group by g.gid, g.name, g.parent_id
  ) q;
  return jsonb_build_object('type', 'areas', 'title', case when zone then 'Tổng hợp theo phân khu' else 'Tổng hợp theo ô sản xuất' end,
    'from', f, 'to', t, 'group', case when zone then 'zone' else 'area' end, 'generated_at', now(),
    'columns', jsonb_build_array(
      jsonb_build_object('key', 'label', 'label', case when zone then 'Phân khu' else 'Ô sản xuất' end, 'kind', 'text'),
      jsonb_build_object('key', 'cycles', 'label', 'Số vụ', 'kind', 'int', 'sum', true),
      jsonb_build_object('key', 'area_used_m2', 'label', 'Diện tích đã dùng (m²)', 'kind', 'int'),
      jsonb_build_object('key', 'capacity_m2', 'label', case when zone then 'Diện tích phân khu (m²)' else 'Diện tích ô (m²)' end, 'kind', 'int'),
      jsonb_build_object('key', 'harvest_kg', 'label', 'Sản lượng (kg)', 'kind', 'num', 'sum', true),
      jsonb_build_object('key', 'cost', 'label', 'Chi phí', 'kind', 'money', 'sum', true),
      jsonb_build_object('key', 'revenue', 'label', 'Doanh thu', 'kind', 'money', 'sum', true),
      jsonb_build_object('key', 'profit', 'label', 'Lãi / lỗ', 'kind', 'money', 'sum', true),
      jsonb_build_object('key', 'profit_per_1000m2', 'label', 'Lãi / 1.000 m²', 'kind', 'money')),
    'rows', rows);
end $$;
revoke execute on function report_by_area(uuid, date, date, text) from public, anon;
grant execute on function report_by_area(uuid, date, date, text) to authenticated, service_role;
