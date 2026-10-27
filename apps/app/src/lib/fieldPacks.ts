import type { FieldDef } from './db';
import { MELON_PACK } from './packs/melon';
import { PIG_PACK } from './packs/pig';
import type { FieldPack } from './packs/types';

export type { FieldPack };

/**
 * Danh sách gói trường theo loại hình (D96, D98). Nội dung từng loại hình nằm ở `packs/<loại>.ts`; thêm loại hình mới = thêm file đó và một dòng ở đây.
 * Phần thuần: không import gì ngoài kiểu và các gói.
 */
export const FIELD_PACKS: FieldPack[] = [MELON_PACK, PIG_PACK];

export interface PackWorkType { id: string; code: string; name: string; shared: boolean; field_schema: FieldDef[] }
export interface PackStep { id: string; name: string; shared: boolean; fields: FieldDef[]; replaces: number }
export interface PackNew { name: string; description: string; fields: FieldDef[] }

/** Việc nào sẽ được đặt trường theo gói: theo mã loại việc; mã không có trong danh mục thì ghi vào `missing` */
export function planPackApply(pack: FieldPack, workTypes: PackWorkType[]): { steps: PackStep[]; missing: string[]; creates: PackNew[] } {
  const steps: PackStep[] = [];
  const missing: string[] = [];
  for (const [code, fields] of Object.entries(pack.workTypes)) {
    const wt = workTypes.find((w) => w.code === code);
    if (!wt) { missing.push(code); continue; }
    steps.push({ id: wt.id, name: wt.name, shared: wt.shared, fields, replaces: wt.field_schema.filter((f) => !fields.some((x) => x.key === f.key)).length });
  }
  // việc mới: bỏ qua việc cơ sở đã có cùng tên; nếu đã có thì chỉ đặt lại trường cho việc đó
  const creates: PackNew[] = [];
  for (const n of pack.newWorkTypes ?? []) {
    // cùng tên với việc cơ sở đã có thì đặt lại trường cho việc đó; cùng tên với việc chuẩn dùng chung thì ghi bản chỉnh cho việc chuẩn (không tạo trùng)
    const same = workTypes.find((w) => !w.shared && w.name.trim().toLowerCase() === n.name.toLowerCase())
      ?? workTypes.find((w) => w.shared && w.name.trim().toLowerCase() === n.name.toLowerCase());
    if (same) steps.push({ id: same.id, name: same.name, shared: same.shared, fields: n.fields, replaces: same.field_schema.filter((f) => !n.fields.some((x) => x.key === f.key)).length });
    else creates.push(n);
  }
  return { steps, missing, creates };
}
