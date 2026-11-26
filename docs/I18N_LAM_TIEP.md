# Song ngữ Việt – Anh: tạm dừng, cách làm tiếp

> Tạm dừng ngày 26/11/2026 theo quyết định của chủ sản phẩm. Toàn bộ nằm trên nhánh `feat/app-i18n` (**chưa gộp vào `main`**). Lúc tạm dừng, nhánh tách từ `main` tại commit `7237829`.
> Thiết kế và quy ước: `PHUONG_AN_VIET_ANH_APP.md`. Khảo sát ban đầu: `PLAN_DA_NGON_NGU_APP.md`.

## Đã làm

| Đợt | Nội dung |
|---|---|
| Bước 0 | Lingui 5.9.5, nút chọn ngôn ngữ (ẩn với khách), đọc số theo ngôn ngữ, Đăng nhập, Trang chủ, Ghi việc, menu |
| Bước 1a | Thu hoạch, nhật ký, chấm công, nhắc việc, lỗi chung |
| Bước 1b | Kho, bảng công giấy, số liệu Trang chủ, khách hàng, nhà cung ứng, bộ nạp macro cho test |

1.537 câu đã có bản Anh trong `apps/app/src/locales/en.po`.

## Chưa làm

- **Bước 2:** khai báo, cấu hình, tạo vụ, chi tiết vụ, báo cáo, nhân sự, tài khoản, máy chấm công, `lib/config.ts`.
- **Bước 3:** lỗi từ máy chủ, tên dữ liệu hệ thống (cần migration).
- **Bước 4:** trợ giúp, hướng dẫn, người rành tiếng Anh soát bản dịch.
- Mở nút cho khách: đổi `PUBLIC_SWITCH` trong `apps/app/src/lib/i18n.ts`.

## Chưa kiểm tra

Các màn sau đăng nhập ở tiếng Anh, bản build, chạy offline, toàn bộ test dùng mã app. Ca lệch thứ tự menu Sản xuất trong `ui_simple.test.mjs` cần đối chiếu với `main`.

## Làm tiếp

Xem `main` đã đổi bao nhiêu:

```powershell
git diff --stat 7237829 main -- apps/app
```

**Đổi ít:** gộp `main` vào nhánh.

```powershell
git switch feat/app-i18n
```

```powershell
git merge main
```

Xung đột ở tệp màn hình: giữ bản của `main` rồi bọc chữ lại. Xung đột ở `*.po`: giữ bản của nhánh i18n rồi trích lại.

**Đổi nhiều** (nhiều tệp xung đột): tạo nhánh mới từ `main`, rồi:
1. Chép từ nhánh cũ phần nền: `lingui.config.js`, `lib/format.ts`, `lib/i18n.ts`, `lib/labels.ts`, `LangSwitch.tsx`, `locales/`, `scripts/lingui-test-*.mjs`, `scripts/i18n*`.
2. Làm lại cấu hình: gói npm trong `apps/app/package.json`, `vite.config.ts`, `main.tsx`, `vite-env.d.ts`, lệnh test trong `package.json` và `scripts/test-changed.mjs`.
3. Chạy lại công cụ bọc chữ. Câu tiếng Việt không đổi sẽ nhận lại bản Anh cũ từ `en.po` khi trích.

## Công cụ (`scripts/i18n/`)

| Lệnh | Việc |
|---|---|
| `node scripts/i18n/scope.mjs <màn...>` | Đếm chữ Việt chưa bọc, lần theo import |
| `node scripts/i18n/wrap.mjs <tệp...> --dry` | Xem trước; bỏ `--dry` để bọc (đường dẫn tính từ `apps/app/src`) |
| `npm run i18n:extract -w @agriconnect/app` | Trích câu vào `.po` |
| `node scripts/i18n/translate.mjs dump 1 300` | In câu chưa dịch, có đánh số |
| `node scripts/i18n/translate.mjs fill <tệp>` | Điền bản dịch từ tệp `số\|bản dịch` |
| `npm run i18n:check -w @agriconnect/app` | Báo thiếu câu, mất tham số |
| `node scripts/i18n/safety.mjs` | Báo nhãn dịch bị đọc lúc nạp mô-đun; liệt kê tệp test nạp có macro |

`wrap.mjs` chỉ là trợ thủ, sau mỗi lần chạy phải soát lại:
- Nên chạy trên tệp chưa từng bọc.
- Chữ **được lưu vào CSDL**, **so sánh trong mã** hoặc **in / xuất CSV** phải giữ tiếng Việt: công cụ chỉ phát hiện được phần so sánh.
- Dòng báo "NGOÀI HÀM, sửa tay" và "câu bị tách" cần xem lại.
- Chạy `npm run typecheck -w @agriconnect/app` và test liên quan.
