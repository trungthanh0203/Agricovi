# Bộ nhận diện Agricovi

- `source/`: ảnh gốc do chủ sản phẩm cung cấp (21 biểu tượng chữ A, 23 logo dọc, 25 logo ngang, 22 ảnh bìa, 24 minh họa app, 26–27 ảnh nhà vườn dùng app). Ảnh có dấu "Gemini Notebook" nhưng bản dùng công khai đã xóa dấu.
- `build-brand.cjs`: tạo mọi tệp dùng cho website và app (favicon, biểu tượng cài đặt app, logo nền trong suốt, ảnh chia sẻ 1200×630, ảnh minh họa đã nén). Chạy lại: `node brand/build-brand.cjs`.
- Kết quả: `apps/web/public/` (favicon, `brand/…`) và `apps/app/public/` (favicon, biểu tượng app, logo, ảnh chào).
- Muốn đổi logo: thay tệp trong `source/` (giữ đúng tên), chạy lại lệnh trên, commit.
- Cách viết: **Agricovi** trong văn bản; **AgriCoVi** chỉ nằm trong logo (D75).
