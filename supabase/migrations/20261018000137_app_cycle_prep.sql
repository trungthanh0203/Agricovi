-- Công đoạn chuẩn bị của vụ (D126), thay cấu hình "Chỗ ươm" và cờ ươm gối của migration 0135 (chưa đẩy lên máy chủ thật; chạy sau 0135 nên vẫn an toàn nếu đã đẩy).
-- Khi tạo vụ, người dùng chọn một trong ba cách chuẩn bị THEO NHÀ MÀNG CỦA VỤ:
--   'whole'    = chuẩn bị trong toàn bộ nhà màng (như trước: vụ Chuẩn bị chưa ghi việc được);
--   'part'     = chuẩn bị trong một phần nhà màng (vụ Chuẩn bị nhưng ghi việc được, phần còn lại vẫn chạy vụ khác);
--   'separate' = nhà chuẩn bị riêng (chuẩn bị ở một khu/nhà màng khác: prep_area_id; vụ Chuẩn bị nhưng ghi việc được).
-- Hạn mức gói không đổi: vụ Chuẩn bị vẫn không tính, chuyển sang Đang sản xuất mới tính. follows_cycle_id (nối tiếp sau vụ nào) giữ nguyên từ 0135.

alter table production_cycles
  add column prep_mode text not null default 'whole' check (prep_mode in ('whole', 'part', 'separate')),
  add column prep_area_id uuid references production_areas(id) on delete set null;
update production_cycles set prep_mode = 'part' where nursery_overlap;
alter table production_cycles drop column nursery_overlap;

drop function if exists set_cycle_nursery(uuid, uuid, boolean);

-- Bỏ khóa cấu hình nursery_mode (không còn dùng)
delete from org_config where key = 'nursery_mode';
create or replace function set_org_config(p_org uuid, p_key text, p_items text[]) returns void
language plpgsql security definer set search_path = public as $$
declare clean text[];
begin
  if not has_org_role(p_org, array['owner', 'manager']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ hoặc quản lý được sửa cấu hình.';
  end if;
  if p_key not in ('housing', 'customer_kinds', 'use_phases') then raise exception 'INVALID_KEY: Cấu hình này không tồn tại.'; end if;
  select coalesce(array_agg(t order by o), '{}') into clean
    from (select trim(x) t, min(o) o from unnest(p_items) with ordinality u(x, o) where length(trim(x)) > 0 group by trim(x)) s;
  if cardinality(clean) = 0 then raise exception 'INVALID_ITEMS: Cần ít nhất một mục.'; end if;
  if exists (select 1 from unnest(clean) c where length(c) > 40) then raise exception 'INVALID_ITEMS: Mỗi mục tối đa 40 ký tự.'; end if;
  if p_key = 'use_phases' and clean not in (array['yes'], array['no']) then raise exception 'INVALID_ITEMS: Chỉ nhận yes hoặc no.'; end if;
  insert into org_config (organization_id, key, items) values (p_org, p_key, clean)
    on conflict (organization_id, key) do update set items = excluded.items, updated_at = now();
end $$;
revoke execute on function set_org_config(uuid, text, text[]) from public, anon;
grant execute on function set_org_config(uuid, text, text[]) to authenticated, service_role;

-- Đặt cách chuẩn bị và "nối tiếp sau vụ" cho một vụ. Chỉ chủ hoặc quản lý vụ. Chọn 'part' hoặc 'separate' chỉ khi vụ còn Chuẩn bị.
create or replace function set_cycle_prep(p_cycle uuid, p_mode text, p_area uuid, p_follows uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c production_cycles; f production_cycles; a production_areas;
begin
  select * into c from production_cycles where id = p_cycle;
  if not found then raise exception 'NOT_FOUND: Không tìm thấy vụ.'; end if;
  if not can_manage_cycle(p_cycle) then raise exception 'FORBIDDEN: Chỉ chủ hoặc quản lý được đặt thông tin này.'; end if;
  if p_mode is null or p_mode not in ('whole', 'part', 'separate') then raise exception 'INVALID_MODE: Cách chuẩn bị không hợp lệ.'; end if;

  if p_follows is not null then
    select * into f from production_cycles where id = p_follows;
    if not found or f.owner_org_id <> c.owner_org_id then raise exception 'INVALID_FOLLOWS: Vụ nối tiếp phải là một vụ của cùng cơ sở.'; end if;
    if p_follows = p_cycle or f.follows_cycle_id = p_cycle then raise exception 'INVALID_FOLLOWS: Hai vụ không thể nối tiếp lẫn nhau.'; end if;
  end if;

  if p_mode <> 'whole' and c.status <> 'preparing' then
    raise exception 'NOT_PREPARING: Chỉ vụ đang Chuẩn bị mới chọn chuẩn bị một phần hoặc ở nơi riêng.';
  end if;
  if p_mode = 'separate' then
    select * into a from production_areas where id = p_area;
    if not found or a.organization_id <> c.owner_org_id then raise exception 'INVALID_PREP_AREA: Hãy chọn nơi chuẩn bị là một khu của cơ sở.'; end if;
    if p_area = c.area_id then raise exception 'INVALID_PREP_AREA: Nơi chuẩn bị riêng phải khác nhà màng của vụ.'; end if;
  elsif p_area is not null then
    raise exception 'INVALID_PREP_AREA: Chỉ chọn nơi chuẩn bị khi dùng nhà chuẩn bị riêng.';
  end if;

  update production_cycles set prep_mode = p_mode, prep_area_id = case when p_mode = 'separate' then p_area end, follows_cycle_id = p_follows
   where id = p_cycle;
end $$;
revoke execute on function set_cycle_prep(uuid, text, uuid, uuid) from public, anon;
grant execute on function set_cycle_prep(uuid, text, uuid, uuid) to authenticated;
