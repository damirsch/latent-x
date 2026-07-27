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
        panel(over(medium, BLACK)),
        panel(over(large, BLACK)),
        panel(over(orig, BLACK)),
    ],
    ["timeline, light mode", "timeline, dark mode", "image opened", "original loaded"],
    "public/figures/states.png",
)


def before_after(left, right, labels, note, path, arrow=112, gap=8, pad=30, bg=(12, 12, 16)):
    """Two states side by side with a labelled arrow between them."""
    try:
        font = ImageFont.truetype("/System/Library/Fonts/SFNSMono.ttf", 15)
    except OSError:
        font = ImageFont.load_default()

    h = max(left.height, right.height)
    sheet = Image.new("RGB", (left.width + arrow + right.width + pad * 2, h + pad + 30), bg)
    d = ImageDraw.Draw(sheet)

    for im, x in ((left, pad), (right, pad + left.width + arrow)):
        sheet.paste(im, (x, 0))
        d.rectangle([x, 0, x + im.width - 1, im.height - 1], outline=(58, 58, 70))

    y = h // 2
    x0 = pad + left.width + gap
    x1 = pad + left.width + arrow - gap
    d.line([x0, y, x1 - 12, y], fill=(150, 150, 165), width=2)
    d.polygon([(x1 - 12, y - 6), (x1 - 12, y + 6), (x1, y)], fill=(150, 150, 165))
    w = d.textlength(note, font=font)
    d.text(((x0 + x1 - w) / 2, y - 30), note, fill=(150, 150, 165), font=font)

    for x, label in ((pad, labels[0]), (pad + left.width + arrow, labels[1])):
        d.text((x + 2, h + 8), label, fill=(150, 150, 165), font=font)

    sheet.save(path)
    print("wrote", path, sheet.size)


before_after(
    panel(over(medium, BLACK), height=440),
    panel(over(large, BLACK), height=440),
    ["what the timeline shows", "what you get on tap"],
    "tap",
    "public/figures/effect.png",
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

# ------------------------------------------------------------- schematic of the rounding
# Not a measurement: this one just draws the step the numbers above describe.

SHEET_BG = (12, 12, 16)
INK = (150, 150, 165)
INK_DIM = (105, 105, 120)
SOLID = (238, 178, 92)
EDGE = (58, 58, 70)


def rounding_figure(path, cell=40, pad=30, label_col=132, arrow=76):
    try:
        head = ImageFont.truetype("/System/Library/Fonts/SFNSMono.ttf", 14)
        small = ImageFont.truetype("/System/Library/Fonts/SFNSMono.ttf", 13)
    except OSError:
        head = small = ImageFont.load_default()

    block = cell * 4
    xs = [label_col, label_col + block + arrow, label_col + 2 * (block + arrow)]
    width = xs[2] + block + 72 + pad * 2
    row_h = block + 34
    height = pad + 26 + row_h * 2 + 26 + pad

    sheet = Image.new("RGB", (width, height), SHEET_BG)
    d = ImageDraw.Draw(sheet)

    for x, text in zip(xs, ["what you upload", "shrunk by half", "written back"]):
        d.text((pad + x, pad), text, fill=INK, font=head)

    def grid(ox, oy, n, fill, note=None, note_fill=INK_DIM):
        """n x n cells over the same area; fill(i, j) returns a colour or None."""
        step = block // n
        for j in range(n):
            for i in range(n):
                x0, y0 = ox + i * step, oy + j * step
                c = fill(i, j)
                d.rectangle([x0, y0, x0 + step - 1, y0 + step - 1], fill=c, outline=EDGE)
                if note:
                    t = note(i, j)
                    if t:
                        w = d.textlength(t, font=small)
                        d.text(
                            (x0 + (step - w) / 2, y0 + step / 2 - 8),
                            t,
                            fill=note_fill,
                            font=small,
                        )
        return oy + block

    def arrow_to(x, y, text):
        d.line([x + 14, y, x + arrow - 20, y], fill=INK_DIM, width=2)
        d.polygon(
            [(x + arrow - 20, y - 5), (x + arrow - 20, y + 5), (x + arrow - 8, y)],
            fill=INK_DIM,
        )
        w = d.textlength(text, font=small)
        d.text((x + 14 + (arrow - 22 - w) / 2, y - 26), text, fill=INK_DIM, font=small)

    def blend(t):
        return tuple(round(SHEET_BG[c] + (SOLID[c] - SHEET_BG[c]) * t) for c in range(3))

    rows = [
        (
            "hidden region",
            lambda i, j: SOLID if (i + j) % 2 == 0 else None,
            0.5,
            (236, 236, 244),
            None,
            "gone",
        ),
        ("visible region", lambda i, j: SOLID, 1.0, (74, 52, 18), SOLID, "kept"),
    ]

    y = pad + 26
    for name, fill, avg, note_fill, result, verdict in rows:
        d.text((pad, y + block / 2 - 8), name, fill=INK, font=head)
        grid(pad + xs[0], y, 4, fill)
        grid(pad + xs[1], y, 2, lambda i, j: blend(avg), lambda i, j: f"{avg:.2f}", note_fill)
        grid(pad + xs[2], y, 2, lambda i, j: result)
        arrow_to(pad + xs[0] + block, y + block / 2, "average")
        arrow_to(pad + xs[1] + block, y + block / 2, "round")
        d.text((pad + xs[2] + block + 10, y + block / 2 - 8), verdict, fill=INK_DIM, font=small)
        y += row_h

    d.text(
        (pad, height - pad - 14),
        "the cut sits above a half, so an averaged checkerboard is dropped and a solid block kept",
        fill=INK_DIM,
        font=small,
    )
    sheet.save(path)
    print("wrote", path, sheet.size)


rounding_figure("public/figures/rounding.png")
