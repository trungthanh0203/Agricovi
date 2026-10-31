-- Đo thời gian các báo cáo/tổng hợp ở máy chủ trên cơ sở thử tải ZZ_THU_TAI (Đợt 4, docs/PLAN_HIEU_NANG.md).
-- KHÔNG ghi gì vào dữ liệu: chỉ gọi các hàm báo cáo (đọc) như đang đăng nhập bằng tài khoản chủ cơ sở thử.
-- Cách dùng: Supabase → SQL Editor → dán TOÀN BỘ file, sửa email ở dòng v_owner_email, bấm Run.
-- Kết quả là bảng ở cuối (đã sắp từ chậm đến nhanh): chụp màn hình hoặc chép gửi lại. Mỗi hàm gọi 2 lần: lần 1 (nguội) và lần 2 (ấm).
-- Chạy ở dự án THỬ có dữ liệu giả (xem docs/HUONG_DAN_DO_HIEU_NANG.md).

create temp table if not exists perf_out (name text, run int, ms numeric, kb numeric, err text);
truncate perf_out;
grant all on perf_out to authenticated;

do $$
declare
  v_owner_email constant text := 'email-cua-ban@...';   -- <<< SỬA: email tài khoản chủ cơ sở thử tải
  v_uid uuid;
  v_org uuid;
  v_cycle uuid;
  v_name text; v_expr text; v_run int;
  v_t timestamptz; v_j jsonb;
  v_calls text[][];
  v_err text;
begin
  select id into v_uid from auth.users where lower(email) = lower(v_owner_email);
  if v_uid is null then raise exception 'Không thấy tài khoản %', v_owner_email; end if;
  select o.id into v_org from organizations o join organization_memberships m on m.organization_id = o.id and m.user_id = v_uid
   where o.name = 'ZZ_THU_TAI' limit 1;
  if v_org is null then raise exception 'Chưa có cơ sở ZZ_THU_TAI của tài khoản này (chạy script nạp dữ liệu giả trước)'; end if;
  select id into v_cycle from production_cycles where owner_org_id = v_org and status = 'active' order by created_at limit 1;

  v_calls := array[
    ['Báo cáo tuần',            format('get_weekly_report(%L, date_trunc(''week'', current_date)::date)', v_org)],
    ['Số liệu theo kỳ 12 tháng', format('get_period_series(%L, 12)', v_org)],
    ['Số liệu các vụ (Trang chủ)', format('get_cycles_stats(%L)', v_org)],
    ['Tổng kết một vụ',         format('get_cycle_summary(%L)', v_cycle)],
    ['Báo cáo tùy chỉnh: chi phí 1 năm',  format('run_report(%L, ''expenses'', ''{"from":"%s","to":"%s"}'')', v_org, current_date - 364, current_date)],
    ['Báo cáo tùy chỉnh: doanh thu 1 năm', format('run_report(%L, ''sales'', ''{"from":"%s","to":"%s"}'')', v_org, current_date - 364, current_date)],
    ['Báo cáo tùy chỉnh: thu hoạch 1 năm', format('run_report(%L, ''harvest'', ''{"from":"%s","to":"%s"}'')', v_org, current_date - 364, current_date)],
    ['Báo cáo tùy chỉnh: kho 1 năm',       format('run_report(%L, ''stock'', ''{"from":"%s","to":"%s"}'')', v_org, current_date - 364, current_date)],
    ['Báo cáo tùy chỉnh: nhân công 1 năm', format('run_report(%L, ''labor'', ''{"from":"%s","to":"%s"}'')', v_org, current_date - 364, current_date)],
    ['Công nợ phải trả',        format('get_payables(%L, false)', v_org)],
    ['Công nợ phải thu',        format('get_receivables(%L, false)', v_org)],
    ['Báo cáo kho theo kỳ (3 tháng)', format('get_stock_period_report(%L, %L, %L, null)', v_org, current_date - 90, current_date)],
    ['Bảng lương tháng này (300 người)', format('get_pay_overview(%L, date_trunc(''month'', current_date)::date, current_date, null)', v_org)],
    ['Biểu đồ lương 12 tháng',  format('get_pay_series(%L, null, 12)', v_org)],
    ['Chấm công hôm nay',       format('attendance_summary(%L, current_date)', v_org)]
  ];

  -- đăng nhập giả bằng tài khoản chủ để quyền/RLS chạy đúng như app
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_uid::text, true);
  execute 'set local role authenticated';

  for i in 1 .. array_length(v_calls, 1) loop
    v_name := v_calls[i][1]; v_expr := v_calls[i][2];
    for v_run in 1 .. 2 loop
      v_err := null; v_j := null;
      v_t := clock_timestamp();
      begin
        execute 'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from ' || v_expr || ' t' into v_j;
      exception when others then v_err := left(sqlerrm, 120);
      end;
      insert into perf_out values (v_name, v_run,
        round((extract(epoch from clock_timestamp() - v_t) * 1000)::numeric, 1),
        round((coalesce(length(v_j::text), 0) / 1024.0)::numeric, 1), v_err);
    end loop;
  end loop;
  execute 'reset role';
end $$;

select name as "Báo cáo", run as "Lần", ms as "ms", kb as "KB trả về", err as "Lỗi" from perf_out order by ms desc;
