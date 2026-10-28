import type { FieldDef } from './db';

/**
 * Ngưỡng CẢNH BÁO mềm của ô số (khác min/max là giới hạn cứng không cho lưu): `alert_low` và `alert_high`.
 * Dùng cho phiếu đo môi trường nước (pH, oxy, độ mặn, nhiệt độ): ngoài ngưỡng thì báo màu cảnh báo nhưng vẫn ghi được.
 */
export interface FieldAlert { key: string; label: string; text: string }

const fmt = (n: number) => String(n).replace('.', ',');

/** Cảnh báo của MỘT ô: chuỗi nhập (hoặc số đã lưu); null nếu trong ngưỡng, trống hoặc không có ngưỡng */
export function alertOf(def: FieldDef, raw: unknown): string | null {
  if (def.type !== 'number' || (def.alert_low === undefined && def.alert_high === undefined)) return null;
  if (raw === undefined || raw === null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim().replace(',', '.'));
  if (Number.isNaN(n)) return null;
  const unit = def.unit ? ` ${def.unit}` : '';
  if (def.alert_low !== undefined && n < def.alert_low) return `thấp hơn ngưỡng ${fmt(def.alert_low)}${unit}`;
  if (def.alert_high !== undefined && n > def.alert_high) return `cao hơn ngưỡng ${fmt(def.alert_high)}${unit}`;
  return null;
}

/** Mọi cảnh báo của một bản ghi nhật ký theo biểu mẫu */
export function fieldAlerts(schema: FieldDef[], data: Record<string, unknown>): FieldAlert[] {
  const out: FieldAlert[] = [];
  for (const f of schema) {
    const a = alertOf(f, data[f.key]);
    if (a) out.push({ key: f.key, label: f.label, text: `${f.label} ${fmt(Number(data[f.key]))}${f.unit ? ` ${f.unit}` : ''} ${a}` });
  }
  return out;
}

/** Giá trị điền sẵn từ lần ghi trước cho các ô đánh dấu `prefill` (chuỗi, đúng kiểu form động) */
export function prefillValues(schema: FieldDef[], lastData: Record<string, unknown> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!lastData) return out;
  for (const f of schema) {
    const v = lastData[f.key];
    if (f.prefill && v !== undefined && v !== null && v !== '' && typeof v !== 'object') out[f.key] = String(v).replace('.', ',');
  }
  return out;
}
