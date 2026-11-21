"""
Dựng các cỡ ảnh thương hiệu từ assets/brand/acovin-*.png rồi ghi vào apps/app/public và apps/web/public.
Chạy:  python scripts/brand/build_sizes.py
Cần: pillow. (Tạo acovin-*.png bằng make_brand_assets.py.)
"""
import os

from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
B = os.path.join(ROOT, 'assets', 'brand')
APP = os.path.join(ROOT, 'apps', 'app', 'public')
WEB = os.path.join(ROOT, 'apps', 'web', 'public')
WEBB = os.path.join(WEB, 'brand')


def load(name):
    return Image.open(os.path.join(B, name + '.png')).convert('RGBA')


def tile(mark, size, pad, radius=0.0, bg=(255, 255, 255, 255)):
    """Ô vuông nền trắng chứa chữ A + lá."""
    t = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(t)
    if radius > 0:
        d.rounded_rectangle((0, 0, size - 1, size - 1), radius=int(size * radius), fill=bg)
    else:
        d.rectangle((0, 0, size, size), fill=bg)
    inner = int(size * (1 - 2 * pad))
    m = mark.copy()
    m.thumbnail((inner, inner), Image.LANCZOS)
    t.alpha_composite(m, ((size - m.width) // 2, (size - m.height) // 2))
    return t


def fit_height(im, h):
    return im.resize((max(1, round(im.width * h / im.height)), h), Image.LANCZOS)


def fit_width(im, w):
    return im.resize((w, max(1, round(im.height * w / im.width))), Image.LANCZOS)


def save_webp(im, path):
    im.save(path, 'WEBP', quality=92, method=6, lossless=False, exact=True)


def main():
    mark = load('acovin-mark')
    horiz = load('acovin-horizontal')
    horiz_s = load('acovin-horizontal-slogan')
    logo = load('acovin-logo')
    sizes = {}
    for out in (APP, WEB):
        os.makedirs(out, exist_ok=True)
        # biểu tượng thẻ trình duyệt và cài app
        big = tile(mark, 256, 0.07, radius=0.2)
        big.resize((16, 16), Image.LANCZOS).save(os.path.join(out, 'favicon-16.png'))
        big.resize((32, 32), Image.LANCZOS).save(os.path.join(out, 'favicon-32.png'))
        big.save(os.path.join(out, 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48)])
        tile(mark, 180, 0.12).convert('RGB').save(os.path.join(out, 'apple-touch-icon.png'))
    tile(mark, 192, 0.10).save(os.path.join(APP, 'icon-192.png'))
    tile(mark, 512, 0.10).save(os.path.join(APP, 'icon-512.png'))
    tile(mark, 512, 0.24).save(os.path.join(APP, 'icon-maskable-512.png'))
    # logo dùng trong giao diện
    sq = Image.new('RGBA', (max(mark.size),) * 2, (0, 0, 0, 0))
    sq.alpha_composite(mark, ((sq.width - mark.width) // 2, (sq.height - mark.height) // 2))
    sq.resize((256, 256), Image.LANCZOS).save(os.path.join(APP, 'logo-mark.png'))
    os.makedirs(WEBB, exist_ok=True)
    sq.resize((512, 512), Image.LANCZOS).save(os.path.join(WEBB, 'logo-mark.png'))
    for d in (APP, WEBB):
        save_webp(fit_height(horiz, 120), os.path.join(d, 'logo-header.webp'))
        save_webp(fit_width(horiz_s, 900), os.path.join(d, 'logo-horizontal.webp'))
        save_webp(fit_width(logo, 640), os.path.join(d, 'logo-vertical.webp'))
    print('xong')


if __name__ == '__main__':
    main()
