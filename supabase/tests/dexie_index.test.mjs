import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Mọi truy vấn db.<bảng>.where('<cột>') ở ứng dụng phải dùng cột ĐÃ LẬP CHỈ MỤC trong bản lưu trên máy (Dexie báo lỗi "KeyPath ... is not indexed" nếu không).

const SRC = 'apps/app/src';
const dbSrc = readFileSync(join(SRC, 'lib/db.ts'), 'utf8');

function indexes() {
  const idx = new Map(); // bảng -> Set cột
  for (const block of dbSrc.matchAll(/\.stores\(\{([\s\S]*?)\}\)/g)) {
    for (const m of block[1].matchAll(/^\s*(\w+):\s*'([^']*)'/gm)) {
      const cols = m[2].split(',').map((c) => c.trim().replace(/^[&*+]+/, '').replace(/^\[.*\]$/, '')).filter(Boolean);
      idx.set(m[1], new Set(cols)); // phiên bản sau ghi đè phiên bản trước
    }
  }
  return idx;
}

function walk(dir) {
  const out = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(f)) out.push(p);
  }
  return out;
}

test('mọi where() trên bản lưu Dexie dùng cột đã lập chỉ mục', () => {
  const idx = indexes();
  assert.ok(idx.get('logs').has('cycle_id') && !idx.get('logs').has('work_type_id'));
  const bad = [];
  for (const file of walk(SRC)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/\bdb\.(\w+)\.where\('(\w+)'\)/g)) {
      const cols = idx.get(m[1]);
      if (!cols) { bad.push(`${file}: bảng ${m[1]} không có trong db.ts`); continue; }
      if (!cols.has(m[2])) bad.push(`${file}: db.${m[1]}.where('${m[2]}') — cột chưa lập chỉ mục`);
    }
  }
  assert.deepEqual(bad, []);
});
