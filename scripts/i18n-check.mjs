// Kiểm tra bản tiếng Anh của app: thiếu câu, hoặc mất tham số {tên} / thẻ <0>. Chạy sau `npm run i18n:extract -w @agriconnect/app`.
// Thêm --pairs để in từng cặp câu cho người soát.
import fs from 'node:fs';

const po = fs.readFileSync(new URL('../apps/app/src/locales/en.po', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const text = (block, key) => {
  const m = new RegExp(`^${key} (".*"(?:\\n".*")*)`, 'm').exec(block);
  return m ? m[1].split('\n').map((l) => JSON.parse(l)).join('') : '';
};
/** Tên tham số và thẻ trong câu (bỏ phần chữ bên trong nhánh số ít / số nhiều) */
const params = (s) => [...new Set([...s.matchAll(/\{(\w+)(?=[,}])|<\/?(\d+)\/?>/g)].map((m) => m[1] ?? `<${m[2]}>`))].sort().join(' ');

const bad = [];
let total = 0;
for (const block of po.split('\n\n')) {
  const id = text(block, 'msgid');
  if (!id || block.includes('#~')) continue;
  const str = text(block, 'msgstr');
  total++;
  if (!str) bad.push(`Thiếu bản dịch: ${id}`);
  else if (params(id) !== params(str)) bad.push(`Lệch tham số: ${id}\n   → ${str}`);
  if (process.argv.includes('--pairs')) console.log(`${id}\n   → ${str}`);
}
console.log(bad.length ? bad.join('\n') : `Bản tiếng Anh đủ ${total} câu, tham số khớp.`);
process.exitCode = bad.length ? 1 : 0;
