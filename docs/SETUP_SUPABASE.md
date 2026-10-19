# Nối AgriConnect với Supabase thật

Các bước dưới đây **bạn tự thực hiện** vì cần tài khoản và khóa của bạn. Tôi không tạo tài khoản hay nhập khóa thay bạn.

## 1. Tạo dự án Supabase

1. Vào <https://supabase.com>, tạo tổ chức và **dự án mới**.
2. Chọn vùng **Singapore** (gần Việt Nam nhất). Ghi lại mật khẩu CSDL.
3. Giai đoạn phát triển dùng gói miễn phí. **Trước khi có người dùng thật, nâng lên gói có backup** (v1.2 mục 2.1). Gói miễn phí tự tạm dừng khi không hoạt động.

## 2. Áp dụng schema (migration)

Cần Node.js. Chạy trong thư mục `D:\AgriCo`:

```bash
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push
```

`<PROJECT_REF>` là đoạn mã trong địa chỉ dự án (`https://<PROJECT_REF>.supabase.co`). Lệnh `db push` áp dụng 7 migration trong `supabase/migrations` theo thứ tự.

## 3. Lấy khóa và cấu hình app

Trong Supabase: **Project Settings → API**. Chép hai giá trị:

- **Project URL**
- **anon public key** (khóa công khai)

Tạo file `apps/app/.env.local`:

```
VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public key>
```

> **Không bao giờ** dùng khóa `service_role` trong app hoặc website. File `.env.local` đã nằm trong `.gitignore`.

## 4. Cấu hình đăng nhập

Trong **Authentication → URL Configuration**:

- **Site URL**: địa chỉ app (khi chạy thử: `http://localhost:5180`).
- **Redirect URLs**: thêm cùng địa chỉ đó, và sau này thêm địa chỉ production.

Trong **Authentication → Providers → Email**:

- Đang thử nghiệm, bạn có thể tắt "Confirm email" để đăng ký xong dùng ngay. **Khi chạy thật nên bật** để xác nhận email.
- Supabase gửi thư mặc định có giới hạn tần suất. Trước khi pilot, cấu hình SMTP riêng (Authentication → SMTP Settings).

## 5. Chạy thử

```bash
npm run dev:app
```

Mở `http://localhost:5180`, tạo tài khoản, tạo cơ sở. Kiểm tra trong **Table Editor**: bảng `organizations`, `organization_memberships` (vai trò `owner`) và `subscriptions` (trạng thái `trial`) có dữ liệu mới.

## 6. Tạo tài khoản quản trị và kiểm duyệt (làm thủ công)

Sau khi đã có tài khoản của bạn, vào **SQL Editor** chạy (thay email của bạn):

```sql
insert into platform_admins (user_id)
select id from auth.users where email = 'email-cua-ban@example.com';

-- kiểm duyệt viên nội dung (nên dùng tài khoản khác với quản trị nếu có thể)
insert into platform_reviewers (user_id)
select id from auth.users where email = 'email-kiem-duyet@example.com';
```

Hai bảng này không truy cập được qua API; chỉ thêm bằng SQL Editor.

## 6b. Triển khai Edge Function tạo tài khoản nhân viên

Chức năng "Tạo tài khoản nhân viên" (đăng nhập bằng số điện thoại) cần một hàm chạy ở máy chủ. Chạy trong `D:\AgriCo`:

```bash
npx supabase functions deploy staff-accounts
```

- Không cần tự nhập khóa: Supabase tự cấp `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` cho hàm.
- Kiểm tra: Supabase → **Edge Functions** thấy `staff-accounts`, trạng thái Active. Nếu lỗi, xem tab **Logs** của hàm.
- Hàm yêu cầu đăng nhập (`verify_jwt`), và chỉ **chủ cơ sở** mới tạo/đặt lại được.

**Cấu hình tên miền email ẩn.** Mặc định `agricovi.com`, lưu trong bảng `platform_settings`. Đổi bằng SQL Editor:

```sql
update platform_settings set value = '"ten-mien-cua-ban.vn"' where key = 'login_email_domain';
```

Tài khoản nhân viên đã tạo giữ nguyên email cũ nên vẫn đăng nhập được. **Chỉ dùng tên miền do bạn sở hữu**, và không bật catch-all email cho `sdt.<tên miền>` (xem `docs/DECISIONS.md`).

## 7. Kiểm tra bảo mật nhanh

Trong **Authentication → Policies** (hoặc Table Editor) xác nhận mọi bảng có biểu tượng RLS **bật**. Kiểm thử tự động của schema (không cần Supabase thật):

```bash
npm run test:db
```

## 8. Triển khai lên Cloudflare Pages (khi sẵn sàng)

- Kết nối kho GitHub với Cloudflare Pages, thư mục gốc `apps/app`, lệnh build `npm run build`, thư mục xuất `dist`.
- Khai báo hai biến `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` trong cài đặt Pages.
- Mua domain trước khi pilot với người dùng thật.

## Chưa làm trong bước này

- Lời mời thành viên vào cơ sở (FR-ORG-004) và chấp nhận lời mời.
- Phân quyền hiển thị theo vai trò trong giao diện (RLS đã chặn ở CSDL; giao diện sẽ ẩn nút theo vai trò ở các bước sau).
