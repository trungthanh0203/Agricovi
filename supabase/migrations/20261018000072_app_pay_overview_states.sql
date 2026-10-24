-- D90: thêm vào get_pay_overview số khoản theo trạng thái của từng người (để chấm trạng thái trong danh sách Bảng lương):
-- n_locked (đã chốt), n_calculated (đã tính), n_estimate (ước tính, chưa vào kỳ), n_open (đang trong ca).
do $$
declare d text;
begin
  d := pg_get_functiondef('get_pay_overview(uuid, date, date, uuid)'::regprocedure);
  if position('''no_rate_days'', count(*) filter (where i.status = ''no_rate'')) as r' in d) = 0 then raise exception 'get_pay_overview: không tìm thấy đoạn cần thay'; end if;
  d := replace(d, '''no_rate_days'', count(*) filter (where i.status = ''no_rate'')) as r',
    '''no_rate_days'', count(*) filter (where i.status = ''no_rate''),
      ''n_locked'', count(*) filter (where i.status = ''locked''),
      ''n_calculated'', count(*) filter (where i.status = ''calculated''),
      ''n_estimate'', count(*) filter (where i.status = ''estimate''),
      ''n_open'', count(*) filter (where i.kind = ''open'')) as r');
  execute d;
end $$;
