-- Thu hẹp quyền đọc bảng thành viên. Trước đây mọi thành viên đọc được MỌI dòng thành viên cùng cơ sở
-- (mã người dùng + vai trò của đồng nghiệp). Điều đó vừa lộ thông tin vừa khiến app lấy nhầm vai trò của người khác.
-- Giờ: ai cũng đọc được dòng CỦA MÌNH; chủ và quản lý đọc được dòng của cả cơ sở.
-- Danh sách thành viên kèm email/số điện thoại vẫn lấy qua list_org_members (kiểm quyền riêng).

drop policy memb_read on organization_memberships;
create policy memb_read on organization_memberships for select to authenticated
  using (user_id = auth.uid()
         or has_org_role(organization_id, array['owner', 'manager']::member_role[]));
