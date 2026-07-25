import numpy as np
from PIL import Image
import os
os.makedirs('research/out', exist_ok=True)

def comp(path, bg, out, maxw=520):
    im = Image.open(path).convert('RGBA')
    a = np.array(im).astype(np.float64)
    rgb, al = a[:,:,:3], a[:,:,3:4]/255.0
    res = rgb*al + np.array(bg)*(1-al)
    r = Image.fromarray(res.astype(np.uint8))
    if r.width > maxw: r = r.resize((maxw, round(r.height*maxw/r.width)), Image.LANCZOS)
    r.save(out); return r

W=(255,255,255); B=(21,32,43); K=(0,0,0)
comp('research/variants/medium.png', W, 'research/out/timeline_light.png')
comp('research/variants/medium.png', B, 'research/out/timeline_dark.png')
comp('research/variants/large.png',  K, 'research/out/viewer_large.png')
comp('research/variants/orig.png',   K, 'research/out/viewer_orig.png')

# side by side sheet
names = [('timeline_light','feed / light'),('timeline_dark','feed / dark'),
         ('viewer_large','opened (large)'),('viewer_orig','held (orig)')]
ims = [Image.open(f'research/out/{n}.png') for n,_ in names]
h = max(i.height for i in ims); wsum = sum(i.width for i in ims)
sheet = Image.new('RGB',(wsum, h),(40,40,40))
x=0
for i in ims: sheet.paste(i,(x,0)); x+=i.width
sheet.save('research/out/comparison.png')
print("wrote research/out/comparison.png", sheet.size)

# zoomed crop of the checkerboard in orig vs large vs medium
def crop(path, box, out, scale=8):
    im = Image.open(path).convert('RGBA')
    c = im.crop(box)
    c = c.resize((c.width*scale, c.height*scale), Image.NEAREST)
    bgim = Image.new('RGBA', c.size, (255,0,255,255))
    Image.alpha_composite(bgim, c).convert('RGB').save(out)
crop('research/variants/orig.png',  (300,1500,340,1530), 'research/out/zoom_orig.png')
crop('research/variants/large.png', (252,1263,292,1293), 'research/out/zoom_large.png')
crop('research/variants/medium.png',(148,740,188,770),   'research/out/zoom_medium.png')
zs=[Image.open(f'research/out/zoom_{n}.png') for n in ['orig','large','medium']]
sh=Image.new('RGB',(sum(z.width for z in zs)+40, max(z.height for z in zs)),(30,30,30))
x=0
for z in zs: sh.paste(z,(x,0)); x+=z.width+20
sh.save('research/out/zoom_compare.png')
print("wrote research/out/zoom_compare.png (magenta = transparent)")
