import { useEffect, useState } from 'react';
import { useOnline } from '../lib/hooks';
import { useOrgs } from '../lib/orgs';
import { hasRole } from '../lib/roles';
import { supabase } from '../lib/supabase';

interface Inbox { orders_new: number; orders_todo: number; quotes_new: number; reviews_unreplied: number }

/** Việc đang chờ từ website (đơn đặt hàng, yêu cầu báo giá, đánh giá chưa trả lời). Chỉ hiện khi có việc và khi có mạng; xử lý ở website. */
export function WebInboxCard() {
  const { active } = useOrgs();
  const online = useOnline();
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const allowed = !!active && hasRole(active.roles, 'manager', 'profile_editor');
  const orgId = active?.id;
  useEffect(() => {
    if (!allowed || !online || !supabase || !orgId) { setInbox(null); return; }
    let live = true;
    void supabase.rpc('org_web_inbox', { p_org: orgId }).then(({ data, error }) => { if (live) setInbox(error ? null : (data as Inbox)); });
    return () => { live = false; };
  }, [allowed, online, orgId]);
  if (!inbox || inbox.orders_todo + inbox.quotes_new + inbox.reviews_unreplied === 0) return null;
  const site = ((import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined) ?? '').replace(/\/$/, '');
  const link = (path: string, label: string, n: number, what: string) => n > 0 && (
    <li key={path}><a href={`${site}${path}`} target="_blank" rel="noopener noreferrer"><strong>{n}</strong> {what}</a>{label && <span className="muted"> — {label}</span>}</li>
  );
  return (
    <div className="card">
      <strong className="band">Việc chờ từ website</strong>
      <ul style={{ margin: '6px 0', paddingLeft: '1.1em' }}>
        {link('/don-hang/?vai=ban', inbox.orders_new > 0 ? `${inbox.orders_new} đơn mới chờ báo giá` : '', inbox.orders_todo, 'đơn đặt hàng cần xử lý')}
        {link('/gian-hang/', 'khách để lại số điện thoại/email', inbox.quotes_new, 'yêu cầu báo giá mới')}
        {link('/danh-gia/', '', inbox.reviews_unreplied, 'đánh giá chưa trả lời')}
      </ul>
      <p className="muted" style={{ margin: 0 }}>Bấm để mở website, đăng nhập bằng cùng email với ứng dụng.</p>
    </div>
  );
}
