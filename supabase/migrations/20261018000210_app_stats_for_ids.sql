-- D173: số liệu tóm tắt CHỈ cho các vụ được hỏi (giới hạn từ trước truy vấn, không tính cả cơ sở khi chỉ cần xem một trang).
-- get_cycles_stats_for(p_org, p_cycle_ids) trả cùng định dạng và cùng cách tính với get_cycles_stats nhưng chỉ cho các vụ trong danh sách
-- (chỉ vụ do cơ sở sở hữu và người gọi đọc được). Danh sách rỗng/null = không có vụ nào; tối đa 200 vụ mỗi lần để một yêu cầu không nặng quá.
-- get_cycles_stats(p_org) cũ giữ nguyên cho các báo cáo tổng hợp toàn cơ sở và bản app cũ.

do $$
declare d text; a1 text; a2 text;
begin
  d := pg_get_functiondef('get_cycles_stats(uuid)'::regprocedure);
  a1 := 'get_cycles_stats(p_org uuid)';
  a2 := 'pc.owner_org_id = p_org and can_read_cycle(pc.id)';
  if position(a1 in d) = 0 or position(a2 in d) = 0 then raise exception 'get_cycles_stats: không tìm thấy đoạn cần thay'; end if;
  d := replace(d, a1, 'get_cycles_stats_for(p_org uuid, p_cycle_ids uuid[])');
  d := replace(d, a2, 'pc.owner_org_id = p_org and pc.id = any (coalesce(p_cycle_ids, ''{}''::uuid[])) and can_read_cycle(pc.id)');
  -- kiểm số vụ ngay đầu hàm (sau câu kiểm thành viên cơ sở có sẵn, nên chèn trước vòng lặp)
  a1 := 'for c in select * from production_cycles pc';
  if position(a1 in d) = 0 then raise exception 'get_cycles_stats: không tìm thấy vòng lặp'; end if;
  d := replace(d, a1, 'if cardinality(coalesce(p_cycle_ids, ''{}''::uuid[])) > 200 then raise exception ''TOO_MANY: Chỉ xem số liệu tối đa 200 vụ mỗi lần.''; end if;' || chr(10) || '  ' || a1);
  execute d;
end $$;

revoke execute on function get_cycles_stats_for(uuid, uuid[]) from public, anon;
grant execute on function get_cycles_stats_for(uuid, uuid[]) to authenticated, service_role;
