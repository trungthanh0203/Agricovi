-- Chế độ hiển thị của cơ sở (D100): 'simple' = chế độ đơn giản cho hộ nhỏ (ẩn các mục nâng cao như đầu việc, nhà cung ứng, chức vụ, bảng lương,
-- bảng kiểm, sổ nhật ký…), 'full' = đầy đủ (mặc định, giữ nguyên như cũ). Đây CHỈ là cách hiển thị: quyền và dữ liệu không đổi; chủ cơ sở bật/tắt bất cứ lúc nào.
alter table organizations add column ui_mode text not null default 'full' check (ui_mode in ('simple', 'full'));

create or replace function set_org_ui_mode(p_org uuid, p_mode text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_org_role(p_org, array['owner']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở mới đổi được chế độ hiển thị.';
  end if;
  if p_mode not in ('simple', 'full') then
    raise exception 'INVALID_MODE: Chế độ phải là đơn giản hoặc đầy đủ.';
  end if;
  update organizations set ui_mode = p_mode where id = p_org;
end $$;
revoke execute on function set_org_ui_mode(uuid, text) from public, anon;
grant execute on function set_org_ui_mode(uuid, text) to authenticated, service_role;
