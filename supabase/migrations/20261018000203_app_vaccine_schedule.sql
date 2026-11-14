-- Mục 14 lát 3 (D166): LỊCH VACCINE cho vật nuôi, dựng trên mốc nhắc việc của quy trình/vụ (0086).
-- Mốc có thêm "loại": 'task' (việc nhắc thường) hoặc 'vaccine' (mũi tiêm). Mũi tiêm khi đánh dấu "đã tiêm" ghi được số lô vaccine.
-- Ngày tiêm vẫn tính từ ngày bắt đầu lứa (anchor 'start' + số ngày), nên đổi ngày nhập chuồng thì lịch tự dời.
-- KHÔNG nạp lịch cố định: lịch do thú y của trại chốt. Mẫu tham khảo (nếu có) nằm ở phía giao diện, chủ tự chọn thêm.

alter table cycle_milestones
  add column kind text not null default 'task' check (kind in ('task', 'vaccine')),
  add column lot_no text check (lot_no is null or length(lot_no) <= 60);

-- Thêm một mốc riêng cho vụ (thêm tham số loại; hàm cũ bị thay)
drop function add_cycle_milestone(uuid, text, text, integer, text);
create function add_cycle_milestone(p_cycle uuid, p_title text, p_anchor text, p_offset integer, p_note text, p_kind text default 'task')
returns cycle_milestones language plpgsql security definer set search_path = public as $$
declare r cycle_milestones;
begin
  if not exists (select 1 from production_cycles where id = p_cycle) or not can_manage_cycle(p_cycle) then
    raise exception 'FORBIDDEN: Chỉ người quản lý vụ mới thêm mốc nhắc.';
  end if;
  if length(trim(coalesce(p_title, ''))) < 2 then raise exception 'INVALID_TITLE: Hãy nhập nội dung mốc nhắc.'; end if;
  if p_anchor not in ('start', 'end') or p_offset is null or p_offset < 0 then raise exception 'INVALID_ARGUMENT: Mốc nhắc không hợp lệ.'; end if;
  if coalesce(p_kind, 'task') not in ('task', 'vaccine') then raise exception 'INVALID_ARGUMENT: Loại mốc không hợp lệ.'; end if;
  insert into cycle_milestones (cycle_id, title, anchor, offset_days, note, kind)
    values (p_cycle, trim(p_title), p_anchor, p_offset, nullif(trim(coalesce(p_note, '')), ''), coalesce(p_kind, 'task')) returning * into r;
  return r;
end $$;

-- Đánh dấu đã làm; mũi tiêm ghi thêm số lô (bỏ đánh dấu thì xóa số lô)
drop function set_milestone_done(uuid, boolean);
create function set_milestone_done(p_id uuid, p_done boolean, p_lot text default null)
returns cycle_milestones language plpgsql security definer set search_path = public as $$
declare m cycle_milestones; lot text := nullif(trim(coalesce(p_lot, '')), '');
begin
  select * into m from cycle_milestones where id = p_id;
  if m.id is null or not can_log_cycle(m.cycle_id) then raise exception 'FORBIDDEN: Bạn không có quyền với mốc nhắc này.'; end if;
  if lot is not null and length(lot) > 60 then raise exception 'INVALID_ARGUMENT: Số lô quá dài (tối đa 60 ký tự).'; end if;
  if p_done then
    update cycle_milestones set done_at = coalesce(done_at, now()), done_by = coalesce(done_by, auth.uid()),
           done_name = coalesce(done_name, author_display_name(auth.uid(), organization_id, null)),
           lot_no = case when kind = 'vaccine' then coalesce(lot, lot_no) else null end
     where id = p_id returning * into m;
  else
    update cycle_milestones set done_at = null, done_by = null, done_name = null, lot_no = null where id = p_id returning * into m;
  end if;
  return m;
end $$;

revoke execute on function add_cycle_milestone(uuid, text, text, integer, text, text), set_milestone_done(uuid, boolean, text) from public, anon;
grant execute on function add_cycle_milestone(uuid, text, text, integer, text, text), set_milestone_done(uuid, boolean, text) to authenticated, service_role;
