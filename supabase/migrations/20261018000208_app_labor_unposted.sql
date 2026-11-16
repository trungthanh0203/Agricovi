-- D171: công đã xác nhận NHƯNG CHƯA vào bảng lương cũng được tính TẠM vào chi phí nhân công của vụ (giờ đã duyệt × đơn giá giờ tại ngày công).
-- Trước đây công chỉ vào giá thành khi đã lập bảng lương, nên vụ đang chạy thiếu tiền công. Số tạm này nằm trong "labor_estimated" (có cờ ước tính);
-- khi công vào bảng lương thì dòng lương thay thế (mỗi ca công chỉ tính một lần vì loại trừ ca đã có dòng lương), không cộng trùng.
-- Máy chủ báo thêm: labor_unposted (số tạm), labor_unposted_missing_rate (số ca chưa có đơn giá giờ nên chưa tính), labor_manual (tiền công ghi tay
-- loại "Nhân công", để giao diện cảnh báo khi vừa có công ghi tay vừa có công chấm công, tránh tính trùng). Không tự đổi số ghi tay.

create index if not exists attendance_cycle_idx on attendance_records (cycle_id) where cycle_id is not null;

do $$
declare d text; a1 text; a2 text; a3 text;
begin
  d := pg_get_functiondef('get_cycle_summary(uuid)'::regprocedure);
  a1 := 'v_total bigint; v_cps numeric;';
  a2 := 'v_total := v_cash_nonmat + v_mat_cost + v_mat_manual + v_alloc + v_labor + v_labor_est;';
  a3 := '''labor_estimated'', v_labor_est,';
  if position(a1 in d) = 0 or position(a2 in d) = 0 or position(a3 in d) = 0 then raise exception 'get_cycle_summary: không tìm thấy đoạn cần thay'; end if;
  d := replace(d, a1, a1 || ' v_labor_pre bigint := 0; v_pre_miss integer := 0; v_cash_labor bigint := 0;');
  d := replace(d, a2,
       'select coalesce(round(sum(a.approved_minutes / 60.0 * r.amount)), 0)::bigint, (count(*) filter (where r.amount is null))::integer' || chr(10)
    || '    into v_labor_pre, v_pre_miss' || chr(10)
    || '    from attendance_records a' || chr(10)
    || '    left join lateral (select x.amount from resolve_rate(a.organization_id, a.worker_id, ''hour'', null, null, a.work_date) x) r on true' || chr(10)
    || '   where a.cycle_id = p_cycle and a.status = ''confirmed'' and coalesce(a.approved_minutes, 0) > 0' || chr(10)
    || '     and not exists (select 1 from pay_statement_lines l where l.attendance_id = a.id);' || chr(10)
    || '  select coalesce(sum(amount), 0)::bigint into v_cash_labor from expense_records' || chr(10)
    || '   where cycle_id = p_cycle and voided_at is null and category = ''labor'' and kind = ''cash_paid'';' || chr(10)
    || '  v_labor_est := v_labor_est + v_labor_pre;' || chr(10)
    || '  ' || a2);
  d := replace(d, a3, a3 || chr(10) || '    ''labor_unposted'', v_labor_pre, ''labor_unposted_missing_rate'', v_pre_miss, ''labor_manual'', v_cash_labor,');
  execute d;

  d := pg_get_functiondef('get_cycles_stats(uuid)'::regprocedure);
  a1 := '''cost_per_kg'', v_cps,';
  if position(a1 in d) = 0 then raise exception 'get_cycles_stats: không tìm thấy đoạn cần thay'; end if;
  d := replace(d, a1, a1 || chr(10) || '      ''labor_unposted'', case when sm is not null then (sm->>''labor_unposted'')::bigint end,'
                         || ' ''labor_unposted_missing_rate'', case when sm is not null then (sm->>''labor_unposted_missing_rate'')::integer end,'
                         || ' ''labor_manual'', case when sm is not null then (sm->>''labor_manual'')::bigint end,');
  execute d;
end $$;
