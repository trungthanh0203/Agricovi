// Chạy CHỈ các test CSDL liên quan tới phần vừa thay đổi (nhanh hơn `npm run test:db`; CI vẫn chạy đủ).
//
//   npm run test:db:changed                  # thay đổi chưa commit (so với HEAD) + file mới
//   npm run test:db:changed -- --since main  # mọi thay đổi so với nhánh/commit khác
//   npm run test:db:changed -- --list        # chỉ in danh sách test sẽ chạy và lý do, không chạy
//   npm run test:db:changed -- --all         # chạy toàn bộ (như test:db)
//
// Cách chọn:
//  - file test thay đổi            -> chạy chính nó
//  - harness.mjs / shim.sql        -> chạy tất cả
//  - migration thay đổi            -> lấy tên bảng/view/hàm/chính sách trong phần SQL thay đổi, chọn test có nhắc tên đó
//  - apps/app/src/lib/{outbox,db,inventory,production}.ts -> sync.e2e (kiểm thử đồng bộ dùng chính các file này)
//  - không chọn được test nào cho một migration -> chạy tất cả (an toàn hơn là bỏ sót)
//  - giao diện thuần (screens, components, css) -> không cần test CSDL; nhớ chạy `npm run typecheck`
import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const since = args.includes('--since') ? args[args.indexOf('--since') + 1] : 'HEAD';

const testsDir = 'supabase/tests';
const allTests = readdirSync(testsDir).filter((f) => f.endsWith('.test.mjs')).map((f) => `${testsDir}/${f}`);
const testText = new Map(allTests.map((f) => [f, readFileSync(f, 'utf8')]));

const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
const changed = new Set([
  ...git('diff', '--name-only', since, '--'),
  ...(since === 'HEAD' ? git('ls-files', '--others', '--exclude-standard') : []),
]);

/** Dòng SQL đã thêm/đổi của một migration (file mới thì lấy cả file) */
function changedSql(file) {
  const tracked = git('ls-files', '--', file).length > 0;
  if (!tracked) return readFileSync(file, 'utf8');
  const diff = execFileSync('git', ['diff', '-U0', since, '--', file], { encoding: 'utf8' });
  const added = diff.split(/\r?\n/).filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1)).join('\n');
  return added || readFileSync(file, 'utf8');
}

/** Tên bảng/view/hàm/kiểu/chính sách xuất hiện trong lệnh DDL, và bảng sau "on"/"into"/"from" */
function identifiers(sql) {
  const ids = new Set();
  const ddl = /\b(?:create(?:\s+or\s+replace)?|alter|drop)\s+(?:table|view|function|trigger|policy|type|index)\s+(?:if\s+(?:not\s+)?exists\s+)?([a-z_][a-z0-9_]*)/gi;
  const refs = /\b(?:on|into|from|update|join)\s+(?:only\s+)?([a-z_][a-z0-9_]*)\b/gi;
  for (const re of [ddl, refs]) for (const m of sql.matchAll(re)) ids.add(m[1].toLowerCase());
  for (const m of sql.matchAll(/\b([a-z]+_[a-z_0-9]+)\s*\(/gi)) ids.add(m[1].toLowerCase()); // lời gọi hàm
  // bỏ từ khóa SQL, bí danh ngắn, và tên xuất hiện ở hơn nửa số test (quá chung chung, chọn theo đó sẽ ra gần như tất cả)
  const stop = new Set(['conflict', 'select', 'each', 'public', 'auth', 'delete', 'insert', 'values', 'lateral', 'only', 'where', 'constraint', 'table', 'exists', 'function', 'trigger', 'policy', 'view', 'true', 'false', 'null', 'authenticated', 'service_role', 'anon']);
  for (const id of [...ids]) {
    const re = new RegExp(`\b${id}\b`, 'i');
    const freq = [...testText.values()].filter((t) => re.test(t)).length;
    if (id.length < 4 || stop.has(id) || freq > allTests.length / 2) ids.delete(id);
  }
  return ids;
}

const selected = new Map(); // file test -> lý do
const add = (f, why) => { if (!selected.has(f)) selected.set(f, why); };
let runAll = flag('--all') ? 'theo yêu cầu --all' : null;

for (const f of changed) {
  const norm = f.replace(/\\/g, '/');
  if (/^supabase\/tests\/.+\.test\.mjs$/.test(norm)) {
    if (existsSync(norm)) add(norm, 'file test thay đổi');
  } else if (/^supabase\/tests\/(harness\.mjs|shim\.sql)$/.test(norm)) {
    runAll = `${norm} thay đổi (dùng chung cho mọi test)`;
  } else if (/^supabase\/migrations\/.+\.sql$/.test(norm)) {
    if (!existsSync(norm)) continue;
    const ids = identifiers(changedSql(norm));
    let hits = 0;
    for (const [t, text] of testText) {
      const hit = [...ids].find((id) => new RegExp(`\\b${id}\\b`, 'i').test(text));
      if (hit) { add(t, `${norm.split('/').pop()} nhắc "${hit}"`); hits += 1; }
    }
    if (hits === 0) runAll = `không tìm được test nào nhắc tới thay đổi trong ${norm}`;
  } else if (/^apps\/app\/src\/lib\/(outbox|db|inventory|production|hooks)\.ts$/.test(norm)) {
    add(`${testsDir}/server_write.test.mjs`, `${norm} thay đổi (ghi thẳng lên máy chủ)`);
    add(`${testsDir}/sync.e2e.test.mjs`, `${norm} thay đổi (kiểm thử đồng bộ dùng file này)`);
  } else if (/^apps\/app\/src\/lib\/(serverWrite|finance|harvest)\.ts$/.test(norm)) {
    add(`${testsDir}/server_write.test.mjs`, `${norm} thay đổi (ghi thẳng lên máy chủ)`);
  } else if (/^apps\/app\/src\/lib\/summaryReport\.ts$/.test(norm)) {
    add(`${testsDir}/summary_report.test.mjs`, `${norm} thay đổi`);
  } else if (/^supabase\/functions\//.test(norm)) {
    add(`${testsDir}/staff.test.mjs`, `${norm} thay đổi`);
  }
}

const files = runAll ? allTests : [...selected.keys()].sort();
if (runAll) console.log(`Chạy TẤT CẢ ${allTests.length} file test: ${runAll}.`);
else if (files.length === 0) {
  console.log('Không có thay đổi nào cần test CSDL. (Giao diện thuần: chạy `npm run typecheck`.)');
  process.exit(0);
} else {
  console.log(`Chạy ${files.length}/${allTests.length} file test liên quan:`);
  for (const f of files) console.log(`  - ${f.split('/').pop()}  (${selected.get(f)})`);
}
if (flag('--list')) process.exit(0);

const r = spawnSync(process.execPath, ['--import', 'tsx', '--test', '--test-force-exit', ...files], { stdio: 'inherit' });
process.exit(r.status ?? 1);
