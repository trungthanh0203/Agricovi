// Build trang quản trị và đặt vào apps/app/dist/quan-tri để cùng một dự án Cloudflare phục vụ cả app lẫn admin (D54).
// Chạy tự động sau "vite build" của app (xem apps/app/package.json).
import { execSync } from 'node:child_process';
import { cpSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
execSync('npm run build -w @agriconnect/admin', { cwd: root, stdio: 'inherit' });
const from = join(root, 'apps', 'admin', 'dist');
const to = join(root, 'apps', 'app', 'dist', 'quan-tri');
if (!existsSync(from)) throw new Error('Không thấy apps/admin/dist sau khi build admin');
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
console.log('Đã đặt trang quản trị vào', to);
