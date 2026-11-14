-- D162: SỬA LOGIC PHIẾU THU MUA TỪ PHIẾU THU HOẠCH của hộ (HTX).
--  1. Khối lượng là số HTX CÂN THỰC TẾ khi nhận (mặc định = số hộ ghi trừ hao hụt), không còn cố định theo số hộ ghi; lưu kèm số hộ ghi để đối chiếu.
--  2. MUA MỘT PHẦN: phiếu thu hoạch vẫn còn để mua tiếp cho tới khi một phiếu được đánh dấu "đã mua xong" (harvest_closed).
--  3. Ngày thu mua nhập được (ngày HTX nhận hàng), không còn bắt buộc bằng ngày thu hoạch.
--  4. Số phiếu để trống thì TỰ ĐÁNH SỐ (TM-năm-0001, riêng từng HTX).
--  5. Ảnh chứng từ (phiếu cân, biên nhận) đính kèm vào phiếu, chỉ HTX thấy; dùng kho ảnh 'org-media', loại 'receipts'.
-- Phiếu cũ không đổi: mỗi phiếu có từ trước coi là "đã mua xong" phiếu thu hoạch của nó, số hộ ghi để trống.

alter table procurement_receipts
  add column harvest_qty numeric check (harvest_qty is null or harvest_qty >= 0),
  add column harvest_closed boolean not null default true,
  add column attachment text check (attachment is null or length(attachment) <= 300);

drop index procurement_one_receipt_per_harvest;
create unique index procurement_one_closing_receipt_per_harvest on procurement_receipts (harvest_id)
  where harvest_id is not null and voided_at is null and harvest_closed;

-- Tự đánh số phiếu khi để trống (riêng từng HTX, theo năm của ngày thu mua)
create or replace function procurement_auto_invoice() returns trigger language plpgsql as $$
declare yr text := to_char(new.receipt_date, 'YYYY'); n integer;
begin
  if new.invoice_no is null or length(trim(new.invoice_no)) = 0 then
    perform pg_advisory_xact_lock(hashtext('proc-invoice-' || new.cooperative_org_id::text || yr));
    select coalesce(max(substring(r.invoice_no from ('^TM-' || yr || '-([0-9]+)$'))::integer), 0) + 1 into n
      from procurement_receipts r where r.cooperative_org_id = new.cooperative_org_id and r.invoice_no ~ ('^TM-' || yr || '-[0-9]+$');
    new.invoice_no := 'TM-' || yr || '-' || lpad(n::text, 4, '0');
  end if;
  return new;
end $$;
create trigger procurement_auto_invoice_trg before insert on procurement_receipts
  for each row execute function procurement_auto_invoice();

-- Phiếu thu hoạch của hộ còn có thể thu mua: chưa có phiếu "đã mua xong"; kèm hao hụt và số đã mua (mua một phần)
create or replace function coop_household_harvests(p_coop uuid, p_household uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_ok boolean;
begin
  if not has_perm(p_coop, 'coop', 'view') then raise exception 'FORBIDDEN: Bạn không có quyền xem hộ thành viên.'; end if;
  if not exists (select 1 from cooperative_memberships where household_org_id = p_household and cooperative_org_id = p_coop and status = 'active') then
    raise exception 'NOT_MEMBER: Hộ này không thuộc HTX.';
  end if;
  v_ok := has_org_role(p_household, array['owner']::member_role[])
          or coalesce((select s.share_production from coop_data_sharing s where s.household_org_id = p_household and s.cooperative_org_id = p_coop), false);
  if not v_ok then return jsonb_build_object('shared', false, 'harvests', '[]'::jsonb); end if;
  return jsonb_build_object('shared', true, 'harvests', coalesce((
    select jsonb_agg(x order by x->>'harvested_at' desc) from (
      select jsonb_build_object('id', h.id, 'cycle_id', c.id, 'cycle_name', coalesce(nullif(c.name, ''), nullif(c.template_name, ''), 'Vụ'),
               'harvested_at', h.harvested_at, 'grade', h.grade, 'quantity', h.quantity, 'loss_quantity', coalesce(h.loss_quantity, 0), 'lot_code', h.lot_code,
               'crop_type_id', c.crop_type_id, 'crop_name', cr.name,
               'purchased_qty', coalesce((select sum(r.quantity) from procurement_receipts r where r.harvest_id = h.id and r.voided_at is null), 0)) as x
        from harvest_records h
        join production_cycles c on c.id = h.cycle_id
        join production_areas a on a.id = c.area_id and a.organization_id = p_household
        join crop_types cr on cr.id = c.crop_type_id
       where h.voided_at is null
         and not exists (select 1 from procurement_receipts r where r.harvest_id = h.id and r.voided_at is null and r.harvest_closed)
       order by h.harvested_at desc limit 200
    ) q), '[]'::jsonb));
end $$;

-- Lập phiếu từ phiếu thu hoạch (bản mới): khối lượng thực cân, ngày thu mua, mua một phần, ảnh chứng từ
create or replace function create_procurement_from_harvest(p_id uuid, p_coop uuid, p_harvest uuid, p_price bigint, p_due date, p_invoice text, p_note text,
                                                           p_qty numeric, p_close boolean, p_attachment text, p_date date)
returns procurement_receipts
language plpgsql security definer set search_path = public as $$
declare r procurement_receipts; h harvest_records; c production_cycles; v_household uuid; v_lot text; v_net numeric; v_qty numeric; v_date date; v_hday date;
begin
  select * into r from procurement_receipts where id = p_id;
  if r.id is not null then
    if r.cooperative_org_id = p_coop then return r; end if;
    raise exception 'DUPLICATE_ID: Mã phiếu đã tồn tại.';
  end if;
  if not has_perm(p_coop, 'coop', 'edit') then raise exception 'FORBIDDEN: Bạn không có quyền lập phiếu thu mua của HTX.'; end if;
  select * into h from harvest_records where id = p_harvest;
  if h.id is null or h.voided_at is not null then raise exception 'NOT_FOUND: Không tìm thấy phiếu thu hoạch (hoặc đã hủy).'; end if;
  select * into c from production_cycles where id = h.cycle_id;
  v_household := cycle_area_org(c.id);
  if not exists (select 1 from cooperative_memberships where household_org_id = v_household and cooperative_org_id = p_coop and status = 'active') then
    raise exception 'NOT_MEMBER: Phiếu thu hoạch này không thuộc hộ của HTX.';
  end if;
  if not (has_org_role(v_household, array['owner']::member_role[])
          or coalesce((select s.share_production from coop_data_sharing s where s.household_org_id = v_household and s.cooperative_org_id = p_coop), false)) then
    raise exception 'NOT_SHARED: Hộ chưa đồng ý cho HTX xem dữ liệu sản xuất.';
  end if;
  if exists (select 1 from procurement_receipts x where x.harvest_id = h.id and x.voided_at is null and x.harvest_closed) then
    raise exception 'ALREADY_PURCHASED: Phiếu thu hoạch này đã được thu mua xong.';
  end if;
  if p_price is null or p_price < 0 then raise exception 'INVALID_PRICE: Đơn giá không hợp lệ.'; end if;
  v_net := greatest(h.quantity - coalesce(h.loss_quantity, 0), 0);
  v_qty := coalesce(p_qty, v_net);
  if v_qty is null or v_qty <= 0 then raise exception 'INVALID_QTY: Khối lượng thu mua phải lớn hơn 0.'; end if;
  v_hday := (h.harvested_at at time zone 'Asia/Ho_Chi_Minh')::date;
  v_date := coalesce(p_date, v_hday);
  if v_date > vn_today() then raise exception 'INVALID_DATE: Ngày thu mua không được sau ngày hôm nay.'; end if;
  if v_date < v_hday then raise exception 'INVALID_DATE: Ngày thu mua không được trước ngày thu hoạch (%).', to_char(v_hday, 'DD/MM/YYYY'); end if;
  if p_due is not null and p_due < v_date then raise exception 'INVALID_DATE: Hạn trả tiền không được trước ngày thu mua.'; end if;
  if p_attachment is not null and p_attachment not like ('storage:' || p_coop::text || '/receipts/%') then
    raise exception 'INVALID_ATTACHMENT: Ảnh chứng từ không hợp lệ.';
  end if;
  v_lot := h.lot_code;
  insert into procurement_receipts (id, cooperative_org_id, household_org_id, cycle_id, crop_type_id, harvest_id, harvest_qty, harvest_closed, receipt_date, quantity, unit_price, amount,
                                    due_date, invoice_no, note, attachment)
    values (p_id, p_coop, v_household, c.id, c.crop_type_id, h.id, v_net, coalesce(p_close, true), v_date, v_qty, p_price, round(v_qty * p_price)::bigint,
            p_due, nullif(trim(coalesce(p_invoice, '')), ''),
            coalesce(nullif(trim(coalesce(p_note, '')), ''), case when v_lot is not null then 'Lô ' || v_lot end), p_attachment)
    returning * into r;
  return r;
end $$;

-- Bản cũ giữ lại làm lớp bọc (app cũ chưa cập nhật vẫn chạy): lấy khối lượng hộ ghi trừ hao hụt, mua xong, ngày thu hoạch
create or replace function create_procurement_from_harvest(p_id uuid, p_coop uuid, p_harvest uuid, p_price bigint, p_due date, p_invoice text, p_note text)
returns procurement_receipts
language sql security definer set search_path = public as $$
  select create_procurement_from_harvest(p_id, p_coop, p_harvest, p_price, p_due, p_invoice, p_note, null::numeric, true, null::text, null::date);
$$;

-- Đính ảnh chứng từ vào phiếu (kể cả phiếu nhập tay); chỉ HTX lập phiếu; để null là gỡ ảnh
create or replace function set_procurement_attachment(p_receipt uuid, p_attachment text) returns procurement_receipts
language plpgsql security definer set search_path = public as $$
declare r procurement_receipts;
begin
  select * into r from procurement_receipts where id = p_receipt;
  if r.id is null or not has_perm(r.cooperative_org_id, 'coop', 'edit') then raise exception 'FORBIDDEN: Bạn không có quyền sửa phiếu thu mua của HTX.'; end if;
  if r.voided_at is not null then raise exception 'VOIDED: Phiếu đã hủy.'; end if;
  if p_attachment is not null and p_attachment not like ('storage:' || r.cooperative_org_id::text || '/receipts/%') then
    raise exception 'INVALID_ATTACHMENT: Ảnh chứng từ không hợp lệ.';
  end if;
  update procurement_receipts set attachment = p_attachment where id = p_receipt returning * into r;
  return r;
end $$;

-- Sổ công nợ thu mua: thêm số hộ ghi, mã phiếu thu hoạch, ảnh chứng từ (chỉ HTX thấy ảnh)
create or replace function get_procurement_ledger(p_org uuid, p_as text, p_only_open boolean default true) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if p_as = 'coop' then
    if not has_perm(p_org, 'coop', 'view') then raise exception 'FORBIDDEN: Bạn không có quyền xem công nợ thu mua của HTX.'; end if;
  elsif p_as = 'household' then
    if not has_perm(p_org, 'sales', 'view') then raise exception 'FORBIDDEN: Bạn không có quyền xem doanh thu của hộ.'; end if;
  else raise exception 'INVALID_ARGUMENT'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by t.partner_name, t.receipt_date desc, t.created_at) from (
      select r.id as receipt_id,
             case p_as when 'coop' then r.household_org_id else r.cooperative_org_id end as partner_id,
             case p_as when 'coop' then h.name else c.name end as partner_name,
             r.receipt_date, r.due_date, r.invoice_no, r.note, r.quantity, r.unit_price, r.amount as total_amount, r.cycle_id,
             cr.name as crop_name, r.harvest_id, r.harvest_qty, case when p_as = 'coop' then r.attachment end as attachment,
             r.created_at, r.version, r.voided_at,
             coalesce(pp.paid, 0) as paid, r.amount - coalesce(pp.paid, 0) as remaining,
             case when r.voided_at is not null then 'voided'
                  when r.amount - coalesce(pp.paid, 0) <= 0 then 'paid'
                  when r.due_date is not null and r.due_date < vn_today() then 'overdue'
                  when r.due_date is not null and r.due_date <= vn_today() + 7 then 'due_soon'
                  else 'ok' end as status
        from procurement_receipts r
        join organizations h on h.id = r.household_org_id
        join organizations c on c.id = r.cooperative_org_id
        left join crop_types cr on cr.id = r.crop_type_id
        left join lateral (select sum(amount) as paid from procurement_payments x where x.receipt_id = r.id and x.voided_at is null) pp on true
       where (case p_as when 'coop' then r.cooperative_org_id else r.household_org_id end) = p_org
         and r.voided_at is null
         and (not p_only_open or r.amount - coalesce(pp.paid, 0) > 0)
    ) t), '[]'::jsonb);
end $$;

revoke execute on function coop_household_harvests(uuid, uuid), set_procurement_attachment(uuid, text), get_procurement_ledger(uuid, text, boolean),
  create_procurement_from_harvest(uuid, uuid, uuid, bigint, date, text, text, numeric, boolean, text, date),
  create_procurement_from_harvest(uuid, uuid, uuid, bigint, date, text, text) from public, anon;
grant execute on function coop_household_harvests(uuid, uuid), set_procurement_attachment(uuid, text), get_procurement_ledger(uuid, text, boolean),
  create_procurement_from_harvest(uuid, uuid, uuid, bigint, date, text, text, numeric, boolean, text, date),
  create_procurement_from_harvest(uuid, uuid, uuid, bigint, date, text, text) to authenticated;

-- Kho ảnh: thêm loại 'receipts' (ảnh chứng từ thu mua); người có quyền HTX (sửa) được ghi/xóa ảnh loại này của HTX mình
create or replace function media_org(p_name text) returns uuid
language sql immutable set search_path = public as $$
  select case when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(areas|crops|materials|licenses|overrides|receipts)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(_t)?\.jpg$'
              then split_part(p_name, '/', 1)::uuid end;
$$;
drop policy org_media_insert on storage.objects;
drop policy org_media_delete on storage.objects;
create policy org_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'org-media' and media_org(name) is not null
              and (has_org_role(media_org(name), array['owner', 'manager']::member_role[])
                   or has_perm(media_org(name), 'declare', 'edit') or has_perm(media_org(name), 'inventory', 'edit')
                   or (name like '%/receipts/%' and has_perm(media_org(name), 'coop', 'edit'))));
create policy org_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'org-media' and media_org(name) is not null
         and (has_org_role(media_org(name), array['owner', 'manager']::member_role[])
              or has_perm(media_org(name), 'declare', 'edit') or has_perm(media_org(name), 'inventory', 'edit')
              or (name like '%/receipts/%' and has_perm(media_org(name), 'coop', 'edit'))));
