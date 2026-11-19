-- D204: RÀ SOÁT QUY TẮC BẢO MẬT HÀNG (RLS) CHẬM TRÊN BẢNG NHIỀU DÒNG.
-- Vấn đề (đo ở D203 với bảng công): chính sách `has_perm(organization_id, ...)`, `is_workforce_admin(organization_id)`, `is_worker_self(worker_id)`... được gọi cho TỪNG DÒNG
-- khi đọc; mỗi lần là một hàm có truy vấn bên trong (kiểm tư cách thành viên, vai trò, chức vụ, quyền cấp riêng). Cơ sở đông người có hàng chục nghìn dòng công, chi phí,
-- giao dịch kho... nên cộng lại mất hàng giây (đo: ~0,2 ms mỗi dòng trên bản chạy thử).
-- Cách sửa (cùng mẫu đã dùng ở 0147 cho nhật ký/vụ): tính TẬP tổ chức/người được phép MỘT lần cho cả câu truy vấn, rồi mỗi dòng chỉ tra tập đó (`x in (select ...)`
-- là InitPlan băm một lần). Mỗi hàm tập dưới đây có test đối chiếu từng người × từng tổ chức với hàm cũ nên quyền KHÔNG đổi.
-- Chỉ đổi chính sách ĐỌC (SELECT) của các bảng có thể nhiều dòng; chính sách ghi giữ nguyên (mỗi lệnh ghi chỉ chạm ít dòng).

-- ---------------------------------------------------------------------------
-- 1. Các hàm tập (SECURITY DEFINER, STABLE: chạy một lần mỗi câu truy vấn)
-- ---------------------------------------------------------------------------
-- Tổ chức mà người đang đăng nhập có quyền `p_need` ở mục `p_module` (đúng như has_perm cho từng tổ chức)
create or replace function perm_orgs(p_module text, p_need text default 'view') returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.organization_id from organization_memberships m
   where m.user_id = auth.uid() and m.status = 'active' and has_perm(m.organization_id, p_module, p_need);
$$;
-- Tổ chức mà người đó là chủ hoặc quản lý (đúng như is_workforce_admin)
create or replace function admin_org_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.organization_id from organization_memberships m
   where m.user_id = auth.uid() and m.status = 'active' and is_workforce_admin(m.organization_id);
$$;
-- Tổ chức mà người đó là chủ (đúng như has_org_role(org, array['owner']))
create or replace function owner_org_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.organization_id from organization_memberships m
   where m.user_id = auth.uid() and m.status = 'active' and has_org_role(m.organization_id, array['owner']::member_role[]);
$$;
-- Tổ chức mà người đó là thành viên đang hoạt động (đúng như is_org_member)
create or replace function member_org_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.organization_id from organization_memberships m
   where m.user_id = auth.uid() and m.status = 'active' and is_org_member(m.organization_id);
$$;
-- Hồ sơ lao động của chính mình (đúng như is_worker_self)
create or replace function my_worker_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select w.id from worker_profiles w
   where w.user_id = auth.uid() and w.status = 'active' and not account_blocked();
$$;
-- Người làm trong các tổ mình làm tổ trưởng (đúng như is_team_leader_of)
create or replace function led_worker_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.worker_id
    from worker_team_memberships m
    join worker_teams t on t.id = m.team_id and t.is_active
    join worker_profiles lead on lead.id = t.leader_worker_id and lead.user_id = auth.uid() and lead.status = 'active'
   where not account_blocked() and m.valid_from <= current_date and (m.valid_to is null or m.valid_to >= current_date);
$$;
revoke execute on function perm_orgs(text, text), admin_org_ids(), owner_org_ids(), member_org_ids(), my_worker_ids(), led_worker_ids() from public, anon;
grant execute on function perm_orgs(text, text), admin_org_ids(), owner_org_ids(), member_org_ids(), my_worker_ids(), led_worker_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Chính sách đọc: bảng theo quyền mục (expenses, sales, inventory, payroll, declare)
-- ---------------------------------------------------------------------------
alter policy expense_read on expense_records using (organization_id in (select perm_orgs('expenses', 'view')));
alter policy bills_read on purchase_bills using (organization_id in (select perm_orgs('expenses', 'view')));
alter policy bill_pay_read on bill_payments using (organization_id in (select perm_orgs('expenses', 'view')));
alter policy sales_read on sales_records using (organization_id in (select perm_orgs('sales', 'view')));
alter policy sale_rec_read on sale_receipts using (organization_id in (select perm_orgs('sales', 'view')));
alter policy inv_txn_read on inventory_transactions using (organization_id in (select perm_orgs('inventory', 'view')));
alter policy material_lots_read on material_lots using (organization_id in (select perm_orgs('inventory', 'view')));
alter policy stocktakes_read on stocktakes using (organization_id in (select perm_orgs('inventory', 'view')));
alter policy assets_read on assets using (organization_id in (select perm_orgs('expenses', 'view')));
alter policy asset_posts_read on asset_depreciation_posts using (organization_id in (select perm_orgs('expenses', 'view')));
alter policy asset_maint_read on asset_maintenance using (organization_id in (select perm_orgs('expenses', 'view')));
alter policy checklist_answers_read on checklist_answers using (organization_id in (select perm_orgs('declare', 'view')));
alter policy checklist_audits_read on checklist_audits using (organization_id in (select perm_orgs('declare', 'view')));
alter policy worker_hr_read on worker_hr using (organization_id in (select perm_orgs('payroll', 'view')));
alter policy worker_contracts_read on worker_contracts using (organization_id in (select perm_orgs('payroll', 'view')));
alter policy rates_read on work_rates using (organization_id in (select perm_orgs('payroll', 'view')));
alter policy partners_read on partners using (
  (is_supplier and organization_id in (select perm_orgs('expenses', 'view'))) or (is_customer and organization_id in (select perm_orgs('sales', 'view'))));

-- ---------------------------------------------------------------------------
-- 3. Chính sách đọc: công, nghỉ, bảng chấm công, nhật ký kiểm toán
-- ---------------------------------------------------------------------------
alter policy att_read on attendance_records using (
  organization_id in (select admin_org_ids()) or worker_id in (select my_worker_ids()) or worker_id in (select led_worker_ids()));
alter policy out_read on work_output_records using (
  organization_id in (select admin_org_ids()) or worker_id in (select my_worker_ids()) or worker_id in (select led_worker_ids()));
alter policy worker_absences_read on worker_absences using (
  organization_id in (select admin_org_ids()) or worker_id in (select led_worker_ids()) or worker_id in (select my_worker_ids()));
alter policy attendance_photos_read on attendance_photos using (organization_id in (select admin_org_ids()));
alter policy timesheet_sheets_read on timesheet_sheets using (organization_id in (select admin_org_ids()) or created_by = auth.uid());
alter policy audit_read on audit_events using (organization_id in (select owner_org_ids()) or (select is_platform_admin()));
alter policy wp_read on worker_profiles using (organization_id in (select admin_org_ids()) or user_id = auth.uid() or id in (select led_worker_ids()));
alter policy tm_read on worker_team_memberships using (
  worker_org(worker_id) in (select admin_org_ids()) or worker_id in (select my_worker_ids()) or worker_id in (select led_worker_ids()));

-- ---------------------------------------------------------------------------
-- 4. Chính sách đọc: tiền công
-- ---------------------------------------------------------------------------
alter policy padj_read on pay_adjustments using (organization_id in (select perm_orgs('payroll', 'view')) or worker_id in (select my_worker_ids()));
alter policy stmt_read on worker_pay_statements using (organization_id in (select perm_orgs('payroll', 'view')) or worker_id in (select my_worker_ids()));
alter policy lines_read on pay_statement_lines using (
  organization_id in (select perm_orgs('payroll', 'view'))
  or statement_id in (select s.id from worker_pay_statements s where s.worker_id in (select my_worker_ids())));

-- ---------------------------------------------------------------------------
-- 5. Chính sách đọc: theo vụ (đo đạc, kỳ, kế hoạch ăn) và nhật ký không gắn vụ
-- ---------------------------------------------------------------------------
alter policy measure_read on measure_readings using (cycle_id in (select readable_cycle_ids()));
alter policy cycle_periods_read on cycle_periods using (cycle_id in (select readable_cycle_ids()));
alter policy cycle_feed_plans_read on cycle_feed_plans using (cycle_id in (select readable_cycle_ids()));
alter policy logs_read on activity_logs using (
  case when cycle_id is not null then cycle_id in (select readable_cycle_ids()) else organization_id in (select member_org_ids()) end);

-- ---------------------------------------------------------------------------
-- 6. Chính sách đọc: thu mua của HTX
-- ---------------------------------------------------------------------------
alter policy proc_receipts_read on procurement_receipts using (
  cooperative_org_id in (select perm_orgs('coop', 'view')) or household_org_id in (select perm_orgs('sales', 'view')));
alter policy proc_payments_read on procurement_payments using (
  cooperative_org_id in (select perm_orgs('coop', 'view')) or household_org_id in (select perm_orgs('sales', 'view')));
