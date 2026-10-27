import { useMemo } from 'react';
import { useCatalog } from '../lib/catalog';
import { effectiveModel, featuresOf } from '../lib/models';
import { nextSteps } from '../lib/nextSteps';
import { useOrgs } from '../lib/orgs';
import { canPerm } from '../lib/permissions';
import { useTable } from '../lib/tables';
import type { TabId } from '../lib/tabs';

/** Khối "Việc cần làm tiếp" của vụ theo mô hình quản lý: tối đa 3 dòng, mỗi dòng có nút đi thẳng tới bước đó (nếu có) */
export function CycleNextSteps({ cycleId, onGo }: { cycleId: string; onGo?: (tab: TabId, section?: string) => void }) {
  const { active } = useOrgs();
  const { cropTypes } = useCatalog();
  const cycle = useTable('cycles').find((c) => c.id === cycleId);
  const expenses = useTable('expenses'), harvests = useTable('harvests'), sales = useTable('sales'), logs = useTable('logs'), stages = useTable('stages');
  const steps = useMemo(() => {
    if (!cycle || !active) return [];
    const model = effectiveModel(cycle.mgmt_model, active.mgmtModel);
    const mine = <T extends { cycle_id: string | null; voided_at?: string | null }>(rows: T[]) => rows.filter((r) => r.cycle_id === cycleId && !r.voided_at).length;
    const st = stages.filter((s) => s.cycle_id === cycleId);
    return nextSteps({
      model, features: featuresOf(model, cycle.mgmt_options ?? []), kind: cropTypes.find((c) => c.id === cycle.crop_type_id)?.kind, status: cycle.status,
      expenses: mine(expenses), harvests: mine(harvests), sales: mine(sales), logs: mine(logs), plantCount: cycle.plant_count ?? null,
      stagesTotal: st.length, stagesDone: st.filter((s) => s.status === 'done').length,
      can: { expense: canPerm(active.perms, 'expenses', 'edit'), harvest: canPerm(active.perms, 'harvest', 'edit'), sales: canPerm(active.perms, 'sales', 'edit'), summary: canPerm(active.perms, 'summary'), logs: true },
    });
  }, [cycle, active, cropTypes, expenses, harvests, sales, logs, stages, cycleId]);

  if (steps.length === 0) return null;
  return (
    <div className="card slim">
      <strong>Việc cần làm tiếp</strong>
      {steps.map((s) => (
        <div className="row" key={s.id}>
          <span className="grow">{s.text}</span>
          {s.go && onGo && <button className="link" onClick={() => onGo(s.go!.tab, s.go!.section)}>Mở</button>}
        </div>
      ))}
    </div>
  );
}
