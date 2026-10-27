-- Cân mẫu và cám đã dùng NHẬP RIÊNG cho vụ (vật nuôi, thủy sản), không bắt buộc đi qua Ghi việc hay Kho.
-- Bản ghi chỉ thêm; sai thì hủy kèm lý do (không sửa đè, không xóa). get_cycle_growth gộp các bản ghi này với việc "Cân heo" và cám từ Ghi việc/Kho.

create table cycle_weighings (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references production_cycles(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  weigh_date date not null,
  head_count integer check (head_count is null or head_count > 0),
  avg_kg numeric not null check (avg_kg > 0 and avg_kg < 5000),
  note text check (note is null or length(note) <= 300),
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  void_reason text
);
create index on cycle_weighings (cycle_id);

create table cycle_feed_entries (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references production_cycles(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  feed_date date not null,
  kg numeric not null check (kg > 0 and kg < 1000000),
  feed_name text check (feed_name is null or length(feed_name) <= 120),
  note text check (note is null or length(note) <= 300),
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  void_reason text
);
create index on cycle_feed_entries (cycle_id);

alter table cycle_weighings enable row level security;
alter table cycle_feed_entries enable row level security;
create policy cycle_weighings_read on cycle_weighings for select to authenticated using (can_read_cycle(cycle_id));
create policy cycle_feed_read on cycle_feed_entries for select to authenticated using (can_read_cycle(cycle_id));
grant select on cycle_weighings, cycle_feed_entries to authenticated;
revoke insert, update, delete on cycle_weighings, cycle_feed_entries from authenticated, anon;

create function add_cycle_weighing(p_cycle uuid, p_date date, p_heads integer, p_avg numeric, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not can_log_cycle(p_cycle) then raise exception 'FORBIDDEN: Bạn không có quyền ghi cho vụ này.'; end if;
  if p_date is null or p_date > current_date + 1 then raise exception 'INVALID_DATE: Ngày cân không được ở tương lai.'; end if;
  if p_avg is null or p_avg <= 0 then raise exception 'INVALID_QTY: Cân nặng trung bình phải lớn hơn 0.'; end if;
  insert into cycle_weighings (cycle_id, organization_id, weigh_date, head_count, avg_kg, note)
    values (p_cycle, cycle_owner_org(p_cycle), p_date, p_heads, p_avg, nullif(trim(coalesce(p_note, '')), '')) returning id into v_id;
  return v_id;
end $$;

create function add_cycle_feed(p_cycle uuid, p_date date, p_kg numeric, p_name text default null, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not can_log_cycle(p_cycle) then raise exception 'FORBIDDEN: Bạn không có quyền ghi cho vụ này.'; end if;
  if p_date is null or p_date > current_date + 1 then raise exception 'INVALID_DATE: Ngày cho ăn không được ở tương lai.'; end if;
  if p_kg is null or p_kg <= 0 then raise exception 'INVALID_QTY: Lượng cám phải lớn hơn 0.'; end if;
  insert into cycle_feed_entries (cycle_id, organization_id, feed_date, kg, feed_name, note)
    values (p_cycle, cycle_owner_org(p_cycle), p_date, p_kg, nullif(trim(coalesce(p_name, '')), ''), nullif(trim(coalesce(p_note, '')), '')) returning id into v_id;
  return v_id;
end $$;

-- Hủy một lần cân ('weighing') hoặc một lần nhập cám ('feed'): người ghi hoặc chủ/quản lý của vụ, bắt buộc có lý do
create function void_cycle_measure(p_kind text, p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_cycle uuid; v_by uuid;
begin
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'REASON_REQUIRED: Hủy cần ghi lý do (ít nhất 3 ký tự).'; end if;
  if p_kind = 'weighing' then select cycle_id, created_by into v_cycle, v_by from cycle_weighings where id = p_id and voided_at is null;
  elsif p_kind = 'feed' then select cycle_id, created_by into v_cycle, v_by from cycle_feed_entries where id = p_id and voided_at is null;
  else raise exception 'INVALID_KIND: Loại bản ghi không hợp lệ.'; end if;
  if v_cycle is null then raise exception 'NOT_FOUND: Không tìm thấy bản ghi hoặc đã hủy.'; end if;
  if not (can_manage_cycle(v_cycle) or (v_by = auth.uid() and can_log_cycle(v_cycle))) then
    raise exception 'FORBIDDEN: Chỉ người ghi hoặc chủ/quản lý được hủy.';
  end if;
  if p_kind = 'weighing' then update cycle_weighings set voided_at = now(), void_reason = trim(p_reason) where id = p_id;
  else update cycle_feed_entries set voided_at = now(), void_reason = trim(p_reason) where id = p_id; end if;
end $$;
revoke execute on function add_cycle_weighing(uuid, date, integer, numeric, text), add_cycle_feed(uuid, date, numeric, text, text), void_cycle_measure(text, uuid, text) from public, anon;
grant execute on function add_cycle_weighing(uuid, date, integer, numeric, text), add_cycle_feed(uuid, date, numeric, text, text), void_cycle_measure(text, uuid, text) to authenticated, service_role;

-- get_cycle_growth gộp thêm cân mẫu và cám nhập riêng (và trả danh sách để hiện/hủy)
create or replace function get_cycle_growth(p_cycle uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_org uuid; v_weigh jsonb; v_stock jsonb; v_logs jsonb; v_manual jsonb; v_can boolean; v_other boolean := false;
begin
  select owner_org_id into v_org from production_cycles where id = p_cycle;
  if v_org is null or not can_read_cycle(p_cycle) then raise exception 'NOT_FOUND: Không tìm thấy vụ hoặc bạn không có quyền xem.'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('date', x.d, 'pigs', x.pigs, 'avg_kg', x.avg, 'id', x.id, 'manual', x.manual) order by x.d, x.ts), '[]'::jsonb) into v_weigh
    from (
      select (l.performed_at at time zone 'Asia/Ho_Chi_Minh')::date d, l.performed_at ts,
             case when l.data->>'pigs' ~ '^[0-9]+(\.[0-9]+)?$' then (l.data->>'pigs')::numeric end pigs,
             case when l.data->>'avg_kg' ~ '^[0-9]+(\.[0-9]+)?$' then (l.data->>'avg_kg')::numeric end avg,
             null::uuid id, false manual
        from activity_logs l join work_types w on w.id = l.work_type_id
       where l.cycle_id = p_cycle and l.voided_at is null and w.name ilike 'cân heo%'
      union all
      select m.weigh_date, m.created_at, m.head_count::numeric, m.avg_kg, m.id, true
        from cycle_weighings m where m.cycle_id = p_cycle and m.voided_at is null
    ) x
   where x.avg is not null and x.avg > 0;

  select coalesce(jsonb_agg(jsonb_build_object('date', y.d, 'kg', y.kg) order by y.d), '[]'::jsonb) into v_logs
    from (select u.d, sum(u.kg) kg from (
            select (l.performed_at at time zone 'Asia/Ho_Chi_Minh')::date d, (l.data->>'feed_kg')::numeric kg
              from activity_logs l
             where l.cycle_id = p_cycle and l.voided_at is null and l.data->>'feed_kg' ~ '^[0-9]+(\.[0-9]+)?$'
            union all
            select f.feed_date, f.kg from cycle_feed_entries f where f.cycle_id = p_cycle and f.voided_at is null
          ) u group by u.d) y;

  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'date', f.feed_date, 'kg', f.kg, 'name', f.feed_name) order by f.feed_date, f.created_at), '[]'::jsonb) into v_manual
    from cycle_feed_entries f where f.cycle_id = p_cycle and f.voided_at is null;

  v_can := has_perm(v_org, 'inventory', 'view');
  if v_can then
    select coalesce(jsonb_agg(jsonb_build_object('date', z.d, 'kg', z.kg) order by z.d), '[]'::jsonb), coalesce(bool_or(z.unknown), false) into v_stock, v_other
      from (select t.txn_date d, sum(case when f.factor is null then 0 else -t.quantity_delta * f.factor end) kg, bool_or(f.factor is null) unknown
              from inventory_transactions t
              join materials m on m.id = t.material_id and m.material_group = 'feed'
              join units_of_measure u on u.id = m.base_unit_id
              cross join lateral (select case u.code when 'kg' then 1::numeric when 'g' then 0.001 when 'ton' then 1000::numeric end as factor) f
             where t.cycle_id = p_cycle and t.txn_type = 'issue'
               and not exists (select 1 from inventory_transactions x where x.reverses_txn_id = t.id)
             group by t.txn_date) z;
  else
    v_stock := '[]'::jsonb;
  end if;

  return jsonb_build_object('weighings', v_weigh, 'feed', jsonb_build_object('can_view', v_can, 'stock_by_date', v_stock, 'other_unit', v_other, 'logs_by_date', v_logs, 'manual_entries', v_manual));
end $$;
