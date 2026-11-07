-- Bổ sung cho 0186 (idempotent: chạy được dù 0186 đã đẩy bản cũ hay chưa):
--  (1) loại lần đọc (phiếu nhập hàng / nhãn vật tư, dùng chung hạn mức) + hàm begin_invoice_scan có tham số loại,
--  (2) các hàm quản trị chỉnh hạn mức đọc ảnh theo gói, hạn mức dùng thử và mô hình.
-- Lý do: 0186 từng được đẩy trước khi thêm "nhãn vật tư"; `supabase db push` không áp lại file đã đẩy nên cần file mới này.

alter table plan_tiers add column if not exists scan_per_month integer not null default 10 check (scan_per_month >= 0);
alter table invoice_scans add column if not exists kind text not null default 'invoice' check (kind in ('invoice', 'label'));

-- bản cũ của hàm (3 tham số) bỏ đi để không bị nhầm khi gọi
drop function if exists begin_invoice_scan(uuid, uuid, integer);

-- Bắt đầu một lần đọc (Edge Function gọi bằng phiên của chính người dùng): kiểm quyền, hạn mức, tốc độ rồi ghi nhận. Gọi lặp cùng mã thì không tính thêm.
create or replace function begin_invoice_scan(p_org uuid, p_id uuid, p_images integer default 1, p_kind text default 'invoice') returns jsonb
language plpgsql security definer set search_path = public as $$
declare q jsonb; r invoice_scans; recent integer;
begin
  if auth.uid() is null then raise exception 'FORBIDDEN: Bạn chưa đăng nhập.'; end if;
  -- phiếu nhập hàng cần quyền sửa Chi phí và Kho (như "Mua có hóa đơn"); nhãn vật tư chỉ cần quyền sửa Kho (khai báo vật tư)
  if p_kind = 'label' then
    if not has_perm(p_org, 'inventory', 'edit') then raise exception 'FORBIDDEN: Đọc nhãn vật tư cần quyền sửa mục Kho.'; end if;
  elsif not (has_perm(p_org, 'expenses', 'edit') and has_perm(p_org, 'inventory', 'edit')) then
    raise exception 'FORBIDDEN: Đọc phiếu cần quyền sửa mục Chi phí và mục Kho.';
  end if;
  if p_kind not in ('invoice', 'label') then raise exception 'BAD_REQUEST: Loại đọc ảnh không hợp lệ.'; end if;
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
  insert into invoice_scans (id, organization_id, user_id, kind, images) values (p_id, p_org, auth.uid(), p_kind, greatest(1, least(coalesce(p_images, 1), 3)));
  return jsonb_set(jsonb_set(q, '{used}', to_jsonb((q->>'used')::integer + 1)), '{remaining}', to_jsonb(greatest((q->>'remaining')::integer - 1, 0)));
end $$;
revoke execute on function begin_invoice_scan(uuid, uuid, integer, text) from public, anon;
grant execute on function begin_invoice_scan(uuid, uuid, integer, text) to authenticated, service_role;

-- QUẢN TRỊ NỀN TẢNG: chỉnh hạn mức đọc phiếu theo gói, hạn mức dùng thử và mô hình đọc ảnh
create or replace function admin_set_plan_scan_limit(p_plan uuid, p_limit integer) returns void
language plpgsql security definer set search_path = public as $$
declare prev integer;
begin
  perform admin_guard();
  if p_limit is null or p_limit < 0 or p_limit > 100000 then raise exception 'INVALID_LIMIT: Số lần đọc phiếu mỗi tháng phải từ 0 đến 100000.'; end if;
  select scan_per_month into prev from plan_tiers where id = p_plan;
  if not found then raise exception 'NOT_FOUND: Không tìm thấy gói.'; end if;
  update plan_tiers set scan_per_month = p_limit where id = p_plan;
  perform admin_audit(null, 'set_plan_scan_limit', 'plan_tier', p_plan::text, to_jsonb(prev), to_jsonb(p_limit), null);
end $$;
revoke execute on function admin_set_plan_scan_limit(uuid, integer) from public, anon;
grant execute on function admin_set_plan_scan_limit(uuid, integer) to authenticated, service_role;

create or replace function admin_set_scan_settings(p_trial_limit integer, p_model text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard();
  if p_trial_limit is null or p_trial_limit < 0 or p_trial_limit > 1000 then raise exception 'INVALID_LIMIT: Số lần dùng thử phải từ 0 đến 1000.'; end if;
  if p_model is null or p_model !~ '^@cf/[A-Za-z0-9._/-]{3,120}$' then raise exception 'INVALID_MODEL: Tên mô hình phải bắt đầu bằng @cf/ (Cloudflare Workers AI).'; end if;
  insert into platform_settings (key, value) values ('invoice_scan_trial_limit', to_jsonb(p_trial_limit))
    on conflict (key) do update set value = excluded.value;
  insert into platform_settings (key, value) values ('invoice_scan_model', to_jsonb(p_model))
    on conflict (key) do update set value = excluded.value;
  perform admin_audit(null, 'set_scan_settings', 'platform_setting', 'invoice_scan', null, jsonb_build_object('trial_limit', p_trial_limit, 'model', p_model), null);
end $$;
revoke execute on function admin_set_scan_settings(integer, text) from public, anon;
grant execute on function admin_set_scan_settings(integer, text) to authenticated, service_role;
