-- G2-5 R4 (D78): GHI DOANH THU TỪ ĐƠN HÀNG WEBSITE. Khi đơn đã giao/hoàn tất, người có quyền sửa Doanh thu ghi lần bán cho đúng vụ
-- (vụ lấy từ sản phẩm niêm yết của website) kèm khách hàng và công nợ phải thu theo G2-4, trong MỘT giao dịch, và đánh dấu đơn đã ghi.
-- Migration này CHỈ THÊM phần phía app và CHỈ ĐỌC bảng đơn của website (web_orders, web_order_items, product_listings); không sửa gì của website.

create table web_order_sales (
  order_id uuid not null,                                       -- mã đơn của website (không ràng buộc khóa ngoại để không chặn website)
  sale_id uuid not null unique references sales_records(id),
  organization_id uuid not null references organizations(id),
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (order_id, sale_id)
);
create index web_order_sales_org_idx on web_order_sales (organization_id, order_id);
alter table web_order_sales enable row level security;
create policy web_order_sales_read on web_order_sales for select to authenticated using (has_perm(organization_id, 'sales', 'view'));
-- Không có chính sách ghi trực tiếp: chỉ ghi qua hàm record_order_sale

-- Đơn nào thuộc cơ sở nào (để app chỉ hiện đơn của cơ sở đang chọn). Chỉ cho người xử lý được website của cơ sở đó.
create or replace function app_seller_order_orgs() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(o.id::text, o.organization_id), '{}'::jsonb)
    from web_orders o where auth.uid() is not null and can_edit_profile(o.organization_id);
$$;

-- Bối cảnh để ghi doanh thu: cơ sở, người nhận, từng dòng hàng kèm vụ gợi ý (từ sản phẩm niêm yết) và đơn vị, các lần bán đã ghi cho đơn này
create or replace function app_order_context(p_order uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o web_orders;
begin
  select * into o from web_orders where id = p_order;
  if o.id is null or auth.uid() is null or not can_edit_profile(o.organization_id) then
    raise exception 'NOT_FOUND: Không tìm thấy đơn hàng hoặc bạn không có quyền xử lý.';
  end if;
  return jsonb_build_object(
    'organization_id', o.organization_id, 'code', o.code, 'status', o.status, 'payment_status', o.payment_status,
    'recipient', o.recipient, 'recipient_phone', o.recipient_phone, 'shipping_fee', o.shipping_fee, 'delivered_at', o.delivered_at,
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'unit', i.unit, 'quantity', i.quantity, 'agreed_quantity', i.agreed_quantity,
                         'unit_price', i.unit_price, 'cycle_id', l.cycle_id, 'listing_unit', l.unit) order by i.position)
                         from web_order_items i left join product_listings l on l.id = i.listing_id where i.order_id = o.id), '[]'::jsonb),
    'sales', coalesce((select jsonb_agg(jsonb_build_object('sale_id', s.sale_id, 'created_at', s.created_at) order by s.created_at)
                         from web_order_sales s where s.order_id = o.id), '[]'::jsonb));
end $$;

-- GHI LẦN BÁN CHO ĐƠN: kiểm đơn thuộc cơ sở và đã giao/hoàn tất, rồi tạo lần bán + lần thu đầu + liên kết đơn trong một giao dịch.
-- Gọi lặp cùng p_sale trả lại lần bán đã có. Một đơn có thể có nhiều lần bán (nhiều vụ); app cảnh báo khi đơn đã được ghi.
create or replace function record_order_sale(
  p_order uuid, p_sale uuid, p_org uuid, p_cycle uuid, p_date date, p_qty numeric, p_amount bigint, p_buyer_note text,
  p_partner uuid, p_invoice text, p_due date, p_paid bigint, p_method text)
returns sales_records
language plpgsql security definer set search_path = public as $$
declare o web_orders; s sales_records; cyc_org uuid;
begin
  if auth.uid() is null or not can_edit_profile(p_org) then
    raise exception 'FORBIDDEN: Chỉ chủ, quản lý hoặc biên tập hồ sơ của cơ sở được xử lý đơn từ website.';
  end if;
  if not has_perm(p_org, 'sales', 'edit') then
    raise exception 'FORBIDDEN: Bạn cần quyền sửa mục Doanh thu để ghi doanh thu từ đơn.';
  end if;
  select * into s from sales_records where id = p_sale;
  if s.id is not null then
    if not exists (select 1 from web_order_sales where order_id = p_order and sale_id = p_sale) then
      raise exception 'INVALID: Mã lần bán này đã được dùng cho việc khác.';
    end if;
    return s;
  end if;
  select * into o from web_orders where id = p_order and organization_id = p_org;
  if o.id is null then raise exception 'NOT_FOUND: Không tìm thấy đơn hàng của cơ sở này.'; end if;
  if o.status not in ('delivered', 'completed') then
    raise exception 'INVALID: Chỉ ghi doanh thu khi đơn đã giao hoặc hoàn tất (hiện: %).', o.status;
  end if;
  select owner_org_id into cyc_org from production_cycles where id = p_cycle;
  if cyc_org is distinct from p_org then
    raise exception 'INVALID: Vụ được chọn không thuộc cơ sở này.';
  end if;
  s := record_sale(p_sale, p_org, p_cycle, p_date, p_qty, p_amount, p_buyer_note, p_partner, p_invoice, p_due, p_paid, p_method);
  insert into web_order_sales (order_id, sale_id, organization_id) values (p_order, p_sale, p_org);
  return s;
end $$;

revoke execute on function app_seller_order_orgs(), app_order_context(uuid),
  record_order_sale(uuid, uuid, uuid, uuid, date, numeric, bigint, text, uuid, text, date, bigint, text) from public, anon;
grant execute on function app_seller_order_orgs(), app_order_context(uuid),
  record_order_sale(uuid, uuid, uuid, uuid, date, numeric, bigint, text, uuid, text, date, bigint, text) to authenticated, service_role;
