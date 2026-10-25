/** CSV mở được bằng Excel (UTF-8 có BOM, ngăn cách bằng dấu chấm phẩy để Excel tiếng Việt tự chia cột). Phần thuần. */
export function toCsv(headers: string[], rows: string[][], sep = ';'): string {
  const q = (s: string) => (/[";\r\n]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s);
  return '﻿' + [headers, ...rows].map((r) => r.map((c) => q(c ?? '')).join(sep)).join('\r\n');
}
