-- Nhóm chi phí thành cấu hình dạng "mục có mã" (Cấu hình → Nhóm chi phí), giống Nhóm loại sản phẩm / Nhóm vật tư:
--  - 6 nhóm có sẵn (vật tư, nhân công, điện nước, thuê, khấu hao, khác): đổi tên/dừng được, không xóa;
--  - mục tự thêm "tính như" một nhóm có sẵn; bản ghi lưu nhóm gốc ở cột category (báo cáo không đổi) + mã mục tự thêm ở category_item.
-- "Loại chi" (cash_paid/material_used/allocated/estimated) giữ nguyên, không cấu hình.

alter table expense_records add column category_item text check (category_item is null or category_item ~ '^[a-z0-9_]{1,30}$');

create or replace function update_expense(p_id uuid, p_expected_version integer, p_op_id uuid, p_changes jsonb)
returns expense_records
language plpgsql security invoker set search_path = public as $$
declare r expense_records; cur expense_records;
begin
  update expense_records set
    category     = case when p_changes ? 'category'     then (p_changes->>'category')::expense_category else category end,
    category_item = case when p_changes ? 'category_item' then nullif(p_changes->>'category_item', '') else category_item end,
    kind         = case when p_changes ? 'kind'         then (p_changes->>'kind')::expense_kind else kind end,
    amount       = case when p_changes ? 'amount'       then (p_changes->>'amount')::bigint else amount end,
    expense_date = case when p_changes ? 'expense_date' then (p_changes->>'expense_date')::date else expense_date end,
    note         = case when p_changes ? 'note'         then nullif(p_changes->>'note', '') else note end,
    voided_at    = case when p_changes ? 'voided_at'    then (p_changes->>'voided_at')::timestamptz else voided_at end,
    void_reason  = case when p_changes ? 'void_reason'  then p_changes->>'void_reason' else void_reason end,
    last_op_id   = p_op_id
  where id = p_id and version = p_expected_version
  returning * into r;
  if r.id is not null then return r; end if;

  select * into cur from expense_records where id = p_id;
  if cur.id is null then
    raise exception 'NOT_FOUND: Không tìm thấy khoản chi hoặc bạn không có quyền xem.';
  end if;
  if p_op_id is not null and cur.last_op_id = p_op_id then
    return cur;
  end if;
  if cur.version <> p_expected_version then
    raise exception 'CONFLICT: Khoản chi đã được người khác thay đổi (phiên bản máy chủ %, bạn đang sửa phiên bản %).', cur.version, p_expected_version;
  end if;
  raise exception 'FORBIDDEN: Bạn không có quyền sửa khoản chi này (chỉ chủ và vai trò Kho & chi phí).';
end $$;

create or replace function set_org_entries(p_org uuid, p_key text, p_entries jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  builtin text[]; e jsonb; code text; lab text; bs text; act boolean;
  codes text[] := '{}'; labels text[] := '{}'; cleaned jsonb := '[]'::jsonb; n integer := 0; old jsonb; r text; used boolean;
begin
  if not has_org_role(p_org, array['owner', 'manager']::member_role[]) then
    raise exception 'FORBIDDEN: Chỉ chủ hoặc quản lý được sửa cấu hình.';
  end if;
  builtin := case p_key
    when 'product_groups' then array['crop', 'livestock', 'aquatic', 'other']
    when 'material_groups' then array['feed', 'vet_drug', 'vaccine', 'pesticide', 'fertilizer', 'disinfectant', 'seed', 'other']
    when 'expense_groups' then array['material', 'labor', 'utility', 'rent', 'depreciation', 'other']
    else null end;
  if builtin is null then raise exception 'INVALID_KEY: Cấu hình này không có dạng danh sách mục có mã.'; end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) > 40 then
    raise exception 'INVALID_ITEMS: Danh sách không hợp lệ (tối đa 40 mục).';
  end if;
  for e in select value from jsonb_array_elements(p_entries) loop
    code := e->>'code'; lab := trim(coalesce(e->>'label', '')); bs := e->>'base'; act := coalesce((e->>'active')::boolean, true);
    if code is null or code !~ '^[a-z0-9_]{1,30}$' then raise exception 'INVALID_ITEMS: Mã mục không hợp lệ.'; end if;
    if length(lab) < 1 or length(lab) > 40 then raise exception 'INVALID_ITEMS: Tên mỗi mục cần từ 1 đến 40 ký tự.'; end if;
    if code = any (codes) then raise exception 'INVALID_ITEMS: Có mục bị trùng mã.'; end if;
    if lower(lab) = any (labels) then raise exception 'INVALID_ITEMS: Tên mục "%" bị trùng.', lab; end if;
    if code = any (builtin) then bs := code;
    elsif bs is null or not (bs = any (builtin)) then raise exception 'INVALID_ITEMS: Mục "%" cần chọn "tính như" một nhóm có sẵn.', lab;
    end if;
    codes := codes || code; labels := labels || lower(lab);
    if act then n := n + 1; end if;
    cleaned := cleaned || jsonb_build_array(jsonb_build_object('code', code, 'label', lab, 'base', bs, 'active', act));
  end loop;
  if not (builtin <@ codes) then raise exception 'INVALID_ITEMS: Mục có sẵn không xóa được, chỉ dừng.'; end if;
  if n = 0 then raise exception 'INVALID_ITEMS: Cần ít nhất một mục đang dùng.'; end if;

  -- mục tự thêm bị bỏ khỏi danh sách mà vẫn có dữ liệu dùng thì không cho xóa
  select entries into old from org_config where organization_id = p_org and key = p_key;
  if old is not null then
    for r in select x->>'code' from jsonb_array_elements(old) x loop
      if not (r = any (codes)) and not (r = any (builtin)) then
        used := case p_key
          when 'product_groups' then exists (select 1 from crop_types where organization_id = p_org and kind_item = r)
                                     or exists (select 1 from production_areas where organization_id = p_org and kind_item = r)
          when 'material_groups' then exists (select 1 from materials where organization_id = p_org and group_item = r)
          when 'expense_groups' then exists (select 1 from expense_records where organization_id = p_org and category_item = r)
          else false end;
        if used then
          raise exception 'IN_USE: Mục "%" đang được dùng, hãy chọn Dừng thay vì xóa.', (select x->>'label' from jsonb_array_elements(old) x where x->>'code' = r);
        end if;
      end if;
    end loop;
  end if;

  insert into org_config (organization_id, key, items, entries) values (p_org, p_key, '{}', cleaned)
    on conflict (organization_id, key) do update set items = '{}', entries = excluded.entries, updated_at = now();
end $$;
