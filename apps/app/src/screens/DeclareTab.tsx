import { LicensesSection } from '../components/LicensesSection';
import { isOwner } from '../lib/roles';
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
import { pickSection, SECTION_ICONS } from '../components/SubTabs';
import { useOrgs } from '../lib/orgs';
import { declareGroups, declareSections, type DeclareSection } from '../lib/tabs';

/**
 * Tab Khai báo: nơi khai báo, cấu hình, định nghĩa mọi thứ liên quan đến sản xuất của cơ sở.
 * Gồm cả nhân sự và tổ chức: Chức vụ, Phòng / Tổ, Nhân sự, Hợp tác xã / Hộ thành viên (trước đây ở tab Tổ chức).
 */
export function DeclareTab({ section, onSection }: { section?: string; onSection: (s: DeclareSection) => void }) {
  const { active } = useOrgs();
  if (!active) return null;
  const items = declareSections(active);
  const groups = declareGroups(active);
  // chỉ có một khung thì mở thẳng khung đó (không cần menu)
  const current = pickSection(items, section) ?? (groups.length === 1 ? groups[0]!.items[0]?.id ?? null : null);

  return (
    <section>
      <h1>Khai báo</h1>
      {current === null && groups.length > 1 && (
        <nav aria-label="Khai báo">
          {groups.map((g) => (
            <div className="gframe" key={g.id} role="group">
              <div className="tiles">
                {g.items.map((x) => (
                  <button key={x.id} className="tile" onClick={() => onSection(x.id)}>
                    <span className="tile-ico" aria-hidden>{SECTION_ICONS[x.id] ?? '•'}</span>
                    <span className="tile-label">{x.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
      )}
      {current !== null && groups.length > 0 && (
        <div className="menubar">
          {groups.length > 1 && <button className="menu-back" onClick={() => onSection('' as DeclareSection)} aria-label="Quay lại menu Khai báo">‹ Menu</button>}
          <strong className="menu-cur">{SECTION_ICONS[current] ?? ''} {items.find((x) => x.id === current)?.label}</strong>
        </div>
      )}
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
      ) : current === 'licenses' ? (
        <LicensesSection orgId={active.id} canEdit={isOwner(active.roles)} />
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
