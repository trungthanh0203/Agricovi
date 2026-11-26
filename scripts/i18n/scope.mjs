// Từ các màn của việc hằng ngày, lần theo import và đếm chữ Việt chưa bọc trong từng tệp.
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const REPO = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/');
const ts = createRequire(`${REPO}package.json`)('typescript');
const root = `${REPO}apps/app/src`;
const vi = /[ăâđêôơưàảãáạằẳẵắặầẩẫấậèẻẽéẹềểễếệìỉĩíịòỏõóọồổỗốộờởỡớợùủũúụừửữứựỳỷỹýỵ]/i;
const seeds = process.argv.slice(2);
const resolve = (from, spec) => {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(from), spec);
  return [base + '.ts', base + '.tsx', base + '/index.ts'].find((f) => fs.existsSync(f)) ?? null;
};
const testSrc = fs.readdirSync(`${REPO}supabase/tests`).filter((f) => f.endsWith('.mjs')).map((f) => fs.readFileSync(`${REPO}supabase/tests/` + f, 'utf8')).join('\n');
const testQueue = [...testSrc.matchAll(/apps\/app\/src\/([\w./-]+?\.tsx?)/g)].map((m) => path.resolve(root, m[1])).filter((f) => fs.existsSync(f));
const imports = (f) => ts.preProcessFile(fs.readFileSync(f, 'utf8'), true, true).importedFiles.map((i) => resolve(f, i.fileName)).filter(Boolean);
const tested = new Set();
while (testQueue.length) { const f = testQueue.pop(); if (tested.has(f)) continue; tested.add(f); testQueue.push(...imports(f)); }
const count = (f) => {
  const sf = ts.createSourceFile(f, fs.readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  let n = 0;
  const walk = (node) => {
    if (ts.isTaggedTemplateExpression(node)) return;
    if (ts.isJsxElement(node) && /^(Trans)$/.test(node.openingElement.tagName.getText())) return;
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node) || ts.isJsxText(node)) && vi.test(node.getText())) { n++; return; }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return n;
};
const seen = new Map();
const queue = seeds.map((s) => [path.resolve(root, s), 0]);
while (queue.length) {
  const [f, d] = queue.shift();
  if (seen.has(f) || !fs.existsSync(f)) continue;
  seen.set(f, d);
  if (d < 3 && f.endsWith('.tsx')) for (const i of imports(f)) queue.push([i, d + 1]);
}
let total = 0;
for (const [f, d] of seen) {
  const n = count(f); if (!n) continue; total += n;
  console.log(String(n).padStart(4), d, path.relative(root, f).replaceAll('\\', '/'), tested.has(f) ? '[test]' : '');
}
console.log('Tổng', total);
