import { useMemo } from 'react';
import { SECTION_ICONS } from './SubTabs';
import { declareSections, orgSections, productionSections, reportSections, type TabId } from '../lib/tabs';
import type { MyOrg } from '../lib/orgs';

/** 6 ô ở Trang chủ: Mùa vụ, Chấm công, Chi phí, Kho, Nhật ký việc, Theo nhu cầu */
const HOME_ORDER = ['cycles', 'attendance', 'expense', 'stock', 'logs', 'custom'];

interface Item { tab: TabId; id: string; label: string }

/** Lối vào nhanh các chức năng dùng hằng ngày ở Trang chủ (ô lưới). Chỉ hiện chức năng người dùng được phép. */
export function FunctionGrid({ org, onGo }: { org: MyOrg; onGo: (tab: TabId, section?: string) => void }) {
  const shown = useMemo<Item[]>(() => {
    const mk = (tab: TabId, list: { id: string; label: string }[]): Item[] => list.map((x) => ({ tab, id: x.id, label: x.label }));
    const all = [...mk('production', productionSections(org)), ...mk('reports', reportSections(org)), ...mk('declare', declareSections(org)), ...mk('org', orgSections(org))];
    return HOME_ORDER.map((id) => all.find((x) => x.id === id)).filter((x): x is Item => x !== undefined);
  }, [org]);

  return (
    <div className="fgrid">
      <div className="tiles">
        {shown.map((x) => (
          <button key={`${x.tab}:${x.id}`} className="tile" onClick={() => onGo(x.tab, x.id)}>
            <span className="tile-ico" aria-hidden>{SECTION_ICONS[x.id] ?? '•'}</span>
            <span className="tile-label">{x.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
