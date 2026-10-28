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
import { pickSection } from '../components/SubTabs';
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
  const group = current ? groups.find((g) => g.items.some((i) => i.id === current)) ?? null : null;

  return (
    <section>
      <h1>Khai báo</h1>
      {current === null && groups.length > 1 && (
        <nav className="gtiles" aria-label="Khai báo">
          {groups.map((g) => (
            <button key={g.id} className="gtile" onClick={() => onSection(g.items[0]!.id)}>
              <span className="gtile-ico" aria-hidden>{g.icon}</span>
              <span className="gtile-title">{g.label}</span>
              <span className="gtile-sub">{g.items.map((i) => i.label).join(' · ')}</span>
            </button>
          ))}
        </nav>
      )}
      {group && (
        <>
          <div className="menubar">
            {groups.length > 1 && <button className="menu-back" onClick={() => onSection('' as DeclareSection)} aria-label="Quay lại menu Khai báo">‹ Menu</button>}
            <strong className="menu-cur">{group.icon} {group.label}</strong>
          </div>
          {group.items.length > 1 && (
            <div className="chips" role="tablist" aria-label={group.label}>
              {group.items.map((i) => (
                <button key={i.id} role="tab" aria-selected={current === i.id} className={current === i.id ? 'chip active' : 'chip'} onClick={() => onSection(i.id)}>{i.label}</button>
              ))}
            </div>
          )}
        </>
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
