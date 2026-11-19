-- D201: BẢNG CHẤM CÔNG GIẤY, lớp B: đọc ảnh bảng giấy bằng AI để điền sẵn vào lưới nhập (lớp A).
-- Dùng lại đường đọc ảnh hiện có (Edge Function scan-invoice, hạn mức tháng theo gói, giới hạn tốc độ, KHÔNG lưu ảnh); thêm loại lần đọc 'timesheet'.
-- Quyền: chủ, quản lý hoặc tổ trưởng của cơ sở (người nhập bảng). Lần đọc lỗi không tính vào hạn mức; kết quả chỉ là bản nháp để người dùng kiểm tra.

-- Cho phép loại 'timesheet' ở cột kind (ràng buộc cũ chỉ có invoice/label; tên ràng buộc có thể khác nhau nên tìm theo nội dung)
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'invoice_scans'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%kind%' loop
    execute format('alter table invoice_scans drop constraint %I', c.conname);
  end loop;
end $$;
alter table invoice_scans add constraint invoice_scans_kind_check check (kind in ('invoice', 'label', 'timesheet'));

-- Người nhập bảng chấm công: chủ/quản lý, hoặc người đang là tổ trưởng của một tổ còn hoạt động
create or replace function is_timesheet_user(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    is_workforce_admin(p_org)
    or exists (select 1 from worker_teams t join worker_profiles w on w.id = t.leader_worker_id
                where t.organization_id = p_org and t.is_active and w.user_id = auth.uid() and w.status = 'active'));
$$;
revoke execute on function is_timesheet_user(uuid) from public, anon;
grant execute on function is_timesheet_user(uuid) to authenticated, service_role;

-- Bản mới của begin_invoice_scan: thêm nhánh 'timesheet'; các nhánh invoice/label giữ nguyên như 0187
create or replace function begin_invoice_scan(p_org uuid, p_id uuid, p_images integer default 1, p_kind text default 'invoice') returns jsonb
language plpgsql security definer set search_path = public as $$
declare q jsonb; r invoice_scans; recent integer;
begin
  if auth.uid() is null then raise exception 'FORBIDDEN: Bạn chưa đăng nhập.'; end if;
  if p_kind not in ('invoice', 'label', 'timesheet') then raise exception 'BAD_REQUEST: Loại đọc ảnh không hợp lệ.'; end if;
  -- phiếu nhập hàng cần quyền sửa Chi phí và Kho; nhãn vật tư cần quyền sửa Kho; bảng chấm công cần là chủ, quản lý hoặc tổ trưởng
  if p_kind = 'label' then
    if not has_perm(p_org, 'inventory', 'edit') then raise exception 'FORBIDDEN: Đọc nhãn vật tư cần quyền sửa mục Kho.'; end if;
  elsif p_kind = 'timesheet' then
    if not is_timesheet_user(p_org) then raise exception 'FORBIDDEN: Đọc bảng chấm công cần là chủ, quản lý hoặc tổ trưởng.'; end if;
  elsif not (has_perm(p_org, 'expenses', 'edit') and has_perm(p_org, 'inventory', 'edit')) then
    raise exception 'FORBIDDEN: Đọc phiếu cần quyền sửa mục Chi phí và mục Kho.';
  end if;
  select * into r from invoice_scans where id = p_id;
  if r.id is not null then
    if r.user_id <> auth.uid() or r.organization_id <> p_org then raise exception 'FORBIDDEN: Mã lần đọc không hợp lệ.'; end if;
    return invoice_scan_quota(p_org);
  end if;
  q := invoice_scan_quota(p_org);
  if (q->>'status') not in ('trial', 'active') then
    raise exception 'SCAN_NOT_ALLOWED: Gói của cơ sở đã hết hạn hoặc đang bị khóa nên chưa đọc ảnh được. Hãy gia hạn gói hoặc nhập tay.';
  end if;
  if (q->>'remaining')::integer <= 0 then
    raise exception 'SCAN_LIMIT: Tháng này cơ sở đã dùng hết % lần đọc ảnh theo gói. Bạn vẫn nhập tay được, hoặc nâng gói để có thêm lượt.', q->>'limit';
  end if;
  select count(*) into recent from invoice_scans where user_id = auth.uid() and created_at > now() - interval '5 minutes';
  if recent >= 6 then raise exception 'SCAN_RATE: Bạn đọc ảnh hơi nhiều trong vài phút qua. Hãy đợi một lát rồi thử lại.'; end if;
  insert into invoice_scans (id, organization_id, user_id, kind, images) values (p_id, p_org, auth.uid(), p_kind, greatest(1, least(coalesce(p_images, 1), 3)));
  return jsonb_set(jsonb_set(q, '{used}', to_jsonb((q->>'used')::integer + 1)), '{remaining}', to_jsonb(greatest((q->>'remaining')::integer - 1, 0)));
end $$;
revoke execute on function begin_invoice_scan(uuid, uuid, integer, text) from public, anon;
grant execute on function begin_invoice_scan(uuid, uuid, integer, text) to authenticated, service_role;
