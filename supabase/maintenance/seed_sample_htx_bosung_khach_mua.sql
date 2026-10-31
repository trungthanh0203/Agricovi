-- BỔ SUNG cho dữ liệu mẫu HTX đã nạp: ghi tên khách vào cột "người mua" của các lần bán có khách (bản nạp đầu để trống nên danh sách Doanh thu không thấy khách).
-- Chỉ sửa các lần bán MẪU có khách mà chưa có ghi chú người mua. Chạy lại an toàn. Dán vào Supabase → SQL Editor, sửa v_email nếu cần, bấm Run.
do $$
declare
  v_email constant text := 'trungthanhfx23@gmail.com';
  v_user uuid; v_org uuid; n int;
begin
  select id into v_user from auth.users where lower(email) = lower(v_email);
  if v_user is null then raise exception 'Không tìm thấy tài khoản có email %.', v_email; end if;
  select o.id into v_org from organizations o join organization_memberships m on m.organization_id = o.id and m.user_id = v_user and 'owner' = any (m.roles::text[])
   order by (o.type = 'cooperative') desc, o.created_at limit 1;
  if v_org is null then raise exception 'Không tìm thấy cơ sở của tài khoản %.', v_email; end if;
  update sales_records s set buyer_note = p.name
    from partners p, production_cycles c
   where p.id = s.partner_id and c.id = s.cycle_id and c.owner_org_id = v_org and c.code like 'MAU-%'
     and s.partner_id is not null and nullif(trim(coalesce(s.buyer_note, '')), '') is null;
  get diagnostics n = row_count;
  raise notice 'Đã ghi tên khách cho % lần bán mẫu.', n;
end $$;
