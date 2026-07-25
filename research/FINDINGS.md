# How the X "press and hold" image trick actually works

Measured from a real post: https://x.com/jm7Jimin/status/2080881842488820214
Media id `HODHACWbYAAXT5R`. All numbers below are reproducible with the scripts in this
folder.

The sample files are not committed. Fetch them first:

```bash
mkdir -p research/variants
for n in thumb small medium large 4096x4096 orig; do
  curl -s "https://pbs.twimg.com/media/HODHACWbYAAXT5R?format=png&name=$n" \
    -o "research/variants/$n.png"
done
```

## Summary

Every public explanation says the trick depends on X showing images against a white
background in the timeline and a black background in the fullscreen viewer. That is a
different, older technique, and it is **not** what the current viral posts do.

The real mechanism is a **quantisation artefact in X's thumbnail pipeline**:

1. The uploaded PNG is a palette image (PNG8) with **binary** alpha. The region meant to
   stay hidden is covered by a 1:1 checkerboard: every other pixel is fully transparent.
2. To build a preview variant, X downscales the image. In the checkerboard region the
   resampled alpha lands near 50%.
3. X re-encodes every variant as PNG8 with **binary** alpha again — a single fully
   transparent palette index, no partial alpha anywhere. The ~50% alpha therefore has to be
   rounded, and it rounds **down to fully transparent**.
4. Result: the checkerboarded region does not become faint in the timeline. It disappears
   completely. Only the fully opaque region survives.
5. Loading the original brings back the untouched checkerboard, and the hidden artwork
   appears.

Because the hidden region is *fully* transparent rather than partially transparent, it
simply takes on whatever background it is placed on. **The trick works in light mode and
dark mode equally well**, which is the clearest way to tell it apart from the older
background-algebra technique.

## Measurement 1: file structure

`research/png_chunks.py`

| | `orig` (uploaded) | `medium` (timeline) |
|---|---|---|
| Colour type | 3 (indexed) | 3 (indexed) |
| Bit depth | 8 | 8 |
| `PLTE` entries | 255 | 255 |
| `tRNS` length | 255 | 255 |
| Alpha values present | `{0, 255}` | `{0, 255}` |
| Fully transparent indices | 1 | 1 |
| RGB of that index | `(0, 0, 0)` | `(0, 0, 0)` |

There is no partial alpha and no hidden colour data in the transparent palette entry. The
entire effect is carried by *which* pixels are transparent, not by their colour.

## Measurement 2: the checkerboard

`research/alpha.py`

In `orig` (1376x2432), 46.75% of pixels are transparent. Split by the parity of `(x + y)`:

- parity 0: **0.00%** transparent
- parity 1: **93.49%** transparent

All transparent pixels sit on a single sublattice. So 93.5% of the image area is
checkerboarded (the hidden region) and 6.5% is left fully opaque (the part visible in the
feed). Within the hidden region exactly every second pixel is dropped.

This is also visible by eye: magnify any of these images and the hidden area is a regular
one-pixel grid, not a smooth translucent wash. That grid is the thing that gives the
mechanism away, since it only makes sense if you expect the image to be downscaled.

## Measurement 3: the alpha transfer function

`research/transfer.py` maps each preview pixel back to its source footprint and compares
the local opacity coverage against the preview's alpha.

| Source coverage | P(opaque in preview) |
|---|---|
| 0.40 - 0.45 | 0.007 |
| 0.50 - 0.55 | 0.005 |
| 0.55 - 0.60 | 0.004 |
| 0.60 - 0.70 | 0.984 |
| 0.70 - 0.80 | 0.999 |
| 0.99 - 1.00 | 1.000 |

A hard threshold with nothing in between. The cut sits between **0.55 and 0.60** coverage.
A 1:1 checkerboard gives exactly 0.50, comfortably below it. Solid areas give 1.00.

## Measurement 4: which size variants the trick survives

`research/variants_analysis.py`. X exposes fixed variants; the ratio is
`orig_long_side / variant_long_side`.

| Variant | Size | Ratio | Transparent | Isolated transparent px | Result |
|---|---|---|---|---|---|
| `orig` | 1376x2432 | 1.00 | 46.8% | - | checkerboard intact |
| `large` | 1159x2048 | 1.19 | 48.3% | 78.0% | **breaks into speckle** |
| `medium` | 679x1200 | 2.03 | 92.9% | 0.13% | clean transparency |
| `small` | 385x680 | 3.57 | 92.6% | 0.22% | clean transparency |
| `thumb` | 150x150 | cropped square | 87.5% | 0.70% | clean transparency |

This is the practical rule nobody states: **the downscale ratio has to be at least ~2**.
At ratio 1.19 each output pixel covers only ~1.4 source pixels, so coverage varies wildly
from pixel to pixel and the region turns into noise instead of vanishing. At ratio >= 2
every output pixel averages the checkerboard evenly and lands on 0.5.

Since the timeline uses `small` (680) or `medium` (1200), the uploaded image should have a
long side of **at least 2400px**.

## Measurement 5: why the checkerboard has to be 1x1 pixels

`research/cellsize.py` simulates the pipeline (box downscale, then threshold at 0.575) for
checkerboards with different cell sizes, and finds the smallest downscale ratio at which
the region vanishes cleanly.

| Cell | Minimum ratio | Required upload long side |
|---|---|---|
| **1px** | 2.00 | 2400px |
| 2px | 3.00 | 3600px |
| 3px | 4.80 | 5760px - impossible, X caps uploads at 4096px |
| 4px | 5.70 | 6840px - impossible |
| 6px | 8.55 | 10260px - impossible |
| 8px | 11.95 | 14340px - impossible |

A single output pixel averages an `R x R` block of source pixels. For the average to always
land on exactly 0.5, that block has to contain a whole number of checkerboard periods. With
1px cells the period is 2px, so a 2x2 block already suffices: two opaque, two transparent.
With 4px cells the period is 8px and a 2x2 block falls entirely inside one cell, so coverage
is either 0 or 1, the threshold fires at random, and the region turns into coarse mosaic
noise instead of disappearing.

The coverage standard deviation makes the same point: at cell 1px / ratio 2.03 it is 0.002
(every preview pixel identical), at cell 4px / ratio 2.03 it is 0.373 (pure noise).

Given X's 4096px upload cap, **1x1 is the only cell size that is comfortably usable**. It is
not an aesthetic choice, it is the only one that fits inside the platform's constraints.

## Measurement 6: the usable size is a window, not a minimum

The variant table above suggests a tempting idea: upload at 4096px so that `large` is also
a 2x downscale, keep the art hidden even when the image is opened, and make the reveal
depend on the explicit press-and-hold. We built that as an option and it does not work.

Posting a 4096px file and checking it on a phone, the hidden region stayed transparent both
when the image was opened *and* after pressing and holding. On desktop the same file
revealed correctly on open.

The straightforward reading is that the mobile press-and-hold does not fetch the true
original; it stops at `large` (2048px). At a 4096px upload the ratio to `large` is exactly
2.0, so the checkerboard averages cleanly there as well and there is simply nothing left to
reveal on a phone. Desktop does fetch the original, which is why it behaved differently.

That turns the size requirement into a two-sided window:

| Bound | Comes from | Value |
|---|---|---|
| Lower | ratio to `medium` (1200) must be >= 2, or the feed speckles | 2400px |
| Upper | ratio to `large` (2048) must be < 2, or nothing ever reveals on mobile | 4096px |

The reference post sits at 2432px, just inside the lower edge. The tool targets 2560px and
no longer offers a choice, because every value outside this window breaks one end or the
other.

Caveat: the upper bound rests on a single hands-on test rather than a sweep, and the exact
variant the mobile gesture requests was inferred from the behaviour rather than observed on
the wire. The lower bound is measured directly and holds independently.

## Constraints for generated files

Measured here:

- PNG8, colour type 3, `tRNS` with a single fully transparent index. Partial alpha is
  destroyed by X's re-encode, so writing it is pointless.
- Palette must fit 256 entries total, including the transparent one.
- Upload long side of at least 2400px, or the checkerboard speckles instead of vanishing.

Taken from other sources, not verified here:

- The 5MB ceiling above which X re-encodes to JPEG, and the 4096px upload cap, both come
  from David Buchanan's write-up of `tweetable-polyglot-png`.
- The claim that posting from the mobile apps re-encodes the upload and kills the effect is
  widely repeated but we have not tested it. Desktop is the safer route either way.

Certain from first principles:

- Never re-save or screenshot the exported file. Any round trip through another encoder
  drops either the palette or the alpha.
