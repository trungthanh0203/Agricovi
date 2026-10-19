# Triển khai lên Cloudflare Pages (từ GitHub)

Mỗi lần bạn `git push`, Cloudflare tự build và cho một địa chỉ xem thử. Bạn thử giao diện thật trên điện thoại, không cần chạy máy cục bộ.
Làm **một lần**, rồi sau đó chỉ cần đẩy code.

## 0. Chuẩn bị

1. Đã đẩy code lên GitHub (kho riêng tư). Xem `README.md`.
2. Đã có dự án Supabase và đã chạy `npx supabase db push` + `npx supabase functions deploy staff-accounts` (xem `docs/SETUP_SUPABASE.md`).
3. Có tài khoản Cloudflare (gói miễn phí đủ cho giai đoạn đầu).

## 1. Tạo dự án Pages cho app

Cloudflare → **Workers & Pages → Create → Pages → Connect to Git** → chọn kho AgriConnect.

| Ô | Giá trị |
|---|---|
| Project name | `agriconnect-app` (tên bất kỳ) |
| Production branch | `main` |
| Root directory | để **trống** (gốc kho, vì dự án dùng workspaces) |
| Build command | `npm ci && npm run build -w @agriconnect/app` |
| Build output directory | `apps/app/dist` |
| Node version | thêm biến môi trường `NODE_VERSION` = `22` |

**Environment variables** (mục Settings → Variables and Secrets, cho cả Production và Preview):

| Tên | Giá trị |
|---|---|
| `VITE_SUPABASE_URL` | URL dự án Supabase |
| `VITE_SUPABASE_ANON_KEY` | khóa **anon public** |

> Chỉ dùng khóa **anon**. Không bao giờ đặt `service_role` ở đây.

Bấm **Save and Deploy**. Lần đầu mất vài phút; xong sẽ có địa chỉ dạng `https://agriconnect-app.pages.dev`.

## 2. Cho phép địa chỉ mới đăng nhập (bắt buộc)

Supabase → **Authentication → URL Configuration**:

- **Site URL**: địa chỉ Pages của app.
- **Redirect URLs**: thêm địa chỉ Pages, và thêm `https://*.agriconnect-app.pages.dev` (cho bản xem thử theo nhánh).
- Vẫn giữ `http://localhost:5180` nếu còn chạy cục bộ.

Nếu quên bước này, thư xác nhận email và thư đặt lại mật khẩu sẽ dẫn về địa chỉ sai.

## 3. (Sau này) Admin và website

Làm tương tự, **mỗi cái một dự án Pages riêng**:

| Dự án | Build command | Build output directory | Biến môi trường |
|---|---|---|---|
| admin | `npm ci && npm run build -w @agriconnect/admin` | `apps/admin/dist` | như app |
| web | `npm ci && npm run build -w @agriconnect/web` | `apps/web/dist` | `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` |

Hiện admin và web mới là khung; chưa cần tạo cho tới khi có nội dung.

## 4. Quy trình làm việc hằng ngày

1. Sửa code, chạy `npm run typecheck` (vài giây).
2. `git add -A && git commit -m "..." && git push`.
3. GitHub **Actions** chạy typecheck, build và toàn bộ test CSDL (tab Actions; chờ dấu xanh).
4. Cloudflare build bản xem thử; mở địa chỉ để thử trên điện thoại.
5. Thay đổi CSDL (`supabase/migrations`): chạy `npx supabase db push` **trước** khi thử bản mới.

## 5. Lưu ý

- **Bản xem thử dùng chung CSDL Supabase** với bản chính. Giai đoạn đầu chưa sao, nhưng khi có người dùng thật nên tạo dự án Supabase riêng cho môi trường thử (v1.1 NFR-MAINT-003).
- **Gói miễn phí** của Cloudflare Pages và GitHub Actions có giới hạn số lượt build/số phút mỗi tháng; xem trang giá hiện hành. Workflow đã hủy lượt chạy cũ khi có commit mới để đỡ tốn.
- App là PWA: sau khi cập nhật, người dùng có thể thấy bản cũ cho tới khi tải lại (app đặt `registerType: 'prompt'` để không tự đổi giữa lúc đang nhập). Khi thử, dùng **Ctrl+F5** hoặc xóa dữ liệu trang.
- **Domain:** khi mua tên miền, gắn vào dự án Pages (Custom domains) rồi cập nhật Site URL ở Supabase và `login_email_domain` (xem `docs/DECISIONS.md`).
