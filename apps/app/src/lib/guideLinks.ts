/** Tài liệu hướng dẫn đặt trên website (D153): bấm mở trang web ở tab mới. Địa chỉ gốc cùng cấu hình với liên kết website ở Trang chủ. */
const SITE_URL = ((import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined) || 'https://agricovi.com').replace(/\/$/, '');

export interface GuideLink { id: string; title: string; hint: string; url: string }

export const GUIDE_LINKS: GuideLink[] = [
  { id: 'he-thong', title: 'Giới thiệu hệ thống Agricovi', hint: 'Agricovi làm được gì, ai dùng và dùng như thế nào', url: `${SITE_URL}/huong-dan/he-thong/` },
  { id: 'trong-cay', title: 'Hướng dẫn trồng trọt', hint: 'Cách ghi vụ, việc và thu hoạch cho cây trồng', url: `${SITE_URL}/huong-dan/trong-cay/` },
  { id: 'vat-nuoi', title: 'Hướng dẫn vật nuôi', hint: 'Cách ghi vụ, việc và thu hoạch cho vật nuôi', url: `${SITE_URL}/huong-dan/vat-nuoi/` },
];
