-- Thông báo của website gửi tới chủ + người được cấp quyền "website" (website_staff_ids, migration 0064), thay cho danh sách vai trò cũ (D83).

create or replace function submit_quote_request(p_kind text, p_target text, p_name text, p_phone text, p_email text, p_qty text, p_message text)
returns uuid language plpgsql security definer set search_path = public as $$
declare ph text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), ''); em text := nullif(lower(trim(coalesce(p_email, ''))), '');
        tname text; tprof uuid; torg uuid; tshop uuid; r uuid;
begin
  if p_kind not in ('material', 'product', 'profile', 'general') then raise exception 'INVALID: Loại yêu cầu không hợp lệ.'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'INVALID: Hãy nhập họ tên.'; end if;
  if ph is null and em is null then raise exception 'INVALID: Hãy nhập số điện thoại hoặc email để nhà cung cấp liên hệ lại.'; end if;
  if ph is not null and ph !~ '^\+?[0-9]{8,15}$' then raise exception 'INVALID: Số điện thoại chưa đúng.'; end if;
  if em is not null and em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'INVALID: Email chưa đúng.'; end if;
  if length(trim(coalesce(p_message, ''))) = 0 then raise exception 'INVALID: Hãy nhập nội dung cần báo giá.'; end if;
  if p_message ~* '(https?://|www\.)' then raise exception 'INVALID: Nội dung không được chứa đường dẫn.'; end if;
  if (select count(*) from quote_requests where created_at > now() - interval '24 hours'
        and ((ph is not null and sender_phone = ph) or (em is not null and sender_email = em))) >= 3 then
    raise exception 'RATE_LIMIT: Bạn đã gửi nhiều yêu cầu hôm nay. Vui lòng thử lại vào ngày mai hoặc liên hệ trực tiếp.';
  end if;
  if (select count(*) from quote_requests where created_at > now() - interval '1 hour') >= 300 then
    raise exception 'RATE_LIMIT: Hệ thống đang nhận quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.';
  end if;
  if p_kind = 'material' then
    select name, shop_id into tname, tshop from site_materials where slug = p_target and status = 'published' and (shop_id is null or shop_is_active(shop_id));
    if tname is null then raise exception 'NOT_FOUND: Không tìm thấy vật tư này.'; end if;
  elsif p_kind = 'product' then
    select pp.snapshot->>'name', pp.profile_id, pr.organization_id into tname, tprof, torg
      from public_products pp join public_profiles pr on pr.profile_id = pp.profile_id
     where pp.listing_id::text = p_target and pp.is_visible and pr.is_visible;
    if tname is null then raise exception 'NOT_FOUND: Không tìm thấy sản phẩm này.'; end if;
  elsif p_kind = 'profile' then
    select snapshot->>'display_name', profile_id, organization_id into tname, tprof, torg from public_profiles where slug = p_target and is_visible;
    if tname is null then raise exception 'NOT_FOUND: Không tìm thấy nhà cung cấp này.'; end if;
  end if;
  insert into quote_requests (kind, target_ref, target_name, profile_id, organization_id, shop_id, sender_name, sender_phone, sender_email, quantity_note, message, user_id)
  values (p_kind, p_target, tname, tprof, torg, tshop, trim(p_name), ph, em, nullif(trim(coalesce(p_qty, '')), ''), trim(p_message), case when is_web_user() then auth.uid() end)
  returning id into r;
  if torg is not null then
    perform notify(u, 'quote', 'Có yêu cầu báo giá mới', coalesce(tname, 'Yêu cầu báo giá'), '/gian-hang/') from website_staff_ids(torg) u;
  end if;
  if tshop is not null then
    perform notify(s.owner_id, 'quote', 'Có yêu cầu báo giá vật tư', coalesce(tname, 'Yêu cầu báo giá'), '/gian-hang-vat-tu/quan-ly/#bao-gia') from material_shops s where s.id = tshop;
  end if;
  return r;
end $$;

create or replace function notify_order_sellers(p_org uuid, p_title text, p_body text, p_order uuid) returns void
language sql security definer set search_path = public as $$
  select notify(u, 'order', p_title, p_body, '/don-hang/' || p_order) from website_staff_ids(p_org) u;
$$;
