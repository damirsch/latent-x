"""Checks the model against X's own output, pixel by pixel.

Takes the alpha channel of the uploaded file, shrinks it locally with several resampling
kernels, rounds the result at a threshold, and compares the mask to the alpha channel of the
variant X actually serves. Also reports how much the averaged coverage really varies inside
the checkerboard, which is what the "averages to a half" claim rests on.
"""
import numpy as np
from PIL import Image

THRESH = 0.575

orig = np.array(Image.open("research/variants/orig.png").convert("RGBA"))[:, :, 3]
served = np.array(Image.open("research/variants/medium.png").convert("RGBA"))[:, :, 3]

oh, ow = served.shape
print(f"original {orig.shape[1]}x{orig.shape[0]} -> variant {ow}x{oh}")
print(f"ratio {orig.shape[0] / oh:.3f}")
print(f"alpha values in the served variant: {sorted(set(np.unique(served).tolist()))}")

src = Image.fromarray(orig)
kernels = {
    "box": Image.BOX,
    "bilinear": Image.BILINEAR,
    "bicubic": Image.BICUBIC,
    "lanczos": Image.LANCZOS,
    "hamming": Image.HAMMING,
}

truth = served > 127
print(f"\ntransparent in the served variant: {100 * (~truth).mean():.2f}%")
print("\nkernel      agreement   coverage inside the checkerboard")
for name, method in kernels.items():
    cov = np.asarray(src.resize((ow, oh), method), dtype=np.float64) / 255.0
    agree = 100 * ((cov > THRESH) == truth).mean()

    band = cov[~truth]
    print(f"{name:<11} {agree:8.3f}%   mean {band.mean():.4f}  sd {band.std():.4f}")

# Where does the remaining disagreement sit? Pixels next to the boundary between the
# checkerboarded region and the solid one see a mix of both, so their coverage lands between
# a half and one — exactly where the threshold decides by a hair.
cov = np.asarray(src.resize((ow, oh), Image.BILINEAR), dtype=np.float64) / 255.0
wrong = (cov > THRESH) != truth
edge = np.zeros_like(truth)
edge[:-1] |= truth[:-1] != truth[1:]
edge[1:] |= truth[:-1] != truth[1:]
edge[:, :-1] |= truth[:, :-1] != truth[:, 1:]
edge[:, 1:] |= truth[:, :-1] != truth[:, 1:]

print(f"\ndisagreeing pixels: {wrong.sum()} of {wrong.size} ({100 * wrong.mean():.3f}%)")
print(f"of those, on the region boundary: {100 * edge[wrong].mean():.1f}%")
print(f"boundary pixels are {100 * edge.mean():.2f}% of the image")
print(f"agreement away from the boundary: {100 * (~wrong[~edge]).mean():.3f}%")
