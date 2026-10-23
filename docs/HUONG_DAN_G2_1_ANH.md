# G2-1 — Kho ảnh mới: hướng dẫn thực hiện từng bước

Áp dụng cho ảnh **vận hành của app**: trang trại, sản phẩm (cây/vật nuôi), vật tư, giấy phép/chứng chỉ. Ảnh **công khai của website** (hồ sơ thương mại, bài viết, gian hàng, tin giao thương) **chưa đổi**, vẫn như cũ.

## 1. Cách hoạt động (ngắn gọn)

- Ảnh mới là **tệp JPEG** nằm trong kho riêng `org-media` của Supabase; cột `image` trong bảng chỉ còn dòng ngắn `storage:<mã cơ sở>/<loại>/<mã ảnh>.jpg`.
- Mỗi ảnh có hai bản: **ảnh nhỏ** (khoảng 240 px, vài KB, dùng trong danh sách) và **ảnh đầy đủ** (khoảng 1024 px, dưới 1 MB).
- Kho là **riêng tư**: chỉ người trong cơ sở xem được; chỉ người có quyền sửa mục tương ứng (chủ, quản lý, hoặc được cấp quyền Khai báo/Kho) mới thêm được.
- App tải ảnh khi cần rồi **lưu trên máy** nên xem lại không tốn mạng, xem được cả khi mất mạng; tối đa 400 ảnh, quá thì bỏ ảnh lâu không xem.
- **Ảnh cũ vẫn hiện bình thường** trong lúc chưa chuyển. Có nút chuyển ảnh cũ sang kho mới (bước 5).
- Thêm ảnh mới **cần có mạng** (theo D24).

## 2. Trước khi làm — kiểm tra

1. Bạn đã `db push` các migration cũ (0016 → 0053) chưa? Migration 0054 **không cần** các migration cũ nếu chúng đã được đẩy lên rồi; nếu chưa đẩy thì `db push` sẽ đẩy **tất cả theo thứ tự**, hãy làm theo hướng dẫn ở `docs/PLAN_GIAI_DOAN_2_APP.md` mục Lát 0 trước.
2. Gói Supabase: bản Free có 1 GB lưu trữ, đủ để thử. Chạy thật nên dùng gói Pro (có sao lưu).
3. Mở dự án Supabase trên trình duyệt, vào **Storage** để biết giao diện (bước 4 sẽ kiểm tra ở đây).

## 3. Đẩy migration (người dùng tự chạy, Claude không chạy)

Trong thư mục dự án, mở Terminal:

```bash
npx supabase db push
```

- Lệnh sẽ liệt kê các migration sắp đẩy; kiểm tra có `20261018000054_app_media_storage.sql` rồi gõ `Y`.
- Migration này **chỉ thêm**: tạo kho `org-media`, một hàm kiểm đường dẫn `media_org` và 3 chính sách (đọc, thêm, xóa). Không sửa bảng nào, không xóa dữ liệu nào.
- Nếu báo lỗi, **dừng lại và gửi nguyên văn lỗi cho Claude**; không chạy lại nhiều lần, không dán SQL tay vào Supabase.

## 4. Kiểm tra kho đã tạo đúng (trên trang Supabase)

1. Vào **Storage** → thấy kho **org-media** → biểu tượng **không** phải "Public" (phải là riêng tư).
2. Bấm kho → **Policies** (hoặc Settings) → thấy 3 chính sách `org_media_read`, `org_media_insert`, `org_media_delete`.
3. Giới hạn tệp 1 MB, kiểu `image/jpeg` (hiện ở phần cài đặt của kho).

## 5. Đưa app mới lên và thử

1. Đẩy mã lên GitHub như mọi lần (bạn tự `git push`); Cloudflare tự dựng bản mới. Mở app 1–2 lần để bản mới có hiệu lực (xem `docs/DEPLOY_CLOUDFLARE.md` mục 5b).
2. **Thử ảnh mới** (nên dùng cơ sở thử, không phải dữ liệu quan trọng):
   - Khai báo → **Trang trại** → thêm trang trại mới, chọn ảnh → Lưu. Ảnh phải hiện ở danh sách.
   - Trên Supabase → Storage → org-media phải thấy hai tệp `…jpg` và `…_t.jpg` trong thư mục có mã cơ sở.
   - Tắt mạng, mở lại danh sách: ảnh vẫn hiện (đã lưu trên máy).
   - Thử thêm ảnh cho **Sản phẩm**, **Vật tư**, **Giấy phép** (Tài khoản → Giấy phép, chứng chỉ).
3. **Thử phân quyền:** đăng nhập một nhân viên bình thường → nhân viên xem được ảnh nhưng không thấy nút thêm/sửa ảnh (không có quyền Khai báo).

## 6. Chuyển ảnh cũ (làm sau khi bước 5 ổn)

1. Đăng nhập bằng tài khoản **chủ** cơ sở, có mạng tốt (nên dùng wifi).
2. Tab **Tài khoản** → mục **Kho ảnh** → bấm **Chuyển ảnh cũ sang kho ảnh mới**.
3. Chờ tới khi hiện "Đã chuyển N ảnh". **Đừng đóng app** khi đang chạy.
4. Nếu hiện "N ảnh chưa chuyển được": bấm lại để thử tiếp. Ảnh lỗi vẫn giữ nguyên ảnh cũ nên không mất gì.
5. Kiểm tra lại danh sách: ảnh vẫn hiện đủ. Làm cho **từng cơ sở**: chọn cơ sở ở menu ☰ rồi chạy lại các bước trên (mỗi cơ sở do chủ của cơ sở đó chạy).
6. **Không xóa cột ảnh cũ** hay dữ liệu gì ở bước này. Việc dọn (nếu cần) sẽ làm ở một migration riêng, khi tất cả cơ sở đã chuyển xong.

## 7. Nếu có sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| Thêm ảnh báo lỗi "new row violates row-level security" | Người dùng không có quyền Khai báo/Kho ở cơ sở đó, hoặc migration chưa đẩy. Kiểm tra bước 3–4 |
| Ảnh hiện khung 🖼 mà không hiện ảnh | Đang mất mạng và ảnh chưa từng xem trên máy này; có mạng rồi mở lại màn đó |
| Chuyển ảnh cũ chạy lâu | Mỗi ảnh vài giây; cơ sở nhiều ảnh thì chờ. Có thể bấm lại nếu bị ngắt |
| Muốn quay lại như cũ | Ảnh cũ chưa bị xóa nên chưa chuyển thì vẫn dùng bình thường. Ảnh đã chuyển thì cột đã đổi sang tham chiếu; liên hệ Claude để khôi phục bằng cách tải ngược từ kho |

## 8. Việc còn lại (chưa làm)

- **Dọn ảnh mồ côi** trong kho (ảnh đã chọn nhưng người dùng bấm Hủy, hoặc ảnh đã bị thay): cố ý **không xóa tự động** ở app vì có thể xóa nhầm ảnh bản ghi vẫn đang dùng. Sẽ làm một hàm dọn chạy ở máy chủ, chỉ xóa tệp không còn bản ghi nào tham chiếu, sau khi quen vận hành.
- **Ảnh công khai của website** (hồ sơ thương mại, hình truy xuất): chuyển sang kho riêng ở một lát phối hợp với chat Website.
- **Ảnh hóa đơn** cho G2-3 sẽ dùng chung kho này (thêm loại `invoices`).
