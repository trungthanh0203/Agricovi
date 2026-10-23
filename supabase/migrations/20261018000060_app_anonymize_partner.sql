-- G2-5 R5 (D78): ẨN DANH KHÁCH HÀNG theo yêu cầu xóa dữ liệu cá nhân (D58-6). Thay tên và xóa điện thoại, địa chỉ, mã số thuế, tài khoản,
-- ghi chú; khách chuyển sang "đã dừng". Giữ nguyên các lần bán, số tiền và công nợ để sổ sách không lệch. Ghi nhật ký kiểm toán (trigger audit của bảng partners).
-- Chỉ ẩn danh được đối tác là KHÁCH HÀNG; đối tác vừa là nhà cung ứng thì cần cả hai quyền sửa (Doanh thu và Chi phí).

create or replace function anonymize_partner(p_id uuid, p_reason text) returns partners
language plpgsql security definer set search_path = public as $$
declare p partners;
begin
  if auth.uid() is null then raise exception 'FORBIDDEN: Hãy đăng nhập.'; end if;
  select * into p from partners where id = p_id;
  if p.id is null then raise exception 'NOT_FOUND: Không tìm thấy khách hàng.'; end if;
  if not p.is_customer then raise exception 'INVALID: Chỉ ẩn danh được đối tác là khách hàng.'; end if;
  if not has_perm(p.organization_id, 'sales', 'edit') or (p.is_supplier and not has_perm(p.organization_id, 'expenses', 'edit')) then
    raise exception 'FORBIDDEN: Bạn không có quyền ẩn danh khách hàng này (cần quyền sửa mục Doanh thu).';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'INVALID: Hãy ghi lý do ẩn danh (ví dụ: khách yêu cầu xóa dữ liệu).'; end if;
  update partners set
    name = 'Khách đã ẩn danh ' || upper(substr(replace(p_id::text, '-', ''), 1, 6)),
    phone = null, address = null, tax_code = null, bank_account = null, goods = null,
    note = 'Đã ẩn danh theo yêu cầu ngày ' || to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY'),
    customer_kind = null, is_active = false
  where id = p_id returning * into p;
  return p;
end $$;

revoke execute on function anonymize_partner(uuid, text) from public, anon;
grant execute on function anonymize_partner(uuid, text) to authenticated, service_role;
