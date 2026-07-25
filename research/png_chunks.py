import struct, sys, zlib
from collections import Counter

def chunks(path):
    d = open(path,'rb').read()
    assert d[:8] == b'\x89PNG\r\n\x1a\n'
    i = 8
    out = []
    while i < len(d):
        ln = struct.unpack('>I', d[i:i+4])[0]
        typ = d[i+4:i+8].decode('latin1')
        data = d[i+8:i+8+ln]
        out.append((typ, data))
        i += 12 + ln
    return out, len(d)

for path in sys.argv[1:]:
    cs, size = chunks(path)
    print("="*70)
    print(path, f"({size} bytes)")
    ihdr = [c for c in cs if c[0]=='IHDR'][0][1]
    w,h,depth,ctype,comp,filt,inter = struct.unpack('>IIBBBBB', ihdr)
    print(f"  IHDR: {w}x{h} depth={depth} colortype={ctype} interlace={inter}")
    print("  chunks:", ", ".join(f"{t}({len(d)})" for t,d in cs))
    plte = [d for t,d in cs if t=='PLTE']
    trns = [d for t,d in cs if t=='tRNS']
    if plte:
        pal = plte[0]
        n = len(pal)//3
        print(f"  PLTE: {n} entries")
        if trns:
            tr = trns[0]
            print(f"  tRNS: {len(tr)} alpha values")
            cnt = Counter(tr)
            print(f"       alpha histogram: {sorted(cnt.items())[:12]}{' ...' if len(cnt)>12 else ''}")
            fully = [i for i,a in enumerate(tr) if a==0]
            partial = [i for i,a in enumerate(tr) if 0<a<255]
            print(f"       fully transparent indices: {len(fully)}  partial: {len(partial)}")
            if fully:
                cols = [(pal[3*i],pal[3*i+1],pal[3*i+2]) for i in fully]
                uniq = sorted(set(cols))
                print(f"       RGB of transparent entries: {len(uniq)} unique")
                print(f"       sample: {uniq[:16]}")
        else:
            print("  tRNS: NONE (fully opaque palette)")
