import { useEffect, useState } from 'react';
import { shareSystem } from '../lib/shareApp';
import { ADMIN_URL } from '../lib/platformAdmin';
import { TAB_LABEL, type TabId } from '../lib/tabs';
import type { MyOrg } from '../lib/orgs';

const ORG_TYPE_LABEL: Record<'household' | 'cooperative', string> = { household: 'Hộ nuôi trồng', cooperative: 'Hợp tác xã' };
const TAB_ICON: Partial<Record<TabId, string>> = { declare: '🧰', config: '⚙️', guide: '📖', profile: '👤', reports: '📊' };
const TAB_HINT: Partial<Record<TabId, string>> = {
  declare: 'Phân khu, sản phẩm, vật tư, nhân sự, tổ',
  config: 'Nhóm loại sản phẩm và các cấu hình mặc định',
  guide: 'Giới thiệu, hướng dẫn hộ, HTX, công ty',
  profile: 'Thông tin cá nhân, mã QR, giấy phép',
};

interface Props {
  open: boolean;
  onClose: () => void;
  name: string;
  email: string;
  orgs: MyOrg[];
  active: MyOrg | null;
  onSwitchOrg: (id: string) => void;
  /** Các tab đặt trong menu (Cấu hình, Hướng dẫn, Tài khoản) */
  tabs: TabId[];
  current: TabId;
  onGo: (t: TabId) => void;
  isPlatformAdmin: boolean;
  /** Số bản ghi chưa gửi lên máy chủ: cảnh báo trước khi đăng xuất */
  waiting: number;
  onSignOut: () => void;
}

/** Menu bên trái (mở bằng nút ☰ ở thanh trên): thông tin người dùng, chuyển cơ sở, các chức năng ít dùng hằng ngày, đăng xuất. */
export function Drawer({ open, onClose, name, email, orgs, active, onSwitchOrg, tabs, current, onGo, isPlatformAdmin, waiting, onSignOut }: Props) {
  const [shareNote, setShareNote] = useState('');
  useEffect(() => {
    if (!open) { setShareNote(''); return; }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const initial = (name || email || '?').trim().charAt(0).toUpperCase();
  const signOut = () => {
    // Bản ghi chưa gửi nằm trên máy này; đăng xuất rồi đăng nhập tài khoản khác sẽ xóa chúng
    if (waiting > 0 && !window.confirm(`Còn ${waiting} bản ghi chưa gửi lên máy chủ. Đăng xuất bây giờ có thể làm mất chúng.\n\nBạn vẫn muốn đăng xuất?`)) return;
    onSignOut();
  };

  return (
    <div className={open ? 'drawer open' : 'drawer'} aria-hidden={!open}>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer-panel" role="dialog" aria-modal="true" aria-label="Menu">
        <div className="drawer-head">
          <span className="avatar" aria-hidden>{initial}</span>
          <strong className="drawer-name">{name || 'Tài khoản'}</strong>
          <span className="drawer-mail">{email}</span>
        </div>

        <div className="drawer-body">
          <div className="drawer-org">
            <span className="muted">{active ? `Cơ sở ${ORG_TYPE_LABEL[active.type]}` : 'Tài khoản'}</span>
            {orgs.length > 1 ? (
              <select value={active?.id ?? ''} onChange={(e) => { onSwitchOrg(e.target.value); onClose(); }} aria-label="Chuyển cơ sở">
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            ) : (
              <strong>{active?.name}</strong>
            )}
          </div>

          <nav aria-label="Chức năng khác">
            {tabs.map((t) => (
              <button key={t} className={t === current ? 'drawer-item on' : 'drawer-item'} onClick={() => { onGo(t); onClose(); }}>
                <span className="drawer-ico" aria-hidden>{TAB_ICON[t] ?? '•'}</span>
                <span className="grow"><strong>{TAB_LABEL[t]}</strong>{TAB_HINT[t] && <small className="muted">{TAB_HINT[t]}</small>}</span>
                <span className="menu-go" aria-hidden>›</span>
              </button>
            ))}
            <button className="drawer-item" onClick={() => void shareSystem().then((m) => { if (m) setShareNote(m); else onClose(); })}>
              <span className="drawer-ico" aria-hidden>📤</span>
              <span className="grow"><strong>Chia sẻ hệ thống</strong><small className="muted">Gửi lời giới thiệu app cho người khác</small></span>
              <span className="menu-go" aria-hidden>›</span>
            </button>
            {shareNote && <p className="muted" role="status" style={{ padding: '0 16px' }}>{shareNote}</p>}
            {isPlatformAdmin && (
              <a className="drawer-item" href={ADMIN_URL}>
                <span className="drawer-ico" aria-hidden>🔒</span>
                <span className="grow"><strong>Quản trị nền tảng</strong></span>
                <span className="menu-go" aria-hidden>›</span>
              </a>
            )}
          </nav>
        </div>

        <div className="drawer-foot">
          <button className="drawer-item danger" onClick={signOut}>
            <span className="drawer-ico" aria-hidden>🚪</span>
            <span className="grow"><strong>Đăng xuất</strong></span>
          </button>
          <p className="muted drawer-ver">Agricovi · {__APP_VERSION__}</p>
        </div>
      </aside>
    </div>
  );
}
