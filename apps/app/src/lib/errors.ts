/** Chuyển lỗi kỹ thuật thành câu tiếng Việt kèm việc người dùng có thể làm tiếp (NFR-UX-006). */
export function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : (err as { message?: string })?.message ?? '';

  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
    return 'Không có kết nối mạng. Hãy kiểm tra Internet rồi thử lại.';
  }
  if (/invalid login credentials/i.test(msg)) return 'Email/số điện thoại hoặc mật khẩu chưa đúng. Hãy kiểm tra lại. Nếu quên mật khẩu: chủ Hộ/HTX chọn "Quên mật khẩu"; nhân viên nhờ chủ cơ sở đặt lại.';
  if (/email not confirmed/i.test(msg)) return 'Email chưa được xác nhận. Hãy mở thư xác nhận trong hộp thư của bạn.';
  if (/user already registered|already been registered/i.test(msg)) return 'Email này đã có tài khoản. Hãy chuyển sang "Đăng nhập".';
  if (/password should be at least|weak.?password/i.test(msg)) return 'Mật khẩu quá ngắn hoặc quá yếu. Hãy dùng ít nhất 8 ký tự.';
  if (/invalid email|unable to validate email/i.test(msg)) return 'Email chưa đúng định dạng.';
  if (/rate limit|too many requests|over_email_send_rate_limit/i.test(msg)) return 'Bạn thao tác quá nhanh. Hãy đợi một lát rồi thử lại.';
  if (/INVALID_NAME/.test(msg)) return 'Tên cơ sở cần ít nhất 2 ký tự.';
  if (/QUOTA_EXCEEDED/.test(msg)) return 'Đã dùng hết số vụ của gói. Hãy kết thúc một vụ hoặc nâng gói để tạo thêm.';
  if (/QUOTA_NO_SUBSCRIPTION/.test(msg)) return 'Gói dịch vụ đã hết hạn. Hãy gia hạn để tạo vụ mới. Dữ liệu của bạn vẫn được giữ nguyên.';
  // Các hàm máy chủ trả lỗi dạng "MÃ_LỖI: nội dung tiếng Việt" -> hiển thị phần nội dung
  const coded = /^([A-Z][A-Z_]{3,}): (.+)$/s.exec(msg);
  if (coded && coded[1] !== 'FORBIDDEN') return coded[2]!;
  if (/row-level security|permission denied|FORBIDDEN/i.test(msg)) return 'Bạn chưa có quyền thực hiện thao tác này.';
  if (/NOT_FOUND/.test(msg)) return 'Không tìm thấy dữ liệu. Hãy tải lại rồi thử lại.';
  return 'Có lỗi xảy ra. Hãy thử lại; nếu vẫn lỗi, liên hệ hỗ trợ.';
}
