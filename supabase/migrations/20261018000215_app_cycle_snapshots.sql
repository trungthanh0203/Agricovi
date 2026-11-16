-- D178: BẢN CHỤP SỐ LIỆU VỤ ĐÃ KẾT THÚC + DANH SÁCH VỤ THEO KHU (phân trang).
-- Vụ đã kết thúc rất ít thay đổi nên số tổng kết của nó chỉ tính MỘT LẦN rồi lưu (cycle_stat_snapshots.summary = kết quả get_cycle_summary).
-- Bản chụp bị đánh dấu "cần tính lại" (dirty) khi có ghi chép ảnh hưởng đến vụ (chi phí, thu hoạch, bán, xuất/nhập kho gắn vụ, chấm công, số lượng, khoản khoán, sản lượng khoán),
-- khi sửa vụ, khi nhập kho đầu vào có ngày trước ngày kết thúc (giá bình quân đổi), khi kỳ lương đổi trạng thái; ngoài ra mỗi bản chụp hết hạn sau 1 ngày.
-- Vụ chuyển khỏi trạng thái kết thúc thì xóa bản chụp. Bảng không cấp quyền trực tiếp; chỉ đọc qua hàm có kiểm quyền "Tổng kết vụ".
-- get_area_rollup dùng bản chụp cho vụ kết thúc (thêm tham số p_refresh = tính lại); get_area_cycles trả danh sách vụ của một khu, mỗi trang 50 vụ.

create table cycle_stat_snapshots (
  cycle_id uuid primary key references production_cycles(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  ended_on date,
  summary jsonb not null,
  computed_at timestamptz not null default now(),
  dirty boolean not null default false
);
create index cycle_stat_snapshots_org_idx on cycle_stat_snapshots (organization_id, ended_on);
alter table cycle_stat_snapshots enable row level security;
revoke all on cycle_stat_snapshots from anon, authenticated;

-- Đánh dấu cần tính lại khi bảng nguồn có cột cycle_id đổi
create or replace function mark_cycle_stat_dirty() returns trigger language plpgsql security definer set search_path = public as $$
declare cid uuid; oid uuid;
begin
  if tg_op <> 'INSERT' then oid := (to_jsonb(old) ->> 'cycle_id')::uuid; end if;
  if tg_op <> 'DELETE' then cid := (to_jsonb(new) ->> 'cycle_id')::uuid; end if;
  if cid is not null then update cycle_stat_snapshots set dirty = true where cycle_id = cid and not dirty; end if;
  if oid is not null and oid is distinct from cid then update cycle_stat_snapshots set dirty = true where cycle_id = oid and not dirty; end if;
  return null;
end $$;
revoke execute on function mark_cycle_stat_dirty() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['expense_records', 'harvest_records', 'sales_records', 'inventory_transactions', 'attendance_records', 'cycle_count_events', 'pay_adjustments', 'work_output_records'] loop
    execute format('create trigger %I after insert or update or delete on %I for each row execute function mark_cycle_stat_dirty()', t || '_snap_dirty', t);
  end loop;
end $$;

-- Nhập kho đầu vào ảnh hưởng giá bình quân của các lần xuất đến sau ngày nhập: chỉ vụ kết thúc từ ngày đó trở đi cần tính lại
create or replace function mark_snapshots_on_receipt() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.txn_type = 'receipt' then
    update cycle_stat_snapshots set dirty = true where organization_id = new.organization_id and ended_on >= new.txn_date and not dirty;
  end if;
  return null;
end $$;
revoke execute on function mark_snapshots_on_receipt() from public, anon, authenticated;
create trigger inventory_transactions_snap_receipt after insert on inventory_transactions for each row execute function mark_snapshots_on_receipt();

-- Sửa vụ: đang kết thúc thì cần tính lại; không còn kết thúc thì bỏ bản chụp
create or replace function mark_snapshot_on_cycle() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'ended' then update cycle_stat_snapshots set dirty = true where cycle_id = new.id and not dirty;
  else delete from cycle_stat_snapshots where cycle_id = new.id; end if;
  return null;
end $$;
revoke execute on function mark_snapshot_on_cycle() from public, anon, authenticated;
create trigger production_cycles_snap_dirty after update on production_cycles for each row execute function mark_snapshot_on_cycle();

-- Kỳ lương đổi trạng thái (khóa/mở khóa): tiền công của vụ đổi giữa "đã duyệt" và "dự tính"
create or replace function mark_snapshots_on_payroll() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then update cycle_stat_snapshots set dirty = true where organization_id = new.organization_id and not dirty; end if;
  return null;
end $$;
revoke execute on function mark_snapshots_on_payroll() from public, anon, authenticated;
create trigger payroll_periods_snap_dirty after update on payroll_periods for each row execute function mark_snapshots_on_payroll();

-- Phạm vi vụ dùng chung cho tổng hợp và danh sách (chỉ vụ người gọi đọc được)
create or replace function rollup_scope(p_org uuid, p_statuses text[], p_ended_from date, p_ended_to date)
returns table (cycle_id uuid, area_id uuid, status cycle_status, cycle_mode text, cname text, start_date date, end_date date, ended_on date)
language sql stable security definer set search_path = public as $$
  select pc.id, pc.area_id, pc.status, pc.cycle_mode, coalesce(nullif(pc.name, ''), pc.code, 'Vụ'), pc.start_date, pc.end_date,
         coalesce(pc.end_date, pc.expected_end_date, pc.start_date)
    from production_cycles pc
   where pc.owner_org_id = p_org and pc.status <> 'cancelled' and can_read_cycle(pc.id)
     and (p_statuses is null or pc.status::text = any (p_statuses))
     and (pc.status <> 'ended' or ((p_ended_from is null or coalesce(pc.end_date, pc.expected_end_date, pc.start_date) >= p_ended_from)
                                  and (p_ended_to is null or coalesce(pc.end_date, pc.expected_end_date, pc.start_date) <= p_ended_to)));
$$;
revoke execute on function rollup_scope(uuid, text[], date, date) from public, anon, authenticated;

-- Tính (hoặc tính lại) bản chụp cho các vụ kết thúc trong danh sách mã vụ; trả số bản đã tính
create or replace function ensure_cycle_snapshots(p_ids uuid[], p_refresh boolean) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with todo as (
    select pc.id, pc.owner_org_id, coalesce(pc.end_date, pc.expected_end_date, pc.start_date) ended_on
      from production_cycles pc left join cycle_stat_snapshots sn on sn.cycle_id = pc.id
     where pc.id = any (p_ids) and pc.status = 'ended'
       and (p_refresh or sn.cycle_id is null or sn.dirty or sn.computed_at < now() - interval '1 day')
  ), ins as (
    insert into cycle_stat_snapshots (cycle_id, organization_id, ended_on, summary, computed_at, dirty)
      select id, owner_org_id, ended_on, get_cycle_summary(id), now(), false from todo
      on conflict (cycle_id) do update set summary = excluded.summary, ended_on = excluded.ended_on, computed_at = excluded.computed_at, dirty = false
      returning 1
  ) select count(*)::integer into n from ins;
  return n;
end $$;
revoke execute on function ensure_cycle_snapshots(uuid[], boolean) from public, anon, authenticated;

-- Tổng hợp theo khu: thay hàm cũ (thêm p_refresh). Vụ kết thúc dùng bản chụp, vụ khác tính trực tiếp.
drop function get_area_rollup(uuid, text[], date, date);
create or replace function get_area_rollup(p_org uuid, p_statuses text[] default null, p_ended_from date default null, p_ended_to date default null, p_refresh boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare money_ok boolean; harvest_ok boolean; ids uuid[];
begin
  if auth.uid() is null or not is_org_member(p_org) then raise exception 'FORBIDDEN: Bạn không thuộc cơ sở này.'; end if;
  money_ok := has_perm(p_org, 'summary', 'view');
  harvest_ok := has_perm(p_org, 'harvest', 'view') or money_ok;
  if money_ok then
    select coalesce(array_agg(s.cycle_id), '{}') into ids from rollup_scope(p_org, p_statuses, p_ended_from, p_ended_to) s where s.status = 'ended';
    perform ensure_cycle_snapshots(ids, coalesce(p_refresh, false));
  end if;
  return jsonb_build_object('can_money', money_ok, 'can_harvest', harvest_ok, 'generated_at', now(), 'rows', coalesce((
    select jsonb_agg(jsonb_build_object('area_id', t.area_id, 'cycles', t.n, 'running', t.run,
                                        'cost', case when money_ok then t.cost end, 'harvest', case when harvest_ok then t.harv end,
                                        'revenue', case when money_ok then t.rev end, 'profit', case when money_ok then t.prof end))
      from (
        select cy.area_id, count(*)::int n, (count(*) filter (where cy.status = 'active'))::int run,
               sum(x.total) cost, sum(x.net) harv, sum(x.rev) rev, sum(x.total_profit) filter (where not x.pending) prof
          from rollup_scope(p_org, p_statuses, p_ended_from, p_ended_to) cy
          cross join lateral (
            select case when money_ok then case when cy.status = 'ended' then (select sn.summary from cycle_stat_snapshots sn where sn.cycle_id = cy.cycle_id)
                                                else get_cycle_summary(cy.cycle_id) end end sm
          ) s
          cross join lateral (
            select (s.sm->>'total_cost')::numeric total,
                   (select sum(h.quantity - coalesce(h.loss_quantity, 0)) from harvest_records h where h.cycle_id = cy.cycle_id and h.voided_at is null) net,
                   (s.sm->>'revenue_recorded')::numeric rev,
                   (s.sm->>'revenue_recorded')::numeric - (s.sm->>'total_cost')::numeric total_profit,
                   (cy.cycle_mode = 'perennial' and coalesce((s.sm->>'seasons')::integer, 0) > 0)
                     or (cy.status <> 'ended' and (coalesce((s.sm->>'partial_out')::boolean, false) or coalesce((s.sm->>'revenue_recorded')::numeric, 0) <= 0)) pending
          ) x
         group by cy.area_id
      ) t), '[]'::jsonb));
end $$;
revoke execute on function get_area_rollup(uuid, text[], date, date, boolean) from public, anon;
grant execute on function get_area_rollup(uuid, text[], date, date, boolean) to authenticated, service_role;

-- Danh sách vụ của một khu (ô: chỉ vụ của ô; phân khu: vụ của phân khu và các ô con), mới nhất trước, mỗi lần p_limit vụ (tối đa 100)
create or replace function get_area_cycles(p_org uuid, p_area uuid, p_statuses text[] default null, p_ended_from date default null, p_ended_to date default null,
                                           p_limit integer default 50, p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare money_ok boolean; harvest_ok boolean; lim integer := least(greatest(coalesce(p_limit, 50), 1), 100); off integer := greatest(coalesce(p_offset, 0), 0); ids uuid[]; total integer;
begin
  if auth.uid() is null or not is_org_member(p_org) then raise exception 'FORBIDDEN: Bạn không thuộc cơ sở này.'; end if;
  if not exists (select 1 from production_areas where id = p_area and organization_id = p_org) then raise exception 'NOT_FOUND: Không tìm thấy khu của cơ sở.'; end if;
  money_ok := has_perm(p_org, 'summary', 'view');
  harvest_ok := has_perm(p_org, 'harvest', 'view') or money_ok;
  select count(*)::integer into total from rollup_scope(p_org, p_statuses, p_ended_from, p_ended_to) s join production_areas a on a.id = s.area_id where s.area_id = p_area or a.parent_id = p_area;
  select coalesce(array_agg(q.cycle_id), '{}') into ids from (
    select s.cycle_id from rollup_scope(p_org, p_statuses, p_ended_from, p_ended_to) s join production_areas a on a.id = s.area_id
     where s.area_id = p_area or a.parent_id = p_area
     order by (s.status = 'active') desc, s.start_date desc nulls last, s.cycle_id limit lim offset off) q;
  if money_ok then perform ensure_cycle_snapshots(ids, false); end if;
  return jsonb_build_object('can_money', money_ok, 'can_harvest', harvest_ok, 'total', total, 'items', coalesce((
    select jsonb_agg(jsonb_build_object('cycle_id', y.cycle_id, 'area_id', y.area_id, 'name', y.cname, 'status', y.status, 'start_date', y.start_date, 'end_date', y.ended_on,
                                        'cost', case when money_ok then y.total end, 'harvest', case when harvest_ok then y.net end,
                                        'revenue', case when money_ok then y.rev end, 'profit', case when money_ok and not y.pending then y.total_profit end,
                                        'pending', case when money_ok then y.pending end) order by y.ord)
      from (
        select cy.cycle_id, cy.area_id, cy.cname, cy.status, cy.start_date, cy.ended_on, x.total, x.net, x.rev, x.total_profit, x.pending, i.ord
          from unnest(ids) with ordinality i(id, ord)
          join rollup_scope(p_org, p_statuses, p_ended_from, p_ended_to) cy on cy.cycle_id = i.id
          cross join lateral (
            select case when money_ok then case when cy.status = 'ended' then (select sn.summary from cycle_stat_snapshots sn where sn.cycle_id = cy.cycle_id)
                                                else get_cycle_summary(cy.cycle_id) end end sm
          ) s
          cross join lateral (
            select (s.sm->>'total_cost')::numeric total,
                   (select sum(h.quantity - coalesce(h.loss_quantity, 0)) from harvest_records h where h.cycle_id = cy.cycle_id and h.voided_at is null) net,
                   (s.sm->>'revenue_recorded')::numeric rev,
                   (s.sm->>'revenue_recorded')::numeric - (s.sm->>'total_cost')::numeric total_profit,
                   (cy.cycle_mode = 'perennial' and coalesce((s.sm->>'seasons')::integer, 0) > 0)
                     or (cy.status <> 'ended' and (coalesce((s.sm->>'partial_out')::boolean, false) or coalesce((s.sm->>'revenue_recorded')::numeric, 0) <= 0)) pending
          ) x
      ) y), '[]'::jsonb));
end $$;
revoke execute on function get_area_cycles(uuid, uuid, text[], date, date, integer, integer) from public, anon;
grant execute on function get_area_cycles(uuid, uuid, text[], date, date, integer, integer) to authenticated, service_role;
