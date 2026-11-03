import { buildShareText } from './guideContent';

/** Địa chỉ gửi kèm lời giới thiệu: hiện là địa chỉ app đang chạy; khi có tên miền chính thức thì đổi tại đây */
export const APP_SHARE_URL = window.location.origin;

/** Chia sẻ lời giới thiệu hệ thống (hộp chia sẻ của điện thoại; không có thì chép vào bộ nhớ tạm). Trả về câu báo cho người dùng ('' nếu không cần báo). */
export const referralLink = (code: string) => `${APP_SHARE_URL}/?ref=${encodeURIComponent(code)}`;

export async function shareSystem(contact?: string, refCode?: string): Promise<string> {
  const text = buildShareText(refCode ? referralLink(refCode) : APP_SHARE_URL, contact);
  try {
    if (navigator.share) { await navigator.share({ title: 'Agricovi', text }); return ''; }
    await navigator.clipboard.writeText(text);
    return 'Đã chép lời giới thiệu, dán vào Zalo hoặc tin nhắn để gửi.';
  } catch {
    return ''; // người dùng đóng hộp chia sẻ
  }
}
