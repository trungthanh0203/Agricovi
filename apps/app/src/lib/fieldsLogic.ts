import type { FieldDef } from './db';

/**
 * Form động (D96): các trường của một loại việc (field_schema) là dữ liệu, không phải mã. Phần thuần: nhãn kiểu trường,
 * giá trị ban đầu, kiểm tra nhập, đổi sang `data` của nhật ký và tóm tắt dạng chữ. Không import gì ngoài kiểu để kiểm thử được.
 * Giá trị đang nhập luôn là chuỗi: ô chọn nhiều nối bằng "|", ô Có/Không là "yes" | "no".
 */

export const FIELD_TYPE_LABEL: Record<FieldDef['type'], string> = {
  number: 'Số', text: 'Chữ', select: 'Chọn một trong danh sách', multiselect: 'Chọn nhiều trong danh sách', date: 'Ngày', bool: 'Có / Không',
};

export const FIELD_TYPES = Object.keys(FIELD_TYPE_LABEL) as FieldDef['type'][];
const MULTI_SEP = '|';

export const splitMulti = (v: string): string[] => v.split(MULTI_SEP).filter(Boolean);
export const joinMulti = (a: string[]): string => a.join(MULTI_SEP);

/** Giá trị ban đầu của form: lấy từ nhật ký đã có (khi sửa) hoặc giá trị mặc định của trường */
export function initialValues(schema: FieldDef[], data?: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of schema) {
    const raw = data?.[f.key];
    if (raw === undefined || raw === null || raw === '') { out[f.key] = data ? '' : f.default ?? ''; continue; }
    out[f.key] = Array.isArray(raw) ? joinMulti(raw.map(String)) : typeof raw === 'boolean' ? (raw ? 'yes' : 'no') : String(raw);
  }
  return out;
}

/** Số có thể nhập bằng dấu phẩy (0,5) */
const num = (s: string) => Number(s.trim().replace(',', '.'));

/** Lỗi nhập đầu tiên (bằng chữ dễ hiểu) hoặc null nếu hợp lệ */
export function validateFields(schema: FieldDef[], values: Record<string, string>): string | null {
  for (const f of schema) {
    const v = (values[f.key] ?? '').trim();
    if (!v) { if (f.required) return `Hãy nhập "${f.label}".`; continue; }
    if (f.type === 'number') {
      const n = num(v);
      if (Number.isNaN(n)) return `"${f.label}" phải là số.`;
      if (f.min !== undefined && n < f.min) return `"${f.label}" không được nhỏ hơn ${f.min}.`;
      if (f.max !== undefined && n > f.max) return `"${f.label}" không được lớn hơn ${f.max}.`;
    }
    if (f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return `"${f.label}" cần chọn ngày.`;
  }
  return null;
}

/** Đổi giá trị form thành `data` của nhật ký (giữ các khóa không thuộc form; trường để trống thì bỏ) */
export function fieldsToData(schema: FieldDef[], values: Record<string, string>, base: Record<string, unknown> = {}): Record<string, unknown> {
  const data: Record<string, unknown> = { ...base };
  for (const f of schema) {
    const v = (values[f.key] ?? '').trim();
    if (!v) { delete data[f.key]; continue; }
    data[f.key] = f.type === 'number' ? num(v) : f.type === 'bool' ? v === 'yes' : f.type === 'multiselect' ? splitMulti(v) : v;
  }
  return data;
}

/** Một giá trị của nhật ký thành chữ để hiện */
export function displayValue(f: FieldDef, v: unknown): string {
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'boolean') return v ? 'Có' : 'Không';
  const s = String(v);
  return f.unit && f.type === 'number' ? `${s} ${f.unit}` : f.type === 'date' ? s.split('-').reverse().join('/') : s;
}

/** "Nhãn: giá trị · Nhãn: giá trị" cho các trường có dữ liệu */
export function summarizeFields(schema: FieldDef[], data: Record<string, unknown>): string {
  return schema
    .filter((f) => data[f.key] !== undefined && data[f.key] !== '' && data[f.key] !== null)
    .map((f) => `${f.label}: ${displayValue(f, data[f.key])}`)
    .join(' · ');
}

/** Lỗi khi chủ cơ sở thiết kế trường (null nếu ổn) */
export function checkSchemaDraft(fields: FieldDef[]): string | null {
  for (const f of fields) {
    if ((f.type === 'select' || f.type === 'multiselect') && (f.options ?? []).length === 0) return `Trường "${f.label}" cần có ít nhất một lựa chọn.`;
    if (f.min !== undefined && f.max !== undefined && f.min > f.max) return `Trường "${f.label}": giá trị nhỏ nhất lớn hơn giá trị lớn nhất.`;
  }
  return null;
}
