# Kế hoạch: Ghi nghỉ việc theo chấm công (mảng 3 của hồ sơ nhân sự; chờ duyệt, chưa làm)

Bối cảnh: người làm trong cơ sở phần lớn chỉ chấm công vào ca/ra ca, ít người dùng app, nên **không có luồng "nhân viên gửi đơn trong app"**. Người xin nghỉ nói miệng, nhắn Zalo hoặc gọi điện; **chủ, quản lý (hoặc tổ trưởng) ghi lại** ngay trong khu Chấm công. Bỏ bước "chờ duyệt": người ghi chính là người cho phép.

## 1. Ghi nghỉ ghi những gì

| Ô | Ý nghĩa |
|---|---|
| Người nghỉ | chọn từ danh sách người làm |
| Từ ngày, đến ngày | một ngày thì bằng nhau; có ô "nửa ngày" khi chỉ nghỉ một ngày |
| Loại nghỉ | Phép năm · Ốm · Việc gia đình (hiếu, hỉ, con ốm) · Nghỉ không lương · Nghỉ không báo trước · Khác |
| Có xin phép? | Có xin trước / Báo sau / Không báo (đánh dấu rõ "xin nghỉ" hay "tự nghỉ") |
| Xin qua đâu, ngày xin | Trực tiếp · Điện thoại · Zalo · Người khác báo; ngày được báo |
| Lý do | một dòng chữ |
| Hưởng lương? | Có / Không (mặc định theo loại; **chỉ ghi nhận, chưa nối vào phiếu lương**) |
| Ảnh đính kèm | giấy khám bệnh, tin nhắn… (không bắt buộc) |
| Ghi chú | tùy ý |

## 2. Hiện ở đâu

- **Chấm công → thêm mục "Nghỉ"** (cạnh Hôm nay / Danh sách): danh sách ghi nghỉ theo tháng, lọc theo người và loại; nút "＋ Ghi nghỉ".
- **Chấm công → Hôm nay / Danh sách**: người đang nghỉ có phép hiện nhãn "Nghỉ phép (ốm)…" để không bị hiểu là vắng; nếu hôm đó vẫn có ca chấm công thì hiện cảnh báo "đã ghi nghỉ nhưng có chấm công" (không chặn).
- **Hồ sơ nhân sự của từng người**: thêm dòng tóm tắt "Năm nay nghỉ X ngày (phép năm Y/12)".
- **Báo cáo** (bước sau): bảng nghỉ theo người/tháng.

## 3. Quy tắc

- Quyền ghi: chủ, quản lý; tổ trưởng ghi cho người trong tổ mình (cùng quy tắc "Chấm công cho người làm" hiện có). Xem: người xem được Chấm công.
- Không trùng ngày với một ghi nghỉ còn hiệu lực khác của cùng người; từ ngày ≤ đến ngày; tối đa 90 ngày một lần ghi.
- Ghi ngày quá khứ được (ghi bù); ghi ngày tương lai được (báo trước).
- Sửa có phiên bản (CONFLICT → tải lại); hủy = đánh dấu, không xóa; bấm lặp không nhân đôi (UUID tạo ở thiết bị); lưu nhật ký kiểm toán.
- **Cần mạng** (chức năng quản lý, không offline).
- Phép năm: mỗi cơ sở đặt số ngày phép/năm (mặc định 12 theo Bộ luật Lao động; sửa được); tính số ngày nghỉ loại "Phép năm" đã dùng trong năm, hiện còn lại. Chưa chặn khi vượt, chỉ cảnh báo.

## 4. Làm theo bước

1. **Bước 1** (migration `app_absences`): bảng `worker_absences`, hàm `create/update/cancel_worker_absence`, kiểm trùng ngày, test quyền và ràng buộc; giao diện mục "Nghỉ" và nút Ghi nghỉ; nhãn nghỉ ở Hôm nay/Danh sách; cảnh báo nghỉ mà vẫn có công.
2. **Bước 2**: phép năm còn lại (cài đặt số ngày/năm + dòng tóm tắt trong hồ sơ người) và báo cáo nghỉ theo người/tháng.
3. **Sau này (khi có khách cần)**: nối vào phiếu lương (nghỉ không lương trừ công, nghỉ ốm theo chế độ); nhắc nghỉ sắp tới trong bản tin sáng.

## 5. Không làm

Không có đơn nghỉ do nhân viên gửi trong app; không duyệt nhiều bước; không xếp ca; không tự trừ lương.

## 6. Gói dùng thử

Mục này khóa cùng nhóm Chấm công/Khoán công ở bước 2 của kế hoạch gói dùng thử (xem `PLAN_GOI_DUNG_THU.md`).
