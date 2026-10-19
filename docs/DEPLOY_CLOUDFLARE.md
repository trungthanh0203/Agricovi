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
- **Domain:** xem mục 6 ngay dưới (thử bằng `*.pages.dev` trước, mua tên miền sau).

## 6. Thử bằng địa chỉ `*.pages.dev` trước, mua tên miền sau

**Không cần sửa code** khi đổi địa chỉ: app tự lấy địa chỉ đang chạy (`window.location.origin`) cho thư xác nhận/đặt lại mật khẩu. Chỉ đổi **cấu hình** ở Cloudflare, Supabase và một dòng cấu hình trong CSDL.

### 6.1 Làm ngay bây giờ (giai đoạn thử)

1. Làm mục 1 và 2 ở trên. Địa chỉ thử là `https://<tên-dự-án>.pages.dev` (miễn phí, có HTTPS, mở được trên điện thoại).
2. **Trước khi tạo tài khoản nhân viên thử**, đổi tên miền email ẩn sang một tên miền *không ai mua được và không có hộp thư*, vì mặc định `agricovi.com` có thể thuộc người khác (cảnh báo trong `docs/DECISIONS.md`). Chạy ở Supabase → SQL Editor:
   ```sql
   update platform_settings set value = '"agriconnect-thu.example.com"' where key = 'login_email_domain';
   ```
   (`example.com` do tổ chức IANA giữ riêng cho thử nghiệm, không có hộp thư.) Nếu Supabase từ chối tạo tài khoản với tên miền này, báo lại để chọn cách khác.
3. Chỉ nhập **dữ liệu thử**. Coi mọi thứ trên `pages.dev` là bỏ đi được.
4. Cài app ra màn hình chính chỉ để thử. App cài từ `pages.dev` gắn với đúng địa chỉ đó.

### 6.2 Khi đã mua tên miền (đưa cho người dùng thật)

Làm theo thứ tự; mỗi bước đều làm được mà không ngắt bản thử.

1. **Mua tên miền** (ở Cloudflare Registrar thì tiện nhất; mua nơi khác thì thêm tên miền vào Cloudflare và trỏ nameserver về Cloudflare).
2. **Gắn vào Pages:** dự án `agriconnect-app` → **Custom domains → Set up a custom domain** → nhập `app.<tên-miền>`. Cloudflare tự tạo bản ghi DNS và chứng chỉ HTTPS (vài phút).
3. **Tách môi trường thật khỏi môi trường thử** (khuyến nghị mạnh trước khi có người dùng thật):
   - Tạo **dự án Supabase mới** làm bản thật; `supabase link` sang dự án đó rồi `npx supabase db push` và `npx supabase functions deploy staff-accounts` (xem `docs/SETUP_SUPABASE.md`). Dự án cũ giữ làm bản thử.
   - Trong Pages → Settings → Variables: đặt `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` của **dự án mới** cho **Production** (nhánh `main`), giữ của dự án cũ cho **Preview**. Bấm **Retry deployment** để build lại.
4. **Cho phép địa chỉ mới đăng nhập:** Supabase (dự án thật) → Authentication → URL Configuration: **Site URL** = `https://app.<tên-miền>`; **Redirect URLs** thêm đúng địa chỉ đó.
5. **Đổi tên miền email ẩn** ở dự án thật, *trước khi tạo bất kỳ tài khoản nhân viên nào*:
   ```sql
   update platform_settings set value = '"<tên-miền>"' where key = 'login_email_domain';
   ```
   Tên miền này phải do bạn sở hữu và **không bật hộp thư gom thư** (catch-all). Tài khoản nhân viên tạo trước đó vẫn giữ email cũ và đăng nhập bình thường; chỉ tài khoản mới dùng tên miền mới.
6. **Cấu hình gửi thư:** Supabase dùng dịch vụ gửi thư mặc định, rất hạn chế số thư mỗi giờ. Trước khi nhiều chủ hộ đăng ký bằng email, cấu hình SMTP riêng (Authentication → SMTP Settings).
7. **Người dùng thật cài lại app:** gửi họ địa chỉ mới, bảo gỡ app cũ (nếu có) và cài lại. Dữ liệu offline lưu theo từng địa chỉ nên **không chuyển sang địa chỉ mới**; vì vậy người thử phải đồng bộ hết (không còn "chưa đồng bộ") trước khi bỏ địa chỉ cũ.
8. **Dọn bản thử:** khi mọi người đã chuyển, gỡ `pages.dev` khỏi Redirect URLs ở Supabase (giữ nếu vẫn cần thử bản Preview).

### 6.3 Danh sách kiểm tra trước ngày mở cho người dùng thật

- [ ] Dự án Supabase thật đã `db push` đủ migration và deploy `staff-accounts`.
- [ ] `login_email_domain` là tên miền bạn sở hữu, không có hộp thư.
- [ ] Biến môi trường **Production** trỏ dự án thật, **Preview** trỏ dự án thử.
- [ ] Site URL và Redirect URLs của dự án thật đúng tên miền mới.
- [ ] SMTP riêng đã cấu hình và thử gửi thư đặt lại mật khẩu.
- [ ] Đã bật sao lưu của Supabase và thử khôi phục một lần (v1.1 NFR-SEC-004).
- [ ] Đã thử đủ các bài trong `docs/HUONG_DAN_THU.md` trên điện thoại thật ở địa chỉ mới.
