import type { FieldPack } from './types';

/** Gói dưa lưới nhà màng theo sổ VietGAP trồng trọt. Phân/thuốc cụ thể chọn ở ô "Vật tư đã dùng" (trừ kho, tính cách ly). */
const PEST = ['Rệp', 'Bọ trĩ', 'Nhện đỏ', 'Ruồi đục quả', 'Sâu xanh', 'Sương mai', 'Phấn trắng', 'Héo rũ / thối gốc', 'Khác'];

export const MELON_PACK: FieldPack = {
  id: 'melon_greenhouse',
  kind: 'crop',
  name: 'Dưa lưới nhà màng (hướng VietGAP)',
  description: 'Ươm giống, ra vườn, dặm, treo dây, bón phân (EC/pH), phun thuốc (dụng cụ, lý do, hiệu quả), tưới, thụ phấn, tỉa, thu hoạch (Brix, phân loại).',
  workTypes: {
    spraying: [
      { key: 'target', label: 'Đối tượng phòng trừ', type: 'multiselect', options: PEST, required: true },
      { key: 'reason', label: 'Lý do phun', type: 'select', options: ['Phòng bệnh', 'Phát hiện sâu bệnh', 'Theo quy trình'] },
      { key: 'dose', label: 'Liều lượng / nồng độ', type: 'text', hint: 'Ví dụ: 20 ml pha bình 16 lít' },
      { key: 'tool', label: 'Dụng cụ phun', type: 'select', options: ['Bình đeo vai', 'Máy phun điện', 'Máy phun động cơ'] },
      { key: 'water_l', label: 'Lượng nước phun', type: 'number', unit: 'lít', min: 0 },
      { key: 'sprayed_m2', label: 'Diện tích đã phun', type: 'number', unit: 'm²', min: 0 },
      { key: 'ppe', label: 'Có dùng đồ bảo hộ', type: 'bool' },
      { key: 'effect', label: 'Đánh giá hiệu quả (sau phun)', type: 'select', options: ['Tốt', 'Trung bình', 'Chưa hiệu quả'] },
    ],
    fertilizing: [
      { key: 'method', label: 'Cách bón', type: 'select', options: ['Bón gốc', 'Qua nước tưới nhỏ giọt', 'Phun qua lá'], required: true },
      { key: 'stage', label: 'Giai đoạn dinh dưỡng', type: 'select', options: ['Bón lót', 'Cây con', 'Ra hoa', 'Nuôi quả', 'Trước thu hoạch'] },
      { key: 'dose', label: 'Liều lượng', type: 'text', hint: 'Ví dụ: 5 kg / 1.000 m²' },
      { key: 'ec', label: 'EC dung dịch', type: 'number', unit: 'mS/cm', min: 0, max: 10 },
      { key: 'ph', label: 'pH dung dịch', type: 'number', min: 0, max: 14 },
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
      { key: 'grade_note', label: 'Phân loại (theo kích cỡ / hình thức)', type: 'select', options: ['Loại 1', 'Loại 2', 'Loại 3', 'Loại bỏ'] },
      { key: 'buyer', label: 'Nơi nhận / khách', type: 'text' },
      { key: 'fruit_kg', label: 'Cân quả mẫu', type: 'number', unit: 'kg', min: 0 },
    ],
  },
  newWorkTypes: [
    { name: 'Ngâm ủ hạt giống', description: 'Xử lý và ủ hạt trước khi gieo', fields: [
      { key: 'method', label: 'Cách xử lý', type: 'text', hint: 'Ví dụ: ngâm nước ấm 3 giờ' },
      { key: 'hours', label: 'Thời gian ngâm ủ', type: 'number', unit: 'giờ', min: 0 },
      { key: 'seeds', label: 'Số hạt', type: 'number', min: 0 },
    ] },
    { name: 'Gieo hạt vào khay', description: 'Gieo hạt ươm cây con', fields: [
      { key: 'trays', label: 'Số khay', type: 'number', min: 0 },
      { key: 'seeds', label: 'Số hạt', type: 'number', min: 0 },
      { key: 'substrate', label: 'Giá thể', type: 'text' },
    ] },
    { name: 'Ra vườn / trồng cây con', description: 'Chuyển cây con ra nhà màng', fields: [
      { key: 'plants', label: 'Số cây trồng', type: 'number', min: 0, required: true },
      { key: 'spacing', label: 'Khoảng cách trồng', type: 'text', hint: 'Ví dụ: 40 cm × 1 m' },
    ] },
    { name: 'Dặm cây', description: 'Trồng dặm cây thay cây chết', fields: [
      { key: 'plants', label: 'Số cây dặm', type: 'number', min: 0, required: true },
    ] },
    { name: 'Treo dây / lên giàn', description: 'Treo dây, buộc cây lên giàn', fields: [
      { key: 'plants', label: 'Số cây đã treo', type: 'number', min: 0 },
    ] },
  ],
};
