-- D96 (Đợt 1, T2 bước 2): THỜI GIAN CÁCH LY. Vật tư có "thời gian cách ly (ngày)" (materials.withdrawal_days, đã có).
-- Mỗi lần xuất dùng vật tư cho vụ, vụ bị cách ly đến ngày dùng + số ngày. Thu hoạch hoặc bán TRONG thời gian cách ly thì
-- CẢNH BÁO KÈM LÝ DO: máy chủ không chặn hẳn nhưng bắt buộc ghi lý do (withdrawal_reason) để có dấu vết.

-- Bản tóm tắt theo vụ để hiển thị và kiểm tra khi offline (máy chủ tính, app chỉ đọc)
create table cycle_withdrawal (
  cycle_id uuid primary key references production_cycles(id) on delete cascade,
  organization_id uuid not null references organizations(id),
  safe_date date not null,               -- ngày sớm nhất mà mọi lần dùng thuốc đều đã hết cách ly
  items jsonb not null default '[]',     -- [{material, used_on, days, safe_on}]
  updated_at timestamptz not null default now()
);
alter table cycle_withdrawal enable row level security;
create policy cycle_withdrawal_read on cycle_withdrawal for select to authenticated using (can_read_cycle(cycle_id));
revoke insert, update, delete on cycle_withdrawal from authenticated, anon;

-- Các lần dùng vật tư có cách ly của vụ (bỏ lần đã bị đảo do hủy nhật ký)
create or replace function cycle_withdrawal_uses(p_cycle uuid)
returns table (material text, used_on date, days integer, safe_on date)
language sql stable security definer set search_path = public as $$
  select m.name, t.txn_date, m.withdrawal_days, t.txn_date + m.withdrawal_days
    from inventory_transactions t
    join materials m on m.id = t.material_id
   where t.cycle_id = p_cycle and t.txn_type = 'issue' and coalesce(m.withdrawal_days, 0) > 0
     and not exists (select 1 from inventory_transactions x where x.reverses_txn_id = t.id)
$$;
revoke execute on function cycle_withdrawal_uses(uuid) from public, anon, authenticated;

create or replace function refresh_cycle_withdrawal(p_cycle uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_items jsonb; v_safe date;
begin
  select coalesce(jsonb_agg(jsonb_build_object('material', u.material, 'used_on', u.used_on, 'days', u.days, 'safe_on', u.safe_on) order by u.used_on, u.material), '[]'::jsonb),
         max(u.safe_on)
    into v_items, v_safe
    from (select distinct * from cycle_withdrawal_uses(p_cycle)) u;
  if v_safe is null then
    delete from cycle_withdrawal where cycle_id = p_cycle;
  else
    insert into cycle_withdrawal (cycle_id, organization_id, safe_date, items)
      values (p_cycle, cycle_owner_org(p_cycle), v_safe, v_items)
      on conflict (cycle_id) do update set safe_date = excluded.safe_date, items = excluded.items, updated_at = now();
  end if;
end $$;
revoke execute on function refresh_cycle_withdrawal(uuid) from public, anon, authenticated;

create or replace function inventory_withdrawal_refresh() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.cycle_id is not null then perform refresh_cycle_withdrawal(new.cycle_id); end if;
  return new;
end $$;
create trigger inventory_transactions_withdrawal after insert on inventory_transactions
  for each row execute function inventory_withdrawal_refresh();

-- Đổi số ngày cách ly của vật tư thì tính lại các vụ đã dùng vật tư đó
create or replace function material_withdrawal_changed() returns trigger
language plpgsql security definer set search_path = public as $$
declare c uuid;
begin
  if old.withdrawal_days is distinct from new.withdrawal_days then
    for c in select distinct cycle_id from inventory_transactions where material_id = new.id and cycle_id is not null loop
      perform refresh_cycle_withdrawal(c);
    end loop;
  end if;
  return new;
end $$;
create trigger materials_withdrawal_changed after update of withdrawal_days on materials
  for each row execute function material_withdrawal_changed();

-- Lý do thu hoạch/bán trong thời gian cách ly
alter table harvest_records add column withdrawal_reason text check (withdrawal_reason is null or length(withdrawal_reason) <= 300);
alter table sales_records add column withdrawal_reason text check (withdrawal_reason is null or length(withdrawal_reason) <= 300);

create or replace function withdrawal_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare d date; old_d date; v_list text; v_until date; v_reason text;
begin
  if coalesce(current_setting('agri.withdrawal_exempt', true), '') = '1' then return new; end if;
  if new.voided_at is not null then return new; end if;   -- hủy phiếu không bị chặn
  if tg_table_name = 'harvest_records' then
    d := (new.harvested_at at time zone 'Asia/Ho_Chi_Minh')::date;
    if tg_op = 'UPDATE' then old_d := (old.harvested_at at time zone 'Asia/Ho_Chi_Minh')::date; end if;
  else
    d := new.sold_date;
    if tg_op = 'UPDATE' then old_d := old.sold_date; end if;
  end if;
  if tg_op = 'UPDATE' and old_d is not distinct from d then return new; end if;   -- chỉ kiểm khi ghi mới hoặc đổi ngày
  select string_agg(u.material || ' (dùng ' || to_char(u.used_on, 'DD/MM') || ', ' || u.days || ' ngày)', ', ' order by u.safe_on), max(u.safe_on)
    into v_list, v_until
    from cycle_withdrawal_uses(new.cycle_id) u
   where u.used_on <= d and u.safe_on > d;
  if v_list is null then return new; end if;
  v_reason := nullif(trim(coalesce(new.withdrawal_reason, current_setting('agri.withdrawal_reason', true), '')), '');
  if v_reason is null or length(v_reason) < 3 then
    raise exception 'WITHDRAWAL_REASON: Vụ còn trong thời gian cách ly đến ngày % (%). Nếu vẫn cần ghi, hãy nhập lý do (ví dụ: đã kiểm tra dư lượng đạt) để có dấu vết.',
      to_char(v_until, 'DD/MM/YYYY'), v_list;
  end if;
  new.withdrawal_reason := v_reason;
  return new;
end $$;
create trigger harvest_records_withdrawal before insert or update of harvested_at on harvest_records
  for each row execute function withdrawal_guard();
create trigger sales_records_withdrawal before insert or update of sold_date on sales_records
  for each row execute function withdrawal_guard();

-- Bán cho khách có công nợ (record_sale) nhận thêm lý do; hàm cũ giữ nguyên để nơi khác (đơn website) gọi như trước
create or replace function record_sale(
  p_id uuid, p_org uuid, p_cycle uuid, p_date date, p_qty numeric, p_amount bigint, p_buyer_note text,
  p_partner uuid, p_invoice text, p_due date, p_paid bigint, p_method text, p_withdrawal_reason text)
returns sales_records
language plpgsql security invoker set search_path = public as $$
begin
  perform set_config('agri.withdrawal_reason', coalesce(p_withdrawal_reason, ''), true);
  return record_sale(p_id, p_org, p_cycle, p_date, p_qty, p_amount, p_buyer_note, p_partner, p_invoice, p_due, p_paid, p_method);
end $$;
revoke execute on function record_sale(uuid, uuid, uuid, date, numeric, bigint, text, uuid, text, date, bigint, text, text) from public, anon;
grant execute on function record_sale(uuid, uuid, uuid, date, numeric, bigint, text, uuid, text, date, bigint, text, text) to authenticated, service_role;

-- Ghi doanh thu từ đơn website (record_order_sale) chưa có ô nhập lý do nên chưa bị kiểm cách ly (giới hạn đã ghi ở D96)
do $$
declare d text; k text := 's := record_sale(p_sale,';
begin
  d := pg_get_functiondef('record_order_sale(uuid, uuid, uuid, uuid, date, numeric, bigint, text, uuid, text, date, bigint, text)'::regprocedure);
  if position(k in d) = 0 then raise exception 'record_order_sale: không tìm thấy đoạn cần thay'; end if;
  d := replace(d, k, 'perform set_config(''agri.withdrawal_exempt'', ''1'', true);' || chr(10) || '  ' || k);
  execute d;
end $$;
