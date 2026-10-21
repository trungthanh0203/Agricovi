-- D46: chủ tạm dừng / dùng lại một thành viên. Tạm dừng = người đó không còn thuộc cơ sở (mọi kiểm tra quyền đều đòi
-- trạng thái 'active') nên không vào được dữ liệu; lịch sử đã ghi vẫn giữ. Dùng lại = trả về 'active' (vai trò, quyền, chức vụ giữ nguyên).
alter type member_status add value if not exists 'suspended';
