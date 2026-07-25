"""Builds the figures used in the article, straight from the pipeline model.

Everything is derived from images/test.png, so no third-party artwork is republished.
Output goes to public/figures/.
"""
import os

import numpy as np
from PIL import Image

os.makedirs("public/figures", exist_ok=True)

TARGET = 2560
THRESH = 0.575
MEDIUM, LARGE = 1200, 2048

WHITE = (255, 255, 255)
FEED_DARK = (21, 32, 43)
BLACK = (0, 0, 0)


def load_source(target=TARGET):
    im = Image.open("images/test.png").convert("RGB")
    scale = target / max(im.size)
    im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    return np.array(im).astype(np.float64)


def build_mask(rgb):
    """Keep the astronaut, hide the sky and the field around him."""
    from scipy import ndimage  # noqa: PLC0415

    h, w = rgb.shape[:2]
    lum = 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]

    # The suit is the bright thing near the middle; the clouds are bright too, so restrict
    # the search to a central column before thresholding.
    yy, xx = np.mgrid[0:h, 0:w]
    central = (np.abs(xx - w / 2) < w * 0.22) & (yy > h * 0.06)
    mask = ((lum > 150) & central).astype(np.uint8)

    mask = ndimage.binary_closing(mask, np.ones((9, 9))).astype(np.uint8)
    mask = ndimage.binary_fill_holes(mask).astype(np.uint8)

    lbl, n = ndimage.label(mask)
    if n:
        sizes = ndimage.sum(mask, lbl, range(1, n + 1))
        mask = (lbl == (np.argmax(sizes) + 1)).astype(np.uint8)
    return mask


def checkerboard(rgb, mask, cell=1):
    """Returns RGBA with binary alpha: hidden areas lose every second pixel."""
    h, w = mask.shape
    yy, xx = np.mgrid[0:h, 0:w]
    drop = ((xx // cell + yy // cell) % 2) == 1
    alpha = np.where(mask.astype(bool) | ~drop, 255, 0).astype(np.float64)
    return np.dstack([rgb, alpha])


def box_downscale(rgba, target_long):
    """Box filter in premultiplied space, then binarise alpha the way X does."""
    h, w = rgba.shape[:2]
    scale = target_long / max(h, w)
    oh, ow = max(1, round(h * scale)), max(1, round(w * scale))
    a = rgba[:, :, 3] / 255.0
    pre = rgba[:, :, :3] * a[:, :, None]

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
    cov = asum / area
    keep = cov > THRESH
    out = np.zeros((oh, ow, 4))
    safe = np.where(asum == 0, 1, asum)
    for c in range(3):
        out[:, :, c] = np.where(keep, rect(ints[c]) / safe, 0)
    out[:, :, 3] = np.where(keep, 255, 0)
    return out


def over(rgba, bg):
    a = rgba[:, :, 3:4] / 255.0
    return (rgba[:, :, :3] * a + np.array(bg) * (1 - a)).astype(np.uint8)


def panel(arr, width=430):
    im = Image.fromarray(arr)
    return im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)


def strip(images, labels, path, gap=14, bg=(12, 12, 16), pad=30):
    from PIL import ImageDraw, ImageFont

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


rgb = load_source()
mask = build_mask(rgb)
print(f"source {rgb.shape[1]}x{rgb.shape[0]}, visible {mask.mean() * 100:.1f}%")

full = checkerboard(rgb, mask)
feed = box_downscale(full, MEDIUM)
opened = box_downscale(full, LARGE)

# Figure 1: the same file in four places.
strip(
    [
        panel(over(feed, WHITE)),
        panel(over(feed, FEED_DARK)),
        panel(over(opened, BLACK)),
        panel(over(full, BLACK)),
    ],
    ["timeline, light mode", "timeline, dark mode", "image opened", "original loaded"],
    "public/figures/states.png",
)

# Figure 2: the alpha channel itself, magnified. Magenta marks transparent pixels.
def alpha_zoom(rgba, box, scale):
    y, x, s = box
    crop = rgba[y : y + s, x : x + s]
    vis = np.where(crop[:, :, 3:4] > 0, crop[:, :, :3], np.array([255, 0, 255])).astype(np.uint8)
    im = Image.fromarray(vis).resize((s * scale, s * scale), Image.NEAREST)
    return im


h, w = mask.shape
# Pick a point well inside the hidden area: the mask is one central blob, so the median of
# the hidden coordinates lands in the middle of the subject instead.
region = mask[: h // 2, : w // 4]
hy, hx = np.nonzero(region == 0)
cy, cx = int(np.median(hy)), int(np.median(hx))
assert mask[cy, cx] == 0, "crop point must be inside the hidden region"
strip(
    [
        alpha_zoom(full, (cy, cx, 36), 12),
        alpha_zoom(opened, (round(cy * LARGE / max(h, w)), round(cx * LARGE / max(h, w)), 36), 12),
        alpha_zoom(feed, (round(cy * MEDIUM / max(h, w)), round(cx * MEDIUM / max(h, w)), 36), 12),
    ],
    ["original file", "2048px variant", "1200px variant"],
    "public/figures/alpha-zoom.png",
)

# Figure 3: why the cell has to be one pixel.
cells = [1, 2, 4]
panels, labels = [], []
for cell in cells:
    c = checkerboard(rgb, mask, cell=cell)
    panels.append(panel(over(box_downscale(c, MEDIUM), WHITE)))
    labels.append(f"{cell}px cell")
strip(panels, labels, "public/figures/cell-size.png")
