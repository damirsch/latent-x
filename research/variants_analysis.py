import numpy as np, glob, os
from PIL import Image

orig = np.array(Image.open('research/variants/orig.png').convert('RGBA'))
oa = orig[:,:,3] > 0
OH,OW = oa.shape

print(f"{'variant':>10} {'size':>12} {'ratio':>7} {'transp%':>9} {'parity split':>22} {'verdict'}")
print("-"*95)
for name in ['orig','4096x4096','large','medium','small','thumb']:
    p = f'research/variants/{name}.png'
    a = np.array(Image.open(p).convert('RGBA'))[:,:,3] > 0
    h,w = a.shape
    yy,xx = np.mgrid[0:h,0:w]
    par = (xx+yy)%2
    t0 = (~a[par==0]).mean(); t1 = (~a[par==1]).mean()
    ratio = OW/w
    # checkerboard present if the two parities differ a lot
    checker = abs(t0-t1) > 0.15
    # speckle: measure how often an opaque pixel has a transparent 4-neighbour inside hidden zone
    verdict = "CHECKERBOARD VISIBLE" if checker else "flat"
    print(f"{name:>10} {w}x{h:<7} {ratio:>7.3f} {(~a).mean()*100:>8.2f}% {t0*100:>9.2f}% /{t1*100:>7.2f}%   {verdict}")

print("\nSpeckle / cleanliness of the hidden region per variant")
print("(fraction of transparent pixels that are isolated, i.e. have >=3 opaque 4-neighbours)")
for name in ['large','medium','small']:
    a = np.array(Image.open(f'research/variants/{name}.png').convert('RGBA'))[:,:,3] > 0
    t = (~a).astype(np.uint8)
    nb = np.zeros_like(t, dtype=np.int16)
    nb[1:,:]+=a[:-1,:]; nb[:-1,:]+=a[1:,:]; nb[:,1:]+=a[:,:-1]; nb[:,:-1]+=a[:,1:]
    iso = ((t==1)&(nb>=3)).sum() / max(t.sum(),1)
    # also opaque pixels stranded inside transparent area
    o = a.astype(np.uint8)
    nbt = np.zeros_like(o, dtype=np.int16)
    nbt[1:,:]+=t[:-1,:]; nbt[:-1,:]+=t[1:,:]; nbt[:,1:]+=t[:,:-1]; nbt[:,:-1]+=t[:,1:]
    strand = ((o==1)&(nbt>=3)).sum() / max(o.sum(),1)
    print(f"  {name:>7}: isolated transparent {iso*100:6.2f}%   stranded opaque {strand*100:6.2f}%")
