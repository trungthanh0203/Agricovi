-- Mục 14 lát 4 (D167): ĐỊNH MỨC THỨC ĂN theo ngày tuổi của lứa nuôi (TÙY CHỌN, mặc định không có).
-- Nguyên tắc để không xung đột với số liệu đã có:
--   * KHÔNG thêm đường nhập hằng ngày mới. Cám thực dùng vẫn lấy từ cái đã có (xuất kho nhóm Thức ăn, hoặc cám ghi tay) qua get_cycle_growth (0088/0105/0200), hàm đó không đổi.
--   * Mỗi lứa tối đa MỘT bảng định mức, lưu nguyên khối (jsonb) và ghi nguyên khối: không có từng dòng sửa lẻ nên không thể chồng chéo/hở khoảng.
--     Mỗi dòng "từ ngày tuổi X trở đi: Y kg/con/ngày", áp dụng đến khi gặp dòng kế tiếp.
--   * Ghi có số phiên bản (version): hai người sửa cùng lúc thì người sau nhận CONFLICT và phải tải lại bản mới (quy tắc không ghi đè âm thầm).
--   * Không nạp số mặc định: định mức phụ thuộc giống, hãng cám và giai đoạn; do cơ sở tự nhập hoặc chép từ lứa trước.
--   * Tùy chọn: tuổi con giống lúc nhập chuồng, kỳ so sánh (7 ngày gần đây hoặc cả lứa; xuất kho thường theo bao nên không so từng ngày), ngưỡng lệch %.

create table cycle_feed_plans (
  cycle_id uuid primary key references production_cycles(id) on delete cascade,
  organization_id uuid not null references organizations(id),
  age_at_start integer not null default 0 check (age_at_start between 0 and 3650),
  window_kind text not null default 'week' check (window_kind in ('week', 'all')),
  tolerance_pct numeric not null default 20 check (tolerance_pct between 5 and 100),
  norms jsonb not null default '[]'::jsonb,
  version integer not null default 1,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
create trigger cycle_feed_plans_org before insert on cycle_feed_plans for each row execute function sync_org_from_cycle();
alter table cycle_feed_plans enable row level security;
create policy cycle_feed_plans_read on cycle_feed_plans for select to authenticated using (can_read_cycle(cycle_id));
revoke insert, update, delete on cycle_feed_plans from authenticated, anon;   -- chỉ ghi qua hàm bên dưới

-- Kiểm tra và chuẩn hóa bảng định mức: mảng [{"from_day": n, "kg": x}], 1–30 dòng, ngày tuổi không trùng, kg trong (0; 50]; trả về mảng đã sắp theo ngày tuổi
create or replace function normalize_feed_norms(p_norms jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare r jsonb; n integer; d integer; k numeric;
begin
  if p_norms is null or jsonb_typeof(p_norms) <> 'array' then raise exception 'INVALID_NORMS: Bảng định mức không hợp lệ.'; end if;
  n := jsonb_array_length(p_norms);
  if n < 1 or n > 30 then raise exception 'INVALID_NORMS: Bảng định mức cần từ 1 đến 30 dòng.'; end if;
  for r in select * from jsonb_array_elements(p_norms) loop
    if jsonb_typeof(r) <> 'object' or coalesce(r->>'from_day', '') !~ '^[0-9]{1,4}$' or coalesce(r->>'kg', '') !~ '^[0-9]+(\.[0-9]+)?$' then
      raise exception 'INVALID_NORMS: Mỗi dòng cần ngày tuổi (số nguyên không âm) và lượng cám (số lớn hơn 0).';
    end if;
    d := (r->>'from_day')::integer; k := (r->>'kg')::numeric;
    if d > 3650 or k <= 0 or k > 50 then raise exception 'INVALID_NORMS: Ngày tuổi tối đa 3650; lượng cám phải lớn hơn 0 và không quá 50 kg/con/ngày.'; end if;
  end loop;
  if (select count(distinct (e->>'from_day')::integer) from jsonb_array_elements(p_norms) e) <> n then
    raise exception 'INVALID_NORMS: Có hai dòng cùng ngày tuổi. Mỗi ngày tuổi chỉ một dòng.';
  end if;
  return (select jsonb_agg(jsonb_build_object('from_day', (e->>'from_day')::integer, 'kg', (e->>'kg')::numeric) order by (e->>'from_day')::integer)
            from jsonb_array_elements(p_norms) e);
end $$;

-- Ghi bảng định mức của lứa. p_version = số phiên bản đang xem (0 nếu lứa chưa có bảng). Lệch phiên bản => CONFLICT.
create or replace function set_cycle_feed_plan(p_cycle uuid, p_age integer, p_window text, p_tol numeric, p_norms jsonb, p_version integer)
returns cycle_feed_plans language plpgsql security definer set search_path = public as $$
declare cur cycle_feed_plans; v_norms jsonb; r cycle_feed_plans;
begin
  if not exists (select 1 from production_cycles where id = p_cycle) or not can_manage_cycle(p_cycle) then
    raise exception 'FORBIDDEN: Chỉ chủ hoặc quản lý vụ đặt được định mức thức ăn.';
  end if;
  if coalesce(p_age, 0) < 0 or coalesce(p_age, 0) > 3650 then raise exception 'INVALID_ARGUMENT: Tuổi con giống lúc nhập không hợp lệ.'; end if;
  if coalesce(p_window, 'week') not in ('week', 'all') then raise exception 'INVALID_ARGUMENT: Kỳ so sánh không hợp lệ.'; end if;
  if coalesce(p_tol, 20) < 5 or coalesce(p_tol, 20) > 100 then raise exception 'INVALID_ARGUMENT: Ngưỡng lệch phải từ 5 đến 100 phần trăm.'; end if;
  v_norms := normalize_feed_norms(p_norms);
  select * into cur from cycle_feed_plans where cycle_id = p_cycle for update;
  if cur.cycle_id is null then
    if coalesce(p_version, 0) <> 0 then raise exception 'CONFLICT: Bảng định mức đã bị xóa hoặc đổi ở nơi khác. Hãy tải lại.'; end if;
    insert into cycle_feed_plans (cycle_id, age_at_start, window_kind, tolerance_pct, norms, updated_by)
      values (p_cycle, coalesce(p_age, 0), coalesce(p_window, 'week'), coalesce(p_tol, 20), v_norms, auth.uid()) returning * into r;
  else
    if coalesce(p_version, -1) <> cur.version then raise exception 'CONFLICT: Bảng định mức vừa được người khác sửa. Hãy tải lại bản mới rồi sửa tiếp.'; end if;
    update cycle_feed_plans set age_at_start = coalesce(p_age, 0), window_kind = coalesce(p_window, 'week'), tolerance_pct = coalesce(p_tol, 20),
           norms = v_norms, version = version + 1, updated_by = auth.uid(), updated_at = now()
     where cycle_id = p_cycle returning * into r;
  end if;
  return r;
end $$;

-- Xóa bảng định mức (về lại không dùng tính năng này)
create or replace function delete_cycle_feed_plan(p_cycle uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from production_cycles where id = p_cycle) or not can_manage_cycle(p_cycle) then
    raise exception 'FORBIDDEN: Chỉ chủ hoặc quản lý vụ xóa được định mức thức ăn.';
  end if;
  delete from cycle_feed_plans where cycle_id = p_cycle;
end $$;

-- Chép bảng định mức từ lứa khác của cùng cơ sở (ví dụ lứa trước). Ghi đè bảng hiện có của lứa đích và tăng phiên bản.
create or replace function copy_cycle_feed_plan(p_from uuid, p_to uuid) returns cycle_feed_plans
language plpgsql security definer set search_path = public as $$
declare src cycle_feed_plans; r cycle_feed_plans; o1 uuid; o2 uuid;
begin
  select owner_org_id into o1 from production_cycles where id = p_from;
  select owner_org_id into o2 from production_cycles where id = p_to;
  if o1 is null or o2 is null or o1 <> o2 or not can_manage_cycle(p_to) or not can_read_cycle(p_from) then
    raise exception 'FORBIDDEN: Chỉ chép được giữa các lứa của cùng cơ sở mà bạn quản lý.';
  end if;
  select * into src from cycle_feed_plans where cycle_id = p_from;
  if src.cycle_id is null then raise exception 'NOT_FOUND: Lứa nguồn chưa có bảng định mức.'; end if;
  insert into cycle_feed_plans (cycle_id, age_at_start, window_kind, tolerance_pct, norms, updated_by)
    values (p_to, src.age_at_start, src.window_kind, src.tolerance_pct, src.norms, auth.uid())
  on conflict (cycle_id) do update set age_at_start = excluded.age_at_start, window_kind = excluded.window_kind, tolerance_pct = excluded.tolerance_pct,
    norms = excluded.norms, version = cycle_feed_plans.version + 1, updated_by = auth.uid(), updated_at = now()
  returning * into r;
  return r;
end $$;

revoke execute on function normalize_feed_norms(jsonb) from public, anon;
revoke execute on function set_cycle_feed_plan(uuid, integer, text, numeric, jsonb, integer), delete_cycle_feed_plan(uuid), copy_cycle_feed_plan(uuid, uuid) from public, anon;
grant execute on function set_cycle_feed_plan(uuid, integer, text, numeric, jsonb, integer), delete_cycle_feed_plan(uuid), copy_cycle_feed_plan(uuid, uuid) to authenticated, service_role;
