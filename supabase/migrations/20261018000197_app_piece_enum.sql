-- Mục 11 báo cáo đối thủ: PHIẾU KHOÁN. Thêm loại khoản "piece" (tiền khoán) vào khoản cộng/trừ của kỳ lương. Tách file riêng vì giá trị enum mới chỉ dùng được sau khi được ghi nhận (như 0067).
alter type pay_adjustment_kind add value if not exists 'piece';
