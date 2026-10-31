-- D150: hoàn thiện phiếu thu mua: (1) lập phiếu thẳng từ phiếu thu hoạch của hộ (mỗi phiếu thu hoạch chỉ thu mua một lần);
-- (2) báo cáo thu mua theo hộ/sản phẩm/tháng cho HTX và cho hộ, nằm trong "Báo cáo theo nhu cầu".

alter table procurement_receipts add column harvest_id uuid references harvest_records(id);
create unique index procurement_one_receipt_per_harvest on procurement_receipts (harvest_id) where harvest_id is not null and voided_at is null;

-- Phiếu thu hoạch của hộ chưa được HTX thu mua (hộ đã cho xem sản xuất, hoặc hộ do HTX làm chủ)
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
               'harvested_at', h.harvested_at, 'grade', h.grade, 'quantity', h.quantity, 'lot_code', h.lot_code,
               'crop_type_id', c.crop_type_id, 'crop_name', cr.name) as x
        from harvest_records h
        join production_cycles c on c.id = h.cycle_id
        join production_areas a on a.id = c.area_id and a.organization_id = p_household
        join crop_types cr on cr.id = c.crop_type_id
       where h.voided_at is null
         and not exists (select 1 from procurement_receipts r where r.harvest_id = h.id and r.voided_at is null)
       order by h.harvested_at desc limit 200
    ) q), '[]'::jsonb));
end $$;

create or replace function create_procurement_from_harvest(p_id uuid, p_coop uuid, p_harvest uuid, p_price bigint, p_due date, p_invoice text, p_note text)
returns procurement_receipts
language plpgsql security definer set search_path = public as $$
declare r procurement_receipts; h harvest_records; c production_cycles; v_household uuid; v_lot text;
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
  if exists (select 1 from procurement_receipts x where x.harvest_id = h.id and x.voided_at is null) then
    raise exception 'ALREADY_PURCHASED: Phiếu thu hoạch này đã được lập phiếu thu mua.';
  end if;
  if p_price is null or p_price < 0 then raise exception 'INVALID_PRICE: Đơn giá không hợp lệ.'; end if;
  if (h.harvested_at at time zone 'Asia/Ho_Chi_Minh')::date > vn_today() then raise exception 'INVALID_DATE: Ngày thu hoạch chưa tới.'; end if;
  if p_due is not null and p_due < (h.harvested_at at time zone 'Asia/Ho_Chi_Minh')::date then raise exception 'INVALID_DATE: Hạn trả tiền không được trước ngày thu mua.'; end if;
  v_lot := h.lot_code;
  insert into procurement_receipts (id, cooperative_org_id, household_org_id, cycle_id, crop_type_id, harvest_id, receipt_date, quantity, unit_price, amount, due_date, invoice_no, note)
    values (p_id, p_coop, v_household, c.id, c.crop_type_id, h.id, (h.harvested_at at time zone 'Asia/Ho_Chi_Minh')::date, h.quantity, p_price,
            round(h.quantity * p_price)::bigint, p_due, nullif(trim(coalesce(p_invoice, '')), ''),
            coalesce(nullif(trim(coalesce(p_note, '')), ''), case when v_lot is not null then 'Lô ' || v_lot end))
    returning * into r;
  return r;
end $$;

-- Báo cáo thu mua: HTX (theo hộ) hoặc hộ (theo HTX); gom theo hộ/HTX, sản phẩm hoặc tháng. Cùng dạng kết quả với run_report.
create or replace function get_procurement_report(p_org uuid, p_from date, p_to date, p_group text default 'partner') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_type org_type; v_rows jsonb; v_title text; v_label text;
begin
  select type into v_type from organizations where id = p_org;
  if v_type = 'cooperative' then
    if not has_perm(p_org, 'coop', 'view') then raise exception 'FORBIDDEN: Bạn không có quyền xem báo cáo thu mua.'; end if;
  elsif v_type = 'household' then
    if not has_perm(p_org, 'sales', 'view') then raise exception 'FORBIDDEN: Bạn không có quyền xem doanh thu của hộ.'; end if;
  else raise exception 'INVALID_ORG'; end if;
  if p_to < p_from then raise exception 'INVALID_DATE: Ngày kết thúc không thể trước ngày bắt đầu.'; end if;
  if p_to - p_from > 800 then raise exception 'INVALID_DATE: Khoảng thời gian tối đa khoảng 2 năm.'; end if;
  v_title := case when v_type = 'cooperative' then 'Thu mua từ hộ thành viên' else 'Bán cho hợp tác xã' end;
  v_label := case when v_type = 'cooperative' then 'Hộ' else 'Hợp tác xã' end;
  select coalesce(jsonb_agg(jsonb_build_object('label', g, 'receipts', n, 'qty', q, 'amount', a, 'paid', pd, 'remaining', a - pd) order by g), '[]'::jsonb) into v_rows from (
    select case p_group when 'crop' then coalesce(cr.name, 'Không rõ sản phẩm') when 'month' then to_char(r.receipt_date, 'YYYY-MM')
                        else case when v_type = 'cooperative' then h.name else c.name end end as g,
           count(*) as n, sum(r.quantity) as q, sum(r.amount) as a,
           sum(coalesce((select sum(x.amount) from procurement_payments x where x.receipt_id = r.id and x.voided_at is null), 0)) as pd
      from procurement_receipts r
      join organizations h on h.id = r.household_org_id
      join organizations c on c.id = r.cooperative_org_id
      left join crop_types cr on cr.id = r.crop_type_id
     where (case when v_type = 'cooperative' then r.cooperative_org_id else r.household_org_id end) = p_org
       and r.voided_at is null and r.receipt_date between p_from and p_to
     group by 1) x;
  return jsonb_build_object('type', 'procurement', 'title', v_title, 'from', p_from, 'to', p_to, 'group', p_group,
    'columns', jsonb_build_array(
      jsonb_build_object('key', 'label', 'label', case p_group when 'crop' then 'Sản phẩm' when 'month' then 'Tháng' else v_label end, 'kind', 'text'),
      jsonb_build_object('key', 'receipts', 'label', 'Số phiếu', 'kind', 'int', 'sum', true),
      jsonb_build_object('key', 'qty', 'label', 'Khối lượng (kg)', 'kind', 'num', 'sum', true),
      jsonb_build_object('key', 'amount', 'label', 'Thành tiền', 'kind', 'money', 'sum', true),
      jsonb_build_object('key', 'paid', 'label', case when v_type = 'cooperative' then 'Đã trả' else 'Đã nhận' end, 'kind', 'money', 'sum', true),
      jsonb_build_object('key', 'remaining', 'label', case when v_type = 'cooperative' then 'Còn phải trả' else 'Còn phải thu' end, 'kind', 'money', 'sum', true)),
    'rows', v_rows, 'generated_at', now());
end $$;

alter table saved_reports drop constraint saved_reports_report_type_check;
alter table saved_reports add constraint saved_reports_report_type_check
  check (report_type in ('expenses', 'sales', 'harvest', 'stock', 'labor', 'cycles', 'purchases', 'customers', 'procurement'));

revoke execute on function coop_household_harvests(uuid, uuid), create_procurement_from_harvest(uuid, uuid, uuid, bigint, date, text, text),
  get_procurement_report(uuid, date, date, text) from public, anon;
grant execute on function coop_household_harvests(uuid, uuid), create_procurement_from_harvest(uuid, uuid, uuid, bigint, date, text, text),
  get_procurement_report(uuid, date, date, text) to authenticated;
