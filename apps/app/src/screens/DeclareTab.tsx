import { AreasSection } from '../components/AreasSection';
import { CatalogSection } from '../components/CatalogSection';
import { pickSection, SubTabs } from '../components/SubTabs';
import { useOrgs } from '../lib/orgs';
import { canPerm } from '../lib/permissions';
import { declareSections, type DeclareSection } from '../lib/tabs';

/**
 * Tab Khai báo: nơi khai báo, cấu hình, định nghĩa mọi thứ liên quan đến sản xuất của cơ sở.
 * Hiện có: Khu trồng, Vật tư và kho. Sắp có (kế hoạch P1): Cây trồng và giống, Quy trình mẫu, Danh mục công việc.
 */
export function DeclareTab({ section, onSection }: { section?: string; onSection: (s: DeclareSection) => void }) {
  const { active } = useOrgs();
  if (!active) return null;
  const items = declareSections(active);
  const current = pickSection(items, section);

  return (
    <section>
      <h1>Khai báo</h1>
      <SubTabs items={items} value={current ?? 'areas'} onChange={onSection} label="Mục khai báo" />
      {current === 'materials' ? (
        <CatalogSection orgId={active.id} canWrite={canPerm(active.perms, 'inventory', 'edit')} />
      ) : (
        <AreasSection />
      )}
      <div className="card slim">
        <p className="muted">Sắp có ở đây: <strong>Cây trồng và giống</strong>, <strong>Quy trình mùa vụ mẫu</strong> (các giai đoạn, việc, thời gian cho từng cây) và <strong>Danh mục công việc</strong>.</p>
      </div>
    </section>
  );
}
