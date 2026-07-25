import numpy as np

def checker(h, w, cell):
    """alpha mask: True = opaque. Checkerboard with square cells of `cell` px."""
    yy, xx = np.mgrid[0:h, 0:w]
    return ((xx // cell + yy // cell) % 2) == 0

def box_downscale(mask, ratio):
    """Average opacity over each output pixel's source footprint."""
    h, w = mask.shape
    oh, ow = max(1, round(h / ratio)), max(1, round(w / ratio))
    ys = (np.arange(oh + 1) * h / oh).round().astype(int)
    xs = (np.arange(ow + 1) * w / ow).round().astype(int)
    integ = np.zeros((h + 1, w + 1))
    integ[1:, 1:] = np.cumsum(np.cumsum(mask.astype(float), 0), 1)
    y0, y1 = ys[:-1][:, None], ys[1:][:, None]
    x0, x1 = xs[:-1][None, :], xs[1:][None, :]
    area = np.maximum((y1 - y0) * (x1 - x0), 1)
    return (integ[y1, x1] - integ[y0, x1] - integ[y1, x0] + integ[y0, x0]) / area

THRESH = 0.575          # measured cut, midpoint of the 0.55-0.60 bracket
SIZE = 960

print("Does the hidden region vanish cleanly in the preview?")
print("Value = % of preview pixels that stay opaque (0% = perfect vanish, 50% = noise)\n")
ratios = [1.19, 1.5, 2.0, 2.03, 3.0, 3.58, 6.0]
print(f"{'cell':>6} |" + "".join(f"{r:>9.2f}x" for r in ratios))
print("-" * (8 + 10 * len(ratios)))
for cell in [1, 2, 3, 4, 6, 8, 16]:
    m = checker(SIZE, SIZE, cell)
    row = f"{cell:>4}px |"
    for r in ratios:
        cov = box_downscale(m, r)
        row += f"{(cov > THRESH).mean() * 100:>9.1f}%"
    print(row)

print("\nSame, but measuring coverage spread (std). 0.00 = every output pixel identical.")
print(f"{'cell':>6} |" + "".join(f"{r:>9.2f}x" for r in ratios))
print("-" * (8 + 10 * len(ratios)))
for cell in [1, 2, 3, 4, 6, 8, 16]:
    m = checker(SIZE, SIZE, cell)
    row = f"{cell:>4}px |"
    for r in ratios:
        cov = box_downscale(m, r)
        row += f"{cov.std():>10.3f}"
    print(row)

print("\nMinimum downscale ratio for a clean vanish, per cell size:")
for cell in [1, 2, 3, 4, 6, 8, 16]:
    m = checker(SIZE, SIZE, cell)
    best = None
    for r in np.arange(1.0, 12.01, 0.05):
        cov = box_downscale(m, r)
        if (cov > THRESH).mean() < 0.001:
            best = r
            break
    if best is None:
        print(f"  cell {cell:>2}px -> no clean vanish below 12x downscale")
        continue
    need = round(1200 * best)
    flag = "" if need <= 4096 else "   IMPOSSIBLE: X caps uploads at 4096px"
    print(f"  cell {cell:>2}px -> ratio >= {best:.2f}   (upload long side >= {need}px){flag}")
