import numpy as np
from PIL import Image

full = np.array(Image.open('research/variants/orig.png').convert('RGBA')).astype(np.float64)
prev = np.array(Image.open('research/variants/medium.png').convert('RGBA')).astype(np.float64)
FH,FW = full.shape[:2]; PH,PW = prev.shape[:2]
print(f"full {FW}x{FH}  preview {PW}x{PH}  scale {FW/PW:.5f} x {FH/PH:.5f}")

fa = full[:,:,3] > 0            # opaque mask in original
pa = prev[:,:,3] > 0            # opaque mask in preview

# Local coverage: for each preview pixel, mean opacity of the source box it maps from
sx, sy = FW/PW, FH/PH
ys = (np.arange(PH+1)*sy).round().astype(int).clip(0,FH)
xs = (np.arange(PW+1)*sx).round().astype(int).clip(0,FW)
integ = np.zeros((FH+1,FW+1)); integ[1:,1:] = np.cumsum(np.cumsum(fa.astype(np.float64),0),1)
y0,y1 = ys[:-1][:,None], ys[1:][:,None]
x0,x1 = xs[:-1][None,:], xs[1:][None,:]
area = (y1-y0)*(x1-x0)
cov = (integ[y1,x1]-integ[y0,x1]-integ[y1,x0]+integ[y0,x0]) / np.maximum(area,1)

print("\nTRANSFER FUNCTION: source opacity coverage -> preview opaque probability")
print(f"{'coverage bin':>16} {'count':>10} {'P(preview opaque)':>20}")
edges = [0,0.001,0.1,0.2,0.3,0.4,0.45,0.5,0.55,0.6,0.7,0.8,0.9,0.99,1.001]
for lo,hi in zip(edges[:-1],edges[1:]):
    m = (cov>=lo)&(cov<hi)
    if m.sum()>50:
        print(f"  [{lo:.3f},{hi:.3f}) {m.sum():>10} {pa[m].mean():>20.4f}")

print("\nAgreement of simple threshold models against actual preview alpha:")
for t in [0.05,0.25,0.5,0.6,0.75,0.9,0.99]:
    pred = cov > t
    print(f"  coverage > {t:<5} : {(pred==pa).mean()*100:6.2f}% match")
