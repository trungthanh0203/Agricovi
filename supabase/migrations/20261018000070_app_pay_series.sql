-- D88: chuỗi thực nhận và giờ công theo tháng cho biểu đồ Bảng lương và thẻ Trang chủ. Cùng quy tắc quyền và cách tính với get_pay_overview.
-- p_worker = null: người thường thì là chính mình; người có quyền Tiền công (xem) thì cộng cả cơ sở.
create or replace function get_pay_series(p_org uuid, p_worker uuid default null, p_months integer default 6) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ws uuid[]; n integer := least(greatest(coalesce(p_months, 6), 1), 24); d0 date; res jsonb;
begin
  ws := pay_scope(p_org, p_worker);
  d0 := (date_trunc('month', vn_today()::timestamp) - make_interval(months => n - 1))::date;
  select coalesce(jsonb_agg(jsonb_build_object('month', to_char(m.d, 'YYYY-MM'), 'net', coalesce(s.net, 0), 'net_locked', coalesce(s.net_locked, 0), 'hours', coalesce(s.hours, 0)) order by m.d), '[]'::jsonb)
    into res
    from generate_series(d0::timestamp, date_trunc('month', vn_today()::timestamp), interval '1 month') as m(d)
    left join (
      select date_trunc('month', i.item_date::timestamp) as mon,
             sum(i.amount) filter (where i.kind in ('hours', 'salary', 'bonus', 'deduction', 'advance')) as net,
             sum(i.amount) filter (where i.kind in ('hours', 'salary', 'bonus', 'deduction', 'advance') and i.status = 'locked') as net_locked,
             round(sum(i.minutes) filter (where i.kind = 'hours') / 60.0, 2) as hours
        from pay_items(p_org, d0, (date_trunc('month', vn_today()::timestamp) + interval '1 month - 1 day')::date, ws) i
       group by 1) s on s.mon = m.d;
  return jsonb_build_object('generated_at', now(), 'can_see_all', has_perm(p_org, 'payroll', 'view'), 'months', res);
end $$;
revoke execute on function get_pay_series(uuid, uuid, integer) from public, anon;
grant execute on function get_pay_series(uuid, uuid, integer) to authenticated, service_role;
