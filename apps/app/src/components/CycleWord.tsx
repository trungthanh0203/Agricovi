import { useConfig, type ProductKind } from '../lib/config';
import { capFirst, cycleNoun } from '../lib/terms';

/** Từ gọi một vụ/lứa theo sản phẩm của cơ sở: "vụ trồng", "lứa nuôi" hoặc "vụ" (có cả hai). Dùng trong nhãn: <CycleWord cap /> */
export function CycleWord({ cap }: { cap?: boolean }) {
  const cfg = useConfig();
  const noun = cycleNoun([...cfg.kindsOn] as ProductKind[]); // theo loại cơ sở đang sử dụng (Cấu hình → Nhóm loại sản phẩm)
  return <>{cap ? capFirst(noun) : noun}</>;
}
