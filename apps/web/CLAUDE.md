# Mảng WEB (apps/web + apps/webadmin)

Chat này chỉ làm **WEBSITE**: website công khai (Astro + Cloudflare Worker) và quản trị website (`/admin/`). Quy tắc chung ở `CLAUDE.md` gốc.

## Đọc khi cần (đừng đọc hết)
- Quyết định: `docs/DECISIONS_WEB.md` (D57–D73); chung: `docs/DECISIONS_CHUNG.md`.
- Trạng thái: `docs/STATUS_WEB.md`. Kế hoạch lát W0–W8: `docs/PLAN_WEBSITE.md`. Thiết kế: `docs/AgriConnect_Thiet_ke_website_ban_2_1.docx`.
- Nguồn sản phẩm: `docs/NGUON_SAN_PHAM_WEBSITE.md`. Quản trị: `docs/HUONG_DAN_QUAN_TRI_WEBSITE.md`. Hiệu năng/an toàn: `docs/RA_SOAT_HIEU_NANG_AN_TOAN.md`. Deploy: `docs/DEPLOY_CLOUDFLARE.md`.

## Ranh giới
- Sửa trong `apps/web`, `apps/webadmin`, `packages/shared/src/site.ts`, migration và test của website.
- **Không đụng** `apps/app`, `apps/admin` và bảng/hàm vận hành của app (khu trồng, vụ, kho, chấm công…). Website chỉ đọc `public_*` (bản chụp đã duyệt), không bao giờ đọc dữ liệu vận hành.
- Migration mới đặt tên `..._web_*.sql`; test CSDL liên quan: `site_*`, `web_*`, `trade*`, `shops`, `i18n`, `perf_images`, `anon_surface`, `w6_trust_insight`.
- Deploy: `npx wrangler deploy` trong `apps/web`; dev: `npm run dev:web` (4321), `npm run dev:webadmin` (5182).
- Giao diện: tiếng Việt là bản gốc, tiếng Anh ở `/en/` (D71); ảnh tối đa 1–2 mỗi chỗ (D62).
