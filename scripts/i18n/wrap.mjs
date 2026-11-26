// Bọc chữ tiếng Việt qua macro Lingui. node scripts/i18n/wrap.mjs <tệp trong src>... [--dry]
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const REPO = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/');
const ts = createRequire(`${REPO}package.json`)('typescript');
const root = `${REPO}apps/app/src`;
const VI = /[ăâđêôơưàảãáạằẳẵắặầẩẫấậèẻẽéẹềểễếệìỉĩíịòỏõóọồổỗốộờởỡớợùủũúụừửữứựỳỷỹýỵ]/i;
const dry = process.argv.includes('--dry');
const files = process.argv.slice(2).filter((a) => a !== '--dry');

const walkDir = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walkDir(d + '/' + e.name) : [d + '/' + e.name]));
const parse = (f, s) => ts.createSourceFile(f, s, ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
// Chữ đang được dùng để so sánh ở bất kỳ đâu trong app: không bọc, báo để sửa tay
const compared = new Set();
const isCompare = (n) => {
  const p = n.parent;
  if (ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken].includes(p.operatorToken.kind)) return true;
  if (ts.isCaseClause(p) && p.expression === n) return true;
  if (ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression) && /^(includes|startsWith|indexOf|has|get)$/.test(p.expression.name.text)) return true;
  return false;
};
for (const f of walkDir(root).filter((f) => /\.tsx?$/.test(f))) {
  const walk = (n) => { if (ts.isStringLiteral(n) && VI.test(n.text) && isCompare(n)) compared.add(n.text); ts.forEachChild(n, walk); };
  walk(parse(f, fs.readFileSync(f, 'utf8')));
}

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${').replace(/\n/g, '\\n');
const decode = (s) => s.replace(/&nbsp;/g, '\u00a0').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
/** Cách React gọn khoảng trắng của chữ trong JSX */
const cleanJsx = (raw) => {
  const lines = raw.split(/\r?\n/);
  const out = [];
  lines.forEach((l, i) => {
    let s = l.replace(/\t/g, ' ');
    if (i > 0) s = s.replace(/^ +/, '');
    if (i < lines.length - 1) s = s.replace(/ +$/, '');
    if (s) out.push(s);
  });
  return decode(out.join(' '));
};

for (const rel of files) {
  const file = path.join(root, rel);
  const raw = fs.readFileSync(file, 'utf8');
  const crlf = raw.includes('\r\n');
  const src = raw.replace(/\r\n/g, '\n');
  const sf = parse(file, src);
  let useT = false, useTrans = false;
  const notes = [];
  const line = (n) => sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
  // có biến cục bộ tên t thì gọi macro bằng tên khác
  let hasT = false;
  const findT = (n) => { if ((ts.isParameter(n) || ts.isVariableDeclaration(n) || ts.isBindingElement(n)) && ts.isIdentifier(n.name) && n.name.text === 't') hasT = true; ts.forEachChild(n, findT); };
  findT(sf);
  const T = hasT ? 'tx' : 't';

  const inFunction = (n) => { for (let p = n.parent; p; p = p.parent) if (ts.isFunctionLike(p)) return true; return false; };
  const containsVi = (n) => VI.test(n.getText());

  const slice = (n, edits) => {
    let s = src.slice(n.getStart(), n.end), base = n.getStart();
    for (const e of edits.sort((a, b) => b.start - a.start)) s = s.slice(0, e.start - base) + e.text + s.slice(e.end - base);
    return s;
  };
  /** Danh sách sửa bên trong node */
  const editsIn = (n) => {
    const edits = [];
    ts.forEachChild(n, (c) => { const r = visit(c); if (r) edits.push(...r); });
    return edits;
  };
  const replace = (n, text) => [{ start: n.getStart(), end: n.end, text }];

  const simpleExpr = (e) => !e || ts.isIdentifier(e) || (ts.isPropertyAccessExpression(e) && simpleExpr(e.expression)) || (ts.isStringLiteral(e) && !VI.test(e.text));
  const INLINE = /^(strong|em|b|i|a|br|span|code)$/;
  const transSafe = (c) => {
    if (ts.isJsxText(c)) return true;
    if (ts.isJsxExpression(c)) return simpleExpr(c.expression);
    if (ts.isJsxSelfClosingElement(c)) return c.tagName.getText() === 'br';
    if (ts.isJsxElement(c)) return INLINE.test(c.openingElement.tagName.getText()) && !VI.test(c.openingElement.getText()) && c.children.every(transSafe);
    return false;
  };

  function jsxChildren(node) {
    const kids = node.children;
    const hasText = kids.some((c) => ts.isJsxText(c) && VI.test(c.text));
    if (!hasText) return null;
    const meaningful = kids.filter((c) => !(ts.isJsxText(c) && !cleanJsx(c.text)));
    if (meaningful.length > 1 && kids.every(transSafe)) {
      useTrans = true;
      const start = kids[0].pos, end = kids[kids.length - 1].end;
      const inner = src.slice(start, end);
      const lead = /^\s*/.exec(inner)[0], tail = /\s*$/.exec(inner)[0];
      return [{ start, end, text: `${lead}<Trans>${inner.trim()}</Trans>${tail}` }];
    }
    const edits = [];
    for (const c of kids) {
      if (ts.isJsxText(c) && VI.test(c.text)) {
        const text = cleanJsx(src.slice(c.pos, c.end));
        const body = text.trim();
        const a = text.startsWith(' ') ? "{' '}" : '', b = text.endsWith(' ') ? "{' '}" : '';
        const whole = src.slice(c.pos, c.end);
        const lead = /^\s*\n\s*/.exec(whole)?.[0] ?? '', tail = /\n\s*$/.exec(whole)?.[0] ?? '';
        useT = true;
        if (meaningful.length > 1) notes.push(`${line(c)} câu bị tách: ${body}`);
        edits.push({ start: c.pos, end: c.end, text: `${lead}${a}{${T}\`${esc(body)}\`}${b}${tail}` });
      } else {
        const r = visit(c); if (r) edits.push(...r);
      }
    }
    return edits;
  }

  function visit(n) {
    if (!containsVi(n)) return null;
    if (ts.isTypeNode(n) || ts.isImportDeclaration(n) || ts.isTaggedTemplateExpression(n)) return null;
    if (ts.isJsxElement(n) && n.openingElement.tagName.getText() === 'Trans') return null;
    if (ts.isJsxElement(n) || ts.isJsxFragment(n)) {
      const kids = jsxChildren(n);
      if (kids) return [...(ts.isJsxElement(n) ? visit(n.openingElement) ?? [] : []), ...kids];
      return editsIn(n);
    }
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n)) {
      const p = n.parent;
      if ((ts.isPropertyAssignment(p) && p.name === n) || (ts.isElementAccessExpression(p) && p.argumentExpression === n)) return null;
      if (!ts.isTemplateExpression(n) && (isCompare(n) || compared.has(n.text))) { notes.push(`${line(n)} KHÔNG bọc (dùng để so sánh): ${n.text}`); return null; }
      let inner;
      if (ts.isTemplateExpression(n)) {
        const own = [n.head.text, ...n.templateSpans.map((s) => s.literal.text)].some((x) => VI.test(x));
        const sub = [];
        for (const s of n.templateSpans) { const r = visit(s.expression); if (r) sub.push(...r); }
        if (!own) return sub;
        inner = slice(n, sub);
      } else inner = '`' + esc(n.text) + '`';
      if (!inFunction(n)) {
        if (ts.isPropertyAssignment(p)) {
          useT = true;
          return [{ start: p.getStart(), end: p.end, text: `get ${p.name.getText()}() { return ${T}${inner}; }` }];
        }
        notes.push(`${line(n)} NGOÀI HÀM, sửa tay: ${n.getText().slice(0, 80)}`);
        return null;
      }
      useT = true;
      return replace(n, ts.isJsxAttribute(p) ? `{${T}${inner}}` : `${T}${inner}`);
    }
    if (ts.isJsxText(n)) return null;
    return editsIn(n);
  }

  const all = editsIn(sf).sort((a, b) => b.start - a.start);
  let out = src;
  let last = Infinity;
  for (const e of all) { if (e.end > last) throw new Error(`${rel}: sửa chồng nhau tại ${e.start}`); out = out.slice(0, e.start) + e.text + out.slice(e.end); last = e.start; }

  // định dạng ngày/số theo ngôn ngữ
  const fmtNames = [];
  if (out.includes("'vi-VN'") && !/speech\.ts|format\.ts/.test(rel)) { out = out.split("'vi-VN'").join('dateLocale()'); fmtNames.push('dateLocale'); }

  const imports = [];
  const hasMacroT = /import \{ t( as tx)? \} from '@lingui\/core\/macro'|useLingui\(\)/.test(src); // đã có sẵn thì không thêm lần nữa
  if (useT && !hasMacroT) imports.push(`import { ${hasT ? 't as tx' : 't'} } from '@lingui/core/macro';`);
  if (useTrans && !/\bTrans\b[^\n]*from '@lingui\/react\/macro'/.test(src)) imports.push("import { Trans } from '@lingui/react/macro';");
  if (fmtNames.length) imports.push(`import { ${fmtNames.join(', ')} } from '${rel.startsWith('lib/') ? './format' : '../lib/format'}';`);
  if (imports.length) {
    const s2 = parse(file, out);
    const lastImport = [...s2.statements].filter(ts.isImportDeclaration).pop();
    const at = lastImport ? lastImport.end : 0;
    out = out.slice(0, at) + (at ? '\n' : '') + imports.join('\n') + (at ? '' : '\n') + out.slice(at);
  }
  if (!dry && out !== src) fs.writeFileSync(file, crlf ? out.replace(/\n/g, '\r\n') : out);
  console.log(`== ${rel}: ${all.length} chỗ`);
  for (const x of notes) console.log('  ' + x);
}
