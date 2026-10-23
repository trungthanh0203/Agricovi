import { useMemo, useState } from 'react';
import { SECTION_ICONS } from './SubTabs';
import { declareSections, orgSections, productionSections, reportSections, TAB_LABEL, type TabId } from '../lib/tabs';
import type { MyOrg } from '../lib/orgs';

interface Item { tab: TabId; id: string; label: string; group: string }

/** Thứ tự các ô ở Trang chủ: Mùa vụ, Chấm công, Chi phí, Kho, Thu hoạch, Doanh thu, Tổng kết vụ, Nhật ký việc */
const HOME_ORDER = ['cycles', 'attendance', 'expense', 'stock', 'harvest', 'sales', 'summary', 'logs'];

/** Bỏ dấu và chữ hoa để tìm "kho" ra cả "Kho và đơn vị" */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase();

/**
 * Lối vào nhanh các chức năng ở Trang chủ: ô lưới các chức năng dùng hằng ngày,
 * và ô tìm chức năng (tìm trong mọi nhóm: Sản xuất, Báo cáo, Khai báo, Tổ chức). Chỉ hiện chức năng người dùng được phép.
 */
export function FunctionGrid({ org, onGo }: { org: MyOrg; onGo: (tab: TabId, section?: string) => void }) {
  const [q, setQ] = useState('');
  const all = useMemo<Item[]>(() => {
    const mk = (tab: TabId, list: { id: string; label: string }[]): Item[] => list.map((x) => ({ tab, id: x.id, label: x.label, group: TAB_LABEL[tab] }));
    return [
      ...mk('production', productionSections(org)),
      ...mk('reports', reportSections(org)),
      ...mk('declare', declareSections(org)),
      ...mk('org', orgSections(org)),
    ];
  }, [org]);

  const query = fold(q.trim());
  // Mặc định chỉ hiện các chức năng dùng hằng ngày theo thứ tự cố định; gõ vào ô tìm thì tìm trong mọi chức năng
  const shown = query
    ? all.filter((x) => fold(x.label).includes(query) || fold(x.group).includes(query))
    : HOME_ORDER.map((id) => all.find((x) => x.id === id)).filter((x): x is Item => x !== undefined);

  return (
    <div className="fgrid">
      <label className="searchbox">
        <span aria-hidden>🔎</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm chức năng (ví dụ: kho, chi phí)" aria-label="Tìm chức năng" />
      </label>
      {shown.length === 0 ? (
        <p className="muted">Không có chức năng nào khớp "{q}".</p>
      ) : (
        <div className="tiles">
          {shown.map((x) => (
            <button key={`${x.tab}:${x.id}`} className="tile" onClick={() => onGo(x.tab, x.id)}>
              <span className="tile-ico" aria-hidden>{SECTION_ICONS[x.id] ?? '•'}</span>
              <span className="tile-label">{x.label}</span>
              {query && <small className="tile-group">{x.group}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
