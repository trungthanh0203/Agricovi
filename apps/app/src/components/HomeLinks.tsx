import { useMemo } from 'react';
import { HO_SO_WEB_ICON, IconGlyph, SECTION_ICONS } from './SubTabs';
import { canSeeConfig, declareSections, productionSections, reportSections, type TabId } from '../lib/tabs';
import { hasRole } from '../lib/roles';
import type { MyOrg } from '../lib/orgs';

interface Step { key: string; label: string; icon: string; tab?: TabId; section?: string; href?: string }

/** Trang website công khai (mở ở thẻ mới) */
const SITE_URL = ((import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined) || 'https://agricovi.com').replace(/\/$/, '');

/** Vị trí các bước trên lưới 5 cột (cột chẵn là mũi tên): hàng 1 đi sang phải, xuống một dòng, hàng 3 quay lại bên trái */
const POS: { r: number; c: number }[] = [{ r: 1, c: 1 }, { r: 1, c: 3 }, { r: 1, c: 5 }, { r: 3, c: 5 }, { r: 3, c: 3 }, { r: 3, c: 1 }];
/** Mũi tên đi sau mỗi bước: → → ↓ ← ← */
const ARROW: { r: number; c: number; ch: string }[] = [{ r: 1, c: 2, ch: '→' }, { r: 1, c: 4, ch: '→' }, { r: 2, c: 5, ch: '↓' }, { r: 3, c: 4, ch: '←' }, { r: 3, c: 2, ch: '←' }];

/**
 * Trang chủ, phần dưới hộp chào:
 * - quản lý trở lên: sơ đồ luồng công việc Cấu hình → Khai báo → Sản xuất → Báo cáo → Hồ sơ web → Website, bấm vào bước nào là vào phần đó;
 * - nhân viên: chỉ hai lối tắt Chấm công và Bảng lương (nếu được dùng).
 * Chỉ hiện bước/lối tắt mà người dùng được phép (giống menu).
 */
export function HomeLinks({ org, onGo }: { org: MyOrg; onGo: (tab: TabId, section?: string) => void }) {
  const manager = hasRole(org.roles, 'manager');
  const steps = useMemo<Step[]>(() => {
    const out: Step[] = [];
    if (canSeeConfig(org)) out.push({ key: 'config', label: 'Cấu hình', icon: '⚙️', tab: 'config' });
    if (declareSections(org).length > 0) out.push({ key: 'declare', label: 'Khai báo', icon: '🧰', tab: 'declare' });
    out.push({ key: 'production', label: 'Sản xuất', icon: '🌱', tab: 'production' });
    if (reportSections(org).length > 0) out.push({ key: 'reports', label: 'Báo cáo', icon: '📊', tab: 'reports' });
    if (reportSections(org).some((s) => s.id === 'commerce')) out.push({ key: 'web', label: 'Hồ sơ web', icon: HO_SO_WEB_ICON, tab: 'reports', section: 'commerce' });
    out.push({ key: 'site', label: 'Website', icon: '🌐', href: SITE_URL });
    return out.slice(0, POS.length);
  }, [org]);

  const shortcuts = useMemo(() => {
    const prod = productionSections(org), rep = reportSections(org);
    return [
      prod.some((s) => s.id === 'attendance') ? { id: 'attendance', label: 'Chấm công', tab: 'production' as TabId } : null,
      rep.some((s) => s.id === 'paybook') ? { id: 'paybook', label: 'Bảng lương', tab: 'reports' as TabId } : null,
    ].filter((x): x is { id: string; label: string; tab: TabId } => x !== null);
  }, [org]);

  if (!manager) {
    if (shortcuts.length === 0) return null;
    return (
      <div className="fgrid">
        <div className="tiles">
          {shortcuts.map((x) => (
            <button key={x.id} className="tile" onClick={() => onGo(x.tab, x.id)}>
              <span className="tile-ico" aria-hidden><IconGlyph icon={SECTION_ICONS[x.id] ?? '•'} /></span>
              <span className="tile-label">{x.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flow-wrap">
      <p className="flow-title">Quản lý và kết nối cơ sở theo luồng công việc:</p>
      <nav className="flow" aria-label="Luồng công việc">
        {steps.map((s, i) => {
          const inner = (<><span className="flow-circle" aria-hidden><IconGlyph icon={s.icon} /></span><span className="flow-label">{s.label}</span></>);
          const style = { gridRow: POS[i]!.r, gridColumn: POS[i]!.c };
          return s.href
            ? <a key={s.key} className="flow-step" style={style} href={s.href} target="_blank" rel="noopener noreferrer">{inner}</a>
            : <button key={s.key} className="flow-step" style={style} onClick={() => onGo(s.tab!, s.section)}>{inner}</button>;
        })}
        {steps.slice(0, -1).map((_, i) => (
          <span key={`a${i}`} className="flow-arrow" aria-hidden style={{ gridRow: ARROW[i]!.r, gridColumn: ARROW[i]!.c }}>{ARROW[i]!.ch}</span>
        ))}
      </nav>
    </div>
  );
}
