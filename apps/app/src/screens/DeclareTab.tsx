import { CooperativeSection } from '../components/CooperativeSection';
import { MembersSection } from '../components/MembersSection';
import { PositionsSection } from '../components/PositionsSection';
import { TeamsSection } from '../components/TeamsSection';
import { AreasSection } from '../components/AreasSection';
import { CatalogSection } from '../components/CatalogSection';
import { canPerm } from '../lib/permissions';
import { CustomersSection } from '../components/CustomersSection';
import { PartnersSection } from '../components/PartnersSection';
import { CropsSection } from '../components/CropsSection';
import { TemplatesSection } from '../components/TemplatesSection';
import { WorkTypesSection } from '../components/WorkTypesSection';
import { pickSection, SubTabs } from '../components/SubTabs';
import { useOrgs } from '../lib/orgs';
import { declareSections, type DeclareSection } from '../lib/tabs';

/**
 * Tab Khai báo: nơi khai báo, cấu hình, định nghĩa mọi thứ liên quan đến sản xuất của cơ sở.
 * Gồm cả nhân sự và tổ chức: Chức vụ, Phòng / Tổ, Nhân sự, Hợp tác xã / Hộ thành viên (trước đây ở tab Tổ chức).
 */
export function DeclareTab({ section, onSection }: { section?: string; onSection: (s: DeclareSection) => void }) {
  const { active } = useOrgs();
  if (!active) return null;
  const items = declareSections(active);
  const current = pickSection(items, section);

  return (
    <section>
      <h1>Khai báo</h1>
      <SubTabs items={items} value={current} onChange={onSection} onBack={() => onSection('' as DeclareSection)} label="Khai báo" />
      {current === 'materials' || current === 'places' ? (
        <CatalogSection orgId={active.id} part={current} canWrite={canPerm(active.perms, 'inventory', 'edit')} />
      ) : current === 'partners' ? (
        <PartnersSection />
      ) : current === 'customers' ? (
        <CustomersSection />
      ) : current === 'crops' ? (
        <CropsSection />
      ) : current === 'worktypes' ? (
        <WorkTypesSection />
      ) : current === 'templates' ? (
        <TemplatesSection />
      ) : current === 'areas' ? (
        <AreasSection />
      ) : current === 'members' ? (
        <MembersSection org={active} />
      ) : current === 'positions' ? (
        <PositionsSection org={active} />
      ) : current === 'teams' ? (
        <TeamsSection org={active} />
      ) : current === 'coop' ? (
        <CooperativeSection org={active} />
      ) : null}
    </section>
  );
}
