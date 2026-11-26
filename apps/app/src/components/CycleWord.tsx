import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { useConfig, type ProductKind } from '../lib/config';
import { capFirst, cycleNoun } from '../lib/terms';

// terms.ts trả từ tiếng Việt; dịch theo đúng ba giá trị đó
const NOUN: Record<string, MessageDescriptor> = { 'vụ trồng': msg`vụ trồng`, 'vụ nuôi': msg`vụ nuôi`, 'vụ nuôi trồng': msg`vụ nuôi trồng` };

/** Từ gọi một vụ/lứa theo sản phẩm của cơ sở: "vụ trồng", "lứa nuôi" hoặc "vụ" (có cả hai). Dùng trong nhãn: <CycleWord cap /> */
export function CycleWord({ cap }: { cap?: boolean }) {
  const cfg = useConfig();
  const { i18n } = useLingui();
  const noun = cycleNoun([...cfg.kindsOn] as ProductKind[]); // theo loại cơ sở đang sử dụng (Cấu hình → Nhóm loại sản phẩm)
  const word = NOUN[noun] ? i18n._(NOUN[noun]) : noun;
  return <>{cap ? capFirst(word) : word}</>;
}
