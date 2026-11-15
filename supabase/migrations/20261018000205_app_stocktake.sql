-- Kiểm kho (D168): ĐỢT KIỂM KÊ một kho. Không đụng vào cách ghi kho hiện có: kiểm kê KHÔNG sửa tồn trực tiếp,
-- khi chốt mới sinh các giao dịch 'adjustment' (đường điều chỉnh sẵn có) để số tồn khớp số đếm. Giao dịch kho vẫn chỉ thêm, không sửa/xóa.
--   * Mở đợt: chụp số tồn sổ sách của từng vật tư (và từng lô nếu có lô) tại kho đó. Mỗi kho chỉ có một đợt nháp tại một thời điểm.
--   * Đếm: nhập số đếm thực tế cho từng dòng (bỏ trống = chưa đếm, không điều chỉnh). Lưu nháp được nhiều lần; mỗi dòng có phiên bản,
--     hai người sửa cùng một dòng thì người sau nhận CONFLICT (không ghi đè âm thầm).
--   * Chốt: so số đếm với tồn HIỆN TẠI (giữa lúc mở và lúc chốt có thể có xuất nhập), lệch thì thêm giao dịch điều chỉnh có lý do "Kiểm kê".
--     Dòng lệch quá ngưỡng (mặc định 20%) bắt buộc có ghi chú. Chốt một lần, sau đó đợt bất biến; hủy đợt nháp cần lý do.
--   * Đếm mù (blind): khi bật, màn đếm không nhận số sổ sách cho tới khi chốt (chỉ để người đếm khỏi đoán theo; không phải lớp bảo mật).
-- Quyền: mọi thao tác ghi cần quyền sửa mục Kho (has_perm 'inventory' 'edit'); xem cần quyền xem Kho.

create table stocktakes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  location_id uuid not null references inventory_locations(id),
  status text not null default 'draft' check (status in ('draft', 'done', 'cancelled')),
  blind boolean not null default false,
  tolerance_pct numeric not null default 20 check (tolerance_pct between 1 and 100),
  note text check (note is null or length(note) <= 300),
  created_by uuid references auth.users(id) default auth.uid(),
  created_by_name text,
  created_at timestamptz not null default now(),
  finished_by uuid references auth.users(id),
  finished_by_name text,
  finished_at timestamptz,
  cancel_reason text,
  check (status <> 'cancelled' or length(trim(coalesce(cancel_reason, ''))) >= 3)
);
create unique index stocktakes_one_draft on stocktakes (location_id) where status = 'draft';
create index on stocktakes (organization_id, created_at desc);
alter table stocktakes enable row level security;
create policy stocktakes_read on stocktakes for select to authenticated using (has_perm(organization_id, 'inventory', 'view'));
revoke insert, update, delete on stocktakes from authenticated, anon;

create table stocktake_lines (
  id uuid primary key default gen_random_uuid(),
  stocktake_id uuid not null references stocktakes(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  material_id uuid not null references materials(id),
  lot_id uuid references material_lots(id),
  book_qty numeric not null,                 -- tồn sổ sách lúc mở đợt
  counted_qty numeric check (counted_qty is null or counted_qty >= 0),
  counted_by uuid references auth.users(id),
  counted_at timestamptz,
  note text check (note is null or length(note) <= 300),
  version integer not null default 1,
  book_at_finish numeric,                    -- tồn sổ sách lúc chốt (cơ sở để tính lệch)
  adjust_qty numeric,                        -- lượng điều chỉnh đã ghi (dương = tăng); null nếu không lệch hoặc chưa đếm
  adjust_txn_id uuid references inventory_transactions(id),
  unit_cost_est numeric                      -- đơn giá nhập bình quân để ước giá trị lệch (null nếu chưa biết giá)
);
create unique index stocktake_lines_uq on stocktake_lines (stocktake_id, material_id, coalesce(lot_id, '00000000-0000-0000-0000-000000000000'::uuid));
alter table stocktake_lines enable row level security;
revoke all on stocktake_lines from authenticated, anon;   -- chỉ đọc qua get_stocktake (để đếm mù không lộ số sổ sách), chỉ ghi qua hàm

-- tên người thao tác để lưu trên biên bản
create or replace function stocktake_actor(p_org uuid) returns text
language sql stable security definer set search_path = public as $$
  select author_display_name(auth.uid(), p_org, null)
$$;
revoke execute on function stocktake_actor(uuid) from public, anon, authenticated;

-- Mở đợt kiểm kê một kho
create or replace function start_stocktake(p_location uuid, p_blind boolean default false, p_tolerance numeric default 20, p_note text default null)
returns stocktakes language plpgsql security definer set search_path = public as $$
declare v_org uuid; r stocktakes;
begin
  select organization_id into v_org from inventory_locations where id = p_location;
  if v_org is null or not has_perm(v_org, 'inventory', 'edit') then raise exception 'FORBIDDEN: Chỉ người có quyền sửa Kho mới mở đợt kiểm kê.'; end if;
  if coalesce(p_tolerance, 20) < 1 or coalesce(p_tolerance, 20) > 100 then raise exception 'INVALID_ARGUMENT: Ngưỡng lệch phải từ 1 đến 100 phần trăm.'; end if;
  if exists (select 1 from stocktakes where location_id = p_location and status = 'draft') then
    raise exception 'STOCKTAKE_OPEN: Kho này đang có một đợt kiểm kê chưa chốt. Hãy chốt hoặc hủy đợt đó trước.';
  end if;
  insert into stocktakes (organization_id, location_id, blind, tolerance_pct, note, created_by_name)
    values (v_org, p_location, coalesce(p_blind, false), coalesce(p_tolerance, 20), nullif(trim(coalesce(p_note, '')), ''), stocktake_actor(v_org))
    returning * into r;
  -- chụp tồn: mỗi (vật tư, lô) còn số dư khác 0, và dòng "không gắn lô" của mọi vật tư đang dùng đã có giao dịch tại kho này
  insert into stocktake_lines (stocktake_id, organization_id, material_id, lot_id, book_qty)
    select r.id, v_org, g.material_id, g.lot_id, g.qty
      from (select t.material_id, t.lot_id, sum(t.quantity_delta) qty
              from inventory_transactions t join materials m on m.id = t.material_id and m.is_active
             where t.location_id = p_location
             group by t.material_id, t.lot_id) g
     where g.qty <> 0 or g.lot_id is null;
  return r;
end $$;

-- Thêm một vật tư chưa có trong kho vào đợt (sổ sách 0), ví dụ phát hiện hàng không ghi nhập
create or replace function add_stocktake_line(p_stocktake uuid, p_material uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare s stocktakes; v_id uuid;
begin
  select * into s from stocktakes where id = p_stocktake;
  if s.id is null or not has_perm(s.organization_id, 'inventory', 'edit') then raise exception 'FORBIDDEN: Bạn không có quyền với đợt kiểm kê này.'; end if;
  if s.status <> 'draft' then raise exception 'STOCKTAKE_CLOSED: Đợt kiểm kê này đã chốt hoặc đã hủy.'; end if;
  if not exists (select 1 from materials where id = p_material and organization_id = s.organization_id and is_active) then
    raise exception 'INVALID_ARGUMENT: Vật tư không hợp lệ.';
  end if;
  insert into stocktake_lines (stocktake_id, organization_id, material_id, lot_id, book_qty)
    values (p_stocktake, s.organization_id, p_material, null,
            coalesce((select sum(t.quantity_delta) from inventory_transactions t where t.location_id = s.location_id and t.material_id = p_material and t.lot_id is null), 0))
    on conflict do nothing
    returning id into v_id;
  return v_id;
end $$;

-- Lưu số đếm nhiều dòng một lần. p_lines: [{"id": uuid, "version": n, "counted": số|null, "note": "..."}]. Lệch phiên bản dòng nào => CONFLICT cả lô (tải lại).
create or replace function set_stocktake_counts(p_stocktake uuid, p_lines jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare s stocktakes; e jsonb; ln stocktake_lines; n integer := 0; c numeric;
begin
  select * into s from stocktakes where id = p_stocktake;
  if s.id is null or not has_perm(s.organization_id, 'inventory', 'edit') then raise exception 'FORBIDDEN: Bạn không có quyền với đợt kiểm kê này.'; end if;
  if s.status <> 'draft' then raise exception 'STOCKTAKE_CLOSED: Đợt kiểm kê này đã chốt hoặc đã hủy.'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then raise exception 'INVALID_ARGUMENT: Dữ liệu đếm không hợp lệ.'; end if;
  for e in select * from jsonb_array_elements(p_lines) loop
    select * into ln from stocktake_lines where id = (e->>'id')::uuid and stocktake_id = p_stocktake for update;
    if ln.id is null then raise exception 'NOT_FOUND: Không tìm thấy dòng kiểm kê. Hãy tải lại.'; end if;
    if coalesce((e->>'version')::integer, -1) <> ln.version then
      raise exception 'CONFLICT: Có người vừa sửa số đếm của một vật tư. Hãy tải lại bản mới rồi đếm tiếp.';
    end if;
    c := case when e->>'counted' is null or e->>'counted' = '' then null else (e->>'counted')::numeric end;
    if c is not null and c < 0 then raise exception 'INVALID_QUANTITY: Số đếm không được âm.'; end if;
    update stocktake_lines set counted_qty = c, counted_by = case when c is null then null else auth.uid() end,
           counted_at = case when c is null then null else now() end,
           note = nullif(trim(coalesce(e->>'note', '')), ''), version = version + 1
     where id = ln.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Chốt đợt: sinh giao dịch điều chỉnh cho dòng đã đếm mà lệch so với tồn hiện tại
create or replace function finish_stocktake(p_stocktake uuid) returns stocktakes
language plpgsql security definer set search_path = public as $$
declare s stocktakes; ln record; cur numeric; diff numeric; txn uuid; cost numeric; today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
        need text := ''; cnt integer := 0; r stocktakes;
begin
  select * into s from stocktakes where id = p_stocktake for update;
  if s.id is null or not has_perm(s.organization_id, 'inventory', 'edit') then raise exception 'FORBIDDEN: Bạn không có quyền với đợt kiểm kê này.'; end if;
  if s.status <> 'draft' then raise exception 'STOCKTAKE_CLOSED: Đợt kiểm kê này đã chốt hoặc đã hủy.'; end if;
  if not exists (select 1 from stocktake_lines where stocktake_id = s.id and counted_qty is not null) then
    raise exception 'NOTHING_COUNTED: Chưa đếm vật tư nào. Hãy nhập số đếm ít nhất một dòng, hoặc hủy đợt.';
  end if;
  -- kiểm trước: dòng lệch quá ngưỡng phải có ghi chú
  for ln in select l.*, m.name mname from stocktake_lines l join materials m on m.id = l.material_id where l.stocktake_id = s.id and l.counted_qty is not null loop
    select coalesce(sum(t.quantity_delta), 0) into cur from inventory_transactions t
     where t.location_id = s.location_id and t.material_id = ln.material_id and t.lot_id is not distinct from ln.lot_id;
    diff := ln.counted_qty - cur;
    if diff <> 0 and abs(diff) * 100 > s.tolerance_pct * greatest(abs(cur), 1) and length(trim(coalesce(ln.note, ''))) < 3 then
      cnt := cnt + 1; if cnt <= 3 then need := need || case when need = '' then '' else ', ' end || ln.mname; end if;
    end if;
  end loop;
  if cnt > 0 then
    raise exception 'NOTE_REQUIRED: % vật tư lệch quá % phần trăm cần ghi chú lý do (ví dụ: %). Hãy ghi chú rồi chốt lại.', cnt, s.tolerance_pct, need;
  end if;
  for ln in select * from stocktake_lines where stocktake_id = s.id and counted_qty is not null loop
    select coalesce(sum(t.quantity_delta), 0) into cur from inventory_transactions t
     where t.location_id = s.location_id and t.material_id = ln.material_id and t.lot_id is not distinct from ln.lot_id;
    diff := ln.counted_qty - cur;
    select sum(t.quantity_delta * t.unit_cost) / nullif(sum(t.quantity_delta), 0) into cost
      from inventory_transactions t where t.material_id = ln.material_id and t.txn_type = 'receipt' and t.unit_cost is not null;
    txn := null;
    if diff <> 0 then
      txn := gen_random_uuid();
      insert into inventory_transactions (id, organization_id, location_id, material_id, txn_type, quantity_delta, txn_date, reason, source, recorded_by, lot_id)
        values (txn, s.organization_id, s.location_id, ln.material_id, 'adjustment', diff, today,
                'Kiểm kê ' || to_char(s.created_at at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY') || case when ln.note is not null then ': ' || ln.note else '' end,
                'online', auth.uid(), ln.lot_id);
    end if;
    update stocktake_lines set book_at_finish = cur, adjust_qty = case when diff = 0 then null else diff end, adjust_txn_id = txn, unit_cost_est = cost
     where id = ln.id;
  end loop;
  update stocktakes set status = 'done', finished_by = auth.uid(), finished_by_name = stocktake_actor(s.organization_id), finished_at = now()
   where id = s.id returning * into r;
  return r;
end $$;

create or replace function cancel_stocktake(p_stocktake uuid, p_reason text) returns stocktakes
language plpgsql security definer set search_path = public as $$
declare s stocktakes; r stocktakes;
begin
  select * into s from stocktakes where id = p_stocktake for update;
  if s.id is null or not has_perm(s.organization_id, 'inventory', 'edit') then raise exception 'FORBIDDEN: Bạn không có quyền với đợt kiểm kê này.'; end if;
  if s.status <> 'draft' then raise exception 'STOCKTAKE_CLOSED: Đợt kiểm kê này đã chốt hoặc đã hủy.'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'REASON_REQUIRED: Hãy ghi lý do hủy (ít nhất 3 ký tự).'; end if;
  update stocktakes set status = 'cancelled', cancel_reason = trim(p_reason) where id = s.id returning * into r;
  return r;
end $$;

-- Đọc một đợt (đầu đợt + các dòng). Đếm mù và đang nháp thì không trả số sổ sách.
create or replace function get_stocktake(p_stocktake uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s stocktakes; hide boolean;
begin
  select * into s from stocktakes where id = p_stocktake;
  if s.id is null or not has_perm(s.organization_id, 'inventory', 'view') then raise exception 'NOT_FOUND: Không tìm thấy đợt kiểm kê hoặc bạn không có quyền xem.'; end if;
  hide := s.blind and s.status = 'draft';
  return jsonb_build_object(
    'stocktake', to_jsonb(s),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'version', l.version, 'material_id', l.material_id, 'material_name', m.name, 'unit', u.name,
        'lot_id', l.lot_id, 'lot_no', ml.lot_no, 'expiry_date', ml.expiry_date,
        'book_qty', case when hide then null else l.book_qty end,
        'counted_qty', l.counted_qty, 'note', l.note, 'counted_at', l.counted_at,
        'book_at_finish', l.book_at_finish, 'adjust_qty', l.adjust_qty, 'unit_cost_est', l.unit_cost_est)
        order by m.name, ml.expiry_date nulls last, ml.lot_no nulls first)
      from stocktake_lines l join materials m on m.id = l.material_id join units_of_measure u on u.id = m.base_unit_id
      left join material_lots ml on ml.id = l.lot_id where l.stocktake_id = s.id), '[]'::jsonb));
end $$;

revoke execute on function start_stocktake(uuid, boolean, numeric, text), add_stocktake_line(uuid, uuid), set_stocktake_counts(uuid, jsonb),
  finish_stocktake(uuid), cancel_stocktake(uuid, text), get_stocktake(uuid) from public, anon;
grant execute on function start_stocktake(uuid, boolean, numeric, text), add_stocktake_line(uuid, uuid), set_stocktake_counts(uuid, jsonb),
  finish_stocktake(uuid), cancel_stocktake(uuid, text), get_stocktake(uuid) to authenticated, service_role;
