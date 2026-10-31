-- (1) Danh sách gói ở app hiện ĐỦ các gói đang mở của loại cơ sở (Hộ hoặc HTX), kể cả gói dùng thử (đánh dấu is_trial, miễn phí, không có nút đăng ký) (D134).
-- (2) Chỉ mục cho các truy vấn lọc theo cơ sở/ngày thường gặp khi dữ liệu lớn (chính sách bảo mật hàng và danh sách đều lọc theo organization_id).
create or replace function list_purchasable_plans(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t org_type;
begin
  if not has_org_role(p_org, array['owner']::member_role[]) then raise exception 'FORBIDDEN: Chỉ chủ cơ sở xem và mua gói dịch vụ.'; end if;
  select type into t from organizations where id = p_org;
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'max_cycles', p.max_cycles, 'price_per_quarter', p.price_per_quarter, 'is_trial', p.is_trial_default)
                                    order by p.is_trial_default desc, p.price_per_quarter, p.name)
                     from plan_tiers p where p.org_type = t and p.is_active), '[]'::jsonb);
end $$;

create index if not exists sales_records_org_date_idx on sales_records (organization_id, sold_date);
create index if not exists worker_profiles_org_status_idx on worker_profiles (organization_id, status);
create index if not exists inventory_txn_org_date_idx on inventory_transactions (organization_id, txn_date);
create index if not exists production_areas_org_idx on production_areas (organization_id);
