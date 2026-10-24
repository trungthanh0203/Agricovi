-- V3 (D86): hai giá trị mới cho trả công theo người. Tách file riêng vì giá trị enum mới chỉ dùng được ở giao dịch sau.
alter type rate_type add value if not exists 'month';          -- lương cố định theo tháng
alter type pay_line_type add value if not exists 'salary';     -- dòng lương cố định trong bảng lương
