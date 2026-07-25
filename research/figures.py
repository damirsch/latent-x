"""Builds the figures used in the article.

The first two come from the reference post being analysed, fetched from the CDN. The last
one is a controlled experiment on images/test.png, since it needs the same picture
re-encoded at cell sizes the original does not have.

Output goes to public/figures/.
"""
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

os.makedirs("public/figures", exist_ok=True)

THRESH = 0.575
MEDIUM, LARGE = 1200, 2048

WHITE = (255, 255, 255)
FEED_DARK = (21, 32, 43)
BLACK = (0, 0, 0)


def rgba(path):
    return np.array(Image.open(path).convert("RGBA")).astype(np.float64)


def box_downscale(img, target_long):
    """Box filter in premultiplied space, then binarise alpha the way X does."""
    h, w = img.shape[:2]
    scale = target_long / max(h, w)
    oh, ow = max(1, round(h * scale)), max(1, round(w * scale))
    a = img[:, :, 3] / 255.0
    pre = img[:, :, :3] * a[:, :, None]

    def integ(x):
        out = np.zeros((h + 1, w + 1))
        out[1:, 1:] = np.cumsum(np.cumsum(x, 0), 1)
        return out

    ints = [integ(pre[:, :, c]) for c in range(3)] + [integ(a)]
    ys = np.round(np.arange(oh + 1) * h / oh).astype(int)
    xs = np.round(np.arange(ow + 1) * w / ow).astype(int)
    y0, y1 = ys[:-1][:, None], ys[1:][:, None]
    x0, x1 = xs[:-1][None, :], xs[1:][None, :]
    area = np.maximum((y1 - y0) * (x1 - x0), 1)

    def rect(s):
        return s[y1, x1] - s[y0, x1] - s[y1, x0] + s[y0, x0]

    asum = rect(ints[3])
    keep = asum / area > THRESH
    safe = np.where(asum == 0, 1, asum)
    out = np.zeros((oh, ow, 4))
    for c in range(3):
        out[:, :, c] = np.where(keep, rect(ints[c]) / safe, 0)
    out[:, :, 3] = np.where(keep, 255, 0)
    return out


def over(img, bg):
    a = img[:, :, 3:4] / 255.0
    return (img[:, :, :3] * a + np.array(bg) * (1 - a)).astype(np.uint8)


def panel(arr, height=380):
    im = Image.fromarray(arr)
    return im.resize((round(im.width * height / im.height), height), Image.LANCZOS)


def strip(images, labels, path, gap=14, bg=(12, 12, 16), pad=30):
    try:
        font = ImageFont.truetype("/System/Library/Fonts/SFNSMono.ttf", 15)
    except OSError:
        font = ImageFont.load_default()
    w = sum(i.width for i in images) + gap * (len(images) - 1)
    h = max(i.height for i in images)
    sheet = Image.new("RGB", (w, h + pad), bg)
    draw = ImageDraw.Draw(sheet)
    x = 0
    for im, label in zip(images, labels):
        sheet.paste(im, (x, 0))
        draw.text((x + 2, h + 8), label, fill=(150, 150, 165), font=font)
        x += im.width + gap
    sheet.save(path)
    print("wrote", path, sheet.size)


# ---------------------------------------------------------------- figures from the post

orig = rgba("research/variants/orig.png")
medium = rgba("research/variants/medium.png")
large = rgba("research/variants/large.png")

strip(
    [
        panel(over(medium, WHITE)),
        panel(over(medium, FEED_DARK)),
        panel(over(large, BLACK)),
        panel(over(orig, BLACK)),
    ],
    ["timeline, light mode", "timeline, dark mode", "image opened", "original loaded"],
    "public/figures/states.png",
)


def alpha_zoom(img, frac_y, frac_x, size, scale):
    h, w = img.shape[:2]
    y = int(h * frac_y)
    x = int(w * frac_x)
    crop = img[y : y + size, x : x + size]
    vis = np.where(crop[:, :, 3:4] > 0, crop[:, :, :3], np.array([255, 0, 255])).astype(np.uint8)
    return Image.fromarray(vis).resize((size * scale, size * scale), Image.NEAREST)


# Same spot in the picture at each size, inside the region that is meant to stay hidden.
FY, FX, N = 0.30, 0.55, 34
strip(
    [
        alpha_zoom(orig, FY, FX, N, 13),
        alpha_zoom(large, FY, FX, N, 13),
        alpha_zoom(medium, FY, FX, N, 13),
    ],
    ["original file", "2048px variant", "1200px variant"],
    "public/figures/alpha-zoom.png",
)

# ------------------------------------------------------- controlled cell-size experiment

src = Image.open("images/test.png").convert("RGB")
scale = 2560 / max(src.size)
src = src.resize((round(src.width * scale), round(src.height * scale)), Image.LANCZOS)
rgb = np.array(src).astype(np.float64)
h, w = rgb.shape[:2]

# Keep a central ellipse solid, checkerboard the rest.
yy, xx = np.mgrid[0:h, 0:w]
mask = (((xx - w / 2) / (w * 0.17)) ** 2 + ((yy - h / 2) / (h * 0.3)) ** 2 <= 1).astype(np.uint8)

panels, labels = [], []
for cell in (1, 2, 4):
    drop = ((xx // cell + yy // cell) % 2) == 1
    alpha = np.where(mask.astype(bool) | ~drop, 255.0, 0.0)
    composed = np.dstack([rgb, alpha])
    panels.append(panel(over(box_downscale(composed, MEDIUM), WHITE), height=300))
    labels.append(f"{cell}px cell")
strip(panels, labels, "public/figures/cell-size.png")
