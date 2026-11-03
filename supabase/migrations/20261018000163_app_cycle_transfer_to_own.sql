-- D156: chuyển MỘT CHIỀU "vụ theo HTX" → "vụ riêng" của hộ (chủ sản phẩm đồng ý 03/11/2026; chiều ngược lại để sau).
-- Điều kiện: hộ ĐÃ ĐĂNG KÝ TÀI KHOẢN RIÊNG (không phải hộ do HTX tạo và quản lý), còn gói dịch vụ hiệu lực (dùng thử còn hạn hoặc đã mua) và còn hạn mức số vụ.
-- Quy trình: hộ gửi yêu cầu → HTX duyệt (có thể từ chối kèm lý do) → duyệt thì chuyển chủ vụ sang hộ. Có lịch sử (bảng yêu cầu giữ lại).
-- Chuyển theo vụ: nhật ký, giai đoạn, ghi chú, sự cố, mốc, cách ly, cân, thức ăn, việc, THU HOẠCH. Giữ nguyên ở sổ HTX: chi phí và doanh thu HTX đã ghi,
-- phiếu thu mua HTX–hộ, chấm công của nhân sự HTX (là giao dịch/ghi nhận của HTX, không thuộc sản xuất của hộ).

create table if not exists cycle_transfer_requests (
  id uuid primary key,
  cycle_id uuid not null references production_cycles(id) on delete cascade,
  cooperative_org_id uuid not null references organizations(id) on delete cascade,
  household_org_id uuid not null references organizations(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  note text check (note is null or length(note) <= 500),
  decision_reason text check (decision_reason is null or length(decision_reason) <= 500),
  requested_by uuid references auth.users(id) default auth.uid(),
  decided_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create unique index if not exists cycle_transfer_one_pending on cycle_transfer_requests (cycle_id) where status = 'pending';
create index if not exists cycle_transfer_coop_idx on cycle_transfer_requests (cooperative_org_id, created_at desc);
create index if not exists cycle_transfer_hh_idx on cycle_transfer_requests (household_org_id, created_at desc);
alter table cycle_transfer_requests enable row level security;
drop policy if exists cycle_transfer_read on cycle_transfer_requests;
create policy cycle_transfer_read on cycle_transfer_requests for select to authenticated
  using (has_perm(cooperative_org_id, 'coop', 'view') or is_org_member(household_org_id));
-- ghi chỉ qua hàm

-- hộ có thể nhận vụ riêng không? (dùng chung cho gửi yêu cầu và duyệt). Trả về null nếu được, ngược lại là thông báo lý do.
create or replace function cycle_transfer_blocker(p_cycle uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare c production_cycles; v_hh uuid; hh organizations; sub subscriptions; used integer;
begin
  select * into c from production_cycles where id = p_cycle;
  if c.id is null then return 'Không tìm thấy vụ.'; end if;
  v_hh := cycle_area_org(p_cycle);
  select * into hh from organizations where id = v_hh;
  if c.owner_org_id = v_hh then return 'Vụ này đã là vụ riêng của hộ.'; end if;
  if (select type from organizations where id = c.owner_org_id) is distinct from 'cooperative' then return 'Chỉ chuyển được vụ đang ghi theo HTX.'; end if;
  if hh.id is null or hh.type <> 'household' then return 'Vụ không nằm trên khu của một hộ.'; end if;
  if not exists (select 1 from cooperative_memberships cm where cm.household_org_id = v_hh and cm.cooperative_org_id = c.owner_org_id and cm.status = 'active') then
    return 'Hộ không còn thuộc HTX chủ vụ.';
  end if;
  if hh.managed_by_org is not null then return 'Hộ do HTX tạo và quản lý (chưa có tài khoản riêng) nên chưa chuyển được. Hộ cần đăng ký tài khoản của mình trước.'; end if;
  if c.status = 'cancelled' then return 'Vụ đã hủy.'; end if;
  select * into sub from current_subscription(v_hh);
  if sub.id is null then return 'Hộ chưa có gói dịch vụ còn hiệu lực (hết hạn dùng thử hoặc chưa mua gói). Hộ cần mua gói để quản lý vụ riêng.'; end if;
  if c.status in ('active', 'paused') then
    select count(*)::int into used from production_cycles x where x.owner_org_id = v_hh and x.status in ('active', 'paused');
    if used >= sub.max_cycles then return format('Hộ đã dùng %s/%s vụ của gói. Hộ cần kết thúc bớt vụ hoặc nâng gói.', used, sub.max_cycles); end if;
  end if;
  return null;
end $$;

create or replace function request_cycle_to_own(p_id uuid, p_cycle uuid, p_note text) returns cycle_transfer_requests
language plpgsql security definer set search_path = public as $$
declare r cycle_transfer_requests; c production_cycles; v_hh uuid; v_block text;
begin
  select * into r from cycle_transfer_requests where id = p_id;
  if r.id is not null then return r; end if;
  select * into c from production_cycles where id = p_cycle;
  if c.id is null then raise exception 'NOT_FOUND: Không tìm thấy vụ.'; end if;
  v_hh := cycle_area_org(p_cycle);
  if not has_org_role(v_hh, array['owner']::member_role[]) then raise exception 'FORBIDDEN: Chỉ chủ hộ gửi được yêu cầu chuyển vụ sang vụ riêng.'; end if;
  v_block := cycle_transfer_blocker(p_cycle);
  if v_block is not null then raise exception 'TRANSFER_BLOCKED: %', v_block; end if;
  if exists (select 1 from cycle_transfer_requests x where x.cycle_id = p_cycle and x.status = 'pending') then
    raise exception 'ALREADY_REQUESTED: Vụ này đã có yêu cầu đang chờ HTX duyệt.';
  end if;
  insert into cycle_transfer_requests (id, cycle_id, cooperative_org_id, household_org_id, note)
    values (p_id, p_cycle, c.owner_org_id, v_hh, nullif(trim(coalesce(p_note, '')), '')) returning * into r;
  return r;
end $$;

create or replace function cancel_cycle_transfer_request(p_request uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r cycle_transfer_requests;
begin
  select * into r from cycle_transfer_requests where id = p_request for update;
  if r.id is null or r.status <> 'pending' then raise exception 'NOT_FOUND: Không có yêu cầu đang chờ.'; end if;
  if not has_org_role(r.household_org_id, array['owner']::member_role[]) then raise exception 'FORBIDDEN'; end if;
  update cycle_transfer_requests set status = 'cancelled', decided_by = auth.uid(), decided_at = now() where id = p_request;
end $$;

create or replace function decide_cycle_transfer(p_request uuid, p_approve boolean, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare r cycle_transfer_requests; v_block text; t text;
begin
  select * into r from cycle_transfer_requests where id = p_request for update;
  if r.id is null or r.status <> 'pending' then raise exception 'NOT_FOUND: Không có yêu cầu đang chờ.'; end if;
  if not has_perm(r.cooperative_org_id, 'coop', 'edit') then raise exception 'FORBIDDEN: Chỉ HTX (có quyền quản lý hộ thành viên) duyệt yêu cầu này.'; end if;
  if not p_approve then
    if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'REASON_REQUIRED: Hãy ghi lý do từ chối (ít nhất 3 ký tự).'; end if;
    update cycle_transfer_requests set status = 'rejected', decision_reason = trim(p_reason), decided_by = auth.uid(), decided_at = now() where id = p_request;
    return;
  end if;
  v_block := cycle_transfer_blocker(r.cycle_id);
  if v_block is not null then raise exception 'TRANSFER_BLOCKED: %', v_block; end if;
  -- chuyển chủ vụ (trigger hạn mức kiểm hộ nhận khi vụ đang chạy/tạm dừng)
  update production_cycles set owner_org_id = r.household_org_id where id = r.cycle_id;
  -- ghi nhận sản xuất đi theo vụ sang sổ của hộ
  foreach t in array array['activity_logs', 'production_stages', 'harvest_records', 'cycle_notes', 'cycle_count_events', 'cycle_incidents', 'incident_actions',
                           'cycle_milestones', 'cycle_withdrawal', 'cycle_weighings', 'cycle_feed_entries', 'production_tasks'] loop
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'organization_id')
       and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'cycle_id') then
      -- bước 1: chạm vào dòng để trigger đồng bộ cơ sở theo chủ vụ chạy (các trigger bảo vệ chặn ĐỔI TRỰC TIẾP cơ sở của nhật ký/thu hoạch...)
      execute format('update %I set cycle_id = cycle_id where cycle_id = $1 and organization_id is distinct from $2', t) using r.cycle_id, r.household_org_id;
      -- bước 2: bảng không có trigger đồng bộ thì đặt thẳng
      execute format('update %I set organization_id = $1 where cycle_id = $2 and organization_id is distinct from $1', t) using r.household_org_id, r.cycle_id;
    end if;
  end loop;
  update cycle_transfer_requests set status = 'approved', decision_reason = nullif(trim(coalesce(p_reason, '')), ''), decided_by = auth.uid(), decided_at = now() where id = p_request;
end $$;

revoke execute on function cycle_transfer_blocker(uuid), request_cycle_to_own(uuid, uuid, text), cancel_cycle_transfer_request(uuid),
  decide_cycle_transfer(uuid, boolean, text) from public, anon;
grant execute on function cycle_transfer_blocker(uuid), request_cycle_to_own(uuid, uuid, text), cancel_cycle_transfer_request(uuid),
  decide_cycle_transfer(uuid, boolean, text) to authenticated;
