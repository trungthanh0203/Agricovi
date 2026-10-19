# AgriConnect — ERD (khớp với `supabase/migrations`)

Nguồn sự thật là các file migration. Tài liệu này giải thích quan hệ; mô hình khái niệm xem v1.1 mục 5 và v1.2 mục 9.
Xem sơ đồ: dán khối `mermaid` vào <https://mermaid.live> hoặc mở bằng trình xem Markdown hỗ trợ Mermaid.

## 1. Tổ chức, HTX-hộ, gói dịch vụ

```mermaid
erDiagram
  AUTH_USERS ||--o{ ORGANIZATION_MEMBERSHIPS : "thuộc nhiều tổ chức"
  ORGANIZATIONS ||--o{ ORGANIZATION_MEMBERSHIPS : "có thành viên + vai trò"
  ORGANIZATIONS ||--o{ COOPERATIVE_MEMBERSHIPS : "hộ (household_org_id)"
  ORGANIZATIONS ||--o{ COOPERATIVE_MEMBERSHIPS : "HTX (cooperative_org_id)"
  ORGANIZATIONS ||--o{ SUBSCRIPTIONS : "gói theo từng tổ chức"
  PLAN_TIERS ||--o{ SUBSCRIPTIONS : "bản chụp điều khoản"
  SUBSCRIPTIONS ||--o{ PAYMENT_RECORDS : "thu thủ công"
  PLATFORM_SETTINGS }o--|| PLAN_TIERS : "cấu hình dùng thử/xếp hạng"

  ORGANIZATIONS { uuid id PK; org_type type "household|cooperative"; int declared_member_count }
  ORGANIZATION_MEMBERSHIPS { uuid org_id FK; uuid user_id FK; member_role role; member_status status }
  COOPERATIVE_MEMBERSHIPS { uuid household_org_id FK; uuid cooperative_org_id FK; coop_link_status status "UNIQUE 1 active/hộ" }
  PLAN_TIERS { uuid id PK; org_type org_type; int max_cycles; bigint price_per_quarter; numeric ranking_weight }
  SUBSCRIPTIONS { uuid org_id FK; uuid plan_tier_id FK; int max_cycles "snapshot"; bigint price "snapshot"; ts period_end }
```

Quy tắc chính: mỗi hộ có tối đa **1** liên kết HTX hoạt động; gói tính **theo từng tổ chức**; thay đổi `plan_tiers` không đổi `subscriptions` đang chạy.

## 2. Sản xuất (hai ngữ cảnh Hộ/HTX)

```mermaid
erDiagram
  ORGANIZATIONS ||--o{ PRODUCTION_AREAS : "sở hữu khu trồng"
  PRODUCTION_AREAS ||--o{ PRODUCTION_CYCLES : "có nhiều vụ"
  ORGANIZATIONS ||--o{ PRODUCTION_CYCLES : "owner_org_id = chủ dữ liệu & hạn mức"
  CROP_TYPES ||--o{ CROP_PROFILES : ""
  CROP_TYPES ||--o{ CROP_VARIETIES : ""
  CROP_TYPES ||--o{ PRODUCTION_CYCLES : ""
  CROP_PROFILES ||--o{ TASK_TEMPLATES : ""
  WORK_TYPES ||--o{ TASK_TEMPLATES : ""
  PRODUCTION_CYCLES ||--o{ PRODUCTION_STAGES : ""
  PRODUCTION_CYCLES ||--o{ PRODUCTION_TASKS : ""
  PRODUCTION_CYCLES ||--o{ ACTIVITY_LOGS : "nhật ký (id do thiết bị)"
  PRODUCTION_CYCLES ||--o{ HARVEST_RECORDS : ""
  WORK_TYPES ||--o{ ACTIVITY_LOGS : "field_schema quyết định trường"

  PRODUCTION_CYCLES { uuid id PK "tạo ở thiết bị"; uuid owner_org_id FK; uuid area_id FK; cycle_status status "active+paused tính hạn mức"; int version }
  ACTIVITY_LOGS { uuid id PK; uuid organization_id "do máy chủ gán theo vụ"; jsonb data; ts performed_at; ts received_at; ts voided_at }
```

- **Vụ riêng của hộ:** `owner_org_id` = hộ → HTX không phải thành viên → HTX không thấy.
- **Vụ ghi theo HTX:** `owner_org_id` = HTX, khu trồng vẫn thuộc hộ → thành viên HTX và chủ khu trồng đều thấy.
- Bản ghi con (`activity_logs`, `harvest_records`, `production_tasks`...) luôn mang `organization_id` = chủ vụ (trigger `sync_org_from_cycle`).

## 3. Kho, chi phí, bán hàng

```mermaid
erDiagram
  ORGANIZATIONS ||--o{ MATERIALS : ""
  ORGANIZATIONS ||--o{ INVENTORY_LOCATIONS : ""
  UNITS_OF_MEASURE ||--o{ MATERIALS : "đơn vị cơ sở"
  MATERIALS ||--o{ UNIT_CONVERSIONS : "chỉ dùng khi confirmed_at"
  MATERIALS ||--o{ INVENTORY_TRANSACTIONS : ""
  INVENTORY_LOCATIONS ||--o{ INVENTORY_TRANSACTIONS : ""
  ACTIVITY_LOGS ||--o{ INVENTORY_TRANSACTIONS : "xuất dùng"
  PRODUCTION_CYCLES ||--o{ INVENTORY_TRANSACTIONS : ""
  PRODUCTION_CYCLES ||--o{ EXPENSE_RECORDS : ""
  PRODUCTION_CYCLES ||--o{ SALES_RECORDS : ""
  INVENTORY_TRANSACTIONS ||--o{ EXPENSE_RECORDS : "source_txn_id"

  INVENTORY_TRANSACTIONS { uuid id PK "idempotent"; inventory_txn_type txn_type; numeric quantity_delta "có dấu"; bigint unit_cost "null = chưa biết"; text reason "bắt buộc khi điều chỉnh" }
  EXPENSE_RECORDS { expense_category category; expense_kind kind "cash_paid|material_used|allocated|estimated"; bigint amount }
```

Số dư = `sum(quantity_delta)` (view `inventory_balances`). Giao dịch **không sửa/xóa**; sửa bằng giao dịch điều chỉnh. Tổng kết vụ: view `cycle_summary` (nêu rõ dữ liệu thiếu).

## 4. Chấm công và tiền công

```mermaid
erDiagram
  ORGANIZATIONS ||--o{ WORKER_PROFILES : "user_id có thể null"
  WORKER_TEAMS ||--o{ WORKER_TEAM_MEMBERSHIPS : "theo thời gian hiệu lực"
  WORKER_PROFILES ||--o{ WORKER_TEAM_MEMBERSHIPS : ""
  WORKER_PROFILES ||--o| WORKER_TEAMS : "tổ trưởng"
  WORK_LOCATIONS ||--o{ ATTENDANCE_RECORDS : ""
  WORKER_PROFILES ||--o{ ATTENDANCE_RECORDS : ""
  ATTENDANCE_RECORDS ||--o{ ATTENDANCE_ADJUSTMENTS : "yêu cầu sửa"
  WORKER_PROFILES ||--o{ WORK_OUTPUT_RECORDS : ""
  WORK_RATES ||--o{ PAY_STATEMENT_LINES : "snapshot đơn giá"
  PAYROLL_PERIODS ||--o{ WORKER_PAY_STATEMENTS : ""
  WORKER_PROFILES ||--o{ WORKER_PAY_STATEMENTS : ""
  WORKER_PAY_STATEMENTS ||--o{ PAY_STATEMENT_LINES : "truy ngược nguồn"
  ATTENDANCE_RECORDS ||--o| PAY_STATEMENT_LINES : "UNIQUE: tính 1 lần"
  WORK_OUTPUT_RECORDS ||--o| PAY_STATEMENT_LINES : "UNIQUE: tính 1 lần"
  PAYROLL_PERIODS ||--o{ PAY_ADJUSTMENTS : "cộng/trừ/tạm ứng"

  ATTENDANCE_RECORDS { uuid id PK "tạo ở thiết bị"; ts started_at; ts ended_at; float start_lat; float start_accuracy_m; attendance_source source "self|team_leader|admin"; attendance_status status; int declared_minutes; int approved_minutes }
  WORK_RATES { rate_type rate_type "hour|quantity (ngày công = LATER)"; numeric amount; date valid_from; date valid_to }
  PAYROLL_PERIODS { payroll_status status "draft..locked"; ts locked_at }
```

- Một ca mở/người (chỉ mục duy nhất). Ngoại lệ GPS → `needs_confirmation`, không loại công.
- Kỳ `locked` chặn sửa công, sản lượng, dòng lương, khoản cộng/trừ (`PERIOD_LOCKED`); mở khóa = đổi trạng thái kỳ, có audit.
- Tiền công chỉ chủ/quản lý, kho-tài chính và chính người lao động xem; tổ trưởng không xem tiền công người khác.

## 5. Hồ sơ thương mại và website công khai

```mermaid
erDiagram
  ORGANIZATIONS ||--o| BUSINESS_PROFILES : "tối đa 1"
  BUSINESS_PROFILES ||--o{ PRODUCT_LISTINGS : ""
  PRODUCT_LISTINGS ||--o{ PRODUCT_IMAGES : "is_public_allowed"
  PRODUCT_LISTINGS ||--o{ SUPPLY_OFFERS : "lịch sử chỉ thêm"
  BUSINESS_PROFILES ||--o{ CERTIFICATION_RECORDS : "5 mức trạng thái"
  BUSINESS_PROFILES ||--o{ PUBLICATION_CONSENTS : "chủ cơ sở xác nhận"
  BUSINESS_PROFILES ||--o{ PUBLICATION_REVIEWS : ""
  BUSINESS_PROFILES ||--o{ CONTACT_INQUIRIES : "ghi qua Edge Function"
  ORGANIZATIONS ||--o{ PROFILE_SERVICE_REQUESTS : ""
  BUSINESS_PROFILES ||--o| PUBLIC_PROFILES : "bản chụp bất biến"
  PUBLIC_PROFILES ||--o{ PUBLIC_PRODUCTS : ""
  PUBLIC_PROFILES }o--|| PUBLIC_DIRECTORY : "view + xếp hạng theo gói"

  BUSINESS_PROFILES { publication_status status "đổi chỉ qua hàm"; location_precision location_precision }
  PUBLIC_PROFILES { jsonb snapshot "chỉ phần được đồng ý"; bool is_visible }
```

Luồng: `draft → (thiếu thông tin / chờ đồng ý) → pending_review → published`, hoặc `changes_requested / hidden / withdrawn`.
Hàm: `submit_profile_for_review` (chỉ chủ) → `approve_and_publish` / `review_profile` (kiểm duyệt viên) → `hide_profile` (chủ hoặc kiểm duyệt viên).
Website (anon) chỉ có `SELECT` trên `public_profiles`, `public_products`, `public_directory`.

## 6. Vai trò cơ sở dữ liệu

| Vai trò | Quyền |
|---|---|
| `anon` | Chỉ đọc `public_*` và `public_directory` |
| `authenticated` | Theo RLS (thành viên tổ chức, vai trò, người lao động/tổ trưởng) |
| Quản trị nền tảng (`platform_admins`) | Quản lý gói, giá, thanh toán, cấu hình; **không** có chính sách đọc dữ liệu vận hành riêng tư |
| Kiểm duyệt viên (`platform_reviewers`) | Duyệt/ẩn hồ sơ, xác minh chứng nhận |
| `service_role` | Chỉ Edge Function (ví dụ nhận liên hệ sau Turnstile); không bao giờ ở frontend |

## 7. Audit

Trigger `audit_row_change` ghi `before/after` cho: thành viên, liên kết HTX, gói/thanh toán/cấu hình, vụ, nhật ký, thu hoạch, chi phí, bán hàng, chấm công, điều chỉnh công, đơn giá, sản lượng, kỳ/bảng lương, khoản cộng/trừ, hồ sơ/đồng ý/duyệt/chứng nhận. `audit_events` không sửa/xóa được.
