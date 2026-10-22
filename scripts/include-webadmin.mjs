// Build trang quản trị website và đặt vào apps/web/public/admin để CHÍNH Worker của website phục vụ ở địa chỉ /admin/ (D64).
// Chạy tự động trước "astro build" của website (xem apps/web/package.json).
import { execSync } from 'node:child_process';
import { cpSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
execSync('npm run build -w @agriconnect/webadmin', { cwd: root, stdio: 'inherit' });
const from = join(root, 'apps', 'webadmin', 'dist');
const to = join(root, 'apps', 'web', 'public', 'admin');
if (!existsSync(from)) throw new Error('Không thấy apps/webadmin/dist sau khi build quản trị website');
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
console.log('Đã đặt trang quản trị website vào', to);
