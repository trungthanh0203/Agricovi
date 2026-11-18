-- D188: hồ sơ nhân sự gọn + hợp đồng lao động (mục 15 báo cáo đối thủ, mảng 1 và 2). Chỉ LƯU và NHẮC hạn, không soạn hợp đồng.
-- Không lưu số CCCD/bảo hiểm (dữ liệu cá nhân nhạy cảm); hợp đồng đính kèm ảnh scan. Quyền theo mục Tiền công (payroll view/edit).
-- Hủy hợp đồng = đánh dấu, không xóa. Sửa có phiên bản.

create table worker_hr (
  worker_id uuid primary key references worker_profiles(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  start_date date,                                                    -- ngày vào làm
  end_date date,                                                      -- ngày nghỉ việc
  position text check (position is null or length(position) <= 80),   -- chức danh
  employment_type text check (employment_type is null or employment_type in ('regular', 'seasonal')),
  emergency_name text check (emergency_name is null or length(emergency_name) <= 120),
  emergency_phone text check (emergency_phone is null or length(emergency_phone) <= 30),
  note text check (note is null or length(note) <= 500),
  version integer not null default 1,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table worker_contracts (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  worker_id uuid not null references worker_profiles(id) on delete cascade,
  kind text not null check (kind in ('probation', 'fixed_term', 'indefinite', 'seasonal', 'service')),
  start_date date not null,
  end_date date,                                                      -- không hạn (indefinite) thì để trống
  pay_note text check (pay_note is null or length(pay_note) <= 200),  -- lương/đơn giá thỏa thuận (chữ, không nối phiếu lương)
  file text,                                                          -- ảnh scan hợp đồng (kho ảnh)
  note text check (note is null or length(note) <= 300),
  status text not null default 'active' check (status in ('active', 'cancelled')),
  version integer not null default 1,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date),
  check (kind <> 'fixed_term' or end_date is not null)
);
create index on worker_contracts (organization_id, status, end_date);
create index on worker_contracts (worker_id);

alter table worker_hr enable row level security;
alter table worker_contracts enable row level security;
create policy worker_hr_read on worker_hr for select to authenticated using (has_perm(organization_id, 'payroll', 'view'));
create policy worker_contracts_read on worker_contracts for select to authenticated using (has_perm(organization_id, 'payroll', 'view'));
revoke insert, update, delete on worker_hr, worker_contracts from authenticated, anon;

create or replace function hr_guard(p_org uuid) returns void language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not has_perm(p_org, 'payroll', 'edit') then
    raise exception 'FORBIDDEN: Bạn không có quyền sửa hồ sơ nhân sự (cần quyền sửa mục Tiền công).';
  end if;
end $$;
revoke execute on function hr_guard(uuid) from public, anon;

-- Lưu hồ sơ nhân sự của một người (thay cả bộ). p_version null khi chưa có bản nào. Trả phiên bản mới.
create or replace function set_worker_hr(p_worker uuid, p_data jsonb, p_version integer default null) returns integer
language plpgsql security definer set search_path = public as $$
declare v_org uuid := worker_org(p_worker); cur worker_hr; s date; e date; t text;
begin
  if v_org is null then raise exception 'NOT_FOUND: Không tìm thấy người lao động.'; end if;
  perform hr_guard(v_org);
  s := nullif(btrim(p_data->>'start_date'), '')::date;
  e := nullif(btrim(p_data->>'end_date'), '')::date;
  t := nullif(btrim(p_data->>'employment_type'), '');
  if t is not null and t not in ('regular', 'seasonal') then raise exception 'INVALID_ARGUMENT: Loại hình làm việc chưa đúng.'; end if;
  if s is not null and e is not null and e < s then raise exception 'INVALID_DATE: Ngày nghỉ việc không được trước ngày vào làm.'; end if;
  select * into cur from worker_hr where worker_id = p_worker for update;
  if cur.worker_id is null then
    if p_version is not null then raise exception 'CONFLICT: Hồ sơ vừa được người khác sửa. Hãy tải lại bản mới.'; end if;
    insert into worker_hr (worker_id, organization_id, start_date, end_date, position, employment_type, emergency_name, emergency_phone, note, updated_by)
    values (p_worker, v_org, s, e, nullif(btrim(p_data->>'position'), ''), t, nullif(btrim(p_data->>'emergency_name'), ''),
            nullif(btrim(p_data->>'emergency_phone'), ''), nullif(btrim(p_data->>'note'), ''), auth.uid());
    return 1;
  end if;
  if p_version is distinct from cur.version then raise exception 'CONFLICT: Hồ sơ vừa được người khác sửa. Hãy tải lại bản mới.'; end if;
  update worker_hr set start_date = s, end_date = e, position = nullif(btrim(p_data->>'position'), ''), employment_type = t,
         emergency_name = nullif(btrim(p_data->>'emergency_name'), ''), emergency_phone = nullif(btrim(p_data->>'emergency_phone'), ''),
         note = nullif(btrim(p_data->>'note'), ''), version = cur.version + 1, updated_by = auth.uid(), updated_at = now()
   where worker_id = p_worker;
  return cur.version + 1;
end $$;
revoke execute on function set_worker_hr(uuid, jsonb, integer) from public, anon;
grant execute on function set_worker_hr(uuid, jsonb, integer) to authenticated;

create or replace function create_worker_contract(p_id uuid, p_worker uuid, p_kind text, p_start date, p_end date, p_pay_note text, p_file text, p_note text)
returns worker_contracts language plpgsql security definer set search_path = public as $$
declare v_org uuid := worker_org(p_worker); r worker_contracts;
begin
  if v_org is null then raise exception 'NOT_FOUND: Không tìm thấy người lao động.'; end if;
  perform hr_guard(v_org);
  select * into r from worker_contracts where id = p_id;
  if r.id is not null then
    if r.organization_id <> v_org then raise exception 'FORBIDDEN: Mã hợp đồng đã tồn tại ở nơi khác.'; end if;
    return r;                                                           -- bấm lặp không nhân đôi
  end if;
  if p_start is null then raise exception 'INVALID_DATE: Hãy nhập ngày bắt đầu.'; end if;
  if p_end is not null and p_end < p_start then raise exception 'INVALID_DATE: Ngày hết hạn không được trước ngày bắt đầu.'; end if;
  if p_kind = 'fixed_term' and p_end is null then raise exception 'INVALID_DATE: Hợp đồng có thời hạn cần ngày hết hạn.'; end if;
  insert into worker_contracts (id, organization_id, worker_id, kind, start_date, end_date, pay_note, file, note)
  values (p_id, v_org, p_worker, p_kind, p_start, case when p_kind = 'indefinite' then null else p_end end,
          nullif(btrim(coalesce(p_pay_note, '')), ''), nullif(p_file, ''), nullif(btrim(coalesce(p_note, '')), ''))
  returning * into r;
  insert into audit_events (organization_id, actor_id, action, entity, entity_id, after)
  values (v_org, auth.uid(), 'create_worker_contract', 'worker_contract', r.id::text, jsonb_build_object('worker_id', p_worker, 'kind', p_kind));
  return r;
end $$;

create or replace function update_worker_contract(p_id uuid, p_version integer, p_kind text, p_start date, p_end date, p_pay_note text, p_file text, p_note text)
returns worker_contracts language plpgsql security definer set search_path = public as $$
declare r worker_contracts;
begin
  select * into r from worker_contracts where id = p_id for update;
  if r.id is null then raise exception 'NOT_FOUND: Không tìm thấy hợp đồng.'; end if;
  perform hr_guard(r.organization_id);
  if r.version <> p_version then raise exception 'CONFLICT: Hợp đồng vừa được người khác sửa. Hãy tải lại bản mới.'; end if;
  if r.status = 'cancelled' then raise exception 'LOCKED: Hợp đồng đã hủy nên không sửa được.'; end if;
  if p_start is null then raise exception 'INVALID_DATE: Hãy nhập ngày bắt đầu.'; end if;
  if p_end is not null and p_end < p_start then raise exception 'INVALID_DATE: Ngày hết hạn không được trước ngày bắt đầu.'; end if;
  if p_kind = 'fixed_term' and p_end is null then raise exception 'INVALID_DATE: Hợp đồng có thời hạn cần ngày hết hạn.'; end if;
  update worker_contracts set kind = p_kind, start_date = p_start, end_date = case when p_kind = 'indefinite' then null else p_end end,
         pay_note = nullif(btrim(coalesce(p_pay_note, '')), ''), file = nullif(p_file, ''), note = nullif(btrim(coalesce(p_note, '')), ''), version = version + 1
   where id = p_id returning * into r;
  insert into audit_events (organization_id, actor_id, action, entity, entity_id) values (r.organization_id, auth.uid(), 'update_worker_contract', 'worker_contract', r.id::text);
  return r;
end $$;

create or replace function cancel_worker_contract(p_id uuid, p_version integer) returns worker_contracts
language plpgsql security definer set search_path = public as $$
declare r worker_contracts;
begin
  select * into r from worker_contracts where id = p_id for update;
  if r.id is null then raise exception 'NOT_FOUND: Không tìm thấy hợp đồng.'; end if;
  perform hr_guard(r.organization_id);
  if r.version <> p_version then raise exception 'CONFLICT: Hợp đồng vừa được người khác sửa. Hãy tải lại bản mới.'; end if;
  if r.status = 'cancelled' then return r; end if;
  update worker_contracts set status = 'cancelled', version = version + 1 where id = p_id returning * into r;
  insert into audit_events (organization_id, actor_id, action, entity, entity_id) values (r.organization_id, auth.uid(), 'cancel_worker_contract', 'worker_contract', r.id::text);
  return r;
end $$;

revoke execute on function create_worker_contract(uuid, uuid, text, date, date, text, text, text) from public, anon;
revoke execute on function update_worker_contract(uuid, integer, text, date, date, text, text, text) from public, anon;
revoke execute on function cancel_worker_contract(uuid, integer) from public, anon;
grant execute on function create_worker_contract(uuid, uuid, text, date, date, text, text, text) to authenticated;
grant execute on function update_worker_contract(uuid, integer, text, date, date, text, text, text) to authenticated;
grant execute on function cancel_worker_contract(uuid, integer) to authenticated;
