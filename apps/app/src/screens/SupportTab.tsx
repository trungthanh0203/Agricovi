import { useState } from 'react';
import { ContactCard } from '../components/ContactCard';
import { contactLine, useContactInfo } from '../lib/contactInfo';
import { PerfPanel } from '../components/PerfPanel';
import { useOrgs } from '../lib/orgs';
import { hasRole } from '../lib/roles';
import { shareSystem } from '../lib/shareApp';

/**
 * Hỗ trợ & Chia sẻ (D130): thông tin liên hệ của đơn vị vận hành ở trên (do quản trị nền tảng sửa), nút chia sẻ hệ thống cho người khác ở dưới.
 * Chia sẻ dùng hộp chia sẻ của điện thoại; không có thì chép lời giới thiệu vào bộ nhớ tạm để dán vào Zalo.
 */
export function SupportTab() {
  const info = useContactInfo();
  const { active } = useOrgs();
  const [note, setNote] = useState('');
  return (
    <section>
      <h1>Hỗ trợ &amp; Chia sẻ</h1>
      <p className="muted">Cần giúp đỡ? Liên hệ trực tiếp với chúng tôi qua các cách dưới đây.</p>
      <ContactCard title="Liên hệ hỗ trợ" />

      <h2 className="sect">Chia sẻ hệ thống</h2>
      <div className="card">
        <p>Gửi lời giới thiệu app cho người quen làm nông nghiệp (qua Zalo, tin nhắn…). Lời giới thiệu có sẵn địa chỉ để họ mở và dùng thử.</p>
        <button type="button" className="primary" onClick={() => void shareSystem(contactLine(info)).then(setNote)}>Chia sẻ hệ thống cho người khác</button>
        {note && <p className="muted" role="status">{note}</p>}
      </div>
      {active && hasRole(active.roles, 'manager') && <PerfPanel />}
    </section>
  );
}
