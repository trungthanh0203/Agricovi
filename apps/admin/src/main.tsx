import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Khung trang quản trị nền tảng (v1.2 mục 6). Chỉ PlatformAdmin được vào - kiểm tra ở RLS/CSDL.
const SECTIONS = [
  'Gói và giá',
  'Tổ chức và gói đang dùng',
  'Thanh toán',
  'Xếp hạng hiển thị website',
  'Cấu hình nền tảng (dùng thử, ngày nhắc)',
  'Duyệt hồ sơ',
  'Audit log',
];

function Admin() {
  return (
    <main style={{ fontFamily: 'system-ui', maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>AgriConnect — Quản trị nền tảng</h1>
      <ul>
        {SECTIONS.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      <p>Khung dự án. Triển khai theo backlog E5-S14, E5-S15.</p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Admin />
  </StrictMode>,
);
