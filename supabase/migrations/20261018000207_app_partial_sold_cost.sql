-- D170: vật nuôi mới xuất một phần thì CHƯA tính giá thành/kg và lãi/kg (chi phí cả lứa chia cho số kg mới bán sẽ cao giả tạo).
-- Máy chủ báo thêm: partial_out (đang xuất dở), heads_out (số con đã xuất), heads_left (số con còn lại). Vụ đã kết thúc luôn tính như cũ.
-- Số con còn lại = số con nhập + nhập thêm/sinh - chết - loại - xuất (biến động số lượng) - số con ghi ở phiếu thu hoạch.
-- Vụ không ghi số con ở phiếu thu hoạch (cây trồng) không bị ảnh hưởng: heads_out = 0 nên partial_out = false.

do $$
declare d text; a1 text; a2 text; a3 text; n text;
begin
  d := pg_get_functiondef('get_cycle_summary(uuid)'::regprocedure);
  a1 := 'v_total bigint; v_cps numeric;';
  a2 := 'v_cps := case when v_net > 0 and v_miss = 0 then round(v_total::numeric / v_net) end;';
  a3 := '''cost_per_kg'', v_cps,';
  if position(a1 in d) = 0 or position(a2 in d) = 0 or position(a3 in d) = 0 then raise exception 'get_cycle_summary: không tìm thấy đoạn cần thay'; end if;
  d := replace(d, a1, a1 || ' v_heads_out integer; v_heads_left integer; v_partial boolean := false;');
  d := replace(d, a2,
       'select coalesce(sum(unit_count), 0)::integer into v_heads_out from harvest_records where cycle_id = p_cycle and voided_at is null;' || chr(10)
    || '  select pc.plant_count + coalesce((select sum(case when e.kind in (''in'', ''born'', ''open'') then e.quantity when e.kind in (''dead'', ''culled'', ''out'') then -e.quantity else 0 end)' || chr(10)
    || '                                      from cycle_count_events e where e.cycle_id = p_cycle and e.voided_at is null), 0) - v_heads_out' || chr(10)
    || '    into v_heads_left from production_cycles pc where pc.id = p_cycle;' || chr(10)
    || '  v_partial := v_status <> ''ended'' and v_heads_out > 0 and coalesce(v_heads_left, 0) > 0;' || chr(10)
    || '  v_cps := case when v_net > 0 and v_miss = 0 and not v_partial then round(v_total::numeric / v_net) end;');
  d := replace(d, a3, a3 || chr(10) || '    ''partial_out'', v_partial, ''heads_out'', v_heads_out, ''heads_left'', v_heads_left,');
  execute d;

  d := pg_get_functiondef('get_cycles_stats(uuid)'::regprocedure);
  a1 := '''cost_per_kg'', v_cps,';
  a2 := '''profit_per_kg'', case when v_net > 0 and v_profit is not null then round(v_profit / v_net) end,';
  if position(a1 in d) = 0 or position(a2 in d) = 0 then raise exception 'get_cycles_stats: không tìm thấy đoạn cần thay'; end if;
  d := replace(d, a1, a1 || chr(10) || '      ''partial_out'', case when sm is not null then (sm->>''partial_out'')::boolean end,'
                         || ' ''heads_out'', case when sm is not null then (sm->>''heads_out'')::integer end,'
                         || ' ''heads_left'', case when sm is not null then (sm->>''heads_left'')::integer end,');
  n := '''profit_per_kg'', case when v_net > 0 and v_profit is not null and not coalesce((sm->>''partial_out'')::boolean, false) then round(v_profit / v_net) end,';
  d := replace(d, a2, n);
  execute d;
end $$;
