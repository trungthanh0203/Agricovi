-- P1 / M2 (D98): THUỘC TÍNH VẬT TƯ + SỐ LÔ + HẠN DÙNG + TỰ GẮN LÔ THEO FIFO.
--  - Vật tư có nhóm (thức ăn, thuốc thú y, vaccine...), hoạt chất, số đăng ký, nhà sản xuất.
--  - Phiếu nhập kho có thể kèm số lô và hạn dùng (không bắt buộc) => bảng material_lots.
--  - Khi XUẤT dùng, máy chủ tự gắn lô theo "hạn gần nhất xuất trước" (không bắt nhân viên chọn). Gắn lô là nỗ lực tốt nhất:
--    không có lô nào đủ số lượng (hoặc chỉ còn lô hết hạn) thì để trống, KHÔNG chặn việc ghi của nhân viên.
--  - Nếu người dùng chỉ định rõ một lô đã hết hạn thì bắt buộc ghi lý do (cùng tinh thần cảnh báo kèm lý do của cách ly).

alter table materials
  add column material_group text check (material_group is null or material_group in
    ('feed', 'vet_drug', 'vaccine', 'pesticide', 'fertilizer', 'disinfectant', 'seed', 'other')),
  add column active_ingredient text check (active_ingredient is null or length(active_ingredient) <= 300),
  add column registration_no text check (registration_no is null or length(registration_no) <= 80),
  add column manufacturer text check (manufacturer is null or length(manufacturer) <= 200);

create table material_lots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  material_id uuid not null references materials(id) on delete cascade,
  lot_no text not null check (lot_no = trim(lot_no) and length(lot_no) between 1 and 60),
  expiry_date date,
  received_date date not null default current_date,
  created_at timestamptz not null default now()
);
create unique index material_lots_uq on material_lots (material_id, lower(lot_no));
create index on material_lots (organization_id, expiry_date);
alter table material_lots enable row level security;
create policy material_lots_read on material_lots for select to authenticated using (has_perm(organization_id, 'inventory', 'view'));
revoke insert, update, delete on material_lots from authenticated, anon; -- chỉ tạo qua trigger nhập kho

alter table inventory_transactions
  add column lot_id uuid references material_lots(id),
  add column lot_no text check (lot_no is null or (length(trim(lot_no)) between 1 and 60)),   -- thông tin nhập kèm phiếu nhập
  add column lot_expiry date,
  add constraint inv_lot_input_receipt_only check ((lot_no is null and lot_expiry is null) or txn_type = 'receipt'),
  add constraint inv_lot_expiry_needs_no check (lot_expiry is null or lot_no is not null);
create index on inventory_transactions (lot_id) where lot_id is not null;

create or replace function inventory_txn_lot() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_lot material_lots; v_mat_org uuid;
begin
  select organization_id into v_mat_org from materials where id = new.material_id;
  if v_mat_org is distinct from new.organization_id then return new; end if;   -- để inventory_txn_guard báo lỗi chuẩn

  if new.txn_type = 'receipt' and new.lot_no is not null then
    new.lot_no := trim(new.lot_no);
    select * into v_lot from material_lots where material_id = new.material_id and lower(lot_no) = lower(new.lot_no);
    if found then
      if new.lot_expiry is not null and v_lot.expiry_date is not null and new.lot_expiry <> v_lot.expiry_date then
        raise exception 'LOT_EXPIRY_MISMATCH: Lô % của vật tư này đã có hạn dùng %. Hãy kiểm tra lại số lô hoặc hạn dùng.', v_lot.lot_no, to_char(v_lot.expiry_date, 'DD/MM/YYYY');
      end if;
      if v_lot.expiry_date is null and new.lot_expiry is not null then
        update material_lots set expiry_date = new.lot_expiry where id = v_lot.id;
      end if;
    else
      insert into material_lots (organization_id, material_id, lot_no, expiry_date, received_date)
        values (new.organization_id, new.material_id, new.lot_no, new.lot_expiry, new.txn_date) returning * into v_lot;
    end if;
    new.lot_id := v_lot.id;

  elsif new.txn_type = 'issue' then
    if new.lot_id is not null then
      -- lô do người dùng chỉ định: phải đúng vật tư; lô đã hết hạn thì cần lý do
      select * into v_lot from material_lots where id = new.lot_id;
      if not found or v_lot.material_id <> new.material_id or v_lot.organization_id <> new.organization_id then
        raise exception 'INVALID_LOT: Lô này không thuộc vật tư đang xuất.';
      end if;
      if v_lot.expiry_date is not null and v_lot.expiry_date < new.txn_date
         and length(trim(coalesce(new.reason, ''))) < 3 then
        raise exception 'EXPIRED_LOT_REASON: Lô % đã hết hạn dùng từ %. Nếu vẫn cần xuất, hãy ghi lý do để có dấu vết.', v_lot.lot_no, to_char(v_lot.expiry_date, 'DD/MM/YYYY');
      end if;
    elsif exists (select 1 from material_lots where material_id = new.material_id) then
      -- tự gắn: lô còn hạn, đủ số lượng tại kho này, hạn gần nhất trước (lô không ghi hạn xếp sau)
      select l.id into new.lot_id
        from material_lots l
       where l.material_id = new.material_id
         and (l.expiry_date is null or l.expiry_date >= new.txn_date)
         and (select coalesce(sum(t.quantity_delta), 0) from inventory_transactions t
               where t.lot_id = l.id and t.location_id = new.location_id) >= -new.quantity_delta
       order by l.expiry_date nulls last, l.received_date, l.created_at
       limit 1;
    end if;
  end if;
  return new;
end $$;
create trigger inventory_txn_lot_ins before insert on inventory_transactions
  for each row execute function inventory_txn_lot();

-- Hủy nhật ký thì đảo kho: bản đảo cũng mang lô của giao dịch gốc để tồn theo lô khớp lại
create or replace function reverse_log_issues(p_log uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from activity_logs where id = p_log and voided_at is not null) then
    return;
  end if;
  insert into inventory_transactions (id, organization_id, location_id, material_id, txn_type, quantity_delta,
                                      unit_cost, txn_date, cycle_id, activity_log_id, reason, source, recorded_by, reverses_txn_id, lot_id)
  select gen_random_uuid(), t.organization_id, t.location_id, t.material_id, 'adjustment', -t.quantity_delta,
         t.unit_cost, current_date, t.cycle_id, t.activity_log_id, 'Hủy nhật ký', 'online', auth.uid(), t.id, t.lot_id
  from inventory_transactions t
  where t.activity_log_id = p_log and t.txn_type = 'issue'
    and not exists (select 1 from inventory_transactions x where x.reverses_txn_id = t.id);
end $$;
revoke execute on function reverse_log_issues(uuid) from public, anon, authenticated;

-- Lô sắp hết hạn hoặc đã hết hạn mà còn tồn (người có quyền xem Kho)
create or replace function get_lot_status(p_org uuid, p_days integer default 30)
returns table (lot_id uuid, material_id uuid, material_name text, lot_no text, expiry_date date, remaining numeric, days_left integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_perm(p_org, 'inventory', 'view') then
    raise exception 'FORBIDDEN: Bạn không có quyền xem kho.';
  end if;
  return query
    select l.id, l.material_id, m.name, l.lot_no, l.expiry_date, sum(t.quantity_delta),
           (l.expiry_date - (now() at time zone 'Asia/Ho_Chi_Minh')::date)::integer
      from material_lots l
      join materials m on m.id = l.material_id
      join inventory_transactions t on t.lot_id = l.id
     where l.organization_id = p_org and l.expiry_date is not null
       and l.expiry_date <= (now() at time zone 'Asia/Ho_Chi_Minh')::date + greatest(coalesce(p_days, 30), 0)
     group by l.id, m.name
    having sum(t.quantity_delta) > 0
     order by l.expiry_date, m.name;
end $$;
revoke execute on function get_lot_status(uuid, integer) from public, anon;
grant execute on function get_lot_status(uuid, integer) to authenticated, service_role;
