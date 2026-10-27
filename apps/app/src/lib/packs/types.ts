import type { FieldDef } from '../db';

/**
 * Gói trường theo loại hình (D96, D98): mỗi loại hình là MỘT file riêng trong thư mục này (melon.ts, pig.ts…), nhập vào danh sách
 * ở ../fieldPacks.ts. Thêm loại hình = thêm một file + một dòng; không sửa lõi và không ảnh hưởng cơ sở không áp dụng gói đó.
 * Chủ cơ sở bấm "Áp dụng" ở Danh mục việc rồi tự sửa tiếp. Nội dung là BẢN DỰ KIẾN theo sổ thật, "cần đối chiếu" với đơn vị chứng nhận.
 */
export interface FieldPack {
  id: string;
  /** Loại vụ mà gói áp dụng (crop/livestock/aquatic/other); bản chỉnh được lưu cho riêng loại đó, không ghi đè loại khác */
  kind?: 'crop' | 'livestock' | 'aquatic' | 'other';
  name: string;
  description: string;
  /** mã loại việc dùng chung (work_types.code) -> các trường */
  workTypes: Record<string, FieldDef[]>;
  /** việc chưa có trong danh mục dùng chung: tạo mới cho cơ sở (nếu cơ sở chưa có việc cùng tên) */
  newWorkTypes?: { name: string; description: string; fields: FieldDef[] }[];
}
