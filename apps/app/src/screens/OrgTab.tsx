import { useOrgs } from '../lib/orgs';
import { CooperativeSection } from '../components/CooperativeSection';
import { PositionsSection } from '../components/PositionsSection';
import { MembersSection } from '../components/MembersSection';
import { pickSection, SubTabs } from '../components/SubTabs';
import { TeamsSection } from '../components/TeamsSection';
import { orgSections, type OrgSection } from '../lib/tabs';

/**
 * Tab Tổ chức: nhân sự (thành viên, tài khoản nhân viên, quyền), vai trò, tổ lao động, hộ thành viên/HTX.
 * Gói dịch vụ nằm ở tab Tài khoản.
 */
export function OrgTab({ section, onSection }: { section?: string; onSection: (s: OrgSection) => void }) {
  const { active } = useOrgs();
  if (!active) return null;
  const items = orgSections(active);
  const current = pickSection(items, section);

  return (
    <section>
      <h1>Tổ chức</h1>
      <SubTabs items={items} value={current} onChange={onSection} onBack={() => onSection('' as OrgSection)} label="Tổ chức" />
      {current === 'members' && <MembersSection org={active} />}
      {current === 'positions' && <PositionsSection org={active} />}
      {current === 'teams' && <TeamsSection org={active} />}
      {current === 'coop' && <CooperativeSection org={active} />}
    </section>
  );
}
