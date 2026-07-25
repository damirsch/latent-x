# latent

A browser tool that makes "press and hold" images for X: pick the part of a picture that
should stay visible in the timeline, and everything else disappears until someone opens the
image at full size.

Nothing is uploaded. Decoding, masking and PNG encoding all happen in the tab.

## How the effect works

X never shows your upload in the timeline. It shows a shrunken variant of it, and while
shrinking it rebuilds transparency as a plain on-or-off value per pixel with nothing in
between.

The tool makes every second pixel of the hidden region fully transparent, in a one-pixel
checkerboard. When the variant is generated, that region averages out to 50% coverage,
which sits below the threshold where the rounding goes to "fully transparent". So the
region does not become faint in the feed, it disappears outright. The original file still
carries the untouched checkerboard, so loading it brings the picture back.

Because the hidden region ends up *fully* transparent rather than partially transparent, it
simply takes the colour of whatever is behind it. The effect therefore works in light mode
and dark mode alike.

All of this was measured rather than guessed. The numbers, the method and the scripts are
in [research/FINDINGS.md](research/FINDINGS.md).

## Two things the measurements pinned down

**The checkerboard has to be exactly 1x1 pixels.** A single output pixel averages an
`R x R` block of source pixels, so that block must contain a whole number of checkerboard
periods for the average to land on 0.5. A 2px cell would need a 3600px upload, and a 3px
cell would need 5760px, which is past the 4096px cap X enforces.

**The upload needs a long side of at least 2400px.** The timeline is served a variant of at
most 1200px, so anything smaller than 2400px gives a downscale ratio under 2, and the
checkerboard breaks into visible speckle instead of vanishing. On the reference post the
ratio was 2.03 and 0.10% of the hidden region leaked through; at ratio 1.19 the same file
leaked 66%.

## Development

```bash
npm install
npm run dev
```

## Research scripts

The scripts under `research/` reproduce every number in `FINDINGS.md`. They need `numpy`
and `Pillow`.

```bash
# fetch the reference post's variants (media id from research/FINDINGS.md)
mkdir -p research/variants
for n in thumb small medium large 4096x4096 orig; do
  curl -s "https://pbs.twimg.com/media/HOEUIPRbMAAuSY0?format=png&name=$n" \
    -o "research/variants/$n.png"
done

python3 research/png_chunks.py research/variants/orig.png   # palette and tRNS structure
python3 research/alpha.py                                    # checkerboard geometry
python3 research/transfer.py                                 # alpha threshold
python3 research/variants_analysis.py                        # which variants hide cleanly
python3 research/cellsize.py                                 # why the cell must be 1px

npx tsx research/verify_engine.mts                           # run the real encoder in node
```

## Layout

```
src/lib/png8.ts       PNG8 encoder: IHDR, PLTE, tRNS, zlib IDAT
src/lib/quantize.ts   median cut and nearest-palette lookup
src/lib/mask.ts       masks, checkerboard composition, brightness compensation
src/lib/pipeline.ts   full encode path and the platform limits
src/lib/simulate.ts   model of X's variant pipeline, used for the live previews
src/components/       the editor UI
research/             measurement scripts and findings
```
