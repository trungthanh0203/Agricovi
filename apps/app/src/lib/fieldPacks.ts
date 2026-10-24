import type { FieldDef } from './db';

/**
 * Bộ mẫu theo loại hình (D96): gói cấu hình sẵn các trường ghi cho từng loại việc. Chủ cơ sở bấm "Áp dụng" rồi tự sửa tiếp ở
 * Danh mục việc. Loại hình mới = thêm một gói ở đây, không phải sửa mã nơi khác. Nội dung là BẢN DỰ KIẾN theo mẫu sổ VietGAP phổ biến,
 * sẽ chỉnh lại theo sổ thật của các hộ. Thuốc/phân cụ thể chọn ở ô "Vật tư đã dùng" (trừ kho, tính cách ly) nên không lặp lại ở đây.
 * Phần thuần: không import gì ngoài kiểu.
 */
export interface FieldPack {
  id: string;
  name: string;
  description: string;
  /** mã loại việc dùng chung (work_types.code) -> các trường */
  workTypes: Record<string, FieldDef[]>;
}

const PEST_MELON = ['Rệp', 'Bọ trĩ', 'Nhện đỏ', 'Ruồi đục quả', 'Sâu xanh', 'Sương mai', 'Phấn trắng', 'Héo rũ / thối gốc', 'Khác'];

export const FIELD_PACKS: FieldPack[] = [
  {
    id: 'melon_greenhouse',
    name: 'Dưa lưới nhà màng (hướng VietGAP)',
    description: 'Phun thuốc, bón phân, tưới, thụ phấn, tỉa, thu hoạch cho dưa lưới trồng trong nhà màng.',
    workTypes: {
      spraying: [
        { key: 'target', label: 'Đối tượng phòng trừ', type: 'multiselect', options: PEST_MELON, required: true },
        { key: 'dose', label: 'Liều lượng / nồng độ', type: 'text', hint: 'Ví dụ: 20 ml pha bình 16 lít' },
        { key: 'water_l', label: 'Lượng nước phun', type: 'number', unit: 'lít', min: 0 },
        { key: 'sprayed_m2', label: 'Diện tích đã phun', type: 'number', unit: 'm²', min: 0 },
        { key: 'ppe', label: 'Có dùng đồ bảo hộ', type: 'bool' },
      ],
      fertilizing: [
        { key: 'method', label: 'Cách bón', type: 'select', options: ['Bón gốc', 'Qua nước tưới nhỏ giọt', 'Phun qua lá'], required: true },
        { key: 'dose', label: 'Liều lượng', type: 'text', hint: 'Ví dụ: 5 kg / 1.000 m²' },
        { key: 'fert_m2', label: 'Diện tích đã bón', type: 'number', unit: 'm²', min: 0 },
      ],
      irrigation: [
        { key: 'duration_min', label: 'Thời gian tưới', type: 'number', unit: 'phút', min: 0 },
        { key: 'ec', label: 'EC dung dịch tưới', type: 'number', unit: 'mS/cm', min: 0, max: 10 },
        { key: 'ph', label: 'pH dung dịch tưới', type: 'number', min: 0, max: 14 },
      ],
      pollination: [{ key: 'flowers', label: 'Số hoa đã thụ phấn', type: 'number', min: 0 }],
      pruning: [{ key: 'plants', label: 'Số cây đã tỉa / bấm ngọn', type: 'number', min: 0 }],
      harvesting: [
        { key: 'brix', label: 'Độ Brix (độ ngọt)', type: 'number', min: 0, max: 30 },
        { key: 'fruit_kg', label: 'Cân quả mẫu', type: 'number', unit: 'kg', min: 0 },
      ],
    },
  },
];

export interface PackWorkType { id: string; code: string; name: string; shared: boolean; field_schema: FieldDef[] }
export interface PackStep { id: string; name: string; shared: boolean; fields: FieldDef[]; replaces: number }

/** Việc nào sẽ được đặt trường theo gói: theo mã loại việc; mã không có trong danh mục thì ghi vào `missing` */
export function planPackApply(pack: FieldPack, workTypes: PackWorkType[]): { steps: PackStep[]; missing: string[] } {
  const steps: PackStep[] = [];
  const missing: string[] = [];
  for (const [code, fields] of Object.entries(pack.workTypes)) {
    const wt = workTypes.find((w) => w.code === code);
    if (!wt) { missing.push(code); continue; }
    steps.push({ id: wt.id, name: wt.name, shared: wt.shared, fields, replaces: wt.field_schema.filter((f) => !fields.some((x) => x.key === f.key)).length });
  }
  return { steps, missing };
}
