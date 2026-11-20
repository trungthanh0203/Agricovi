import { useFreePlan } from '../lib/freePlan';

/** Nhắc gói Khởi đầu (miễn phí): đã hết hạn thì chỉ xem; còn dưới 30 ngày thì báo số ngày còn lại (D219). */
export function FreePlanBanner() {
  const { state } = useFreePlan();
  if (!state?.free) return null;
  if (state.expired) {
    return (
      <div className="notice" role="status">
        <div>Gói Khởi đầu (miễn phí) đã hết hạn: bạn xem được dữ liệu nhưng chưa ghi thêm được. Vào Cơ sở của tôi → Gói dịch vụ để nâng cấp.</div>
      </div>
    );
  }
  if (typeof state.days_left === 'number' && state.days_left <= 30) {
    return (
      <div className="notice" role="status">
        <div>Gói Khởi đầu (miễn phí) còn {state.days_left} ngày. Muốn làm thêm sau đó: vào Cơ sở của tôi → Gói dịch vụ để nâng cấp.</div>
      </div>
    );
  }
  return null;
}
