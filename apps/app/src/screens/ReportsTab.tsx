import { CommerceProfile } from '../components/CommerceProfile';
import { ReportBuilder } from '../components/ReportBuilder';
import { DebtsSection } from '../components/DebtsSection';
import { WebSiteSection } from '../components/WebSiteSection';
import { PayrollBook } from '../components/PayrollBook';
import { pickSection, SubTabs } from '../components/SubTabs';
import { HelpButton } from '../components/HelpButton';
import { OrgStatsSection } from '../components/OrgStatsSection';
import { SummarySection } from '../components/SummarySection';
import { WeeklyReport } from '../components/WeeklyReport';
import { ChecklistSection } from '../components/ChecklistSection';
import { LogbookSection } from '../components/LogbookSection';
import { ExportDossierSection } from '../components/ExportDossierSection';
import { useFeature } from '../lib/features';
import { useOrgs } from '../lib/orgs';
import { reportSections, type ReportSection, type TabId } from '../lib/tabs';

/**
 * Tab Báo cáo (D30): phần Tài chính (Chi phí, Doanh thu, Tổng kết vụ).
 * Mục "Báo cáo tổng hợp" (P6, D48): chọn loại báo cáo, bộ lọc, lưu và xuất CSV.
 */
export function ReportsTab({ section, onSection, onGo }: { section?: string; onSection: (s: ReportSection) => void; onGo?: (tab: TabId, section?: string) => void }) {
  const { active } = useOrgs();
  useFeature(active?.id, 'export'); // làm mới bản lưu để menu hiện/ẩn đúng
  if (!active) return null;
  const items = reportSections(active);
  const current = pickSection(items, section);

  return (
    <section>
      <div className="row"><h1 className="grow">Báo cáo</h1>{current === null && <HelpButton topic="tab-reports" />}</div>
      <SubTabs items={items} value={current} onChange={onSection} onBack={() => onSection('' as ReportSection)} label="Báo cáo" />
      {current === 'stats' ? <OrgStatsSection /> : current === 'website' ? <WebSiteSection /> : current === 'payables' ? <DebtsSection /> : current === 'summary' ? <SummarySection /> : current === 'weekly' ? <WeeklyReport onSection={onSection} /> : current === 'paybook' ? <PayrollBook onGo={onGo} /> : current === 'custom' ? <ReportBuilder /> : current === 'commerce' ? <CommerceProfile org={active} /> : current === 'checklist' ? <ChecklistSection /> : current === 'logbook' ? <LogbookSection /> : current === 'export' ? <ExportDossierSection /> : null}
    </section>
  );
}
