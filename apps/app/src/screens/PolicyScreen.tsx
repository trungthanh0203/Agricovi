import { ContactCard } from '../components/ContactCard';

/**
 * Chính sách bảo mật và điều khoản sử dụng (D220). Trang công khai ở địa chỉ /chinh-sach, không cần đăng nhập;
 * dùng cho hồ sơ nộp App Store / Google Play và cho hộp đồng ý khi đăng ký. Mục #xoa-tai-khoan là địa chỉ hướng dẫn xóa tài khoản.
 * Bản này do người vận hành soạn theo cách hệ thống đang hoạt động; nên nhờ luật sư rà soát trước khi quảng bá rộng.
 */
export function PolicyScreen() {
  return (
    <main className="content" style={{ maxWidth: 760, margin: '0 auto', padding: 16, lineHeight: 1.6 }}>
      <p><a href="/">← Về ứng dụng</a></p>
      <h1>Chính sách bảo mật và điều khoản sử dụng</h1>
      <p className="muted">AgriConnect (Agricovi) · cập nhật 21/11/2026</p>

      <h2>1. Chúng tôi là ai</h2>
      <p>AgriConnect là ứng dụng giúp hộ nông dân và hợp tác xã ghi chép sản xuất, quản lý kho, chi phí, thu hoạch, bán hàng và nhân công. Thông tin đơn vị vận hành và cách liên hệ ở cuối trang.</p>

      <h2>2. Chúng tôi thu thập gì</h2>
      <ul>
        <li><strong>Tài khoản:</strong> họ tên, số điện thoại (hoặc email), mật khẩu (lưu dạng mã hóa, chúng tôi không đọc được).</li>
        <li><strong>Dữ liệu bạn nhập:</strong> thông tin cơ sở, phân khu, vụ sản xuất, nhật ký công việc, vật tư và kho, chi phí, thu hoạch, bán hàng, nhân sự và chấm công.</li>
        <li><strong>Ảnh:</strong> ảnh bạn đính kèm (nhật ký, hóa đơn, chấm công). Khi bạn dùng tính năng đọc hóa đơn bằng AI, ảnh được gửi tới dịch vụ đọc ảnh để trích chữ và <strong>không được lưu lại</strong> sau khi đọc.</li>
        <li><strong>Chấm công bằng khuôn mặt (tùy chọn, do chủ cơ sở bật):</strong> ảnh và đặc trưng khuôn mặt của người lao động đã đồng ý, chỉ để đối chiếu khi chấm công.</li>
        <li><strong>Vị trí:</strong> chỉ khi bạn chủ động dùng chức năng cần vị trí (ví dụ vẽ ranh khu trên bản đồ, chấm công theo vị trí).</li>
        <li><strong>Thông tin kỹ thuật:</strong> lần đăng nhập, thời điểm sử dụng và lỗi phát sinh, để vận hành và cải thiện ứng dụng.</li>
      </ul>

      <h2>3. Dùng để làm gì</h2>
      <p>Chỉ để cung cấp và vận hành ứng dụng cho bạn: lưu và hiển thị dữ liệu, tính toán tổng kết, gửi thông báo nhắc việc (nếu bạn bật), hỗ trợ khi bạn cần. Chúng tôi <strong>không bán</strong> dữ liệu của bạn.</p>

      <h2>4. Ai nhìn thấy dữ liệu</h2>
      <ul>
        <li>Dữ liệu sản xuất của cơ sở là <strong>riêng tư</strong>: chỉ chủ cơ sở và những người chủ cho phép (quản lý, nhân viên theo quyền) xem được.</li>
        <li>Hợp tác xã chỉ xem dữ liệu của hộ thành viên theo phạm vi hộ đã đồng ý.</li>
        <li>Chỉ thông tin bạn <strong>chủ động gửi duyệt và công khai</strong> (hồ sơ cơ sở, sản phẩm) mới hiện trên website.</li>
        <li>Nhà cung cấp hạ tầng lưu trữ và vận hành (cơ sở dữ liệu, máy chủ, dịch vụ đọc ảnh) xử lý dữ liệu thay mặt chúng tôi, theo hợp đồng và chỉ cho mục đích vận hành.</li>
        <li>Chúng tôi chỉ cung cấp dữ liệu cho cơ quan nhà nước khi pháp luật yêu cầu.</li>
      </ul>

      <h2>5. Lưu trữ và bảo mật</h2>
      <p>Dữ liệu được truyền qua kết nối mã hóa và lưu trên hạ tầng đám mây có phân quyền theo cơ sở. Chúng tôi giữ dữ liệu trong thời gian bạn dùng tài khoản; khi bạn xóa tài khoản, dữ liệu bị xóa theo mục 7.</p>

      <h2>6. Quyền của bạn</h2>
      <p>Bạn có quyền xem, sửa, xuất dữ liệu của mình (ngay trong ứng dụng), rút lại đồng ý và yêu cầu xóa. Người lao động có quyền hỏi chủ cơ sở về dữ liệu chấm công, khuôn mặt của mình.</p>

      <h2 id="xoa-tai-khoan">7. Xóa tài khoản và dữ liệu</h2>
      <p><strong>Trong ứng dụng:</strong> vào tab <em>Tài khoản</em> → <em>Xóa tài khoản</em> → gõ chữ XÓA để xác nhận. Có thời gian chờ để đổi ý (mặc định 14 ngày, hủy được bất cứ lúc nào); sau đó tài khoản bị xóa.</p>
      <p><strong>Không đăng nhập được ứng dụng:</strong> liên hệ chúng tôi theo thông tin cuối trang, nêu số điện thoại đăng ký và họ tên; chúng tôi xác minh rồi xử lý trong tối đa 30 ngày.</p>
      <p><strong>Xóa những gì:</strong> tài khoản đăng nhập; cơ sở mà bạn là chủ duy nhất cùng toàn bộ dữ liệu (vụ, nhật ký, kho, chi phí, nhân sự, chấm công, ảnh, tài khoản nhân viên do cơ sở tạo). Với cơ sở khác mà bạn chỉ là thành viên, dữ liệu của cơ sở đó giữ nguyên và chỉ gỡ liên kết với bạn. Hồ sơ công khai trên website của cơ sở bị gỡ. Một số bản ghi bắt buộc lưu theo pháp luật (nếu có) được giữ đến hết thời hạn luật định.</p>

      <h2>8. Trẻ em</h2>
      <p>Ứng dụng dành cho người lớn làm nông nghiệp; không hướng tới trẻ dưới 16 tuổi.</p>

      <h2>9. Điều khoản sử dụng</h2>
      <ul>
        <li>Bạn chịu trách nhiệm về tính đúng của dữ liệu mình nhập và giữ kín mật khẩu.</li>
        <li>Gói miễn phí (Khởi đầu) có giới hạn về số vụ, khu, ô, nhân viên và tính năng; chúng tôi có thể điều chỉnh giới hạn và sẽ báo trước trong ứng dụng.</li>
        <li>Số liệu, gợi ý kỹ thuật và quy trình mẫu trong ứng dụng chỉ để tham khảo; việc dùng thuốc, phân bón, thú y do bạn và cán bộ chuyên môn địa phương quyết định.</li>
        <li>Không dùng ứng dụng vào mục đích trái pháp luật hoặc gây hại cho người dùng khác. Tài khoản vi phạm có thể bị tạm khóa.</li>
        <li>Chúng tôi cố gắng vận hành ổn định nhưng không bảo đảm không gián đoạn; hãy xuất dữ liệu quan trọng định kỳ.</li>
      </ul>

      <h2>10. Thay đổi chính sách</h2>
      <p>Khi có thay đổi quan trọng, chúng tôi báo trong ứng dụng. Việc tiếp tục sử dụng sau khi báo nghĩa là bạn chấp nhận bản mới.</p>

      <h2>11. Liên hệ</h2>
      <ContactCard />
    </main>
  );
}
