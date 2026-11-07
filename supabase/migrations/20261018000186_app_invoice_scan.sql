-- ĐỌC ẢNH PHIẾU / HÓA ĐƠN NHẬP KHO (G2-3, D158): app gửi ảnh cho Edge Function `scan-invoice` (không lưu ảnh ở đâu cả); hàm máy chủ ở đây lo
--  (1) quyền, hạn mức tháng theo gói và giới hạn tốc độ cho mỗi lần đọc (chỉ lưu nhật ký số lần, KHÔNG lưu ảnh hay nội dung đọc được),
--  (2) "bí danh" vật tư: nhớ cách một nhà cung cấp gọi tên hàng đã được người dùng ghép với vật tư nào, để lần sau tự ghép.

alter table plan_tiers add column if not exists scan_per_month integer not null default 10 check (scan_per_month >= 0);
update plan_tiers set scan_per_month = case name when 'Hộ cơ bản' then 10 when 'Hộ nâng cao' then 30 when 'HTX cơ bản' then 30 when 'HTX nâng cao' then 90 else scan_per_month end;

insert into platform_settings (key, value, description) values
  ('invoice_scan_trial_limit', '2'::jsonb, 'Số lần đọc ảnh phiếu/hóa đơn mỗi tháng của cơ sở đang dùng thử'),
  ('invoice_scan_model', '"@cf/mistralai/mistral-small-3.1-24b-instruct"'::jsonb, 'Mô hình đọc ảnh phiếu/hóa đơn (Cloudflare Workers AI)')
on conflict (key) do nothing;

-- Nhật ký các lần đọc (chỉ để tính hạn mức và thống kê): không có ảnh, không có nội dung đọc được
create table invoice_scans (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  status text not null default 'pending' check (status in ('pending', 'ok', 'failed')),
  model text,
  images integer not null default 1 check (images between 1 and 3),
  line_count integer,
  ms integer,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index invoice_scans_org_idx on invoice_scans (organization_id, created_at desc);
create index invoice_scans_user_idx on invoice_scans (user_id, created_at desc);
alter table invoice_scans enable row level security;   -- không có chính sách: chỉ truy cập qua các hàm bên dưới
revoke all on invoice_scans from anon, authenticated;

-- Hạn mức tháng của cơ sở: dùng thử theo cấu hình; gói còn hạn theo gói; hết hạn hoặc bị khóa = 0. Tháng tính theo giờ Việt Nam.
-- Lần đọc lỗi (failed) và lần đang chờ quá 3 phút không bị tính.
create or replace function invoice_scan_quota(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare st text; lim integer := 0; used integer; sub subscriptions; month_start timestamptz;
begin
  st := org_sub_status(p_org);
  select * into sub from subscriptions where organization_id = p_org order by period_end desc limit 1;
  if st = 'trial' then
    lim := coalesce((select (value #>> '{}')::integer from platform_settings where key = 'invoice_scan_trial_limit'), 2);
  elsif st = 'active' and sub.id is not null then
    select coalesce(t.scan_per_month, 0) into lim from plan_tiers t where t.id = sub.plan_tier_id;
  end if;
  month_start := date_trunc('month', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh';
  select count(*) into used from invoice_scans
   where organization_id = p_org and created_at >= month_start
     and (status = 'ok' or (status = 'pending' and created_at > now() - interval '3 minutes'));
  return jsonb_build_object('status', st, 'limit', lim, 'used', used, 'remaining', greatest(lim - used, 0));
end $$;
revoke execute on function invoice_scan_quota(uuid) from public, anon, authenticated;

-- Số lần còn lại để hiện ở nút "Chụp phiếu"
create or replace function get_invoice_scan_usage(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not is_org_member(p_org) then raise exception 'FORBIDDEN: Bạn không thuộc cơ sở này.'; end if;
  return invoice_scan_quota(p_org);
end $$;
revoke execute on function get_invoice_scan_usage(uuid) from public, anon;
grant execute on function get_invoice_scan_usage(uuid) to authenticated, service_role;

-- Bắt đầu một lần đọc (Edge Function gọi bằng phiên của chính người dùng): kiểm quyền, hạn mức, tốc độ rồi ghi nhận. Gọi lặp cùng mã thì không tính thêm.
create or replace function begin_invoice_scan(p_org uuid, p_id uuid, p_images integer default 1) returns jsonb
language plpgsql security definer set search_path = public as $$
declare q jsonb; r invoice_scans; recent integer;
begin
  if auth.uid() is null then raise exception 'FORBIDDEN: Bạn chưa đăng nhập.'; end if;
  if not (has_perm(p_org, 'expenses', 'edit') and has_perm(p_org, 'inventory', 'edit')) then
    raise exception 'FORBIDDEN: Đọc phiếu cần quyền sửa mục Chi phí và mục Kho.';
  end if;
  select * into r from invoice_scans where id = p_id;
  if r.id is not null then
    if r.user_id <> auth.uid() or r.organization_id <> p_org then raise exception 'FORBIDDEN: Mã lần đọc không hợp lệ.'; end if;
    return invoice_scan_quota(p_org);
  end if;
  q := invoice_scan_quota(p_org);
  if (q->>'status') not in ('trial', 'active') then
    raise exception 'SCAN_NOT_ALLOWED: Gói của cơ sở đã hết hạn hoặc đang bị khóa nên chưa đọc phiếu được. Hãy gia hạn gói hoặc nhập tay.';
  end if;
  if (q->>'remaining')::integer <= 0 then
    raise exception 'SCAN_LIMIT: Tháng này cơ sở đã dùng hết % lần đọc phiếu theo gói. Bạn vẫn nhập tay được, hoặc nâng gói để có thêm lượt.', q->>'limit';
  end if;
  select count(*) into recent from invoice_scans where user_id = auth.uid() and created_at > now() - interval '5 minutes';
  if recent >= 6 then raise exception 'SCAN_RATE: Bạn đọc phiếu hơi nhiều trong vài phút qua. Hãy đợi một lát rồi thử lại.'; end if;
  insert into invoice_scans (id, organization_id, user_id, images) values (p_id, p_org, auth.uid(), greatest(1, least(coalesce(p_images, 1), 3)));
  return jsonb_set(jsonb_set(q, '{used}', to_jsonb((q->>'used')::integer + 1)), '{remaining}', to_jsonb(greatest((q->>'remaining')::integer - 1, 0)));
end $$;
revoke execute on function begin_invoice_scan(uuid, uuid, integer) from public, anon;
grant execute on function begin_invoice_scan(uuid, uuid, integer) to authenticated, service_role;

-- Kết thúc lần đọc: ok = tính vào hạn mức; failed = không tính
create or replace function finish_invoice_scan(p_id uuid, p_ok boolean, p_lines integer, p_ms integer, p_model text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update invoice_scans set status = case when p_ok then 'ok' else 'failed' end, line_count = p_lines, ms = p_ms, model = left(p_model, 120), finished_at = now()
   where id = p_id and user_id = auth.uid() and status = 'pending';
end $$;
revoke execute on function finish_invoice_scan(uuid, boolean, integer, integer, text) from public, anon;
grant execute on function finish_invoice_scan(uuid, boolean, integer, integer, text) to authenticated, service_role;

-- BÍ DANH VẬT TƯ: tên hàng trên phiếu của một nhà cung cấp (đã chuẩn hóa ở app: bỏ dấu, chữ thường) → vật tư của cơ sở
create table material_aliases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  partner_id uuid references partners(id) on delete cascade,
  alias text not null check (length(alias) between 2 and 200),
  material_id uuid not null references materials(id) on delete cascade,
  uses integer not null default 1,
  updated_at timestamptz not null default now()
);
create unique index material_aliases_uq on material_aliases (organization_id, coalesce(partner_id, '00000000-0000-0000-0000-000000000000'::uuid), alias);
alter table material_aliases enable row level security;
revoke all on material_aliases from anon, authenticated;

-- Bí danh áp dụng cho nhà cung cấp này, cộng bí danh chung (không gắn nhà cung cấp)
create or replace function get_material_aliases(p_org uuid, p_partner uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not (has_perm(p_org, 'inventory', 'edit') and has_perm(p_org, 'expenses', 'edit')) then
    raise exception 'FORBIDDEN: Cần quyền sửa mục Chi phí và mục Kho.';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('alias', a.alias, 'material_id', a.material_id, 'partner_id', a.partner_id) order by a.uses desc)
                     from material_aliases a
                    where a.organization_id = p_org and (a.partner_id is null or a.partner_id = p_partner)), '[]'::jsonb);
end $$;
revoke execute on function get_material_aliases(uuid, uuid) from public, anon;
grant execute on function get_material_aliases(uuid, uuid) to authenticated, service_role;

-- Lưu các cặp "tên trên phiếu → vật tư" sau khi người dùng đã kiểm tra (p_items: [{"alias": "...", "material_id": uuid}])
create or replace function save_material_aliases(p_org uuid, p_partner uuid, p_items jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare it jsonb; n integer := 0; al text; mid uuid;
begin
  if auth.uid() is null or not (has_perm(p_org, 'inventory', 'edit') and has_perm(p_org, 'expenses', 'edit')) then
    raise exception 'FORBIDDEN: Cần quyền sửa mục Chi phí và mục Kho.';
  end if;
  if p_partner is not null and not exists (select 1 from partners where id = p_partner and organization_id = p_org) then
    raise exception 'NOT_FOUND: Không tìm thấy nhà cung cấp.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then return 0; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    al := lower(trim(coalesce(it->>'alias', '')));
    mid := nullif(it->>'material_id', '')::uuid;
    continue when length(al) < 2 or length(al) > 200 or mid is null;
    continue when not exists (select 1 from materials where id = mid and organization_id = p_org);
    insert into material_aliases (organization_id, partner_id, alias, material_id)
    values (p_org, p_partner, al, mid)
    on conflict (organization_id, coalesce(partner_id, '00000000-0000-0000-0000-000000000000'::uuid), alias)
    do update set material_id = excluded.material_id, uses = material_aliases.uses + 1, updated_at = now();
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function save_material_aliases(uuid, uuid, jsonb) from public, anon;
grant execute on function save_material_aliases(uuid, uuid, jsonb) to authenticated, service_role;
