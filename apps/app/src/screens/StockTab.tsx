import { CatalogSection } from '../components/CatalogSection';
import { pickSection, SubTabs } from '../components/SubTabs';
import { useOrgs } from '../lib/orgs';
import { canPerm } from '../lib/permissions';
import { stockSections, type StockSection } from '../lib/tabs';
import { StockPanel } from './StockPanel';

/** Tab Kho (D39): Tồn kho (nhập, điều chỉnh, lịch sử) và Vật tư (danh mục vật tư, kho, đơn vị). */
export function StockTab({ section, onSection }: { section?: string; onSection: (s: StockSection) => void }) {
  const { active } = useOrgs();
  if (!active) return null;
  const items = stockSections(active);
  const current = pickSection(items, section);
  return (
    <section>
      <h1>Kho</h1>
      <SubTabs items={items} value={current ?? 'balance'} onChange={onSection} label="Mục kho" />
      {current === 'materials'
        ? <CatalogSection orgId={active.id} canWrite={canPerm(active.perms, 'inventory', 'edit')} />
        : <StockPanel />}
    </section>
  );
}
