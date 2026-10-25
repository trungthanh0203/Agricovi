-- P2 gọn (D100): BIẾN ĐỘNG SỐ LƯỢNG của vụ/lứa — nhập thêm/dặm, chết, loại, xuất — để biết SỐ CÒN LẠI và TỈ LỆ HAO.
-- Số ban đầu là "Số cây/Số con" đã có của vụ (production_cycles.plant_count), nên KHÔNG nhập hai lần. Với vật nuôi, số con ghi ở phiếu
-- thu hoạch/xuất cũng được trừ khi tính số còn lại (tính phía app, không trùng sự kiện "xuất").
-- Ghi mới của nhân viên dùng được offline: id do thiết bị tạo, gửi bằng ON CONFLICT DO NOTHING (D24). Hủy cần mạng và lý do; không xóa.

create table cycle_count_events (
  id uuid primary key,
  cycle_id uuid not null references production_cycles(id) on delete cascade,
  organization_id uuid not null references organizations(id),
  event_date date not null,
  kind text not null check (kind in ('in', 'dead', 'culled', 'out')),   -- nhập/dặm (+), chết, loại thải, xuất/chuyển (-)
  quantity integer not null check (quantity > 0),
  note text check (note is null or length(note) <= 300),
  source record_source not null default 'online',
  created_by uuid references auth.users(id) default auth.uid(),
  author_name text,
  created_at timestamptz not null default now(),
  received_at timestamptz not null default now(),
  voided_at timestamptz,
  void_reason text check (void_reason is null or length(void_reason) <= 300),
  check (voided_at is null or void_reason is not null)
);
create index on cycle_count_events (cycle_id, event_date desc);

create trigger cycle_count_events_org before insert on cycle_count_events
  for each row execute function sync_org_from_cycle();
create or replace function cycle_count_events_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.author_name := author_display_name(new.created_by, new.organization_id, null);
  if new.event_date > (now() at time zone 'Asia/Ho_Chi_Minh')::date + 1 then
    raise exception 'INVALID_DATE: Ngày ghi không được ở tương lai.';
  end if;
  return new;
end $$;
create trigger cycle_count_events_b_guard before insert on cycle_count_events
  for each row execute function cycle_count_events_guard();

alter table cycle_count_events enable row level security;
-- chính sách đọc dựa vào CỘT của hàng (cycle_id) để INSERT ... ON CONFLICT DO NOTHING của hàng đợi offline chạy được (bẫy số 1 và 8)
create policy count_events_read on cycle_count_events for select to authenticated using (can_read_cycle(cycle_id));
create policy count_events_insert on cycle_count_events for insert to authenticated
  with check (can_log_cycle(cycle_id) and created_by = auth.uid());
revoke update, delete on cycle_count_events from authenticated, anon;

-- Hủy một lần ghi (người quản lý vụ, hoặc người ghi trong 24 giờ đầu); cần lý do, không khôi phục
create or replace function void_count_event(p_id uuid, p_reason text) returns cycle_count_events
language plpgsql security definer set search_path = public as $$
declare e cycle_count_events;
begin
  select * into e from cycle_count_events where id = p_id;
  if e.id is null or not can_read_cycle(e.cycle_id) then raise exception 'NOT_FOUND: Không tìm thấy bản ghi.'; end if;
  if not (can_manage_cycle(e.cycle_id) or (e.created_by = auth.uid() and e.created_at > now() - interval '24 hours')) then
    raise exception 'FORBIDDEN: Chỉ người quản lý vụ, hoặc người ghi trong 24 giờ đầu, mới hủy được.';
  end if;
  if e.voided_at is not null then return e; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'INVALID_REASON: Hãy ghi lý do hủy (ít nhất 3 ký tự).'; end if;
  update cycle_count_events set voided_at = now(), void_reason = trim(p_reason) where id = p_id returning * into e;
  return e;
end $$;
revoke execute on function void_count_event(uuid, text) from public, anon;
grant execute on function void_count_event(uuid, text) to authenticated, service_role;
