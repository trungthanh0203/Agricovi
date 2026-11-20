-- D220: xóa tài khoản ngay trong app (bắt buộc với App Store / Google Play) — docs/PLAN_GOI_MIEN_PHI.md, đợt C.
-- Người dùng gửi yêu cầu trong app; có thời gian chờ (mặc định 14 ngày) để đổi ý; hết hạn chờ thì quản trị bấm thực hiện.
-- Việc xóa dùng đúng logic của supabase/maintenance/delete_account.sql (đã dùng thật): xóa cơ sở mà người này là chủ duy nhất cùng
-- dữ liệu, hộ do HTX tạo, tài khoản nhân viên/máy chấm công của cơ sở đó; ở cơ sở khác chỉ gỡ liên kết tới người này.

insert into platform_settings (key, value, description) values
  ('account_deletion_grace_days', '14'::jsonb, 'Số ngày chờ trước khi xóa tài khoản đã yêu cầu xóa (người dùng đổi ý được trong thời gian này)')
  on conflict (key) do nothing;

create table account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,                       -- không có khóa ngoại: dòng này còn lại sau khi tài khoản bị xóa (bằng chứng đã xử lý)
  label text,                                  -- số điện thoại hoặc email lúc yêu cầu
  full_name text,
  reason text check (reason is null or length(reason) <= 500),
  status text not null default 'pending' check (status in ('pending', 'cancelled', 'done')),
  requested_at timestamptz not null default now(),
  scheduled_for timestamptz not null,
  decided_at timestamptz,
  decided_by uuid,
  summary jsonb
);
create unique index account_deletion_one_pending on account_deletion_requests (user_id) where status = 'pending';
alter table account_deletion_requests enable row level security;
create policy account_deletion_own on account_deletion_requests for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on account_deletion_requests from authenticated, anon;

-- Xóa dòng và mọi dòng phụ thuộc theo khóa ngoại (bản của delete_account.sql, đặt trong schema public)
create or replace function purge_rows_internal(p_rel regclass, p_cond text, p_depth integer default 0) returns void
language plpgsql security definer set search_path = public as $$
declare fk record; v_rel text := p_rel::text;
begin
  if p_depth > 14 then raise exception 'Chuỗi khóa ngoại quá sâu tại %', v_rel; end if;
  for fk in
    select c.conrelid::regclass as child, c.conrelid as child_oid, a.attname as ccol, ra.attname as rcol, c.confdeltype as del,
           a.attnotnull as notnull, cardinality(c.conkey) as ncols
      from pg_constraint c
      join pg_class cl on cl.oid = c.conrelid
      join pg_namespace n on n.oid = cl.relnamespace
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      join pg_attribute ra on ra.attrelid = c.confrelid and ra.attnum = c.confkey[1]
     where c.contype = 'f' and c.confrelid = p_rel and n.nspname = 'public'
  loop
    if fk.ncols > 1 then raise exception 'Khóa ngoại nhiều cột tại %', fk.child; end if;
    if fk.child_oid = p_rel::oid then
      -- bảng tự tham chiếu (khu cha–ô, vụ nối tiếp...): gỡ liên kết trước khi xóa
      execute format('update %s set %I = null where %I in (select %I from %s where %s)', fk.child, fk.ccol, fk.ccol, fk.rcol, v_rel, p_cond);
    elsif p_rel = 'auth.users'::regclass and not fk.notnull then
      -- dấu vết "người tạo/người ghi" trong dữ liệu của cơ sở KHÁC: giữ dữ liệu, chỉ bỏ liên kết tới người bị xóa
      execute format('update %s set %I = null where %I in (select %I from %s where %s)', fk.child, fk.ccol, fk.ccol, fk.rcol, v_rel, p_cond);
    elsif fk.del in ('a', 'r', 'c') then
      perform public.purge_rows_internal(fk.child, format('%I in (select %I from %s where %s)', fk.ccol, fk.rcol, v_rel, p_cond), p_depth + 1);
    end if;   -- 'n' (đặt rỗng) và 'd': để CSDL tự xử lý khi xóa dòng cha
  end loop;
  execute format('delete from %s where %s', v_rel, p_cond);
end $$;

-- Xóa một tài khoản và dữ liệu liên quan (logic của delete_account.sql). Chỉ gọi từ admin_execute_account_deletion.
create or replace function purge_account_data(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_orgs uuid[]; v_users uuid[]; v_staff uuid[]; r record; v_email text;
begin
  perform set_config('statement_timeout', '0', true);
  select email into v_email from auth.users where id = p_user;
  if v_email is null then return jsonb_build_object('orgs', 0, 'staff', 0, 'note', 'Tài khoản đã được xóa trước đó'); end if;
  if exists (select 1 from platform_admins where user_id = p_user) or exists (select 1 from platform_roles where user_id = p_user) then
    raise exception 'FORBIDDEN: Không xóa được tài khoản quản trị nền tảng.';
  end if;
  select coalesce(array_agg(o.id), '{}') into v_orgs
    from organizations o
   where exists (select 1 from organization_memberships m where m.organization_id = o.id and m.user_id = p_user and 'owner' = any (m.roles::text[]))
     and not exists (select 1 from organization_memberships m where m.organization_id = o.id and m.user_id <> p_user and m.status = 'active' and 'owner' = any (m.roles::text[]));
  v_orgs := v_orgs || coalesce(array(select o.id from organizations o where o.managed_by_org = any (v_orgs) and not (o.id = any (v_orgs))), '{}');
  select coalesce(array_agg(distinct x), '{}') into v_staff from (
    select s.user_id as x from staff_accounts s where s.organization_id = any (v_orgs)
    union select k.user_id from attendance_kiosks k where k.organization_id = any (v_orgs)) q;
  v_users := array[p_user] || v_staff;

  -- tắt trigger bảo vệ (nhật ký kho/thu tiền không xóa được, dấu vết kiểm toán...) trong lúc xóa; bật lại ở cuối
  for r in select c.oid::regclass as t from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' loop
    execute format('alter table %s disable trigger user', r.t);
  end loop;
  perform public.purge_rows_internal('organizations'::regclass, 'id = any (' || quote_literal(v_orgs::text) || '::uuid[])');
  delete from audit_events where organization_id = any (v_orgs);
  update audit_events set actor_id = null where actor_id = any (v_users);
  delete from organization_invitations where lower(email) = lower(v_email);
  delete from cooperative_invitations where lower(email) = lower(v_email);
  perform public.purge_rows_internal('auth.users'::regclass, 'id = any (' || quote_literal(v_users::text) || '::uuid[])');
  for r in select c.oid::regclass as t from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' loop
    execute format('alter table %s enable trigger user', r.t);
  end loop;
  return jsonb_build_object('orgs', coalesce(cardinality(v_orgs), 0), 'staff', coalesce(cardinality(v_staff), 0));
end $$;
revoke execute on function purge_rows_internal(regclass, text, integer), purge_account_data(uuid) from public, anon, authenticated;

-- Người dùng: yêu cầu / hủy yêu cầu / xem tình trạng
create or replace function request_account_deletion(p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); days integer; r account_deletion_requests; v_label text; v_name text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED: Cần đăng nhập'; end if;
  if exists (select 1 from platform_admins where user_id = v_uid) or exists (select 1 from platform_roles where user_id = v_uid) then
    raise exception 'FORBIDDEN: Tài khoản quản trị nền tảng không xóa theo cách này.';
  end if;
  select * into r from account_deletion_requests where user_id = v_uid and status = 'pending';
  if r.id is null then
    select coalesce((value #>> '{}')::integer, 14) into days from platform_settings where key = 'account_deletion_grace_days';
    select coalesce((select o.phone from owner_signups o where o.user_id = v_uid), (select s.phone from staff_accounts s where s.user_id = v_uid), (select u.email from auth.users u where u.id = v_uid)) into v_label;
    select (select o.full_name from owner_signups o where o.user_id = v_uid) into v_name;
    insert into account_deletion_requests (user_id, label, full_name, reason, scheduled_for)
      values (v_uid, v_label, v_name, nullif(left(trim(coalesce(p_reason, '')), 500), ''), now() + make_interval(days => greatest(coalesce(days, 14), 0)))
      returning * into r;
  end if;
  return jsonb_build_object('status', r.status, 'requested_at', r.requested_at, 'scheduled_for', r.scheduled_for);
end $$;

create or replace function cancel_account_deletion() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED: Cần đăng nhập'; end if;
  update account_deletion_requests set status = 'cancelled', decided_at = now(), decided_by = auth.uid()
   where user_id = auth.uid() and status = 'pending';
end $$;

create or replace function my_account_deletion() returns jsonb
language sql stable security definer set search_path = public as $$
  select (select jsonb_build_object('status', r.status, 'requested_at', r.requested_at, 'scheduled_for', r.scheduled_for)
            from account_deletion_requests r where r.user_id = auth.uid() and r.status = 'pending');
$$;
revoke execute on function request_account_deletion(text), cancel_account_deletion(), my_account_deletion() from public, anon;
grant execute on function request_account_deletion(text), cancel_account_deletion(), my_account_deletion() to authenticated;

-- Quản trị: danh sách và thực hiện
create or replace function admin_list_deletion_requests() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_guard();
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', r.id, 'label', r.label, 'full_name', r.full_name, 'reason', r.reason, 'status', r.status,
      'requested_at', r.requested_at, 'scheduled_for', r.scheduled_for, 'due', r.scheduled_for <= now(), 'decided_at', r.decided_at, 'summary', r.summary,
      'orgs', (select coalesce(jsonb_agg(o.name), '[]'::jsonb) from organizations o join organization_memberships m on m.organization_id = o.id
                where m.user_id = r.user_id and 'owner' = any (m.roles::text[])))
      order by (r.status = 'pending') desc, r.requested_at desc) from account_deletion_requests r), '[]'::jsonb);
end $$;

create or replace function admin_execute_account_deletion(p_id uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r account_deletion_requests; res jsonb;
begin
  perform admin_guard();
  select * into r from account_deletion_requests where id = p_id for update;
  if r.id is null then raise exception 'NOT_FOUND: Không tìm thấy yêu cầu.'; end if;
  if r.status <> 'pending' then raise exception 'ALREADY_DECIDED: Yêu cầu này đã được xử lý.'; end if;
  if r.scheduled_for > now() and length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'NOT_DUE: Chưa đến hạn chờ (%). Muốn xóa sớm hãy ghi lý do (ví dụ: người dùng gọi điện đề nghị xóa ngay).', to_char(r.scheduled_for at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY');
  end if;
  res := purge_account_data(r.user_id);
  update account_deletion_requests set status = 'done', decided_at = now(), decided_by = auth.uid(), summary = res where id = p_id;
  perform admin_audit(null, 'delete_account', 'account_deletion_requests', p_id::text, null, res, p_reason);
  return res;
end $$;
revoke execute on function admin_list_deletion_requests(), admin_execute_account_deletion(uuid, text) from public, anon;
grant execute on function admin_list_deletion_requests(), admin_execute_account_deletion(uuid, text) to authenticated;
