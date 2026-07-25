import numpy as np
from PIL import Image

def alpha_map(path):
    im = Image.open(path)
    a = np.array(im.convert('RGBA'))[:,:,3]
    return a

for p in ['research/variants/orig.png','research/variants/medium.png']:
    a = alpha_map(p)
    h,w = a.shape
    vals = np.unique(a)
    print("="*70)
    print(p, f"{w}x{h}  unique alpha values: {vals}")
    print(f"  transparent fraction: {(a==0).mean():.4f}")
    # checkerboard test: correlation with (x+y)%2
    yy,xx = np.mgrid[0:h,0:w]
    par = (xx+yy) % 2
    for pv in (0,1):
        m = par==pv
        print(f"  parity {pv}: transparent fraction {(a[m]==0).mean():.4f}")
    # column/row stripe test
    print(f"  even cols transparent: {(a[:,0::2]==0).mean():.4f}   odd cols: {(a[:,1::2]==0).mean():.4f}")
    print(f"  even rows transparent: {(a[0::2,:]==0).mean():.4f}   odd rows: {(a[1::2,:]==0).mean():.4f}")

# Print a small ASCII patch of alpha from a mid region of each
for p,(y0,x0) in [('research/variants/orig.png',(1200,1100)),('research/variants/medium.png',(592,542))]:
    a = alpha_map(p)
    print("="*70)
    print(f"{p} alpha patch at ({y0},{x0}) 16x32  ('#'=opaque '.'=transparent)")
    for r in range(y0,y0+16):
        print("   " + "".join('#' if a[r,c]>0 else '.' for c in range(x0,x0+32)))
