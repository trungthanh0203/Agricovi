import { CommerceProfile } from '../components/CommerceProfile';
import { ExpenseSection } from '../components/ExpenseSection';
import { ReportBuilder } from '../components/ReportBuilder';
import { DebtsSection } from '../components/DebtsSection';
import { WebSiteSection } from '../components/WebSiteSection';
import { PayrollBook } from '../components/PayrollBook';
import { SalesSection } from '../components/SalesSection';
import { pickSection, SubTabs } from '../components/SubTabs';
import { SummarySection } from '../components/SummarySection';
import { WeeklyReport } from '../components/WeeklyReport';
import { useOrgs } from '../lib/orgs';
import { reportSections, type ReportSection, type TabId } from '../lib/tabs';

/**
 * Tab Báo cáo (D30): phần Tài chính (Chi phí, Doanh thu, Tổng kết vụ).
 * Mục "Theo nhu cầu" (P6, D48): chọn loại báo cáo, bộ lọc, lưu và xuất CSV.
 */
export function ReportsTab({ section, onSection, onGo }: { section?: string; onSection: (s: ReportSection) => void; onGo?: (tab: TabId, section?: string) => void }) {
  const { active } = useOrgs();
  if (!active) return null;
  const items = reportSections(active);
  const current = pickSection(items, section);

  return (
    <section>
      <h1>Báo cáo</h1>
      <SubTabs items={items} value={current} onChange={onSection} onBack={() => onSection('' as ReportSection)} label="Báo cáo" />
      {current === 'website' ? <WebSiteSection /> : current === 'payables' ? <DebtsSection /> : current === 'sales' ? <SalesSection /> : current === 'summary' ? <SummarySection /> : current === 'weekly' ? <WeeklyReport onSection={onSection} /> : current === 'paybook' ? <PayrollBook onGo={onGo} /> : current === 'custom' ? <ReportBuilder /> : current === 'commerce' ? <CommerceProfile org={active} /> : current === 'expense' ? <ExpenseSection /> : null}
    </section>
  );
}
