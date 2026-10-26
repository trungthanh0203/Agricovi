/**
 * Cấu hình mặc định của hệ thống (tab Cấu hình). Những chỗ cần danh sách này (chọn nhóm loại sản phẩm...) lấy từ đây,
 * không viết cứng lại ở nơi khác. Thêm một cấu hình mới = thêm một mục vào CONFIG_LISTS.
 */
export type ProductKind = 'crop' | 'livestock' | 'aquatic' | 'other';

export interface ConfigItem { id: string; label: string }
export interface ConfigList { id: string; title: string; hint: string; items: ConfigItem[] }

/** Nhóm loại sản phẩm: giá trị lưu ở crop_types.kind */
export const PRODUCT_GROUPS: { id: ProductKind; label: string }[] = [
  { id: 'crop', label: 'Cây trồng' },
  { id: 'livestock', label: 'Vật nuôi' },
  { id: 'aquatic', label: 'Thủy sản' },
  { id: 'other', label: 'Khác' },
];

export const PRODUCT_GROUP_LABEL = Object.fromEntries(PRODUCT_GROUPS.map((g) => [g.id, g.label])) as Record<ProductKind, string>;

export const CONFIG_LISTS: ConfigList[] = [
  {
    id: 'product_groups',
    title: 'Nhóm loại sản phẩm',
    hint: 'Dùng khi khai báo Sản phẩm (Khai báo → Sản phẩm) để biết là cây trồng, vật nuôi hay thủy sản.',
    items: PRODUCT_GROUPS,
  },
];

/** Vật nuôi trên cạn và thủy sản đều đếm theo con, dùng chung các nhãn "lứa nuôi" */
export const isAnimalKind = (k?: ProductKind) => k === 'livestock' || k === 'aquatic';
