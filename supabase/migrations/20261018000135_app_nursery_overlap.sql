-- Ươm gối vụ (D124): vụ B làm giá thể, ươm cây trong khi vụ A còn chạy ở cùng phân khu, rồi chuyển sang sản xuất khi vụ A xong.
-- 1) Cấu hình của cơ sở "Chỗ ươm" (org_config khóa nursery_mode): 'inside' = khu ươm riêng trong khu trồng, 'separate' = vườn ươm riêng,
--    'same' = ươm ngay tại khu trồng (không ươm gối). Chưa lưu = 'same' (giữ cách làm cũ).
-- 2) Vụ có hai thông tin mới: nursery_overlap (đang ươm gối: được ghi việc dù vụ còn ở trạng thái Chuẩn bị, tối đa 45 ngày từ lúc tạo)
--    và follows_cycle_id (nối tiếp sau vụ nào; app nhắc chuyển sang sản xuất khi vụ đó kết thúc).
-- Hạn mức gói KHÔNG đổi: vụ Chuẩn bị vẫn không tính, chuyển sang Đang sản xuất mới tính (trigger production_cycles_quota).

create or replace function set_org_config(p_org uuid, p_key text, p_items text[]) returns void
language plpgsql security definer set search_path = public as $$
declare clean text[];
begin
  if not has_org_role(p_org, array['owner', 'manager']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ hoặc quản lý được sửa cấu hình.';
  end if;
  if p_key not in ('housing', 'customer_kinds', 'use_phases', 'nursery_mode') then raise exception 'INVALID_KEY: Cấu hình này không tồn tại.'; end if;
  select coalesce(array_agg(t order by o), '{}') into clean
    from (select trim(x) t, min(o) o from unnest(p_items) with ordinality u(x, o) where length(trim(x)) > 0 group by trim(x)) s;
  if cardinality(clean) = 0 then raise exception 'INVALID_ITEMS: Cần ít nhất một mục.'; end if;
  if exists (select 1 from unnest(clean) c where length(c) > 40) then raise exception 'INVALID_ITEMS: Mỗi mục tối đa 40 ký tự.'; end if;
  if p_key = 'use_phases' and clean not in (array['yes'], array['no']) then raise exception 'INVALID_ITEMS: Chỉ nhận yes hoặc no.'; end if;
  if p_key = 'nursery_mode' and clean not in (array['inside'], array['separate'], array['same']) then
    raise exception 'INVALID_ITEMS: Chỉ nhận inside, separate hoặc same.';
  end if;
  insert into org_config (organization_id, key, items) values (p_org, p_key, clean)
    on conflict (organization_id, key) do update set items = excluded.items, updated_at = now();
end $$;
revoke execute on function set_org_config(uuid, text, text[]) from public, anon;
grant execute on function set_org_config(uuid, text, text[]) to authenticated, service_role;

alter table production_cycles
  add column nursery_overlap boolean not null default false,
  add column follows_cycle_id uuid references production_cycles(id) on delete set null,
  add constraint production_cycles_follows_self check (follows_cycle_id is null or follows_cycle_id <> id);
create index on production_cycles (follows_cycle_id) where follows_cycle_id is not null;

-- Đặt "ươm gối" và "nối tiếp sau vụ" cho một vụ. Chỉ chủ hoặc quản lý vụ. Gọi ngay sau khi tạo vụ, hoặc sửa sau khi vụ còn Chuẩn bị.
create or replace function set_cycle_nursery(p_cycle uuid, p_follows uuid, p_overlap boolean) returns void
language plpgsql security definer set search_path = public as $$
declare c production_cycles; f production_cycles; mode text;
begin
  select * into c from production_cycles where id = p_cycle;
  if not found then raise exception 'NOT_FOUND: Không tìm thấy vụ.'; end if;
  if not can_manage_cycle(p_cycle) then raise exception 'FORBIDDEN: Chỉ chủ hoặc quản lý được đặt thông tin này.'; end if;

  if p_follows is not null then
    select * into f from production_cycles where id = p_follows;
    if not found or f.owner_org_id <> c.owner_org_id then raise exception 'INVALID_FOLLOWS: Vụ nối tiếp phải là một vụ của cùng cơ sở.'; end if;
    if p_follows = p_cycle or f.follows_cycle_id = p_cycle then raise exception 'INVALID_FOLLOWS: Hai vụ không thể nối tiếp lẫn nhau.'; end if;
  end if;

  if p_overlap then
    select coalesce((select items[1] from org_config where organization_id = c.owner_org_id and key = 'nursery_mode'), 'same') into mode;
    if mode = 'same' then raise exception 'NURSERY_OFF: Cơ sở chưa bật ươm gối vụ. Vào Cấu hình, mục Chỗ ươm để bật.'; end if;
    if c.status <> 'preparing' then raise exception 'NOT_PREPARING: Chỉ vụ đang Chuẩn bị mới ươm gối được.'; end if;
  end if;

  update production_cycles set follows_cycle_id = p_follows, nursery_overlap = p_overlap where id = p_cycle;
end $$;
revoke execute on function set_cycle_nursery(uuid, uuid, boolean) from public, anon;
grant execute on function set_cycle_nursery(uuid, uuid, boolean) to authenticated;
