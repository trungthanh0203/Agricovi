import { useCatalog } from '../lib/catalog';
import { useOrgs } from '../lib/orgs';
import { capFirst, cycleNoun } from '../lib/terms';
import { useTable } from '../lib/tables';

/** Từ gọi một vụ/lứa theo sản phẩm của cơ sở: "vụ trồng", "lứa nuôi" hoặc "vụ" (có cả hai). Dùng trong nhãn: <CycleWord cap /> */
export function CycleWord({ cap }: { cap?: boolean }) {
  const { active } = useOrgs();
  const cycles = useTable('cycles');
  const { cropTypes } = useCatalog();
  const kinds = cycles.filter((c) => c.owner_org_id === active?.id).map((c) => cropTypes.find((t) => t.id === c.crop_type_id)?.kind);
  const noun = cycleNoun(kinds);
  return <>{cap ? capFirst(noun) : noun}</>;
}
