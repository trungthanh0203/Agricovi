-- D174: tiền công ghi tay (chi phí nhóm "Nhân công", tiền thực chi) hiện ở dòng "Tiền công" của số liệu vụ thay vì dồn vào "Chi khác".
-- Tổng chi phí không đổi (các khoản này vốn đã nằm trong tổng); chỉ đổi cách chia nhóm: cost_labor += labor_manual, cost_other bớt đi tương ứng.

do $$
declare d text; a text; fn text;
begin
  a := 'v_lab := coalesce((sm->>''labor_cost'')::numeric, 0) + coalesce((sm->>''labor_estimated'')::numeric, 0);';
  foreach fn in array array['get_cycles_stats(uuid)', 'get_cycles_stats_for(uuid, uuid[])'] loop
    d := pg_get_functiondef(fn::regprocedure);
    if position(a in d) = 0 then raise exception '%: không tìm thấy đoạn cần thay', fn; end if;
    d := replace(d, a, 'v_lab := coalesce((sm->>''labor_cost'')::numeric, 0) + coalesce((sm->>''labor_estimated'')::numeric, 0) + coalesce((sm->>''labor_manual'')::numeric, 0);');
    execute d;
  end loop;
end $$;
