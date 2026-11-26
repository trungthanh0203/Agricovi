import { Fragment, useEffect, useState } from 'react';
import { BRAND } from '@agriconnect/shared';
import { ADMIN_URL } from '../lib/platformAdmin';
import { useIsDesktop } from '../lib/useMediaQuery';
import type { TabId } from '../lib/tabs';
import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { TAB_NAME } from '../lib/labels';
import type { MyOrg } from '../lib/orgs';

const ORG_TYPE_LABEL: Record<'household' | 'cooperative', MessageDescriptor> = { household: msg`Cơ sở Hộ nuôi trồng`, cooperative: msg`Cơ sở Hợp tác xã` };
const TAB_ICON: Partial<Record<TabId, string>> = { home: '🏠', production: '🌱', declare: '🧰', config: '⚙️', guide: '📖', support: '🤝', profile: '👤', reports: '📊' };
const TAB_HINT: Partial<Record<TabId, MessageDescriptor>> = {
  declare: msg`Phân khu, sản phẩm, vật tư, nhân sự, tổ`,
  config: msg`Nhóm loại sản phẩm và các cấu hình mặc định`,
  guide: msg`Giới thiệu, hướng dẫn trồng cây, vật nuôi, HTX`,
  support: msg`Liên hệ hỗ trợ và gửi giới thiệu app cho người khác`,
  profile: msg`Thông tin cá nhân, mã QR, giấy phép`,
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
  /** Bố cục máy tính: các tab chính (ở điện thoại nằm ở thanh dưới) và nút Ghi việc hiện ở đầu menu dọc */
  mainTabs: TabId[];
  onLog: () => void;
  canLog: boolean;
  current: TabId;
  onGo: (t: TabId) => void;
  isPlatformAdmin: boolean;
  /** Số bản ghi chưa gửi lên máy chủ: cảnh báo trước khi đăng xuất */
  waiting: number;
  onSignOut: () => void;
}

/** Menu bên trái (mở bằng nút ☰ ở thanh trên): thông tin người dùng, chuyển cơ sở, các chức năng ít dùng hằng ngày, đăng xuất. */
export function Drawer({ open, onClose, name, email, orgs, active, onSwitchOrg, tabs, mainTabs, onLog, canLog, current, onGo, isPlatformAdmin, waiting, onSignOut }: Props) {
  const { t: tx, i18n } = useLingui();
  const desktop = useIsDesktop();   // máy tính: menu luôn hiện bên trái, không là hộp thoại
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const initial = (name || email || '?').trim().charAt(0).toUpperCase();
  const signOut = () => {
    // Bản ghi chưa gửi nằm trên máy này; đăng xuất rồi đăng nhập tài khoản khác sẽ xóa chúng
    if (waiting > 0 && !window.confirm(`${tx`Số bản ghi chưa gửi lên máy chủ: ${waiting}. Đăng xuất bây giờ có thể làm mất chúng.`}\n\n${tx`Bạn vẫn muốn đăng xuất?`}`)) return;
    onSignOut();
  };

  // Mở website công khai bằng trình duyệt (app đã cài mở ra ngoài trình duyệt vì khác tên miền)
  const websiteLink = (
    <a className="drawer-item" href={BRAND.siteUrl} target="_blank" rel="noopener noreferrer" onClick={onClose}>
      <span className="drawer-ico" aria-hidden>🌐</span>
      <span className="grow"><strong><Trans>Mở website</Trans></strong><small className="muted">{BRAND.domain}: <Trans>nông sản, giao thương, tin và giá</Trans></small></span>
      <span className="menu-go" aria-hidden>↗</span>
    </a>
  );

  return (
    <div className={open ? 'drawer open' : 'drawer'} aria-hidden={!open && !desktop}>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer-panel" role={desktop ? undefined : 'dialog'} aria-modal={desktop ? undefined : true} aria-label="Menu">
        <div className="drawer-head">
          <span className="avatar" aria-hidden>{initial}</span>
          <strong className="drawer-name">{name || tx`Tài khoản`}</strong>
          <span className="drawer-mail">{email}</span>
        </div>

        <div className="drawer-body">
          <div className="drawer-org">
            <span className="muted">{active ? i18n._(ORG_TYPE_LABEL[active.type]) : tx`Tài khoản`}</span>
            {orgs.length > 1 ? (
              <select value={active?.id ?? ''} onChange={(e) => { onSwitchOrg(e.target.value); onClose(); }} aria-label={tx`Chuyển cơ sở`}>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            ) : (
              <strong>{active?.name}</strong>
            )}
          </div>

          <nav className="drawer-main" aria-label={tx`Chức năng chính`}>
            {mainTabs.map((t) => (
              <button key={t} className={t === current ? 'drawer-item on' : 'drawer-item'} aria-current={t === current ? 'page' : undefined} onClick={() => onGo(t)}>
                <span className="drawer-ico" aria-hidden>{TAB_ICON[t] ?? '•'}</span>
                <span className="grow"><strong>{i18n._(TAB_NAME[t])}</strong></span>
              </button>
            ))}
            <button className="drawer-log primary" onClick={onLog} disabled={!canLog} title={canLog ? tx`Ghi việc vừa làm` : tx`Chưa có vụ đang sản xuất để ghi việc`}>＋ <Trans>Ghi việc vừa làm</Trans></button>
          </nav>

          <nav aria-label={tx`Chức năng khác`}>
            {tabs.map((t) => (
              <Fragment key={t}>
                <button className={t === current ? 'drawer-item on' : 'drawer-item'} onClick={() => { onGo(t); onClose(); }}>
                  <span className="drawer-ico" aria-hidden>{TAB_ICON[t] ?? '•'}</span>
                  <span className="grow"><strong>{i18n._(TAB_NAME[t])}</strong>{TAB_HINT[t] && <small className="muted">{i18n._(TAB_HINT[t]!)}</small>}</span>
                  <span className="menu-go" aria-hidden>›</span>
                </button>
                {t === 'support' && websiteLink}
              </Fragment>
            ))}
            {!tabs.includes('support') && websiteLink}
            {isPlatformAdmin && (
              <a className="drawer-item" href={ADMIN_URL}>
                <span className="drawer-ico" aria-hidden>🔒</span>
                <span className="grow"><strong><Trans>Quản trị nền tảng</Trans></strong></span>
                <span className="menu-go" aria-hidden>›</span>
              </a>
            )}
          </nav>
        </div>

        <div className="drawer-foot">
          <button className="drawer-item danger" onClick={signOut}>
            <span className="drawer-ico" aria-hidden>🚪</span>
            <span className="grow"><strong><Trans>Đăng xuất</Trans></strong></span>
          </button>
          <p className="muted drawer-ver">Acovin · {__APP_VERSION__}</p>
        </div>
      </aside>
    </div>
  );
}
