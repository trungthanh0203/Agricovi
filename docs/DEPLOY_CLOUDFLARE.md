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

### Cách B: nếu bạn tạo "Workers" (Workers Builds) thay vì "Pages", hoặc gặp lỗi "application detection logic ... root of a workspace"

Lỗi này do lệnh `npx wrangler deploy` chạy ở gốc kho mà không có tệp cấu hình, nên Cloudflare không biết triển khai thư mục nào trong kho nhiều dự án. Kho đã có sẵn `apps/app/wrangler.jsonc` để chỉ rõ. Trong dự án Workers: **Settings → Build** đặt:

| Ô | Giá trị |
|---|---|
| Root directory | để **trống** (gốc kho) |
| Build command | `npm ci && npm run build -w @agriconnect/app` |
| Deploy command | `npm run deploy:app` |

Lưu ý với Workers Builds:
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` và `NODE_VERSION=22` phải khai ở **Build variables and secrets** (biến dùng lúc build), không phải biến lúc chạy. Khai nhầm chỗ thì app build ra sẽ báo "chưa cấu hình Supabase".
- Tên dự án Workers phải trùng `name` trong `wrangler.jsonc` (`agriconnect-app`); nếu bạn đặt tên khác, sửa `name` cho khớp.
- Địa chỉ có dạng `https://agriconnect-app.<tài-khoản>.workers.dev`. Mục 2 và 6 bên dưới áp dụng y hệt, chỉ thay địa chỉ.

### Nếu app vẫn báo "chưa được nối với máy chủ Supabase" sau khi build

Hai biến `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY` được **nhúng vào file JavaScript lúc build**; `.env.local` trên máy không lên GitHub nên Cloudflare không thấy. Màn hình báo lỗi giờ cho biết **biến nào đang thiếu**. Cách chắc chắn nhất, không phụ thuộc cài đặt trên bảng điều khiển:

1. Trên máy bạn, sao chép `apps/app/.env.local` thành `apps/app/.env.production` (cùng nội dung: URL Supabase và khóa **anon**).
2. Chạy `git add apps/app/.env.production`, `git commit -m "Cấu hình Supabase cho bản build"`, rồi `git push`. Khóa anon vốn công khai (nằm trong file JavaScript gửi cho trình duyệt) nên đưa vào kho được. **Tuyệt đối không** đưa `service_role`.
3. Cloudflare tự build lại; mở trang bằng Ctrl+F5.

Biến khai ở bảng điều khiển (Build variables) vẫn **ưu tiên hơn** file này, nên sau này tách môi trường thật/thử chỉ cần khai biến ở bảng điều khiển.

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
| admin | (chung với app, không tạo riêng) | `apps/app/dist/quan-tri` | như app |
| web | `npm ci && npm run build -w @agriconnect/web` | `apps/web/dist` | `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` |

Trang **admin** (D53, D54) **không cần dự án Cloudflare riêng**: lệnh build của app (`npm run build -w @agriconnect/app`) tự build admin và đặt vào `apps/app/dist/quan-tri`, nên cùng một dự án phục vụ cả hai; admin ở địa chỉ `địa-chỉ-app/quan-tri/`. Không đổi gì ở Cloudflare. Nên bật Cloudflare Access cho đường dẫn `/quan-tri/*` (chỉ email của bạn). Cấp quyền quản trị cho tài khoản (một lần, trong SQL Editor): `insert into platform_admins (user_id) select id from auth.users where email = 'email-cua-ban@...';`. Thu hồi: `delete from platform_admins where user_id = (select id from auth.users where email = 'email-cu@...');`. Trang **web** (D57) là dự án Cloudflare Pages riêng: build `npm ci && npm run build -w @agriconnect/web`, thư mục `apps/web/dist`. Khóa công khai đã nằm trong `apps/web/.env.production` nên không cần đặt biến môi trường. File `public/_redirects` làm cho địa chỉ `/co-so/<tên>` và `/truyxuat/<mã>` chạy được. Sau khi có địa chỉ website, đặt `VITE_PUBLIC_SITE_URL=https://<địa-chỉ-website>` ở dự án app để mã QR của vụ có đường dẫn tới trang truy xuất.

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

## 5b. Build xong mà giao diện vẫn là bản cũ?

App là PWA nên trình duyệt giữ một bản app trong máy (service worker). Tải lại trang (F5, Ctrl+F5) **không đổi** được bản này; bản mới nằm chờ cho tới khi đóng hết các tab của app.

- **Từ bản tự cập nhật trở đi:** bản mới được thay **âm thầm**, không hiện thông báo. Trình duyệt tự kiểm tra bản mới mỗi lần mở app; bản mới có hiệu lực sau khi **đóng và mở lại app một đến hai lần** (lần đầu tải bản mới về, lần sau chạy bản mới). Không bao giờ tự tải lại giữa lúc bạn đang nhập.
- **Kiểm tra đang chạy bản nào:** mở **Cơ sở của tôi**, cuối trang có dòng **"Phiên bản app: <mã commit> · <giờ build>"**. So mã commit với `git log -1` trên GitHub.
- **Một lần duy nhất** để chuyển sang bản tự cập nhật (vì bản cũ trong máy đang giữ chờ bản mới, không tự thay):
  - Máy tính (Chrome): F12 → **Application → Service workers** → bấm **Unregister**; rồi **Storage → Clear site data**; tải lại trang.
  - Điện thoại: đóng hẳn app (vuốt tắt, hoặc đóng mọi tab trình duyệt của trang), mở lại; nếu vẫn bản cũ thì gỡ app cài trên màn hình chính, xóa dữ liệu trang của trình duyệt, cài lại.
  - Trước khi xóa dữ liệu: nếu có việc ghi khi mất mạng mà chưa gửi, hãy bật mạng và mở app cho gửi xong.
- Nếu dòng phiên bản hiện `dev`: bản build không nhận được mã commit từ Cloudflare; không ảnh hưởng hoạt động.

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

> **Tên miền `agricovi.com` đã mua: làm theo `docs/TRIEN_KHAI_TEN_MIEN.md` (từng bước cho website, app, thư, bảo vệ quản trị).** Mục này giữ làm tham khảo chung.

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

## Website công khai (apps/web) trên Cloudflare Workers

Tạo một Worker riêng tên `agriconnect` (khác Worker của app), nối cùng kho GitHub. Ở **Settings → Build**:

| Ô | Giá trị |
|---|---|
| Root directory | để **trống** (gốc kho) |
| Build command | `npm ci && npm run build -w @agriconnect/web` |
| Deploy command | `npx wrangler deploy` |

Biến lúc build (Build variables): `NODE_VERSION` = `22`. Khóa công khai đã nằm trong `apps/web/.env.production` nên không bắt buộc khai thêm. Tên Worker phải trùng `name` trong `apps/web/wrangler.jsonc` (`agriconnect`).

**Từ W0 (D60) website dựng phía máy chủ** (Astro 7 + `@astrojs/cloudflare` 14, chạy trên Workers): `npm run build -w @agriconnect/web` tạo `apps/web/dist/client` (tệp tĩnh) và `apps/web/dist/server` (Worker) kèm cấu hình `wrangler.json` sinh sẵn; lệnh deploy chỉ là `npx wrangler deploy`: Cloudflare chạy nó **trong thư mục `apps/web`** (không phải gốc kho; vì vậy `cd apps/web` và `--config apps/web/...` đều lỗi) và wrangler tự tìm cấu hình sinh sẵn qua `apps/web/.wrangler/deploy/config.json`. Nếu báo không tìm thấy cấu hình, thử `npx wrangler deploy --config dist/server/wrangler.json`. Tệp `_redirects` không còn. Trang công khai gửi `Cache-Control: s-maxage=60`, nên nội dung CMS xuất hiện trên website sau tối đa khoảng 1 phút, không cần deploy lại.

Biến tùy chọn lúc build: `PUBLIC_APP_URL` (địa chỉ app, để chân trang có nút "Mở ứng dụng").

**Hai địa chỉ (D64):** ứng dụng và quản trị nền tảng ở Worker `agricovi` (`https://agricovi.onstudy.workers.dev` và `/quan-tri/`); website công khai **và quản trị website** ở Worker `agriconnect` (`https://agriconnect.onstudy.workers.dev` và `/admin/`). Biến `VITE_PUBLIC_SITE_URL` (đã khai trong `apps/app/.env.production`) làm mã QR của vụ và các nút "Xem" trỏ đúng website.

## Quản trị website (apps/webadmin) — cùng Worker với website, ở /admin/ (D64)

Quản trị nội dung và kiểm duyệt website là một ứng dụng riêng trong kho (`apps/webadmin`, tách khỏi quản trị nền tảng của app) nhưng **được đặt vào chính Worker của website**: lệnh build của website (`npm run build -w @agriconnect/web`) tự build quản trị website (`scripts/include-webadmin.mjs`) và chép vào `apps/web/public/admin`. **Không tạo thêm Worker, không đổi lệnh build/deploy của website**. Địa chỉ: `https://agriconnect.onstudy.workers.dev/admin/` (gõ `/admin` cũng tự chuyển sang `/admin/`). Quản trị website đọc chung tệp `apps/app/.env.production` (khóa công khai Supabase, `VITE_APP_URL`, `VITE_PUBLIC_SITE_URL`); `VITE_WEBADMIN_URL` trong tệp đó làm quản trị nền tảng có liên kết sang quản trị website.

Lưu ý an toàn: vì cùng địa chỉ với website công khai, quản trị website dùng khóa lưu phiên đăng nhập riêng (`agriconnect-webadmin-auth`) để không lẫn với phiên của người dùng website sau này; nên bật **Cloudflare Access** cho đường dẫn `/admin/*` (chỉ email của bạn và nhân sự biên tập vào được), lớp bảo vệ thứ hai ngoài quyền kiểm ở CSDL.

Quyền: quản trị viên nền tảng (bảng `platform_admins`) luôn đủ quyền; cấp vai trò biên tập cho người khác ở **Người biên tập** (tổng biên tập, biên tập viên, kiểm duyệt viên; người đó phải có tài khoản AgriConnect đăng ký bằng email). Chưa có nội dung trong CSDL thì website dùng nội dung mặc định (`packages/shared/src/site.ts`); các trang pháp lý chỉ là khung chờ văn bản chính thức.

## Tài khoản người dùng website (W3, D65)

1. `npx supabase db push` (migration 0045) và triển khai hàm đăng ký bằng số điện thoại: `npx supabase functions deploy web-accounts`.
2. Supabase → **Authentication → URL Configuration**: đặt *Site URL* = địa chỉ website (ví dụ `https://agriconnect.onstudy.workers.dev`) và thêm `https://agriconnect.onstudy.workers.dev/**` vào *Redirect URLs* (cần cho thư xác nhận email và đặt lại mật khẩu).
3. Supabase → **Authentication → Providers → Email**: đăng ký bằng email thường bật *Confirm email*. Dịch vụ thư có sẵn của Supabase bị giới hạn số thư mỗi giờ (rất thấp), nên khi mở thật cần cấu hình SMTP riêng (**Authentication → SMTP Settings**). Khi thử nội bộ có thể tạm tắt *Confirm email* để đăng ký xong vào luôn.
4. Tài khoản nhân viên (số điện thoại do chủ cơ sở tạo) không đăng nhập được website (CSDL chặn); chủ cơ sở đăng nhập website bằng email tài khoản app.
5. Đăng ký bằng số điện thoại chưa xác minh OTP và chưa tự đặt lại mật khẩu được; chống lạm dụng hiện là giới hạn 200 đăng ký/giờ ở CSDL, sẽ thêm Turnstile khi có khóa.

**Lệnh deploy của app (D68):** dùng `npm run deploy:app` (script ở gốc kho gọi thẳng `node node_modules/wrangler/bin/wrangler.js deploy --config apps/app/wrangler.jsonc`, không phụ thuộc việc `npx` có tìm thấy `wrangler` hay không; `wrangler` nằm trong devDependencies ở gốc kho). Lệnh cũ `npx wrangler deploy --config apps/app/wrangler.jsonc` từng báo `wrangler: not found` trên Cloudflare sau khi dự án thêm nhiều gói.
