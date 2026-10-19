-- Audit tự động cho thay đổi quan trọng và thu hẹp quyền mặc định. Tham chiếu: NFR-SEC-005/006/007, FR-LOG-005.

-- Ghi giá trị trước/sau của mọi INSERT/UPDATE/DELETE trên bảng quan trọng. Người dùng không ghi/sửa/xóa audit được.
create or replace function audit_row_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  j_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  j_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  j     jsonb := coalesce(j_new, j_old);
  org   uuid;
begin
  org := coalesce((j->>'organization_id')::uuid, (j->>'owner_org_id')::uuid,
                  (j->>'household_org_id')::uuid, (j->>'id')::uuid);
  -- tổ chức = khóa 'id' chỉ đúng với bảng organizations; các bảng khác luôn có cột org riêng
  if tg_table_name <> 'organizations' and (j->>'organization_id') is null and (j->>'owner_org_id') is null
     and (j->>'household_org_id') is null then
    org := null;
  end if;
  insert into audit_events (organization_id, actor_id, action, entity, entity_id, before, after)
  values (org, auth.uid(), tg_op, tg_table_name, j->>'id', j_old, j_new);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'organization_memberships', 'cooperative_memberships',
    'plan_tiers', 'subscriptions', 'payment_records', 'platform_settings',
    'production_cycles', 'activity_logs', 'harvest_records', 'expense_records', 'sales_records',
    'attendance_records', 'attendance_adjustments', 'work_rates', 'work_output_records',
    'payroll_periods', 'worker_pay_statements', 'pay_adjustments',
    'business_profiles', 'publication_consents', 'publication_reviews', 'certification_records'
  ] loop
    execute format('create trigger %I after insert or update or delete on %I for each row execute function audit_row_change()',
                   'audit_' || t, t);
  end loop;
end $$;

-- audit_events: chỉ đọc, không ai sửa/xóa qua API
create or replace function audit_events_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'AUDIT_IMMUTABLE: Nhật ký kiểm toán không được sửa hoặc xóa';
end $$;
create trigger audit_events_no_mod before update or delete on audit_events
  for each row execute function audit_events_immutable();

-- ---------------------------------------------------------------------------
-- Quyền mức bảng (lớp phòng thủ thứ hai ngoài RLS)
-- ---------------------------------------------------------------------------
-- Khách chưa đăng nhập (anon) KHÔNG đọc được bảng nội bộ nào, chỉ public_* và danh bạ công khai.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant select on public_profiles, public_products, public_directory to anon;

-- Người đăng nhập: RLS quyết định hàng được thấy/ghi. Audit chỉ đọc.
revoke insert, update, delete on audit_events from authenticated;
revoke all on platform_admins, platform_reviewers from authenticated;

-- Bản ghi giao dịch kho chỉ thêm
revoke update, delete on inventory_transactions from authenticated;

-- Hàm đổi trạng thái hồ sơ: chỉ người đăng nhập gọi được (bên trong tự kiểm quyền)
-- PostgreSQL cấp EXECUTE cho PUBLIC theo mặc định nên phải thu hồi cả PUBLIC lẫn anon.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
-- Ngoại lệ duy nhất cho anon: hàm hẹp phục vụ view xếp hạng công khai (không trả giá/hạn gói)
grant execute on function public_org_priority(uuid) to anon;

-- Cấu hình mặc định cho các bảng/hàm tạo sau này trong schema public: không cấp cho anon/PUBLIC
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges in schema public grant execute on functions to authenticated, service_role;
