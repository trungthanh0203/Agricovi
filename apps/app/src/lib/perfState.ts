/** Trạng thái đo dung lượng tải (Đợt 0 hiệu năng): chỉ bật trong lúc đo một lần đồng bộ. Tách riêng để lib/supabase.ts dùng được mà không kéo theo cơ sở dữ liệu trên máy. */
export const perfState = { measuring: false, bytes: 0, requests: 0 };
