-- Bước C, lát C0: vá kho/chi phí/thu hoạch trước khi làm màn hình (docs/PLAN_BUOC_C.md, quyết định D19–D23).
-- 1. Thu hoạch, chi phí, doanh thu: phiên bản + guard + hàm sửa có kiểm tra phiên bản (mở rộng D15/A11).
-- 2. Đơn vị thu hoạch/bán khóa kg (D21).
-- 3. Giao dịch kho: kiểm vụ/nhật ký liên kết; hủy nhật ký thì đảo kho (D23).
-- 4. Giá vốn bình quân gia quyền (D19) và hàm tổng kết vụ có kiểm quyền (thay view cycle_summary).

-- ---------------------------------------------------------------------------
-- 1. Phiên bản và guard cho thu hoạch / chi phí / doanh thu
-- ---------------------------------------------------------------------------
alter table harvest_records add column version integer not null default 1, add column last_op_id uuid;
alter table expense_records add column version integer not null default 1, add column last_op_id uuid;
alter table sales_records   add column version integer not null default 1, add column last_op_id uuid;

create trigger harvest_records_bump before update on harvest_records for each row execute function bump_version();
create trigger expense_records_bump before update on expense_records for each row execute function bump_version();
create trigger sales_records_bump before update on sales_records for each row execute function bump_version();

create or replace function harvest_update_guard() returns trigger language plpgsql as $$
begin
  if new.id <> old.id
     or new.organization_id is distinct from old.organization_id
     or new.cycle_id is distinct from old.cycle_id
     or new.created_by is distinct from old.created_by
     or new.source is distinct from old.source
     or new.received_at is distinct from old.received_at then
    raise exception 'IMMUTABLE_FIELD: Không đổi được vụ, người ghi hoặc nguồn của phiếu thu hoạch. Hãy hủy phiếu và ghi lại.';
  end if;
  if old.voided_at is not null then
    if new.voided_at is null then
      raise exception 'VOIDED: Phiếu đã hủy, không khôi phục được. Hãy ghi lại một phiếu mới.';
    end if;
    if new.quantity is distinct from old.quantity or new.loss_quantity is distinct from old.loss_quantity
       or new.grade is distinct from old.grade or new.harvested_at is distinct from old.harvested_at
       or new.note is distinct from old.note then
      raise exception 'VOIDED: Phiếu đã hủy, không sửa nội dung được.';
    end if;
  end if;
  return new;
end $$;
create trigger harvest_records_guard before update on harvest_records for each row execute function harvest_update_guard();

create or replace function expense_update_guard() returns trigger language plpgsql as $$
begin
  if new.id <> old.id
     or new.organization_id is distinct from old.organization_id
     or new.cycle_id is distinct from old.cycle_id
     or new.source_txn_id is distinct from old.source_txn_id
     or new.created_by is distinct from old.created_by
     or new.source is distinct from old.source
     or new.received_at is distinct from old.received_at then
    raise exception 'IMMUTABLE_FIELD: Không đổi được vụ, người ghi hoặc nguồn của khoản chi. Hãy hủy khoản chi và ghi lại.';
  end if;
  if old.voided_at is not null then
    if new.voided_at is null then
      raise exception 'VOIDED: Khoản chi đã hủy, không khôi phục được. Hãy ghi lại một khoản mới.';
    end if;
    if new.amount is distinct from old.amount or new.category is distinct from old.category
       or new.kind is distinct from old.kind or new.expense_date is distinct from old.expense_date
       or new.note is distinct from old.note then
      raise exception 'VOIDED: Khoản chi đã hủy, không sửa nội dung được.';
    end if;
  end if;
  return new;
end $$;
create trigger expense_records_guard before update on expense_records for each row execute function expense_update_guard();

create or replace function sales_update_guard() returns trigger language plpgsql as $$
begin
  if new.id <> old.id
     or new.organization_id is distinct from old.organization_id
     or new.cycle_id is distinct from old.cycle_id
     or new.created_by is distinct from old.created_by
     or new.source is distinct from old.source
     or new.received_at is distinct from old.received_at then
    raise exception 'IMMUTABLE_FIELD: Không đổi được vụ, người ghi hoặc nguồn của khoản bán. Hãy hủy khoản bán và ghi lại.';
  end if;
  if old.voided_at is not null then
    if new.voided_at is null then
      raise exception 'VOIDED: Khoản bán đã hủy, không khôi phục được. Hãy ghi lại một khoản mới.';
    end if;
    if new.quantity is distinct from old.quantity or new.amount is distinct from old.amount
       or new.sold_date is distinct from old.sold_date or new.buyer_note is distinct from old.buyer_note then
      raise exception 'VOIDED: Khoản bán đã hủy, không sửa nội dung được.';
    end if;
  end if;
  return new;
end $$;
create trigger sales_records_guard before update on sales_records for each row execute function sales_update_guard();

-- D20: người ghi thu hoạch sửa/hủy phiếu CỦA MÌNH trong 24 giờ; chủ/quản lý sửa mọi phiếu theo harvest_update
create policy harvest_update_own on harvest_records for update to authenticated
  using (created_by = auth.uid() and received_at > now() - interval '24 hours' and can_log_cycle(cycle_id))
  with check (created_by = auth.uid());

-- D21: đơn vị khóa kg; hao hụt không vượt số lượng thu
alter table harvest_records
  add constraint harvest_unit_kg check (unit = 'kg'),
  add constraint harvest_loss_le_qty check (loss_quantity is null or loss_quantity <= quantity);
alter table sales_records add constraint sales_unit_kg check (unit = 'kg');

-- ---------------------------------------------------------------------------
-- Hàm sửa có kiểm tra phiên bản (security INVOKER: RLS của người gọi vẫn có hiệu lực)
-- ---------------------------------------------------------------------------
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

create or replace function update_expense(p_id uuid, p_expected_version integer, p_op_id uuid, p_changes jsonb)
returns expense_records
language plpgsql security invoker set search_path = public as $$
declare r expense_records; cur expense_records;
begin
  update expense_records set
    category     = case when p_changes ? 'category'     then (p_changes->>'category')::expense_category else category end,
    kind         = case when p_changes ? 'kind'         then (p_changes->>'kind')::expense_kind else kind end,
    amount       = case when p_changes ? 'amount'       then (p_changes->>'amount')::bigint else amount end,
    expense_date = case when p_changes ? 'expense_date' then (p_changes->>'expense_date')::date else expense_date end,
    note         = case when p_changes ? 'note'         then nullif(p_changes->>'note', '') else note end,
    voided_at    = case when p_changes ? 'voided_at'    then (p_changes->>'voided_at')::timestamptz else voided_at end,
    void_reason  = case when p_changes ? 'void_reason'  then p_changes->>'void_reason' else void_reason end,
    last_op_id   = p_op_id
  where id = p_id and version = p_expected_version
  returning * into r;
  if r.id is not null then return r; end if;

  select * into cur from expense_records where id = p_id;
  if cur.id is null then
    raise exception 'NOT_FOUND: Không tìm thấy khoản chi hoặc bạn không có quyền xem.';
  end if;
  if p_op_id is not null and cur.last_op_id = p_op_id then
    return cur;
  end if;
  if cur.version <> p_expected_version then
    raise exception 'CONFLICT: Khoản chi đã được người khác thay đổi (phiên bản máy chủ %, bạn đang sửa phiên bản %).', cur.version, p_expected_version;
  end if;
  raise exception 'FORBIDDEN: Bạn không có quyền sửa khoản chi này (chỉ chủ và vai trò Kho & chi phí).';
end $$;

create or replace function update_sale(p_id uuid, p_expected_version integer, p_op_id uuid, p_changes jsonb)
returns sales_records
language plpgsql security invoker set search_path = public as $$
declare r sales_records; cur sales_records;
begin
  update sales_records set
    sold_date   = case when p_changes ? 'sold_date'   then (p_changes->>'sold_date')::date else sold_date end,
    quantity    = case when p_changes ? 'quantity'    then (p_changes->>'quantity')::numeric else quantity end,
    amount      = case when p_changes ? 'amount'      then (p_changes->>'amount')::bigint else amount end,
    buyer_note  = case when p_changes ? 'buyer_note'  then nullif(p_changes->>'buyer_note', '') else buyer_note end,
    voided_at   = case when p_changes ? 'voided_at'   then (p_changes->>'voided_at')::timestamptz else voided_at end,
    void_reason = case when p_changes ? 'void_reason' then p_changes->>'void_reason' else void_reason end,
    last_op_id  = p_op_id
  where id = p_id and version = p_expected_version
  returning * into r;
  if r.id is not null then return r; end if;

  select * into cur from sales_records where id = p_id;
  if cur.id is null then
    raise exception 'NOT_FOUND: Không tìm thấy khoản bán hoặc bạn không có quyền xem.';
  end if;
  if p_op_id is not null and cur.last_op_id = p_op_id then
    return cur;
  end if;
  if cur.version <> p_expected_version then
    raise exception 'CONFLICT: Khoản bán đã được người khác thay đổi (phiên bản máy chủ %, bạn đang sửa phiên bản %).', cur.version, p_expected_version;
  end if;
  raise exception 'FORBIDDEN: Bạn không có quyền sửa khoản bán này (chỉ chủ và vai trò Kho & chi phí).';
end $$;

revoke execute on function update_harvest(uuid, integer, uuid, jsonb), update_expense(uuid, integer, uuid, jsonb),
  update_sale(uuid, integer, uuid, jsonb) from public, anon;
grant execute on function update_harvest(uuid, integer, uuid, jsonb), update_expense(uuid, integer, uuid, jsonb),
  update_sale(uuid, integer, uuid, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Giao dịch kho: kiểm vụ/nhật ký liên kết, đảo kho khi hủy nhật ký
-- ---------------------------------------------------------------------------
alter table inventory_transactions
  add column reverses_txn_id uuid references inventory_transactions(id),
  add constraint inv_reverses_is_adjustment check (reverses_txn_id is null or txn_type = 'adjustment');
-- mỗi giao dịch xuất chỉ bị đảo tối đa một lần
create unique index inv_txn_reversed_once on inventory_transactions (reverses_txn_id) where reverses_txn_id is not null;
create index on inventory_transactions (activity_log_id) where activity_log_id is not null;

create or replace function inventory_txn_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare loc_org uuid; mat_org uuid; log_cycle uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    raise exception 'INVENTORY_IMMUTABLE: Giao dịch kho không được sửa/xóa. Hãy tạo giao dịch điều chỉnh có lý do.';
  end if;
  select organization_id into loc_org from inventory_locations where id = new.location_id;
  select organization_id into mat_org from materials where id = new.material_id;
  if loc_org is distinct from new.organization_id or mat_org is distinct from new.organization_id then
    raise exception 'Kho và vật tư phải thuộc cùng tổ chức với giao dịch';
  end if;
  -- Giao dịch kho thuộc tổ chức sở hữu kho; cycle_id chỉ là liên kết nghiệp vụ nên phải là vụ của chính tổ chức đó
  -- (vụ của tổ chức, hoặc vụ ghi theo HTX trên khu trồng của tổ chức) để không lọt chi phí sang tổ chức khác.
  if new.activity_log_id is not null then
    select cycle_id into log_cycle from activity_logs where id = new.activity_log_id;
    if new.cycle_id is null then
      new.cycle_id := log_cycle;
    elsif log_cycle is distinct from new.cycle_id then
      raise exception 'Nhật ký và giao dịch kho phải thuộc cùng một vụ';
    end if;
  end if;
  if new.cycle_id is not null
     and cycle_owner_org(new.cycle_id) is distinct from new.organization_id
     and cycle_area_org(new.cycle_id) is distinct from new.organization_id then
    raise exception 'Vụ liên kết với giao dịch kho không thuộc tổ chức này';
  end if;
  return new;
end $$;

-- Đảo kho: với mỗi giao dịch xuất của nhật ký đã hủy mà chưa bị đảo, thêm một giao dịch điều chỉnh ngược dấu.
-- Hàm nội bộ (chỉ trigger gọi), tự kiểm nhật ký đã hủy nên không lạm dụng được.
create or replace function reverse_log_issues(p_log uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from activity_logs where id = p_log and voided_at is not null) then
    return;
  end if;
  insert into inventory_transactions (id, organization_id, location_id, material_id, txn_type, quantity_delta,
                                      unit_cost, txn_date, cycle_id, activity_log_id, reason, source, recorded_by, reverses_txn_id)
  select gen_random_uuid(), t.organization_id, t.location_id, t.material_id, 'adjustment', -t.quantity_delta,
         t.unit_cost, current_date, t.cycle_id, t.activity_log_id, 'Hủy nhật ký', 'online', auth.uid(), t.id
  from inventory_transactions t
  where t.activity_log_id = p_log and t.txn_type = 'issue'
    and not exists (select 1 from inventory_transactions x where x.reverses_txn_id = t.id);
end $$;
revoke execute on function reverse_log_issues(uuid) from public, anon, authenticated;

create or replace function activity_log_voided_reverse() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.voided_at is null and new.voided_at is not null then
    perform reverse_log_issues(new.id);
  end if;
  return new;
end $$;
create trigger activity_logs_reverse_issues after update of voided_at on activity_logs
  for each row execute function activity_log_voided_reverse();

-- Giao dịch xuất đến muộn (đồng bộ offline) khi nhật ký đã bị hủy: đảo ngay
create or replace function inventory_issue_late_reverse() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.txn_type = 'issue' and new.activity_log_id is not null then
    perform reverse_log_issues(new.activity_log_id);
  end if;
  return new;
end $$;
create trigger inventory_issue_late_reverse after insert on inventory_transactions
  for each row execute function inventory_issue_late_reverse();

-- ---------------------------------------------------------------------------
-- 4. Giá vốn bình quân gia quyền (D19) và tổng kết vụ
-- ---------------------------------------------------------------------------
-- Mỗi giao dịch xuất (chưa bị đảo): đơn giá = đơn giá ghi trên giao dịch, nếu không có thì bình quân gia quyền của các
-- lần nhập CÓ GIÁ tới ngày xuất. Không có giá nào => cost_known = false (không tự bịa số, v1.1 mục 4.4).
create view inventory_issue_costs with (security_invoker = true) as
select t.id as txn_id, t.organization_id, t.material_id, t.cycle_id, t.activity_log_id, t.txn_date,
       -t.quantity_delta as quantity,
       coalesce(t.unit_cost, a.avg_cost) as unit_cost_used,
       coalesce(t.unit_cost, a.avg_cost) is not null as cost_known,
       (t.unit_cost is null and a.avg_cost is not null) as cost_from_average,
       round(-t.quantity_delta * coalesce(t.unit_cost, a.avg_cost))::bigint as cost
from inventory_transactions t
left join lateral (
  select sum(r.quantity_delta * r.unit_cost) / nullif(sum(r.quantity_delta), 0) as avg_cost
  from inventory_transactions r
  where r.organization_id = t.organization_id and r.material_id = t.material_id
    and r.txn_type = 'receipt' and r.unit_cost is not null and r.txn_date <= t.txn_date
) a on true
where t.txn_type = 'issue'
  and not exists (select 1 from inventory_transactions x where x.reverses_txn_id = t.id);

-- View cũ trả số 0 cho người không có quyền đọc chi phí => dễ hiểu nhầm. Thay bằng hàm kiểm quyền.
drop view cycle_summary;

create or replace function get_cycle_summary(p_cycle uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_owner uuid; v_status cycle_status;
  v_cash_nonmat bigint; v_cash_mat bigint; v_mat_manual bigint; v_alloc bigint;
  v_mat_cost bigint; v_miss integer; v_avg integer;
  v_gross numeric; v_loss numeric; v_net numeric; v_sold numeric; v_rev bigint;
  v_total bigint; v_cps numeric;
begin
  select owner_org_id, status into v_owner, v_status from production_cycles where id = p_cycle;
  if v_owner is null or not has_org_role(v_owner, array['owner','manager','inventory_finance','cooperative_manager']::member_role[]) then
    raise exception 'FORBIDDEN: Bạn không có quyền xem tổng kết chi phí của vụ này.';
  end if;

  select coalesce(sum(amount) filter (where kind = 'cash_paid' and category <> 'material'), 0),
         coalesce(sum(amount) filter (where kind = 'cash_paid' and category = 'material'), 0),
         coalesce(sum(amount) filter (where kind = 'material_used'), 0),
         coalesce(sum(amount) filter (where kind in ('allocated', 'estimated')), 0)
    into v_cash_nonmat, v_cash_mat, v_mat_manual, v_alloc
    from expense_records where cycle_id = p_cycle and voided_at is null;

  select coalesce(sum(cost) filter (where cost_known), 0),
         count(*) filter (where not cost_known)::integer,
         count(*) filter (where cost_from_average)::integer
    into v_mat_cost, v_miss, v_avg
    from inventory_issue_costs where cycle_id = p_cycle;

  select coalesce(sum(quantity), 0), coalesce(sum(coalesce(loss_quantity, 0)), 0)
    into v_gross, v_loss from harvest_records where cycle_id = p_cycle and voided_at is null;
  v_net := v_gross - v_loss;

  select coalesce(sum(quantity), 0), coalesce(sum(amount), 0)
    into v_sold, v_rev from sales_records where cycle_id = p_cycle and voided_at is null;

  v_total := v_cash_nonmat + v_mat_cost + v_mat_manual + v_alloc;
  v_cps := case when v_net > 0 and v_miss = 0 then round(v_total::numeric / v_net) end;

  return jsonb_build_object(
    'cycle_id', p_cycle,
    'status', v_status,
    'updated_at', now(),
    'cash_paid_other', v_cash_nonmat,          -- thực chi không phải vật tư
    'cash_paid_material', v_cash_mat,          -- tiền mua vật tư (chỉ hiển thị, không cộng: đã tính khi xuất dùng)
    'material_used_cost', v_mat_cost,          -- giá vốn vật tư đã dùng trong vụ
    'material_used_manual', v_mat_manual,      -- chi phí vật tư ghi tay
    'allocated_or_estimated', v_alloc,
    'total_cost', v_total,
    'harvested_gross_qty', v_gross,
    'harvest_loss_qty', v_loss,
    'harvested_net_qty', v_net,
    'sold_qty', v_sold,
    'revenue_recorded', v_rev,
    'cost_per_kg', v_cps,                      -- null nếu chưa đủ dữ liệu
    'issues_missing_cost', v_miss,
    'issues_cost_from_average', v_avg,
    'has_estimated_cost', v_alloc > 0,
    'missing_harvest', v_gross = 0,
    'missing_revenue', v_rev = 0 and v_sold = 0
  );
end $$;
revoke execute on function get_cycle_summary(uuid) from public, anon;
grant execute on function get_cycle_summary(uuid) to authenticated, service_role;
