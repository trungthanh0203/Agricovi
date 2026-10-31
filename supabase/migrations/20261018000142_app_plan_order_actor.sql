-- Sửa lỗi "Cần đăng nhập" khi gửi yêu cầu mua gói (D131): Edge Function plan-order xác định người gọi bằng mã thông báo (JWT) rồi tạo đơn bằng
-- khóa dịch vụ, truyền mã người dùng vào p_actor. Người dùng đã đăng nhập gọi trực tiếp thì luôn lấy auth.uid() (không giả mạo p_actor được).
drop function create_plan_order(uuid, uuid, integer, text, text, text, text);
create function create_plan_order(p_org uuid, p_plan uuid, p_quarters integer, p_name text, p_phone text, p_address text, p_note text default null, p_actor uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare t plan_tiers; org_t org_type; oid uuid; uid uuid := coalesce(auth.uid(), p_actor);
begin
  if uid is null then raise exception 'UNAUTHENTICATED: Cần đăng nhập'; end if;
  if not exists (select 1 from organization_memberships m where m.organization_id = p_org and m.user_id = uid and 'owner' = any (m.roles) and m.status = 'active') then
    raise exception 'FORBIDDEN: Chỉ chủ cơ sở được mua gói dịch vụ.';
  end if;
  select type into org_t from organizations where id = p_org;
  select * into t from plan_tiers where id = p_plan;
  if t.id is null or not t.is_active or t.is_trial_default or t.org_type <> org_t then
    raise exception 'INVALID_PLAN: Gói này không có cho loại cơ sở của bạn hoặc đã ngừng bán. Hãy chọn gói khác.';
  end if;
  if p_quarters is null or p_quarters < 1 or p_quarters > 8 then raise exception 'INVALID_QUARTERS: Số quý mua từ 1 đến 8.'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'INVALID_NAME: Hãy nhập họ tên.'; end if;
  if length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 9 then raise exception 'INVALID_PHONE: Hãy nhập số điện thoại để chúng tôi liên hệ.'; end if;
  if length(trim(coalesce(p_address, ''))) < 3 then raise exception 'INVALID_ADDRESS: Hãy nhập địa chỉ.'; end if;
  if (select count(*) from plan_orders o where o.organization_id = p_org and o.status = 'pending') >= 3 then
    raise exception 'TOO_MANY: Bạn đang có 3 yêu cầu mua chờ xử lý. Hãy đợi Agricovi liên hệ rồi mua tiếp.';
  end if;
  insert into plan_orders (organization_id, requested_by, plan_tier_id, plan_name, quarters, price_per_quarter, amount, full_name, phone, address, note)
    values (p_org, uid, t.id, t.name, p_quarters, t.price_per_quarter, t.price_per_quarter * p_quarters, trim(p_name), trim(p_phone), trim(p_address), nullif(trim(coalesce(p_note, '')), ''))
    returning id into oid;
  return oid;
end $$;
revoke execute on function create_plan_order(uuid, uuid, integer, text, text, text, text, uuid) from public, anon;
grant execute on function create_plan_order(uuid, uuid, integer, text, text, text, text, uuid) to authenticated, service_role;
