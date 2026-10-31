import { SUPPORT_CONTACT } from '../lib/brand';
import { telHref, useContactInfo, zaloHref } from '../lib/contactInfo';

/**
 * Khối thông tin liên hệ (D130): tên công ty, địa chỉ, điện thoại, Zalo, website, email, Facebook, YouTube. Mục trống thì ẩn.
 * Dùng ở trang đăng nhập/đăng ký (luôn hiện, kể cả khi app đã cài), màn chờ duyệt và màn "Hỗ trợ & Chia sẻ".
 */
export function ContactCard({ title }: { title?: string }) {
  const c = useContactInfo();
  const has = c && Object.values(c).some(Boolean);
  const link = (href: string, text: string) => <a href={href} target="_blank" rel="noopener noreferrer">{text}</a>;
  const rows: { icon: string; label: string; value: React.ReactNode }[] = [];
  if (has) {
    if (c.address) rows.push({ icon: '📍', label: 'Địa chỉ', value: c.address });
    if (c.phone) rows.push({ icon: '📞', label: 'Điện thoại', value: <a href={telHref(c.phone)}>{c.phone}</a> });
    if (c.zalo) rows.push({ icon: '💬', label: 'Zalo', value: link(zaloHref(c.zalo), c.zalo) });
    if (c.email) rows.push({ icon: '✉️', label: 'Email', value: <a href={`mailto:${c.email}`}>{c.email}</a> });
    if (c.website) rows.push({ icon: '🌐', label: 'Website', value: link(c.website, c.website.replace(/^https?:\/\//, '')) });
    if (c.facebook) rows.push({ icon: '📘', label: 'Facebook', value: link(c.facebook, c.facebook.replace(/^https?:\/\/(www\.)?/, '')) });
    if (c.youtube) rows.push({ icon: '▶️', label: 'YouTube', value: link(c.youtube, c.youtube.replace(/^https?:\/\/(www\.)?/, '')) });
  }
  return (
    <section className="contact-card" aria-label="Thông tin liên hệ">
      {title && <h2>{title}</h2>}
      {has ? (
        <>
          {c.company && <p className="contact-company">{c.company}</p>}
          <dl>
            {rows.map((r) => (
              <div className="contact-row" key={r.label}>
                <dt><span aria-hidden>{r.icon}</span> {r.label}</dt>
                <dd>{r.value}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : <p className="contact-company">{SUPPORT_CONTACT}</p>}
    </section>
  );
}
