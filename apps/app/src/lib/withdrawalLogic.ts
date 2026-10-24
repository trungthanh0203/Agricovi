/**
 * Thời gian cách ly (D96), phần thuần. Số liệu do máy chủ tính (bảng cycle_withdrawal): mỗi lần dùng vật tư có cách ly cho vụ
 * là một dòng {material, used_on, days, safe_on}. Thu hoạch/bán vào ngày d vi phạm khi có lần dùng trước hoặc đúng ngày d mà
 * ngày hết cách ly vẫn sau d (khớp withdrawal_guard ở CSDL).
 */
export interface WithdrawalItem { material: string; used_on: string; days: number; safe_on: string }

/** Các lần dùng còn trong thời gian cách ly vào ngày d (yyyy-mm-dd) */
export function blockingItems(items: WithdrawalItem[] | null | undefined, d: string): WithdrawalItem[] {
  return (items ?? []).filter((x) => x.used_on <= d && x.safe_on > d);
}

/** Ngày sớm nhất đã hết cách ly hoàn toàn so với ngày d (null nếu không vướng) */
export function safeUntil(blocking: WithdrawalItem[]): string | null {
  return blocking.length ? blocking.reduce((m, x) => (x.safe_on > m ? x.safe_on : m), blocking[0]!.safe_on) : null;
}

const vn = (iso: string) => iso.split('-').reverse().join('/');

/** Câu cảnh báo hiện cho người dùng, hoặc null */
export function withdrawalMessage(items: WithdrawalItem[] | null | undefined, d: string): string | null {
  const b = blockingItems(items, d);
  const until = safeUntil(b);
  if (!until) return null;
  const list = b.map((x) => `${x.material} (dùng ${vn(x.used_on).slice(0, 5)}, cách ly ${x.days} ngày)`).join(', ');
  return `Vụ còn trong thời gian cách ly đến ngày ${vn(until)}: ${list}. Thu hoạch hoặc bán lúc này có thể chưa an toàn.`;
}

/** Lý do hợp lệ (máy chủ yêu cầu ít nhất 3 ký tự) */
export const validReason = (r: string) => r.trim().length >= 3;
