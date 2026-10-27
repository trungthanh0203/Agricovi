-- Mục TÙY CHỌN của mô hình quản lý, bật riêng cho từng vụ (ví dụ vụ "Tự làm trong gia đình" bật thêm Ghi việc nhẹ).
-- Lưu danh sách mã chức năng đã bật; chỉ có tác dụng với chức năng ở trạng thái "tùy chọn" của mô hình (xem lib/models.ts).
alter table production_cycles add column mgmt_options text[] not null default '{}';

create function set_cycle_options(p_cycle uuid, p_options text[]) returns void
language plpgsql security definer set search_path = public as $$
declare bad text;
begin
  if not can_manage_cycle(p_cycle) then
    raise exception 'FORBIDDEN: Chỉ chủ hoặc quản lý được đổi mục tùy chọn của vụ.';
  end if;
  select x into bad from unnest(coalesce(p_options, '{}')) x where x not in ('logs', 'stock', 'partners', 'licenses') limit 1;
  if bad is not null then raise exception 'INVALID_OPTION: Mục tùy chọn "%" không tồn tại.', bad; end if;
  update production_cycles set mgmt_options = coalesce((select array_agg(distinct x) from unnest(coalesce(p_options, '{}')) x), '{}') where id = p_cycle;
  if not found then raise exception 'NOT_FOUND: Không tìm thấy vụ.'; end if;
end $$;
revoke execute on function set_cycle_options(uuid, text[]) from public, anon;
grant execute on function set_cycle_options(uuid, text[]) to authenticated, service_role;
