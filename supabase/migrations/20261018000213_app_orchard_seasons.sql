-- D176: VƯỜN CÂY THEO MÙA VỤ ("mỗi mùa một vụ").
-- Vườn cây (vụ kiểu perennial) giữ hồ sơ cây và CHI PHÍ ĐẦU TƯ (is_capital: cây giống, làm đất, giàn...). Mỗi mùa thu hoạch mở một VỤ MÙA thường (batch) liên kết với vườn
-- (production_cycles.orchard_cycle_id). Mọi chi, thu của mùa ghi vào vụ mùa đó; khoản đầu tư KHÔNG vào chi phí chăm sóc mà được chia KHẤU HAO vào các vụ mùa
-- (tổng đầu tư / (số năm khấu hao × 365) × số ngày của vụ mùa sau khi vườn bước vào kinh doanh). Để trống số năm khấu hao = không khấu hao.
-- Vườn cũ chưa mở vụ mùa nào (ghi thẳng vào vườn) tính khấu hao cả đời vườn đến nay trong tổng kết của chính vườn, nên không còn lãi giả hay lỗ giả.
-- Vườn đã có vụ mùa: tổng kết của vườn chỉ ghi tổng đầu tư và đã khấu hao đến nay; lãi/lỗ xem ở từng vụ mùa.

alter table production_cycles add column orchard_cycle_id uuid references production_cycles(id) on delete set null;
create index if not exists production_cycles_orchard_idx on production_cycles (orchard_cycle_id) where orchard_cycle_id is not null;

-- Mở vụ mùa mới của vườn: tạo vụ theo mẫu (dùng chung diện tích với vườn vì cùng một vườn cây), rồi gắn liên kết
create or replace function open_orchard_season(p_id uuid, p_orchard uuid, p_name text, p_start date, p_template uuid, p_status cycle_status default 'preparing')
returns uuid language plpgsql security definer set search_path = public as $$
declare o production_cycles;
begin
  if exists (select 1 from production_cycles where id = p_id) then return p_id; end if;      -- gọi lặp không tạo trùng
  select * into o from production_cycles where id = p_orchard;
  if o.id is null or not can_manage_cycle(p_orchard) then raise exception 'FORBIDDEN: Bạn không có quyền mở mùa vụ cho vườn này.'; end if;
  if o.cycle_mode <> 'perennial' then raise exception 'INVALID_MODE: Chỉ vườn cây lâu năm mới mở được vụ mùa.'; end if;
  if o.status in ('ended', 'cancelled') then raise exception 'INVALID_STATUS: Vườn đã kết thúc, không mở thêm mùa vụ.'; end if;
  if p_template is null then raise exception 'INVALID_TEMPLATE: Hãy chọn quy trình mẫu của mùa vụ.'; end if;
  perform create_cycle_checked(p_id, o.owner_org_id, o.area_id, p_template, coalesce(p_start, vn_today()), p_status, p_name,
                               coalesce(nullif(trim(o.variety_name), ''), 'Chưa rõ giống'), coalesce(nullif(o.planted_area_m2, 0), 1), coalesce(o.plant_count, 1),
                               true, false);
  update production_cycles set orchard_cycle_id = p_orchard where id = p_id;
  return p_id;
end $$;
revoke execute on function open_orchard_season(uuid, uuid, text, date, uuid, cycle_status) from public, anon;
grant execute on function open_orchard_season(uuid, uuid, text, date, uuid, cycle_status) to authenticated, service_role;

-- Tổng kết vụ: bỏ chi phí đầu tư khỏi chi phí chăm sóc, cộng khấu hao theo quy tắc trên
do $$
declare d text; a1 text; a2 text; a3 text; a4 text; a5 text; a6 text;
begin
  d := pg_get_functiondef('get_cycle_summary(uuid)'::regprocedure);
  a1 := 'v_total bigint; v_cps numeric;';
  a2 := 'from expense_records where cycle_id = p_cycle and voided_at is null;';
  a3 := 'v_total := v_cash_nonmat + v_mat_cost + v_mat_manual + v_alloc + v_labor + v_labor_est;';
  a4 := '''labor_estimated'', v_labor_est,';
  a5 := '''has_estimated_cost'', v_alloc > 0 or v_labor_est > 0,';
  if position(a1 in d) = 0 or position(a2 in d) = 0 or position(a3 in d) = 0 or position(a4 in d) = 0 or position(a5 in d) = 0 then
    raise exception 'get_cycle_summary: không tìm thấy đoạn cần thay';
  end if;
  d := replace(d, a1, a1 || ' v_dep bigint := 0; v_cap bigint := 0; v_cap_dep bigint := 0; v_seasons integer := 0; v_biz date; v_s date; v_e date; v_me production_cycles; v_orc production_cycles;');
  d := replace(d, a2, 'from expense_records where cycle_id = p_cycle and voided_at is null and not is_capital;');
  d := replace(d, a3,
       'select * into v_me from production_cycles where id = p_cycle;' || chr(10)
    || '  if v_me.orchard_cycle_id is not null then' || chr(10)
    || '    select * into v_orc from production_cycles where id = v_me.orchard_cycle_id;' || chr(10)
    || '  elsif v_me.cycle_mode = ''perennial'' then' || chr(10)
    || '    v_orc := v_me;' || chr(10)
    || '    select count(*)::integer into v_seasons from production_cycles where orchard_cycle_id = p_cycle;' || chr(10)
    || '  end if;' || chr(10)
    || '  if v_orc.id is not null and v_orc.amort_years is not null and v_orc.planting_date is not null then' || chr(10)
    || '    select coalesce(sum(amount), 0)::bigint into v_cap from expense_records where cycle_id = v_orc.id and is_capital and voided_at is null;' || chr(10)
    || '    v_biz := v_orc.planting_date + (coalesce(v_orc.maturity_years, 3) * 365)::integer;' || chr(10)
    || '    v_cap_dep := round(v_cap::numeric / (v_orc.amort_years * 365) * greatest(0, vn_today() - v_biz + 1));' || chr(10)
    || '    if v_me.orchard_cycle_id is not null then' || chr(10)
    || '      v_s := greatest(coalesce(v_me.start_date, v_biz), v_biz); v_e := least(coalesce(v_me.end_date, vn_today()), vn_today());' || chr(10)
    || '      v_dep := round(v_cap::numeric / (v_orc.amort_years * 365) * greatest(0, v_e - v_s + 1));' || chr(10)
    || '    elsif v_seasons = 0 then' || chr(10)
    || '      v_dep := v_cap_dep;' || chr(10)
    || '    end if;' || chr(10)
    || '  end if;' || chr(10)
    || '  v_total := v_cash_nonmat + v_mat_cost + v_mat_manual + v_alloc + v_labor + v_labor_est + v_dep;');
  d := replace(d, a4, a4 || chr(10) || '    ''orchard_depreciation'', v_dep, ''capital_total'', v_cap, ''depreciated_to_date'', v_cap_dep, ''seasons'', v_seasons,');
  d := replace(d, a5, '''has_estimated_cost'', v_alloc > 0 or v_labor_est > 0 or v_dep > 0,');
  execute d;

  -- số liệu vụ: thêm kiểu vụ, vườn của vụ mùa, khấu hao, đầu tư (nối thêm một đối tượng riêng vì jsonb_build_object tối đa 100 tham số)
  a1 := 'res := res || jsonb_build_object(';
  a2 := '(sm->>''missing_revenue'')::boolean end);';
  a6 := 'res := res || (jsonb_build_object(''cycle_mode'', c.cycle_mode, ''orchard_cycle_id'', c.orchard_cycle_id,'
        || ' ''orchard_depreciation'', case when sm is not null then (sm->>''orchard_depreciation'')::bigint end,'
        || ' ''capital_total'', case when sm is not null then (sm->>''capital_total'')::bigint end,'
        || ' ''depreciated_to_date'', case when sm is not null then (sm->>''depreciated_to_date'')::bigint end,'
        || ' ''seasons'', case when sm is not null then (sm->>''seasons'')::integer end) || jsonb_build_object(';   -- gộp hai đối tượng trước khi nối vào mảng
  d := pg_get_functiondef('get_cycles_stats(uuid)'::regprocedure);
  if position(a1 in d) = 0 or position(a2 in d) = 0 then raise exception 'get_cycles_stats: không tìm thấy đoạn cần thay'; end if;
  execute replace(replace(d, a1, a6), a2, '(sm->>''missing_revenue'')::boolean end));');
  d := pg_get_functiondef('get_cycles_stats_for(uuid, uuid[])'::regprocedure);
  if position(a1 in d) = 0 or position(a2 in d) = 0 then raise exception 'get_cycles_stats_for: không tìm thấy đoạn cần thay'; end if;
  execute replace(replace(d, a1, a6), a2, '(sm->>''missing_revenue'')::boolean end));');
end $$;
