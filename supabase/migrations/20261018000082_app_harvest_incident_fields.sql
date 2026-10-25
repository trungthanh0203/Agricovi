-- P1 / M3 (D98): THU HOẠCH / XUẤT BÁN và SỰ CỐ có thêm thông tin. Tách PHẦN CHUNG và PHẦN RIÊNG:
--   CHUNG (mọi loại hình dùng được, không bắt buộc): mã lô thu hoạch tự sinh, số đơn vị (quả/con) cạnh số kg, nguyên nhân sự cố,
--     loại sự cố "thiết bị / nhà màng / chuồng".
--   RIÊNG (chỉ hiện và chỉ có tác dụng khi dùng): dữ liệu thu hoạch theo form động `extra` (Brix, phân loại với dưa; thẻ tai, giấy kiểm dịch
--     với heo... do GÓI TRƯỜNG quyết định, không cài cứng ở đây); sự cố "kim tiêm gãy" (vật nuôi) và quy tắc: còn sự cố kim gãy chưa xử lý
--     thì thu/bán vụ đó phải ghi lý do. Vụ không có sự cố kim gãy thì quy tắc này không bao giờ chạy.

-- 1. Thu hoạch / xuất ---------------------------------------------------------------------------
alter table harvest_records
  add column lot_seq integer,
  add column lot_code text,
  add column unit_count integer check (unit_count is null or unit_count > 0),
  add column extra jsonb not null default '{}'::jsonb
    check (jsonb_typeof(extra) = 'object' and pg_column_size(extra) <= 4000);
create unique index harvest_records_lot_uq on harvest_records (cycle_id, lot_seq) where lot_seq is not null;

-- Mã lô = mã vụ (hoặc VU-xxxxxx nếu vụ chưa đặt mã) + "/L" + số thứ tự; tự sinh, không đổi sau đó
create or replace function harvest_lot_code() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_base text;
begin
  if tg_op = 'UPDATE' then
    if new.lot_seq is distinct from old.lot_seq or new.lot_code is distinct from old.lot_code then
      raise exception 'IMMUTABLE_FIELD: Mã lô thu hoạch do hệ thống tạo, không sửa được.';
    end if;
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('harvest_lot:' || new.cycle_id::text));
  select coalesce(c.code, 'VU-' || upper(substr(replace(c.id::text, '-', ''), 1, 6))) into v_base from production_cycles c where c.id = new.cycle_id;
  select coalesce(max(h.lot_seq), 0) + 1 into new.lot_seq from harvest_records h where h.cycle_id = new.cycle_id;
  new.lot_code := v_base || '/L' || lpad(new.lot_seq::text, 2, '0');
  return new;
end $$;
create trigger harvest_records_lot_ins before insert on harvest_records for each row execute function harvest_lot_code();
create trigger harvest_records_lot_upd before update on harvest_records for each row execute function harvest_lot_code();

-- Sửa phiếu có thêm số đơn vị và dữ liệu form động
create or replace function update_harvest(p_id uuid, p_expected_version integer, p_op_id uuid, p_changes jsonb)
returns harvest_records
language plpgsql security invoker set search_path = public as $$
declare r harvest_records; cur harvest_records;
begin
  update harvest_records set
    harvested_at  = case when p_changes ? 'harvested_at'  then (p_changes->>'harvested_at')::timestamptz else harvested_at end,
    grade         = case when p_changes ? 'grade'         then nullif(p_changes->>'grade', '') else grade end,
    quantity      = case when p_changes ? 'quantity'      then (p_changes->>'quantity')::numeric else quantity end,
    loss_quantity = case when p_changes ? 'loss_quantity' then (p_changes->>'loss_quantity')::numeric else loss_quantity end,
    unit_count    = case when p_changes ? 'unit_count'    then nullif(p_changes->>'unit_count', '')::integer else unit_count end,
    extra         = case when p_changes ? 'extra'         then coalesce(p_changes->'extra', '{}'::jsonb) else extra end,
    note          = case when p_changes ? 'note'          then nullif(p_changes->>'note', '') else note end,
    voided_at     = case when p_changes ? 'voided_at'     then (p_changes->>'voided_at')::timestamptz else voided_at end,
    void_reason   = case when p_changes ? 'void_reason'   then p_changes->>'void_reason' else void_reason end,
    last_op_id    = p_op_id
  where id = p_id and version = p_expected_version
  returning * into r;
  if r.id is not null then return r; end if;

  select * into cur from harvest_records where id = p_id;
  if cur.id is null then
    raise exception 'NOT_FOUND: Không tìm thấy phiếu thu hoạch hoặc bạn không có quyền xem.';
  end if;
  if p_op_id is not null and cur.last_op_id = p_op_id then
    return cur;  -- lần gửi lặp của một thay đổi đã được áp dụng
  end if;
  if cur.version <> p_expected_version then
    raise exception 'CONFLICT: Phiếu thu hoạch đã được người khác thay đổi (phiên bản máy chủ %, bạn đang sửa phiên bản %).', cur.version, p_expected_version;
  end if;
  raise exception 'FORBIDDEN: Bạn không có quyền sửa phiếu này (chỉ chủ/quản lý, hoặc người ghi trong 24 giờ đầu).';
end $$;
revoke execute on function update_harvest(uuid, integer, uuid, jsonb) from public, anon;
grant execute on function update_harvest(uuid, integer, uuid, jsonb) to authenticated, service_role;

-- 2. Sự cố ----------------------------------------------------------------------------------------
alter table cycle_incidents drop constraint cycle_incidents_kind_check;
alter table cycle_incidents
  add constraint cycle_incidents_kind_check check (kind in ('pest', 'loss', 'weather', 'complaint', 'other', 'equipment', 'broken_needle')),
  add column cause text check (cause is null or length(cause) <= 300);

drop function report_incident(uuid, uuid, text, date, uuid, text, text, numeric, numeric, text);
create or replace function report_incident(
  p_id uuid, p_cycle uuid, p_kind text, p_date date, p_stage uuid, p_severity text, p_desc text,
  p_loss_qty numeric default null, p_loss_amount numeric default null, p_image text default null, p_cause text default null)
returns cycle_incidents
language plpgsql security definer set search_path = public as $$
declare r cycle_incidents; v_desc text := nullif(trim(p_desc), ''); v_cause text := nullif(trim(coalesce(p_cause, '')), '');
begin
  select * into r from cycle_incidents where id = p_id;
  if r.id is not null then
    if r.cycle_id = p_cycle and can_read_cycle(p_cycle) then return r; end if;
    raise exception 'FORBIDDEN: Bạn không có quyền với sự cố này.';
  end if;
  if not exists (select 1 from production_cycles where id = p_cycle) or not can_log_cycle(p_cycle) then
    raise exception 'FORBIDDEN: Bạn không có quyền báo sự cố cho vụ này.';
  end if;
  if p_kind not in ('pest', 'loss', 'weather', 'complaint', 'other', 'equipment', 'broken_needle') then raise exception 'INVALID_KIND: Hãy chọn loại sự cố.'; end if;
  if p_severity not in ('low', 'medium', 'high') then raise exception 'INVALID_SEVERITY: Hãy chọn mức độ.'; end if;
  if v_desc is null then raise exception 'INVALID_DESC: Hãy mô tả ngắn sự cố.'; end if;
  if length(v_desc) > 1000 then raise exception 'INVALID_DESC: Mô tả tối đa 1000 ký tự.'; end if;
  if v_cause is not null and length(v_cause) > 300 then raise exception 'INVALID_CAUSE: Nguyên nhân tối đa 300 ký tự.'; end if;
  if p_date is null or p_date > (now() at time zone 'Asia/Ho_Chi_Minh')::date + 1 then
    raise exception 'INVALID_DATE: Ngày xảy ra không được ở tương lai.';
  end if;
  if coalesce(p_loss_qty, 0) < 0 or coalesce(p_loss_amount, 0) < 0 then
    raise exception 'INVALID_AMOUNT: Thiệt hại không được âm.';
  end if;
  if p_stage is not null and not exists (select 1 from production_stages where id = p_stage and cycle_id = p_cycle) then
    raise exception 'INVALID_STAGE: Giai đoạn không thuộc vụ này.';
  end if;
  insert into cycle_incidents (id, cycle_id, kind, incident_date, stage_id, severity, description, loss_quantity, loss_amount, image, cause)
    values (p_id, p_cycle, p_kind, p_date, p_stage, p_severity, v_desc, p_loss_qty, p_loss_amount, nullif(p_image, ''), v_cause)
    returning * into r;
  return r;
end $$;
revoke execute on function report_incident(uuid, uuid, text, date, uuid, text, text, numeric, numeric, text, text) from public, anon;
grant execute on function report_incident(uuid, uuid, text, date, uuid, text, text, numeric, numeric, text, text) to authenticated, service_role;

-- Sửa sự cố: thêm cột nguyên nhân (đổi đúng một dòng của hàm cũ)
do $$
declare d text; k text := 'kind          = case when p_changes ? ''kind'' then p_changes->>''kind'' else kind end,';
begin
  d := pg_get_functiondef('update_incident(uuid, integer, jsonb)'::regprocedure);
  if position(k in d) = 0 then raise exception 'update_incident: không tìm thấy đoạn cần thay'; end if;
  d := replace(d, k, k || chr(10) || '    cause         = case when p_changes ? ''cause'' then nullif(trim(p_changes->>''cause''), '''') else cause end,');
  execute d;
end $$;

-- 3. Quy tắc kim gãy (RIÊNG cho vật nuôi): còn sự cố kim gãy chưa xử lý thì thu/bán phải ghi lý do ------------------
-- Dùng chung cột và cách nhập lý do của cách ly (withdrawal_reason) nên giao diện chỉ cần một ô lý do.
create or replace function needle_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_reason text;
begin
  if coalesce(current_setting('agri.withdrawal_exempt', true), '') = '1' then return new; end if;
  if new.voided_at is not null then return new; end if;
  if tg_op = 'UPDATE' and old.voided_at is null then return new; end if;   -- chỉ kiểm khi ghi mới
  if not exists (select 1 from cycle_incidents i where i.cycle_id = new.cycle_id and i.kind = 'broken_needle'
                    and i.status = 'open' and i.voided_at is null) then
    return new;
  end if;
  v_reason := nullif(trim(coalesce(new.withdrawal_reason, current_setting('agri.withdrawal_reason', true), '')), '');
  if v_reason is null or length(v_reason) < 3 then
    raise exception 'NEEDLE_REASON: Vụ còn sự cố kim tiêm gãy chưa xử lý xong. Nếu vẫn cần thu hoặc bán, hãy nhập lý do (ví dụ: đã tìm thấy và xử lý con heo bị gãy kim) để có dấu vết.';
  end if;
  new.withdrawal_reason := v_reason;
  return new;
end $$;
create trigger harvest_records_needle before insert on harvest_records for each row execute function needle_guard();
create trigger sales_records_needle before insert on sales_records for each row execute function needle_guard();
