"""
Đổi tên miền trong mã và cấu hình (không đụng tài liệu .md): dùng ngày bạn mua tên miền mới.
Ví dụ khi mua acovin.com:   python scripts/brand/switch_domain.py agricovi.com acovin.com
Việc đi kèm (xem docs/DEPLOY_CLOUDFLARE.md mục cuối): gắn tên miền vào Cloudflare, cập nhật Supabase (Site URL, Redirect URLs), RESEND_FROM.
Cần Python 3 (chỉ dùng thư viện chuẩn).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import rename_text as rt  # dùng lại danh sách thư mục/tệp của tập lệnh đổi tên

if len(sys.argv) != 3:
    sys.exit('Cách dùng: python scripts/brand/switch_domain.py <tên-miền-cũ> <tên-miền-mới>')
OLD, NEW = sys.argv[1], sys.argv[2]


def main():
    changed = 0
    for p in rt.targets():
        if p.lower().endswith('.md'):
            continue
        try:
            with open(p, encoding='utf-8', newline='') as fh:
                s = fh.read()
        except (UnicodeDecodeError, OSError):
            continue
        t = s.replace(OLD, NEW)
        if t != s:
            changed += 1
            print(os.path.relpath(p, rt.ROOT))
            with open(p, 'w', encoding='utf-8', newline='') as fh:
                fh.write(t)
    print(changed, 'tệp đã đổi', OLD, '->', NEW)


main()
