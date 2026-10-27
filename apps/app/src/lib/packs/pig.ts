import type { FieldDef } from '../db';
import type { FieldPack } from './types';

/**
 * Gói heo thịt theo 4 sổ VietGAHP/VietGAP chăn nuôi (đàn–giống, thức ăn–nước, thú y–vaccine, vệ sinh–môi trường).
 * Thuốc, vaccine, cám, hóa chất chọn ở ô "Vật tư đã dùng" (trừ kho, tính ngưng thuốc, gắn lô) nên KHÔNG lặp trong form.
 * "Người kiểm tra" tạm là ô chữ; ký xác nhận đúng nghĩa làm ở P5.
 */
const DISEASE = ['Lở mồm long móng', 'Tai xanh (PRRS)', 'Dịch tả heo châu Phi', 'Tiêu chảy', 'Suyễn', 'Khác'];
const ROUTE = ['Tiêm bắp', 'Tiêm dưới da', 'Uống', 'Trộn thức ăn'];
const CHECKER: FieldDef = { key: 'checker', label: 'Người kiểm tra', type: 'text' };
const NEEDLE: FieldDef = { key: 'needle_broken', label: 'Có gãy kim tiêm', type: 'bool', hint: 'Nếu có, hãy báo thêm sự cố "Kim tiêm gãy" để theo dõi' };

export const PIG_PACK: FieldPack = {
  id: 'pig_farm',
  kind: 'livestock',
  name: 'Heo thịt (hướng VietGAHP)',
  description: 'Cho ăn, kiểm tra nước, tiêm vaccine, điều trị, tẩy giun (có gãy kim), cân heo, sát trùng, xử lý chất thải, diệt côn trùng và chuột, vệ sinh chuồng; xuất chuồng ghi thẻ tai và kiểm dịch. Ngưng thuốc dùng chung cơ chế cách ly.',
  workTypes: {
    harvesting: [
      { key: 'ear_tags', label: 'Thẻ tai / mã con', type: 'text', hint: 'Ví dụ: A101–A150' },
      { key: 'quarantine_no', label: 'Số giấy kiểm dịch', type: 'text' },
      { key: 'buyer', label: 'Nơi nhận / khách', type: 'text' },
      { key: 'avg_kg', label: 'Khối lượng trung bình', type: 'number', unit: 'kg/con', min: 0 },
    ],
  },
  newWorkTypes: [
    { name: 'Cho ăn', description: 'Ghi nhóm cám và lượng cho ăn', fields: [
      { key: 'feed_kind', label: 'Nhóm thức ăn', type: 'select', options: ['Cám heo con', 'Cám heo choai', 'Cám heo vỗ béo', 'Tự phối trộn'] },
      { key: 'feed_kg', label: 'Lượng cho ăn', type: 'number', unit: 'kg', min: 0, required: true },
      { key: 'pigs', label: 'Số heo trong chuồng', type: 'number', min: 0 },
    ] },
    { name: 'Kiểm tra nước uống', description: 'Kiểm tra chất lượng nước', fields: [
      { key: 'source', label: 'Nguồn nước', type: 'select', options: ['Nước giếng', 'Nước máy', 'Nước suối / sông'] },
      { key: 'ph', label: 'pH', type: 'number', min: 0, max: 14 },
      { key: 'ecoli', label: 'E.coli', type: 'select', options: ['Đạt', 'Không đạt', 'Chưa có kết quả'] },
      { key: 'result', label: 'Kết luận', type: 'select', options: ['Đạt', 'Không đạt'], required: true },
      CHECKER,
    ] },
    { name: 'Tự phối trộn thức ăn', description: 'Ghi công thức khi tự trộn cám', fields: [
      { key: 'batch_kg', label: 'Khối lượng mẻ trộn', type: 'number', unit: 'kg', min: 0, required: true },
      { key: 'formula', label: 'Thành phần / công thức', type: 'text', hint: 'Ví dụ: ngô 50%, cám gạo 20%, đạm 30%' },
    ] },
    { name: 'Tiêm vaccine', description: 'Vaccine chọn ở ô "Vật tư đã dùng"', fields: [
      { key: 'disease', label: 'Phòng bệnh', type: 'multiselect', options: DISEASE },
      { key: 'route', label: 'Cách dùng', type: 'select', options: ROUTE },
      { key: 'pigs', label: 'Số heo được tiêm', type: 'number', min: 0 },
      { key: 'dose', label: 'Liều dùng', type: 'text', hint: 'Ví dụ: 2 ml / con' },
      NEEDLE,
    ] },
    { name: 'Điều trị bệnh', description: 'Thuốc chọn ở ô "Vật tư đã dùng" để tính thời gian ngưng thuốc', fields: [
      { key: 'symptom', label: 'Triệu chứng / lý do điều trị', type: 'text', required: true },
      { key: 'route', label: 'Cách dùng', type: 'select', options: ROUTE },
      { key: 'pigs', label: 'Số heo được điều trị', type: 'number', min: 0 },
      { key: 'dose', label: 'Liều dùng', type: 'text' },
      { key: 'result', label: 'Kết quả', type: 'select', options: ['Khỏi', 'Đang theo dõi', 'Không khỏi / loại thải'] },
      NEEDLE,
    ] },
    { name: 'Tẩy giun sán', description: 'Thuốc chọn ở ô "Vật tư đã dùng"', fields: [
      { key: 'route', label: 'Cách dùng', type: 'select', options: ROUTE },
      { key: 'pigs', label: 'Số heo được tẩy', type: 'number', min: 0 },
      { key: 'dose', label: 'Liều dùng', type: 'text' },
      NEEDLE,
    ] },
    { name: 'Cân mẫu', description: 'Cân định kỳ để theo dõi tăng trọng (cũng ghi được ở ô "Ghi lần cân" của vụ)', fields: [
      { key: 'pigs', label: 'Số con đã cân', type: 'number', min: 0, required: true },
      { key: 'avg_kg', label: 'Cân nặng trung bình', type: 'number', unit: 'kg', min: 0, required: true },
    ] },
    { name: 'Sát trùng', description: 'Sát trùng cổng, khuôn viên, dãy chuồng. Chọn khu vực ở "Ghi cho"; hóa chất ở "Vật tư đã dùng"', fields: [
      { key: 'concentration', label: 'Nồng độ pha', type: 'text', hint: 'Ví dụ: 1/200' },
      { key: 'result', label: 'Kết quả', type: 'select', options: ['Đạt', 'Cần làm lại'] },
      CHECKER,
    ] },
    { name: 'Thay thuốc hố sát trùng', description: 'Thay dung dịch ở hố sát trùng cổng', fields: [
      { key: 'concentration', label: 'Nồng độ pha', type: 'text' },
      CHECKER,
    ] },
    { name: 'Xử lý chất thải / biogas', description: 'Xử lý phân, nước thải, biogas', fields: [
      { key: 'method', label: 'Cách xử lý', type: 'select', options: ['Hầm biogas', 'Ủ phân', 'Lắng lọc nước thải', 'Khác'] },
      { key: 'amount', label: 'Số lượng xử lý', type: 'number', min: 0 },
      { key: 'unit', label: 'Đơn vị', type: 'select', options: ['kg', 'm³'] },
    ] },
    { name: 'Diệt côn trùng và chuột', description: 'Bẫy chuột, diệt ruồi muỗi', fields: [
      { key: 'method', label: 'Biện pháp', type: 'select', options: ['Bẫy', 'Bả diệt chuột', 'Phun diệt côn trùng'] },
      { key: 'count', label: 'Số bẫy / điểm đặt', type: 'number', min: 0 },
      CHECKER,
    ] },
    { name: 'Vệ sinh và để trống chuồng', description: 'Dọn chuồng, sát trùng, để trống trước khi nhập lứa mới', fields: [
      { key: 'pen_m2', label: 'Diện tích đã vệ sinh', type: 'number', unit: 'm²', min: 0 },
      { key: 'empty_days', label: 'Số ngày để trống', type: 'number', min: 0 },
      CHECKER,
    ] },
  ],
};
