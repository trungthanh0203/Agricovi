"""
Tách logo Acovin từ ảnh gốc (3 khung), bỏ nền, bỏ chữ "a" cuối ("Acovina" -> "Acovin"), dựng bộ tệp thương hiệu.
Chạy:  python scripts/brand/make_brand_assets.py <ảnh-gốc.webp> <thư-mục-ra>
Cần: pillow, numpy, scipy.
Đầu ra (PNG nền trong suốt): acovin-mark / -icon / -logo, các bản ngang (-horizontal), bản trắng cho thanh đầu nền xanh (-white).
Muốn thay logo chất lượng cao hơn: thay ảnh gốc (đúng bố cục 3 khung) rồi chạy lại, sau đó chạy scripts/brand/build_sizes.py.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

SCALE = 4  # phóng lớn trước khi tách nền để viền mịn


def matte(img, bg, near=60.0, dmin=14.0):
    """Tách nền sáng đồng đều: alpha theo màu đặc gần nhất (không bị viền xám)."""
    a = np.asarray(img.convert('RGB')).astype(np.float32)
    bg = np.array(bg, np.float32)
    d = np.abs(a - bg).max(axis=2)
    core = d > near
    # lõi chắc: bào mòn 3 điểm (nét dày lấy màu bên trong, không dính viền pha nền); nét mảnh (đường mạch) giữ màu của chính nó
    strong = ndi.binary_erosion(core, iterations=3)
    far = ndi.distance_transform_edt(~strong) > 6
    solid = strong | (core & far)
    idx = ndi.distance_transform_edt(~solid, return_distances=False, return_indices=True)
    fg = a[idx[0], idx[1]]
    v = fg - bg
    num = ((a - bg) * v).sum(axis=2)
    den = np.maximum((v * v).sum(axis=2), 1.0)
    alpha = np.clip(num / den, 0, 1)
    alpha[d < dmin] = 0
    rgb = np.where(solid[..., None], a, fg)
    rgba = np.dstack([rgb, alpha * 255]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(rgba, 'RGBA')


def bbox_alpha(im, thr=8):
    al = np.asarray(im)[..., 3]
    ys, xs = np.where(al > thr)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def segs(v):
    out, s = [], None
    for i, x in enumerate(v):
        if x and s is None:
            s = i
        if not x and s is not None:
            out.append((s, i - 1))
            s = None
    if s is not None:
        out.append((s, len(v) - 1))
    return out


def trim(im):
    return im.crop(bbox_alpha(im))


def cut(src, box, bg):
    x0, y0, x1, y1 = box
    c = src.crop((x0 - 6, y0 - 6, x1 + 7, y1 + 7))
    c = c.resize((c.width * SCALE, c.height * SCALE), Image.LANCZOS)
    return trim(matte(c, bg))


def drop_last_glyph(word):
    """Bỏ chữ cái cuối của từ (Acovina -> Acovin) rồi cắt gọn."""
    al = np.asarray(word)[..., 3] > 30
    groups = segs(al.sum(axis=0) > 0)
    last = groups[-1]
    arr = np.array(word)
    arr[:, max(last[0] - 1, 0):, 3] = 0
    out = Image.fromarray(arr, 'RGBA')
    return trim(out)


def paste_center(canvas, im, cx, y):
    canvas.alpha_composite(im, (int(round(cx - im.width / 2)), int(round(y))))


def whiten(im):
    a = np.array(im)
    a[..., :3] = 255
    return Image.fromarray(a, 'RGBA')


def badge(mark, size, pad_ratio=0.16, radius_ratio=0.24):
    """Tấm nền trắng bo góc chứa logo màu (dùng trên nền xanh)."""
    t = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(t).rounded_rectangle((0, 0, size - 1, size - 1), radius=int(size * radius_ratio), fill=(255, 255, 255, 255))
    inner = int(size * (1 - 2 * pad_ratio))
    m = mark.copy()
    m.thumbnail((inner, inner), Image.LANCZOS)
    t.alpha_composite(m, ((size - m.width) // 2, (size - m.height) // 2))
    return t


def stack(mark, word, slog=None, gap1=0.07, gap2=0.07):
    w = max(mark.width, word.width, slog.width if slog else 0)
    h = mark.height + int(mark.height * gap1) + word.height + ((int(mark.height * gap2) + slog.height) if slog else 0)
    c = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    cx = w / 2
    paste_center(c, mark, cx, 0)
    y = mark.height + int(mark.height * gap1)
    paste_center(c, word, cx, y)
    if slog is not None:
        paste_center(c, slog, cx, y + word.height + int(mark.height * gap2))
    return trim(c)


def horizontal(mark, word, slog=None, white=False):
    mh = mark.height
    wd = word.resize((int(word.width * (mh * 0.46 / word.height)), int(mh * 0.46)), Image.LANCZOS)
    sl = None
    if slog is not None:
        sw = int(wd.width * 0.98)
        sl = slog.resize((sw, int(slog.height * sw / slog.width)), Image.LANCZOS)
    textw = max(wd.width, sl.width if sl is not None else 0)
    gap = int(mh * 0.14)
    gap_s = int(mh * 0.05)
    text_h = wd.height + ((gap_s + sl.height) if sl is not None else 0)
    mk = badge(mark, mh, 0.14) if white else mark
    c = Image.new('RGBA', (mk.width + gap + textw, mh), (0, 0, 0, 0))
    c.alpha_composite(mk, (0, 0))
    wy = (mh - text_h) // 2
    c.alpha_composite(whiten(wd) if white else wd, (mk.width + gap, wy))
    if sl is not None:
        c.alpha_composite(whiten(sl) if white else sl, (mk.width + gap, wy + wd.height + gap_s))
    return trim(c)


def vertical_white(mark, word, slog=None):
    mk = badge(mark, int(mark.height * 1.0), 0.14)
    wd = whiten(word)
    sl = whiten(slog) if slog is not None else None
    w = max(mk.width, wd.width, sl.width if sl is not None else 0)
    h = mk.height + int(mk.height * 0.1) + wd.height + ((int(mk.height * 0.07) + sl.height) if sl is not None else 0)
    c = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    paste_center(c, mk, w / 2, 0)
    y = mk.height + int(mk.height * 0.1)
    paste_center(c, wd, w / 2, y)
    if sl is not None:
        paste_center(c, sl, w / 2, y + wd.height + int(mk.height * 0.07))
    return trim(c)


def main(src_path, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    src = Image.open(src_path).convert('RGB')
    p3 = src.crop((900, 0, 1376, 690))   # khung 3: icon không khẩu hiệu (nguồn nét nhất)
    p1 = src.crop((0, 0, 620, 690))      # khung 1: logo kèm khẩu hiệu
    bg3, bg1 = (236, 236, 236), (236, 237, 234)
    mark3 = cut(p3, (143, 248, 322, 426), bg3)
    word3 = drop_last_glyph(cut(p3, (72, 437, 401, 500), bg3))
    mark1 = cut(p1, (229, 167, 390, 326), bg1)
    word1 = drop_last_glyph(cut(p1, (161, 337, 460, 394), bg1))
    slog1 = cut(p1, (119, 406, 502, 437), bg1)

    out = {
        'acovin-mark': mark3,
        'acovin-icon': stack(mark3, word3),
        'acovin-logo': stack(mark1, word1, slog1),
        'acovin-horizontal': horizontal(mark3, word3),
        'acovin-horizontal-slogan': horizontal(mark3, word3, slog1),
        'acovin-horizontal-white': horizontal(mark3, word3, white=True),
        'acovin-horizontal-slogan-white': horizontal(mark3, word3, slog1, white=True),
        'acovin-icon-white': vertical_white(mark3, word3),
        'acovin-logo-white': vertical_white(mark3, word3, slog1),
    }
    for k, v in out.items():
        v.save(os.path.join(out_dir, k + '.png'))
    print({k: v.size for k, v in out.items()})


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
