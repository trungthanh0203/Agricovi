# AgriConnect

Monorepo cho app quản lý sản xuất (PWA), trang quản trị nền tảng và website xúc tiến thương mại.
Đặc tả: `AgriConnect_Dac_ta_thiet_ke_nghiep_vu_v1.1.md` + `AgriConnect_Dac_ta_bo_sung_v1.2.md`. Backlog: `AgriConnect_Backlog_v1.2.md`.

## Cấu trúc

| Thư mục | Nội dung |
|---|---|
| `apps/app` | App PWA (Vite + React + TypeScript, IndexedDB/Dexie, hàng đợi đồng bộ) |
| `apps/admin` | Trang quản trị nền tảng (gói, giá, xếp hạng, duyệt hồ sơ) |
| `apps/web` | Website công khai (Astro, chỉ đọc view `public_*`) |
| `packages/shared` | Kiểu và hằng số dùng chung |
| `supabase/migrations` | Schema, ràng buộc, hạn mức vụ, RLS (nguồn sự thật của CSDL) |
| `supabase/tests` | Kịch bản kiểm thử hạn mức / ràng buộc |

## Chạy thử

```bash
npm install
npm run dev:app      # http://localhost:5180
npm run dev:admin    # http://localhost:5181
npm run dev:web      # http://localhost:4321
```

Chưa cấu hình Supabase thì app vẫn chạy, chỉ lưu trên thiết bị. Để nối Supabase: sao chép `.env.example` thành `.env.local` trong từng app.

CSDL cục bộ (cần Docker và Supabase CLI):

```bash
npx supabase start
npx supabase db reset      # áp dụng migration
```

Kiểm thử CSDL không cần Docker (chạy migration trên PGlite, có mô phỏng `auth`/vai trò Supabase):

```bash
npm run test:db      # 28 test: hạn mức, RLS, kho, chấm công, khóa kỳ, xuất bản, riêng tư
```

Sơ đồ quan hệ: `docs/ERD.md`.

## Nguyên tắc bắt buộc

- Phân quyền, hạn mức vụ và ràng buộc "1 hộ ≤ 1 HTX" được ép trong CSDL, không chỉ ở giao diện.
- Khóa `service_role` không bao giờ vào frontend.
- Website chỉ đọc dữ liệu công khai (`public_*`), không đọc bảng nội bộ.
- Bản ghi tạo offline có UUID tạo ở thiết bị; đồng bộ bằng upsert theo `id`.
- Giá trị gói, hạn mức, dùng thử, xếp hạng nằm trong CSDL, không hard-code.

## Triển khai (giai đoạn đầu)

GitHub (mã nguồn, Actions) → Cloudflare Pages (3 dự án: app, admin, web) → Supabase.
Trước khi có người dùng thật: mua domain và nâng Supabase lên gói có backup (v1.2 mục 2.1).

## Tình trạng

Đây là **khung dự án**. Đã có: cấu trúc, shell 4 mục điều hướng, khung hàng đợi đồng bộ, migration lõi (tổ chức, HTX-hộ, gói, vụ, hạn mức, RLS cơ bản). Chưa có: đăng nhập, các màn hình nghiệp vụ, `public_*`, nhật ký/kho/chấm công. Xem backlog.
