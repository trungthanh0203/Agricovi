import { ExpenseSection } from '../components/ExpenseSection';
import { PayrollSection } from '../components/PayrollSection';
import { SalesSection } from '../components/SalesSection';
import { pickSection, SubTabs } from '../components/SubTabs';
import { SummarySection } from '../components/SummarySection';
import { useOrgs } from '../lib/orgs';
import { reportSections, type ReportSection } from '../lib/tabs';

/**
 * Tab Báo cáo (D30): phần Tài chính (Chi phí, Doanh thu, Tổng kết vụ).
 * Sắp có (kế hoạch P6): báo cáo theo nhu cầu (chọn loại, bộ lọc, lưu, xuất CSV).
 */
export function ReportsTab({ section, onSection }: { section?: string; onSection: (s: ReportSection) => void }) {
  const { active } = useOrgs();
  if (!active) return null;
  const items = reportSections(active);
  const current = pickSection(items, section);

  return (
    <section>
      <h1>Báo cáo</h1>
      <SubTabs items={items} value={current ?? 'expense'} onChange={onSection} label="Mục báo cáo" />
      {current === 'sales' ? <SalesSection /> : current === 'summary' ? <SummarySection /> : current === 'payroll' ? <PayrollSection /> : <ExpenseSection />}
      <div className="card slim">
        <p className="muted">Sắp có: <strong>báo cáo theo nhu cầu</strong> — chọn loại báo cáo, bộ lọc theo vụ, khoảng ngày, người; lưu lại và xuất CSV.</p>
      </div>
    </section>
  );
}
