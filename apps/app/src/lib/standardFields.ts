import type { FieldDef } from './db';

/**
 * Biểu mẫu CHUẨN của các đầu việc theo loại vụ (vật nuôi, thủy sản), dùng sẵn không cần "Áp dụng gói" (điểm 2, PLAN_PHAN_BIET_LOAI_VU.md).
 * Khóa theo MÃ đầu việc dùng chung (work_types.code, migration 0107). Thứ tự ưu tiên khi chọn form cho một vụ (xem catalog.ts):
 * bản chỉnh của cơ sở cho đúng loại → bản chỉnh "mọi loại" → biểu mẫu chuẩn ở đây → form gốc của đầu việc.
 * Cây trồng cũng có biểu mẫu chuẩn (thay cho "bộ mẫu theo loại hình" cũ đã bỏ); muốn khác thì sửa ở màn Giai đoạn việc.
 * Các khóa pigs, avg_kg, feed_kg được tính Tăng trọng/FCR đọc (get_cycle_growth) nên KHÔNG đổi khóa. Nội dung là bản dự kiến, "cần đối chiếu" với đơn vị chứng nhận.
 */
const CHECKER: FieldDef = { key: 'checker', label: 'Người kiểm tra', type: 'text' };
const NEEDLE: FieldDef = { key: 'needle_broken', label: 'Có gãy kim tiêm', type: 'bool', hint: 'Nếu có, hãy báo thêm sự cố "Kim tiêm gãy" để theo dõi' };
const ROUTE = ['Tiêm bắp', 'Tiêm dưới da', 'Uống', 'Trộn thức ăn', 'Khác'];
const DISEASE = ['Lở mồm long móng', 'Tai xanh (PRRS)', 'Dịch tả', 'Newcastle', 'Cúm gia cầm', 'Tiêu chảy', 'Khác'];

const LIVESTOCK: Record<string, FieldDef[]> = {
  feeding: [
    { key: 'feed_kind', label: 'Nhóm thức ăn', type: 'select', options: ['Thức ăn công nghiệp', 'Tự phối trộn', 'Khác'] },
    { key: 'feed_kg', label: 'Lượng cho ăn', type: 'number', unit: 'kg', min: 0, required: true },
    { key: 'pigs', label: 'Số con trong chuồng', type: 'number', min: 0 },
  ],
  feed_mixing: [
    { key: 'batch_kg', label: 'Khối lượng mẻ trộn', type: 'number', unit: 'kg', min: 0, required: true },
    { key: 'formula', label: 'Thành phần / công thức', type: 'text', hint: 'Ví dụ: ngô 50%, cám gạo 20%, đạm 30%' },
  ],
  water_checking: [
    { key: 'source', label: 'Nguồn nước', type: 'select', options: ['Nước giếng', 'Nước máy', 'Nước suối / sông'] },
    { key: 'ph', label: 'pH', type: 'number', min: 0, max: 14 },
    { key: 'result', label: 'Kết luận', type: 'select', options: ['Đạt', 'Không đạt'], required: true },
    CHECKER,
  ],
  vaccinating: [
    { key: 'disease', label: 'Phòng bệnh', type: 'multiselect', options: DISEASE },
    { key: 'route', label: 'Cách dùng', type: 'select', options: ROUTE },
    { key: 'pigs', label: 'Số con được tiêm', type: 'number', min: 0 },
    { key: 'dose', label: 'Liều dùng', type: 'text', hint: 'Ví dụ: 2 ml / con' },
    NEEDLE,
  ],
  treating: [
    { key: 'symptom', label: 'Triệu chứng / lý do điều trị', type: 'text', required: true },
    { key: 'route', label: 'Cách dùng', type: 'select', options: ROUTE },
    { key: 'pigs', label: 'Số con được điều trị', type: 'number', min: 0 },
    { key: 'dose', label: 'Liều dùng', type: 'text' },
    { key: 'result', label: 'Kết quả', type: 'select', options: ['Khỏi', 'Đang theo dõi', 'Không khỏi / loại thải'] },
    NEEDLE,
  ],
  deworming: [
    { key: 'route', label: 'Cách dùng', type: 'select', options: ROUTE },
    { key: 'pigs', label: 'Số con được tẩy', type: 'number', min: 0 },
    { key: 'dose', label: 'Liều dùng', type: 'text' },
    NEEDLE,
  ],
  weighing: [
    { key: 'pigs', label: 'Số con đã cân', type: 'number', min: 0, required: true },
    { key: 'avg_kg', label: 'Cân nặng trung bình', type: 'number', unit: 'kg/con', min: 0, required: true },
  ],
  disinfecting: [
    { key: 'concentration', label: 'Nồng độ pha', type: 'text', hint: 'Ví dụ: 1/200' },
    { key: 'result', label: 'Kết quả', type: 'select', options: ['Đạt', 'Cần làm lại'] },
    CHECKER,
  ],
  pit_changing: [{ key: 'concentration', label: 'Nồng độ pha', type: 'text' }, CHECKER],
  waste_handling: [
    { key: 'method', label: 'Cách xử lý', type: 'select', options: ['Hầm biogas', 'Ủ phân', 'Lắng lọc nước thải', 'Khác'] },
    { key: 'amount', label: 'Số lượng xử lý', type: 'number', min: 0 },
    { key: 'unit', label: 'Đơn vị', type: 'select', options: ['kg', 'm³'] },
  ],
  pest_control: [
    { key: 'method', label: 'Biện pháp', type: 'select', options: ['Bẫy', 'Bả diệt chuột', 'Phun diệt côn trùng'] },
    { key: 'count', label: 'Số bẫy / điểm đặt', type: 'number', min: 0 },
    CHECKER,
  ],
  house_cleaning: [
    { key: 'pen_m2', label: 'Diện tích đã vệ sinh', type: 'number', unit: 'm²', min: 0 },
    { key: 'empty_days', label: 'Số ngày để trống', type: 'number', min: 0 },
    CHECKER,
  ],
  harvesting: [
    { key: 'ear_tags', label: 'Thẻ tai / mã con', type: 'text', hint: 'Ví dụ: A101–A150' },
    { key: 'quarantine_no', label: 'Số giấy kiểm dịch', type: 'text' },
    { key: 'buyer', label: 'Nơi nhận / khách', type: 'text' },
    { key: 'avg_kg', label: 'Khối lượng trung bình', type: 'number', unit: 'kg/con', min: 0 },
  ],
};

const AQUATIC: Record<string, FieldDef[]> = {
  feeding: [
    { key: 'feed_kind', label: 'Loại thức ăn', type: 'select', options: ['Thức ăn công nghiệp', 'Tự phối trộn', 'Thức ăn tươi', 'Khác'] },
    { key: 'feed_kg', label: 'Lượng cho ăn', type: 'number', unit: 'kg', min: 0, required: true },
    { key: 'meals', label: 'Số cữ ăn trong ngày', type: 'number', min: 0 },
  ],
  feed_mixing: LIVESTOCK.feed_mixing!,
  treating: [
    { key: 'symptom', label: 'Triệu chứng / lý do điều trị', type: 'text', required: true },
    { key: 'dose', label: 'Liều dùng', type: 'text' },
    { key: 'result', label: 'Kết quả', type: 'select', options: ['Khỏi', 'Đang theo dõi', 'Không khỏi / loại thải'] },
  ],
  weighing: [
    { key: 'pigs', label: 'Số con đã cân', type: 'number', min: 0 },
    { key: 'avg_kg', label: 'Cân nặng trung bình', type: 'number', unit: 'kg/con', min: 0, required: true, hint: 'Cá, tôm nhỏ: ghi bằng kg (ví dụ 0,025 = 25 g)' },
  ],
  disinfecting: LIVESTOCK.disinfecting!,
  water_measuring: [
    { key: 'ph', label: 'pH', type: 'number', min: 0, max: 14 },
    { key: 'temperature', label: 'Nhiệt độ nước', type: 'number', unit: '°C' },
    { key: 'oxygen', label: 'Oxy hòa tan', type: 'number', unit: 'mg/l', min: 0 },
    { key: 'salinity', label: 'Độ mặn', type: 'number', unit: '‰', min: 0 },
    { key: 'transparency', label: 'Độ trong', type: 'number', unit: 'cm', min: 0 },
    CHECKER,
  ],
  water_changing: [
    { key: 'percent', label: 'Tỉ lệ nước thay', type: 'number', unit: '%', min: 0, max: 100 },
    { key: 'source', label: 'Nguồn nước cấp', type: 'select', options: ['Nước sông / kênh', 'Nước giếng', 'Nước đã xử lý', 'Khác'] },
  ],
  water_treating: [
    { key: 'product', label: 'Chế phẩm / hóa chất', type: 'text', hint: 'Chọn thêm ở ô "Vật tư đã dùng" nếu có trong kho' },
    { key: 'dose', label: 'Liều dùng', type: 'text' },
    { key: 'purpose', label: 'Mục đích', type: 'select', options: ['Diệt khuẩn', 'Ổn định pH', 'Gây màu nước', 'Khác'] },
  ],
  pond_cleaning: [
    { key: 'area_m2', label: 'Diện tích đã vệ sinh', type: 'number', unit: 'm²', min: 0 },
    { key: 'method', label: 'Cách làm', type: 'text' },
    CHECKER,
  ],
  harvesting: [
    { key: 'size_grade', label: 'Cỡ thu', type: 'text', hint: 'Ví dụ: 30 con/kg' },
    { key: 'buyer', label: 'Nơi nhận / khách', type: 'text' },
    { key: 'avg_kg', label: 'Khối lượng trung bình', type: 'number', unit: 'kg/con', min: 0 },
  ],
};

const PEST = ['Rệp', 'Bọ trĩ', 'Nhện đỏ', 'Ruồi đục quả', 'Sâu xanh', 'Sương mai', 'Phấn trắng', 'Héo rũ / thối gốc', 'Khác'];

/** Cây trồng (lấy từ bộ dưa lưới nhà màng cũ, hướng VietGAP). Phân/thuốc cụ thể chọn ở ô "Vật tư đã dùng" (trừ kho, tính cách ly). */
const CROP: Record<string, FieldDef[]> = {
  spraying: [
    { key: 'target', label: 'Phòng trừ sâu, bệnh gì', type: 'multiselect', options: PEST, required: true },
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
  seed_soaking: [
    { key: 'method', label: 'Cách xử lý', type: 'text', hint: 'Ví dụ: ngâm nước ấm 3 giờ' },
    { key: 'hours', label: 'Thời gian ngâm ủ', type: 'number', unit: 'giờ', min: 0 },
    { key: 'seeds', label: 'Số hạt', type: 'number', min: 0 },
  ],
  tray_sowing: [
    { key: 'trays', label: 'Số khay', type: 'number', min: 0 },
    { key: 'seeds', label: 'Số hạt', type: 'number', min: 0 },
    { key: 'substrate', label: 'Giá thể', type: 'text' },
  ],
  transplanting: [
    { key: 'plants', label: 'Số cây trồng', type: 'number', min: 0, required: true },
    { key: 'spacing', label: 'Khoảng cách trồng', type: 'text', hint: 'Ví dụ: 40 cm × 1 m' },
  ],
  replanting: [{ key: 'plants', label: 'Số cây dặm', type: 'number', min: 0, required: true }],
  trellising: [{ key: 'plants', label: 'Số cây đã treo', type: 'number', min: 0 }],
};

export const STANDARD_FIELDS: Partial<Record<string, Record<string, FieldDef[]>>> = { crop: CROP, livestock: LIVESTOCK, aquatic: AQUATIC };

/** Biểu mẫu chuẩn của đầu việc dùng chung `code` cho loại `kind`; không có thì undefined */
export const standardFieldsFor = (kind: string | undefined, code: string): FieldDef[] | undefined => (kind ? STANDARD_FIELDS[kind]?.[code] : undefined);
