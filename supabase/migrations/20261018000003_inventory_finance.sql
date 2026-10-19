-- Vật tư, kho, chi phí, bán hàng. Tham chiếu: v1.1 mục 4.4, 4.5, 6.4; FR-INV-001…008.
-- Nguyên tắc: tồn kho chỉ thay đổi bằng giao dịch (bản ghi chỉ thêm). Không ghi đè số dư.

create table units_of_measure (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade, -- null = đơn vị dùng chung
  code text not null,
  name text not null,
  created_at timestamptz not null default now()
);
create unique index units_code_global on units_of_measure (code) where organization_id is null;
create unique index units_code_org on units_of_measure (organization_id, code) where organization_id is not null;

insert into units_of_measure (code, name) values
  ('kg', 'Kilogam'), ('g', 'Gam'), ('l', 'Lít'), ('ml', 'Mililit'),
  ('bag', 'Bao'), ('bottle', 'Chai'), ('pack', 'Gói'), ('piece', 'Cái'), ('tree', 'Cây');

create table materials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  category text,
  base_unit_id uuid not null references units_of_measure(id),
  reorder_threshold numeric check (reorder_threshold is null or reorder_threshold >= 0), -- cảnh báo nếu đã cấu hình
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);
create trigger materials_updated before update on materials for each row execute function set_updated_at();

-- Quy đổi đơn vị CHỈ dùng khi đã xác nhận (v1.1 mục 4.4)
create table unit_conversions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  material_id uuid references materials(id) on delete cascade,
  from_unit_id uuid not null references units_of_measure(id),
  to_unit_id uuid not null references units_of_measure(id),
  factor numeric not null check (factor > 0),
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id),
  check (from_unit_id <> to_unit_id)
);

create table inventory_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create type inventory_txn_type as enum ('receipt', 'issue', 'adjustment');

-- Giao dịch kho: id do thiết bị tạo => đồng bộ lặp không nhân đôi (idempotent, v1.1 mục 8.3).
-- quantity_delta có dấu: nhập > 0, xuất < 0, điều chỉnh khác 0. Không UPDATE/DELETE được (không có policy + trigger chặn).
create table inventory_transactions (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  location_id uuid not null references inventory_locations(id),
  material_id uuid not null references materials(id),
  txn_type inventory_txn_type not null,
  quantity_delta numeric not null,
  unit_cost bigint check (unit_cost is null or unit_cost >= 0), -- VND / đơn vị cơ sở; null = chưa biết giá vốn
  txn_date date not null,
  cycle_id uuid references production_cycles(id),
  activity_log_id uuid references activity_logs(id),
  reason text,
  source record_source not null default 'online',
  recorded_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  received_at timestamptz not null default now(),
  check ((txn_type = 'receipt' and quantity_delta > 0)
      or (txn_type = 'issue' and quantity_delta < 0)
      or (txn_type = 'adjustment' and quantity_delta <> 0)),
  check (txn_type <> 'adjustment' or (reason is not null and length(trim(reason)) > 0)) -- điều chỉnh phải có lý do
);
create index on inventory_transactions (organization_id, material_id, txn_date);
create index on inventory_transactions (cycle_id);

create or replace function inventory_txn_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare loc_org uuid; mat_org uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    raise exception 'INVENTORY_IMMUTABLE: Giao dịch kho không được sửa/xóa. Hãy tạo giao dịch điều chỉnh có lý do.';
  end if;
  select organization_id into loc_org from inventory_locations where id = new.location_id;
  select organization_id into mat_org from materials where id = new.material_id;
  if loc_org is distinct from new.organization_id or mat_org is distinct from new.organization_id then
    raise exception 'Kho và vật tư phải thuộc cùng tổ chức với giao dịch';
  end if;
  -- Giao dịch kho luôn thuộc tổ chức sở hữu kho; cycle_id (nếu có) chỉ là liên kết nghiệp vụ.
  return new;
end $$;
create trigger inventory_txn_guard_ins before insert on inventory_transactions
  for each row execute function inventory_txn_guard();
create trigger inventory_txn_guard_mod before update or delete on inventory_transactions
  for each row execute function inventory_txn_guard();

-- Số dư = tổng giao dịch. Tồn âm KHÔNG bị chặn mà được báo (v1.1 mục 4.4).
create view inventory_balances with (security_invoker = true) as
select t.organization_id, t.location_id, t.material_id, m.name as material_name,
       sum(t.quantity_delta) as balance,
       sum(t.quantity_delta) < 0 as is_negative,
       count(*) filter (where t.unit_cost is null and t.txn_type = 'receipt') as receipts_missing_cost
from inventory_transactions t join materials m on m.id = t.material_id
group by t.organization_id, t.location_id, t.material_id, m.name;

-- ---------------------------------------------------------------------------
-- Chi phí và bán hàng
-- ---------------------------------------------------------------------------
create type expense_category as enum ('material', 'labor', 'utility', 'rent', 'depreciation', 'other');
-- Phân biệt tiền thực chi / chi phí vật tư dùng trong vụ / phân bổ-ước tính (v1.1 mục 4.5)
create type expense_kind as enum ('cash_paid', 'material_used', 'allocated', 'estimated');

create table expense_records (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  cycle_id uuid references production_cycles(id),
  category expense_category not null,
  kind expense_kind not null default 'cash_paid',
  amount bigint not null check (amount >= 0), -- VND
  expense_date date not null,
  note text,
  source_txn_id uuid references inventory_transactions(id),
  source record_source not null default 'online',
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  received_at timestamptz not null default now(),
  voided_at timestamptz,
  void_reason text,
  check (voided_at is null or void_reason is not null),
  check (kind not in ('allocated', 'estimated') or note is not null) -- ước tính/phân bổ phải ghi giả định
);
create index on expense_records (organization_id, expense_date);
create index on expense_records (cycle_id);
create trigger expense_records_org before insert or update of cycle_id on expense_records
  for each row execute function sync_org_from_cycle();

create table sales_records (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  cycle_id uuid not null references production_cycles(id),
  sold_date date not null,
  quantity numeric not null check (quantity > 0),
  unit text not null default 'kg',
  amount bigint not null check (amount >= 0),
  buyer_note text,
  source record_source not null default 'online',
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  received_at timestamptz not null default now(),
  voided_at timestamptz,
  void_reason text,
  check (voided_at is null or void_reason is not null)
);
create index on sales_records (cycle_id);
create trigger sales_records_org before insert or update of cycle_id on sales_records
  for each row execute function sync_org_from_cycle();

-- Tổng kết vụ: nêu rõ dữ liệu còn thiếu, không gọi là "lợi nhuận chính xác" (v1.1 mục 4.5)
create view cycle_summary with (security_invoker = true) as
select c.id as cycle_id, c.owner_org_id, c.status,
       coalesce((select sum(amount) from expense_records e
                  where e.cycle_id = c.id and e.voided_at is null and e.kind = 'cash_paid'), 0)      as cash_paid,
       coalesce((select sum(amount) from expense_records e
                  where e.cycle_id = c.id and e.voided_at is null and e.kind = 'material_used'), 0)  as material_used,
       coalesce((select sum(amount) from expense_records e
                  where e.cycle_id = c.id and e.voided_at is null and e.kind in ('allocated','estimated')), 0) as allocated_or_estimated,
       coalesce((select sum(quantity - coalesce(loss_quantity, 0)) from harvest_records h
                  where h.cycle_id = c.id and h.voided_at is null), 0) as harvested_net_qty,
       coalesce((select sum(quantity) from sales_records s
                  where s.cycle_id = c.id and s.voided_at is null), 0) as sold_qty,
       coalesce((select sum(amount) from sales_records s
                  where s.cycle_id = c.id and s.voided_at is null), 0) as revenue_recorded,
       (select count(*) from inventory_transactions t
         where t.cycle_id = c.id and t.txn_type = 'issue' and t.unit_cost is null) as issues_missing_cost,
       not exists (select 1 from harvest_records h where h.cycle_id = c.id and h.voided_at is null) as missing_harvest,
       not exists (select 1 from sales_records s where s.cycle_id = c.id and s.voided_at is null) as missing_revenue
from production_cycles c;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table units_of_measure enable row level security;
alter table materials enable row level security;
alter table unit_conversions enable row level security;
alter table inventory_locations enable row level security;
alter table inventory_transactions enable row level security;
alter table expense_records enable row level security;
alter table sales_records enable row level security;

create policy units_read on units_of_measure for select to authenticated
  using (organization_id is null or is_org_member(organization_id));
create policy units_write on units_of_measure for all to authenticated
  using (organization_id is not null and has_org_role(organization_id, array['owner','manager','inventory_finance']::member_role[]))
  with check (organization_id is not null and has_org_role(organization_id, array['owner','manager','inventory_finance']::member_role[]));
create policy units_admin on units_of_measure for all to authenticated
  using (organization_id is null and is_platform_admin()) with check (organization_id is null and is_platform_admin());

create policy materials_read on materials for select to authenticated using (is_org_member(organization_id));
create policy materials_write on materials for all to authenticated
  using (has_org_role(organization_id, array['owner','manager','inventory_finance']::member_role[]))
  with check (has_org_role(organization_id, array['owner','manager','inventory_finance']::member_role[]));

create policy conv_read on unit_conversions for select to authenticated using (is_org_member(organization_id));
create policy conv_write on unit_conversions for all to authenticated
  using (has_org_role(organization_id, array['owner','manager','inventory_finance']::member_role[]))
  with check (has_org_role(organization_id, array['owner','manager','inventory_finance']::member_role[]));

create policy locations_read on inventory_locations for select to authenticated using (is_org_member(organization_id));
create policy locations_write on inventory_locations for all to authenticated
  using (has_org_role(organization_id, array['owner','manager','inventory_finance']::member_role[]))
  with check (has_org_role(organization_id, array['owner','manager','inventory_finance']::member_role[]));

-- Kho và chi phí nhạy cảm: nhân viên sản xuất (worker) chỉ GHI xuất dùng, không đọc giá vốn/chi phí.
create policy inv_txn_read on inventory_transactions for select to authenticated
  using (has_org_role(organization_id, array['owner','manager','inventory_finance']::member_role[]));
create policy inv_txn_insert on inventory_transactions for insert to authenticated
  with check (
    has_org_role(organization_id, array['owner','manager','inventory_finance']::member_role[])
    or (txn_type = 'issue' and has_org_role(organization_id, array['worker']::member_role[])));
-- không có policy update/delete (trigger cũng chặn)

create policy expense_read on expense_records for select to authenticated
  using (has_org_role(organization_id, array['owner','manager','inventory_finance','cooperative_manager']::member_role[]));
create policy expense_insert on expense_records for insert to authenticated
  with check (has_org_role(organization_id, array['owner','manager','inventory_finance']::member_role[]));
create policy expense_update on expense_records for update to authenticated
  using (has_org_role(organization_id, array['owner','manager','inventory_finance']::member_role[]))
  with check (has_org_role(organization_id, array['owner','manager','inventory_finance']::member_role[]));

create policy sales_read on sales_records for select to authenticated
  using (has_org_role(organization_id, array['owner','manager','inventory_finance','cooperative_manager']::member_role[]));
create policy sales_insert on sales_records for insert to authenticated
  with check (has_org_role(organization_id, array['owner','manager','inventory_finance']::member_role[]));
create policy sales_update on sales_records for update to authenticated
  using (has_org_role(organization_id, array['owner','manager','inventory_finance']::member_role[]))
  with check (has_org_role(organization_id, array['owner','manager','inventory_finance']::member_role[]));
