# Vai trò và quyền (đã chốt, quyết định D16–D18)

Nguồn sự thật là CSDL (RLS, hàm, trigger trong `supabase/migrations`, kiểm thử trong `supabase/tests/roles.test.mjs`).
Giao diện chỉ ẩn/hiện nút theo quy tắc này; máy chủ luôn kiểm tra lại.

## Nguyên tắc

1. **Một người có thể mang nhiều vai trò** trong cùng một cơ sở (ví dụ nhân viên kiêm Kho & chi phí, tổ trưởng kiêm Quản lý HTX). Quyền là **hợp** của các vai trò.
2. **Chủ cơ sở bao gồm mọi vai trò** ("chủ kiêm quản lý", kiêm kho & chi phí...). Chủ đứng một mình trong danh sách vai trò, không gán thêm.
3. **Tổ trưởng không phải vai trò cấp cơ sở** mà là **chỉ định theo tổ** (`worker_teams.leader_worker_id`). Tổ trưởng vẫn là một nhân viên bình thường, có thêm quyền **đối với tổ được giao**. Một người có thể làm trưởng nhiều tổ.
4. Vai trò **Quản lý HTX** chỉ gán được ở cơ sở loại HTX.
5. Người **không có tài khoản/điện thoại** chỉ là hồ sơ do tổ trưởng chấm hộ, bắt buộc thuộc tổ có tổ trưởng. Tổ trưởng phải **có tài khoản**.

Các vai trò gán được: **Quản lý**, **Nhân viên sản xuất**, **Kho & chi phí**, **Quản lý HTX** (HTX), **Biên tập hồ sơ**.

## Ma trận quyền

✔ có · — không · ✔* kèm điều kiện ghi dưới bảng

| Chức năng | Chủ | Quản lý | Tổ trưởng (theo tổ) | Nhân viên | Kho & chi phí | Quản lý HTX |
|---|---|---|---|---|---|---|
| Mời, gỡ, đổi vai trò, tạo tài khoản nhân viên, đặt lại mật khẩu | ✔ | — | — | — | — | — |
| Xem danh sách thành viên và tổ | ✔ | ✔ | — | — | — | ✔ |
| Tạo khu trồng và vụ, đổi trạng thái vụ | ✔ | ✔ | — | — | — | ✔ |
| Ghi nhật ký sản xuất | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Sửa/hủy nhật ký | mọi bản ghi | mọi bản ghi | ✔* | ✔* | ✔* | mọi bản ghi |
| Chấm công của chính mình | ✔ | ✔ | ✔ | ✔ | — | — |
| Chấm công hộ, ghi sản lượng cho người trong tổ | ✔ | ✔ | ✔ (tổ mình, không cho chính mình) | — | — | — |
| Xác nhận công, xử lý ngoại lệ GPS | ✔ | ✔ | ✔ (người trong tổ, không phải của chính mình) | — | — | — |
| Tạo tổ, chọn tổ trưởng, xếp người vào tổ | ✔ | ✔ | — | — | — | — |
| Đặt/sửa đơn giá lương | ✔ | — (xem) | — | — | — (xem) | — |
| Xem tiền công | ✔ | ✔ | chỉ của mình | chỉ của mình | ✔ | — |
| Lập bảng lương, rà soát, đưa lên chờ duyệt | ✔ | ✔ | — | — | — | — |
| **Duyệt, khóa, mở khóa kỳ lương** | ✔ | **—** | — | — | — | — |
| Ghi nhập kho, danh mục vật tư/kho | ✔ | — | — | — | ✔ | — |
| Ghi "xuất dùng" vật tư khi ghi việc | ✔ | ✔ | ✔ | ✔ | ✔ | — |
| Ghi chi phí, doanh thu | ✔ | — (xem) | — | — | ✔ | — (xem) |
| Xem chi phí, doanh thu, giá vốn | ✔ | ✔ | — | — | ✔ | ✔ |
| Gói dịch vụ của cơ sở (xem) | ✔ | ✔ | — | — | — | ✔ |

\* Người ghi sửa/hủy bản ghi **của mình trong 24 giờ** kể từ khi máy chủ nhận (giả định A10).

## Quyết định đã chốt (chủ sản phẩm đồng ý đề xuất, mục 1–9)

| Mục | Quyết định |
|---|---|
| 1 | Tổ trưởng là **chỉ định theo tổ**, không phải vai trò cấp cơ sở |
| 2 | Quản lý có phạm vi **toàn bộ cơ sở** (chưa phân theo khu trồng) |
| 3 | Quản lý **rà soát và xác nhận** công; **chỉ chủ duyệt, khóa, mở khóa** bảng lương |
| 4 | **Chỉ chủ** đặt và sửa đơn giá lương |
| 5 | Quản lý **xem được** chi phí, doanh thu, giá vốn, **không sửa** (sửa là việc của chủ và Kho & chi phí) |
| 6 | Tổ trưởng **không** xem tiền công của người trong tổ |
| 7 | Một tổ trưởng có thể trưởng **nhiều tổ** |
| 8 | Công của tổ trưởng do **quản lý hoặc chủ** xác nhận; tổ trưởng không tự xác nhận công của mình |
| 9 | Kiểu phân hệ "tổ trưởng chấm" bắt buộc thuộc **một tổ có tổ trưởng** |
| bổ sung | Một người **kiêm nhiều vai trò**; chủ bao gồm mọi vai trò |

## Cách kiểm tra

```bash
npm run test:db     # roles.test.mjs, members.test.mjs, staff.test.mjs...
```

Mỗi hàng trong ma trận có kiểm thử tương ứng (ví dụ: quản lý ghi chi phí bị từ chối, quản lý khóa kỳ lương bị từ chối, tổ trưởng tự xác nhận công của mình bị chặn, nhân viên kiêm Kho & chi phí ghi chi phí được).
