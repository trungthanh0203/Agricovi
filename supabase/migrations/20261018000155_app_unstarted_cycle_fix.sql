-- D155: vụ CHƯA BẮT ĐẦU (trạng thái Chuẩn bị) làm sai nhà màng: (1) đổi sang nhà màng khác, giữ nguyên nhật ký chuẩn bị đã ghi;
-- (2) xóa vụ làm sai: hủy các nhật ký chuẩn bị (kèm lý do, kho tự hoàn lại như khi hủy nhật ký), rồi xóa hẳn vụ nếu hết dữ liệu,
-- còn dấu vết bắt buộc giữ (nhật ký đã hủy, giao dịch hoàn kho) thì chuyển vụ sang "Đã hủy". Vụ đã bắt đầu, có thu hoạch/doanh thu/chi phí thì không dùng được.

create or replace function change_cycle_area(p_cycle uuid, p_area uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c production_cycles; v_old_org uuid; a production_areas;
begin
  select * into c from production_cycles where id = p_cycle;
  if c.id is null or not can_manage_cycle(p_cycle) then raise exception 'FORBIDDEN: Bạn không có quyền sửa vụ này.'; end if;
  if c.status <> 'preparing' then
    raise exception 'CYCLE_STARTED: Chỉ đổi nhà màng khi vụ còn ở trạng thái Chuẩn bị (chưa bắt đầu sản xuất).';
  end if;
  if exists (select 1 from harvest_records h where h.cycle_id = p_cycle and h.voided_at is null)
     or exists (select 1 from sales_records s where s.cycle_id = p_cycle and s.voided_at is null) then
    raise exception 'HAS_OUTPUT: Vụ đã có thu hoạch hoặc doanh thu nên không đổi nhà màng được.';
  end if;
  select * into a from production_areas where id = p_area;
  if a.id is null or not a.is_active then raise exception 'INVALID_AREA: Nhà màng không tồn tại hoặc đã dừng.'; end if;
  v_old_org := cycle_area_org(p_cycle);
  if a.organization_id is distinct from v_old_org then raise exception 'INVALID_AREA: Hãy chọn nhà màng trong cùng cơ sở/hộ với nhà màng hiện tại.'; end if;
  if not can_create_cycle(c.owner_org_id, p_area) then raise exception 'FORBIDDEN: Bạn không có quyền ở nhà màng này.'; end if;
  if p_area = c.area_id then return; end if;
  update production_cycles set area_id = p_area where id = p_cycle;   -- trigger kiểm: không chọn khu cơ sở vật chất, không chọn phân khu đã chia ô
end $$;

create or replace function discard_unstarted_cycle(p_cycle uuid, p_reason text) returns text
language plpgsql security definer set search_path = public as $$
declare c production_cycles;
begin
  select * into c from production_cycles where id = p_cycle;
  if c.id is null or not can_manage_cycle(p_cycle) then raise exception 'FORBIDDEN: Bạn không có quyền xóa vụ này.'; end if;
  if c.status <> 'preparing' then
    raise exception 'CYCLE_STARTED: Vụ đã bắt đầu sản xuất nên không xóa kiểu này được. Hãy chọn "Kết thúc vụ" để giữ lịch sử.';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'REASON_REQUIRED: Hãy ghi lý do xóa (ít nhất 3 ký tự).'; end if;
  if exists (select 1 from harvest_records h where h.cycle_id = p_cycle and h.voided_at is null)
     or exists (select 1 from sales_records s where s.cycle_id = p_cycle and s.voided_at is null)
     or exists (select 1 from expense_records e where e.cycle_id = p_cycle and e.voided_at is null) then
    raise exception 'HAS_FINANCE: Vụ đã có thu hoạch, doanh thu hoặc chi phí. Hãy hủy các khoản đó (kèm lý do) trước, hoặc chọn "Kết thúc vụ".';
  end if;
  -- hủy nhật ký chuẩn bị: kho tự hoàn lại (trigger activity_logs_reverse_issues)
  update activity_logs set voided_at = now(), void_reason = 'Xóa vụ làm sai: ' || trim(p_reason)
   where cycle_id = p_cycle and voided_at is null;
  begin
    delete from production_cycles where id = p_cycle;
    return 'deleted';
  exception when foreign_key_violation then
    update production_cycles set status = 'cancelled' where id = p_cycle;   -- còn dấu vết bắt buộc giữ
    return 'cancelled';
  end;
end $$;

revoke execute on function change_cycle_area(uuid, uuid), discard_unstarted_cycle(uuid, text) from public, anon;
grant execute on function change_cycle_area(uuid, uuid), discard_unstarted_cycle(uuid, text) to authenticated;
