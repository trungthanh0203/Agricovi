// 1) tệp mà test Node nạp tới không được dùng macro; 2) không đọc nhãn dịch ngay lúc nạp mô-đun
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const REPO = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/');
const ts = createRequire(`${REPO}package.json`)('typescript');
const root = path.resolve(`${REPO}apps/app/src`);
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = walk(root).filter((f) => /\.tsx?$/.test(f));
const read = (f) => fs.readFileSync(f, 'utf8');
// chỉ theo import chạy thật (bỏ import type)
const runtimeImports = (f) => ts.createSourceFile(f, read(f), ts.ScriptTarget.Latest, true).statements
  .filter((s) => (ts.isImportDeclaration(s) && !s.importClause?.isTypeOnly) || (ts.isExportDeclaration(s) && s.moduleSpecifier && !s.isTypeOnly))
  .map((s) => s.moduleSpecifier.text).filter((x) => x.startsWith('.'))
  .map((x) => { const b = path.resolve(path.dirname(f), x); return [b + '.ts', b + '.tsx', path.join(b, 'index.ts'), b].find((c) => /\.tsx?$/.test(c) && fs.existsSync(c)); }).filter(Boolean);
const queue = fs.readdirSync(`${REPO}supabase/tests`).filter((f) => f.endsWith('.mjs'))
  .flatMap((f) => [...read(`${REPO}supabase/tests/` + f).matchAll(/apps\/app\/src\/([\w./-]+?\.tsx?)/g)].map((m) => path.resolve(root, m[1])));
const seen = new Set();
while (queue.length) { const f = queue.pop(); if (!seen.has(f) && fs.existsSync(f)) { seen.add(f); queue.push(...runtimeImports(f)); } }
const bad = [...seen].filter((f) => /from '@lingui\//.test(read(f))).map((f) => path.relative(root, f));
console.log('Tệp test nạp tới:', seen.size, '| dùng macro:', bad);

const lazy = new Set(); // hằng cấp mô-đun có getter dịch
const parsed = files.map((f) => [f, ts.createSourceFile(f, read(f), ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)]);
for (const [, sf] of parsed) for (const s of sf.statements) if (ts.isVariableStatement(s)) for (const d of s.declarationList.declarations) if (/get [\w'"]+\(\) \{ return tx?`/.test(d.getText())) lazy.add(d.name.getText());
const eager = [];
for (const [f, sf] of parsed) {
  const visit = (n) => {
    if (ts.isFunctionLike(n)) return;
    if (ts.isIdentifier(n) && lazy.has(n.text)) {
      const p = n.parent;
      const keysOnly = ts.isCallExpression(p) && p.expression.getText() === 'Object.keys';
      if (!keysOnly && !(ts.isVariableDeclaration(p) && p.name === n) && !ts.isImportSpecifier(p) && !ts.isTypeNode(p) && !ts.isTypeQueryNode(p))
        eager.push(`${path.relative(root, f)}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1} ${n.text}`);
    }
    ts.forEachChild(n, visit);
  };
  sf.statements.forEach(visit);
}
console.log('Hằng dịch muộn:', [...lazy].join(', '), '\nĐọc lúc nạp:', eager);
