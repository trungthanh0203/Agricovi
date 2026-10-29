/** Thông tin liên hệ hỗ trợ (cài đặt, duyệt đăng ký, quên mật khẩu). Đổi bằng biến môi trường VITE_SUPPORT_CONTACT khi build nếu cần. */
export const SUPPORT_CONTACT = (import.meta.env.VITE_SUPPORT_CONTACT as string | undefined) || 'Liên hệ Mr.Thành - 0989.099.454 (Zalo)';
