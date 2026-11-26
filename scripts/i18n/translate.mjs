// node scripts/i18n/translate.mjs dump [từ] [đến]   → in "số|câu" chưa dịch
// node scripts/i18n/translate.mjs fill <tệp "số|bản dịch">   → điền theo số (số cố định trong todo.json)
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const REPO = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/');
const poPath = `${REPO}apps/app/src/locales/en.po`;
const raw = fs.readFileSync(poPath, 'utf8').replace(/\r\n/g, '\n');
const idOf = (b) => { const m = /^msgid (".*(?:\n".*")*)\nmsgstr ""$/m.exec(b); return m ? m[1].split('\n').map((l) => JSON.parse(l)).join('') : ''; };
const store = path.join(os.tmpdir(), 'acovin-i18n-todo.json'); // danh sách đánh số; "dump" lần đầu tạo mới
const [cmd, a, b] = process.argv.slice(2);
if (cmd === 'dump') {
  if (Number(a) === 1 || !fs.existsSync(store)) fs.writeFileSync(store, JSON.stringify(raw.split('\n\n').map(idOf).filter(Boolean)));
  const list = JSON.parse(fs.readFileSync(store, 'utf8'));
  console.log('Tổng', list.length);
  list.slice(Number(a) - 1, Number(b)).forEach((s, i) => console.log(`${Number(a) + i}|${s.replace(/\n/g, '\\n')}`));
} else {
  const list = JSON.parse(fs.readFileSync(store, 'utf8'));
  const tr = new Map();
  for (const l of fs.readFileSync(a, 'utf8').split(/\r?\n/)) {
    const m = /^(\d+)\|(.*)$/.exec(l);
    if (m) tr.set(list[Number(m[1]) - 1], m[2].replace(/\\n/g, '\n'));
  }
  let n = 0;
  const out = raw.split('\n\n').map((block) => {
    const id = idOf(block);
    if (!id || !tr.has(id)) return block;
    n++;
    return block.replace(/^msgstr ""$/m, () => `msgstr ${JSON.stringify(tr.get(id))}`);
  });
  fs.writeFileSync(poPath, out.join('\n\n'));
  console.log('Đã điền', n);
}
