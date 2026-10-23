-- G2-5 R2 (D78): KHÁCH TIỀM NĂNG TỪ WEBSITE -> KHÁCH HÀNG. Yêu cầu báo giá gửi từ website (bảng quote_requests, của website) được xem và
-- xử lý ngay trong app qua các hàm có sẵn của website (my_quote_requests, set_my_quote). Migration này CHỈ THÊM phần phía app:
-- bảng ghi nhớ "yêu cầu nào đã thành khách nào" và hàm tạo/nối khách. KHÔNG sửa bảng hay hàm nào của website (chỉ đọc quote_requests).
-- Quyền: người xử lý website của cơ sở (chủ, quản lý, biên tập hồ sơ: can_edit_profile) VÀ có quyền sửa Doanh thu (như khách hàng, D77).

-- Số điện thoại về dạng so sánh được: chỉ chữ số, +84 / 84 đầu thành 0
create or replace function norm_phone(p text) returns text
language sql immutable as $$
  select case when d ~ '^84[0-9]{9}$' then '0' || substr(d, 3) else d end
    from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) x;
$$;

create table web_lead_links (
  organization_id uuid not null references organizations(id),
  quote_id uuid not null,                                       -- mã yêu cầu của website (không ràng buộc khóa ngoại để không chặn website dọn dữ liệu)
  partner_id uuid not null references partners(id),
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (organization_id, quote_id)
);
create index web_lead_links_partner_idx on web_lead_links (partner_id);
alter table web_lead_links enable row level security;
create policy web_lead_links_read on web_lead_links for select to authenticated using (has_perm(organization_id, 'sales', 'view'));
-- Không có chính sách ghi trực tiếp: chỉ ghi qua hàm link_lead_to_customer

-- Thêm yêu cầu báo giá vào khách hàng: nối khách đã có (trùng số điện thoại) hoặc tạo khách mới. Gọi lặp trả lại kết quả cũ.
create or replace function link_lead_to_customer(p_org uuid, p_quote uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare q quote_requests; lk web_lead_links; pr partners; ph text; nm text; nt text; pid uuid;
begin
  if auth.uid() is null or not can_edit_profile(p_org) then
    raise exception 'FORBIDDEN: Chỉ chủ, quản lý hoặc biên tập hồ sơ của cơ sở được xử lý yêu cầu từ website.';
  end if;
  if not has_perm(p_org, 'sales', 'edit') then
    raise exception 'FORBIDDEN: Bạn cần quyền sửa mục Doanh thu để thêm khách hàng.';
  end if;
  select * into q from quote_requests where id = p_quote and organization_id = p_org;
  if q.id is null then raise exception 'NOT_FOUND: Không tìm thấy yêu cầu này của cơ sở.'; end if;

  select * into lk from web_lead_links where organization_id = p_org and quote_id = p_quote;
  if lk.quote_id is not null then
    return jsonb_build_object('partner_id', lk.partner_id, 'created', false, 'already', true);
  end if;

  ph := norm_phone(q.sender_phone);
  if ph <> '' then
    select * into pr from partners where organization_id = p_org and is_customer and norm_phone(phone) = ph order by is_active desc, created_at limit 1;
  end if;
  if pr.id is not null then
    pid := pr.id;
  else
    nm := trim(q.sender_name);
    -- tên đã có trong danh bạ (có thể là nhà cung ứng): thêm hậu tố để không trùng, người dùng gộp sau nếu muốn
    if exists (select 1 from partners where organization_id = p_org and lower(trim(name)) = lower(nm)) then
      nm := left(nm, 100) || ' (từ website)';
      if exists (select 1 from partners where organization_id = p_org and lower(trim(name)) = lower(nm)) then
        nm := left(nm, 100) || ' ' || to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI');
      end if;
    end if;
    nt := left(concat_ws(' · ', 'Từ website', case when q.target_name is not null then 'quan tâm: ' || q.target_name end,
                         case when q.sender_email is not null then 'email: ' || q.sender_email end), 500);
    pid := gen_random_uuid();
    insert into partners (id, organization_id, name, phone, note, is_supplier, is_customer, customer_kind)
    values (pid, p_org, nm, nullif(q.sender_phone, ''), nt, false, true, null);
  end if;
  insert into web_lead_links (organization_id, quote_id, partner_id) values (p_org, p_quote, pid);
  return jsonb_build_object('partner_id', pid, 'created', pr.id is null, 'already', false);
end $$;

revoke execute on function norm_phone(text), link_lead_to_customer(uuid, uuid) from public, anon;
grant execute on function norm_phone(text), link_lead_to_customer(uuid, uuid) to authenticated, service_role;
