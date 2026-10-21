import { ExpenseSection } from '../components/ExpenseSection';
import { ReportBuilder } from '../components/ReportBuilder';
import { PayrollSection } from '../components/PayrollSection';
import { SalesSection } from '../components/SalesSection';
import { pickSection, SubTabs } from '../components/SubTabs';
import { SummarySection } from '../components/SummarySection';
import { useOrgs } from '../lib/orgs';
import { reportSections, type ReportSection } from '../lib/tabs';

/**
 * Tab Báo cáo (D30): phần Tài chính (Chi phí, Doanh thu, Tổng kết vụ).
 * Mục "Theo nhu cầu" (P6, D48): chọn loại báo cáo, bộ lọc, lưu và xuất CSV.
 */
export function ReportsTab({ section, onSection }: { section?: string; onSection: (s: ReportSection) => void }) {
  const { active } = useOrgs();
  if (!active) return null;
  const items = reportSections(active);
  const current = pickSection(items, section);

  return (
    <section>
      <h1>Báo cáo</h1>
      <SubTabs items={items} value={current} onChange={onSection} onBack={() => onSection('' as ReportSection)} label="Báo cáo" />
      {current === 'sales' ? <SalesSection /> : current === 'summary' ? <SummarySection /> : current === 'payroll' ? <PayrollSection /> : current === 'custom' ? <ReportBuilder /> : current === 'expense' ? <ExpenseSection /> : null}
    </section>
  );
}
