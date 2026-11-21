// Chép 3 tài liệu hướng dẫn (docs/huongdan_*.html) vào website để xem ở agricovi.com/huong-dan/… (D153).
// Bản gốc để ở docs/; sửa tài liệu xong chạy: npm run docs:guides (rồi build/deploy website).
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GUIDES = [
  ['huongdan_hethong.html', 'he-thong'],
  ['huongdan_trongcay.html', 'trong-cay'],
  ['huongdan_vatnuoi.html', 'vat-nuoi'],
];
for (const [file, slug] of GUIDES) {
  const from = join(root, 'docs', file);
  if (!existsSync(from)) throw new Error(`Không thấy ${from}`);
  const dir = join(root, 'apps', 'web', 'public', 'huong-dan', slug);
  mkdirSync(dir, { recursive: true });
  cpSync(from, join(dir, 'index.html'));
  console.log(`docs/${file} → /huong-dan/${slug}/`);
}
