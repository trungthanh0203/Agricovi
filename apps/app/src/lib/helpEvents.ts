/** Sự kiện nhảy tới một bước của Hướng dẫn sử dụng (từ nút ⓘ). Để riêng một tệp nhỏ để App.tsx nghe sự kiện mà không kéo gói trợ giúp vào gói đầu. */
export const GUIDE_JUMP_EVENT = 'agri:guide-jump';
export interface GuideJump { id: string; step: number }
