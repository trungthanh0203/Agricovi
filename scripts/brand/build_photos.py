"""
Thay chữ thương hiệu cũ đã "in cứng" trong ảnh website:
- photo-about.webp và og-default.jpg: phủ khung xanh có logo Acovin (bản trắng) + khẩu hiệu lên chỗ chữ AgriCoVi cũ.
- app-illustration.webp: thay dòng địa chỉ trên màn hình điện thoại bằng acovin.com.
Chạy:  python scripts/brand/build_photos.py   (cần pillow; ảnh gốc lấy từ git nếu đã bị ghi đè: git show HEAD:<đường dẫn>)
"""
import os
import subprocess
from io import BytesIO

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
WEBB = os.path.join(ROOT, 'apps', 'web', 'public', 'brand')
B = os.path.join(ROOT, 'assets', 'brand')
FONT_B = 'C:/Windows/Fonts/arialbd.ttf'


def original(rel):
    """Ảnh gốc (từ git, để chạy lại nhiều lần không chồng chữ)."""
    try:
        data = subprocess.check_output(['git', 'show', 'HEAD:' + rel], cwd=ROOT)
        return Image.open(BytesIO(data)).convert('RGB')
    except Exception:
        return Image.open(os.path.join(ROOT, rel)).convert('RGB')


def card(img):
    im = img.convert('RGBA')
    lay = Image.new('RGBA', im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    d.rounded_rectangle((36, 36, 512, 312), radius=30, fill=(10, 78, 40, 255))
    im = Image.alpha_composite(im, lay)
    logo = Image.open(os.path.join(B, 'acovin-horizontal-slogan-white.png')).convert('RGBA')
    w = 420
    logo = logo.resize((w, round(logo.height * w / logo.width)), Image.LANCZOS)
    im.alpha_composite(logo, (36 + (476 - w) // 2, 56))
    d2 = ImageDraw.Draw(im)
    f = ImageFont.truetype(FONT_B, 25)
    for i, line in enumerate(('Quản lý nuôi trồng', 'Kết nối mua bán nông sản')):
        tw = d2.textlength(line, font=f)
        d2.text((36 + (476 - tw) / 2, 214 + i * 36), line, font=f, fill=(255, 255, 255, 255))
    return im.convert('RGB')


def main():
    about = card(original('apps/web/public/brand/photo-about.webp'))
    about.save(os.path.join(WEBB, 'photo-about.webp'), 'WEBP', quality=88, method=6)
    about.resize((1200, 630), Image.LANCZOS).save(os.path.join(WEBB, 'og-default.jpg'), quality=90)

    ill = original('apps/web/public/brand/app-illustration.webp').convert('RGBA')
    # xóa dòng địa chỉ cũ trên màn hình điện thoại (nền gần trắng) rồi viết lại, nghiêng theo điện thoại
    patch = Image.new('RGBA', ill.size, (0, 0, 0, 0))
    ImageDraw.Draw(patch).polygon([(542, 310), (542, 290), (608, 279), (608, 301)], fill=(250, 251, 251, 255))
    ill = Image.alpha_composite(ill, patch)
    t = Image.new('RGBA', (120, 24), (0, 0, 0, 0))
    ImageDraw.Draw(t).text((60, 12), 'acovin.com', font=ImageFont.truetype(FONT_B, 11), fill=(40, 62, 72, 255), anchor='mm')
    t = t.rotate(8.4, resample=Image.BICUBIC, expand=True)
    ill.alpha_composite(t, (576 - t.width // 2, 295 - t.height // 2))
    ill.convert('RGB').save(os.path.join(WEBB, 'app-illustration.webp'), 'WEBP', quality=88, method=6)
    print('xong')


if __name__ == '__main__':
    main()
