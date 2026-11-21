/** Thương hiệu hiển thị (D226). Muốn đổi tên, khẩu hiệu hay địa chỉ: sửa ở đây và ở các biến môi trường (tiền tố VITE_ và PUBLIC_). */
export const BRAND = {
  name: 'Acovin',
  tagline: 'Kết nối nông nghiệp số Việt Nam',
  domain: 'agricovi.com',
  siteUrl: 'https://agricovi.com',
  appUrl: 'https://app.agricovi.com',
} as const;

/**
 * Thông báo từ máy chủ viết sẵn trong các hàm CSDL cũ (migration đã áp dụng) còn dùng tên cũ: đổi sang tên hiện hành khi hiển thị,
 * không cần viết lại hàm CSDL.
 */
export function brandText(msg: string): string {
  return msg.replace(/AgriCoVi|Agricovi|AgriConnect/g, BRAND.name);
}
