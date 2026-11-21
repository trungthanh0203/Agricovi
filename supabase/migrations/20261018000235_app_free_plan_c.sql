-- D221: chỉnh gói Khởi đầu theo chủ sản phẩm (21/11/2026), docs/PLAN_GOI_MIEN_PHI.md.
--  1. HTX Khởi đầu thêm được 1 hộ thành viên; hộ đó có gói Khởi đầu RIÊNG (1 phân khu, 1 ô, 1 vụ riêng, không tính vào vụ của HTX).
--  2. Gói Khởi đầu được công khai vụ, hồ sơ và tin giao thương (bỏ chặn của 0220).
--  3. Đọc ảnh bằng AI (hóa đơn, phiếu nhập kho...): cho dùng 2 lần mỗi tháng (cấu hình invoice_scan_trial_limit); bỏ khỏi danh sách khóa.
--  4. Bỏ "nâng cấp thử đầy đủ 30 ngày". Cột full_trial_* và hàm sub_scoped/sub_max_cycles còn lại nhưng luôn rỗng (không dùng nữa).

-- 1. Hộ thuộc HTX Khởi đầu (miễn phí) được tạo vụ riêng theo hạn mức gói riêng của hộ (luật D148 chỉ còn áp dụng khi HTX có gói trả phí)
create or replace function org_has_paid_plan(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from current_subscription(p_org) s where s.status = 'active' and s.price_per_quarter > 0)
      or exists (select 1 from cooperative_memberships cm
                  where cm.household_org_id = p_org and cm.status = 'active' and org_scoped_trial(cm.cooperative_org_id));
$$;

-- 2. Bỏ chặn công khai
drop trigger if exists public_cycles_trial_block on public_cycles;
drop trigger if exists business_profiles_trial_block on business_profiles;
drop trigger if exists trade_posts_trial_block on trade_posts;
drop function if exists block_scoped_trial_publish();

-- 3. AI đọc ảnh: 2 lần mỗi tháng (hạn mức lấy từ invoice_scan_trial_limit, mặc định 2)
update platform_settings set value = '["attendance","export_reports"]'::jsonb,
       description = 'Tính năng khóa ở gói Khởi đầu: attendance (chấm công, bảng giấy), invoice_scan (đọc ảnh bằng AI; để trống = dùng 2 lần/tháng), export_reports (xuất tệp CSV; chỉ khóa ở giao diện)'
 where key = 'free_locked_features';

-- 4. Bỏ nâng cấp thử đầy đủ
drop function if exists start_full_trial(uuid);
delete from platform_settings where key = 'full_trial_days';

create or replace function my_free_plan_state(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare sub subscriptions;
begin
  if not is_org_member(p_org) then raise exception 'FORBIDDEN: Bạn không thuộc cơ sở này.'; end if;
  select * into sub from subscriptions where organization_id = p_org and is_scoped_trial order by period_end desc limit 1;
  if sub.id is null then return jsonb_build_object('free', false); end if;
  return jsonb_build_object(
    'free', true,
    'scoped', now() < sub.period_end,
    'expired', now() >= sub.period_end and (select cs.id from current_subscription(p_org) cs) is null,
    'period_end', sub.period_end,
    'days_left', greatest(ceil(extract(epoch from sub.period_end - now()) / 86400)::integer, 0),
    'locked_features', coalesce((select value from platform_settings where key = 'free_locked_features'), '[]'::jsonb)
  );
end $$;
revoke execute on function my_free_plan_state(uuid) from public, anon;
grant execute on function my_free_plan_state(uuid) to authenticated;

create or replace function block_locked_feature() returns trigger
language plpgsql security definer set search_path = public as $$
declare feat text := tg_argv[0]; v_org uuid := (to_jsonb(new)->>'organization_id')::uuid;
begin
  if v_org is not null and org_feature_locked(v_org, feat) then
    raise exception 'FEATURE_LOCKED: Tính năng này có ở gói trả phí. Vào Cơ sở của tôi → Gói dịch vụ để nâng cấp.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function block_locked_feature() from public, anon, authenticated;
