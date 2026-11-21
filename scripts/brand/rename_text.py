"""
Đổi chữ thương hiệu hiển thị: Agricovi / AgriConnect -> Acovin, agricovi.com -> acovin.com (D226).
KHÔNG đổi: khóa lưu trên máy (agriconnect.*, agricovi.*), tên IndexedDB, gói mã nguồn @agriconnect/*, tệp migration, tài liệu lịch sử (DECISIONS_*, PLAN_*, STATUS_*).
Chạy:  python scripts/brand/rename_text.py [--dry]
"""
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DRY = '--dry' in sys.argv

DIRS = ['apps/app/src', 'apps/admin/src', 'apps/web/src', 'apps/webadmin/src', 'packages', 'supabase/functions']
FILES = ['apps/app/index.html', 'apps/app/vite.config.ts', 'apps/app/.env.production', 'apps/web/.env.production',
         'scripts/sync-guides-to-web.mjs',
         'docs/huongdan_hethong.html', 'docs/huongdan_trongcay.html', 'docs/huongdan_vatnuoi.html',
         'docs/DEPLOY_CLOUDFLARE.md', 'docs/SETUP_SUPABASE.md']
for n in os.listdir(os.path.join(ROOT, 'docs')):
    if n.startswith('HUONG_DAN_') and n.endswith('.md'):
        FILES.append('docs/' + n)
EXT = {'.ts', '.tsx', '.astro', '.js', '.mjs', '.html', '.css', '.json', '.md', '.txt', '.env', '.production', '.svelte'}
SKIP_DIRS = {'node_modules', 'dist', '.astro', '.git'}
# i18n-msgs.ts: KHÓA là nguyên văn thông báo từ máy chủ (migration cũ giữ chữ AgriConnect) nên không đổi khóa; chỉ sửa giá trị tiếng Anh bằng tay
SKIP_FILES = {'i18n-msgs.ts'}

RULES = [
    (re.compile(r'agricovi\.com'), 'acovin.com'),
    (re.compile(r'AgriCoVi|Agricovi|AgriConnect'), 'Acovin'),
    (re.compile(r'AGRICOVI|AGRICONNECT'), 'ACOVIN'),
]


def targets():
    for d in DIRS:
        for base, dirs, names in os.walk(os.path.join(ROOT, d)):
            dirs[:] = [x for x in dirs if x not in SKIP_DIRS]
            for n in names:
                if n in SKIP_FILES:
                    continue
                if os.path.splitext(n)[1].lower() in EXT or n.startswith('.env'):
                    yield os.path.join(base, n)
    for f in FILES:
        p = os.path.join(ROOT, f)
        if os.path.exists(p):
            yield p


def main():
    changed = 0
    for p in targets():
        try:
            with open(p, encoding='utf-8', newline='') as fh:
                s = fh.read()
        except (UnicodeDecodeError, OSError):
            continue
        t = s
        for rx, rep in RULES:
            t = rx.sub(rep, t)
        if t != s:
            changed += 1
            print(('[thử] ' if DRY else '') + os.path.relpath(p, ROOT))
            if not DRY:
                with open(p, 'w', encoding='utf-8', newline='') as fh:
                    fh.write(t)
    print(changed, 'tệp')


if __name__ == '__main__':
    main()
