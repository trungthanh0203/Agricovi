/** Gói Khởi đầu (miễn phí) khóa xuất tệp CSV (D219). Cờ này do lib/freePlan.ts đặt; chỉ che nút, bảo vệ dữ liệu thật nằm ở CSDL. */
let locked = false;
export const setExportLocked = (v: boolean) => { locked = v; };
export const isExportLocked = () => locked;
export const EXPORT_LOCKED_MSG = 'Xuất tệp có ở gói trả phí. Vào Cơ sở của tôi → Gói dịch vụ để nâng cấp.';
