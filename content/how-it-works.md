# How the "press and hold" images on X actually work

There is a format going around on X right now: an image that looks like one thing in the
timeline, and turns into something else the moment you open it or press and hold. A face
alone on a white field becomes a full illustration. Floating clothes acquire the person
wearing them.

I wanted to make these, so I went looking for an explanation, and every write-up I could
find described a different technique than the one the current posts actually use. So I took
one of the images apart myself: zoomed in until I noticed something none of the articles
mentioned, guessed at a mechanism, and then posted test files until the guesses stopped
being wrong. What follows is the result of that, with the numbers behind it.

If you just want to make one: **[the tool is here](https://github.com/damirsch/latent-x)**.
It runs entirely in your browser and nothing gets uploaded.

## What everyone says, and why it is not this

The explanation you will find, in English and in Japanese, is about background colours. X
shows images on a white background in the timeline and a black background in the fullscreen
viewer. So you build a semi-transparent PNG where each pixel is solved for two outcomes at
once. Given a target appearance on white and a target appearance on black, the alpha and
the colour of every pixel fall out of two equations:

```
white_view = colour × α + 255 × (1 − α)
black_view = colour × α +   0 × (1 − α)
```

Solve them and you get `α = (255 − white_view + black_view) / 255` and
`colour = black_view / α`. It is exact, it is elegant, and it genuinely works.

It also has three problems. It requires `black_view ≤ white_view` at every single pixel,
since alpha cannot exceed 1, so the hidden image has to be uniformly darker than the cover
image — which is why every example you see is a black line drawing paired with a white one.
It produces partial alpha everywhere. And it dies completely in dark mode, because the
premise is that the timeline background is white.

That last point is what made me suspicious. The posts going viral right now work in dark
mode. If the mechanism were background arithmetic, they could not.

## The first clue is visible if you just zoom in

Before measuring anything, download one of these images and magnify it. The hidden part is
not a smooth translucent wash, which is what the background-arithmetic technique would
produce. It is a grid: one pixel of picture, then one fully transparent pixel, alternating
in both directions, all the way across.

That was the observation that reframed the problem for me. A regular one-pixel grid is not
something you would design for a colour illusion — it is something that only makes sense if
you expect the image to be *shrunk*. Averaging neighbouring pixels is what shrinking does,
and a grid like that is built to land on a specific average.

So the interesting thing was probably not how the pixels get composited against a
background, but what happens to them on the way through X's resizer.

## What is actually in the file

I took a live post, pulled the original and every preview size X exposes, and looked at the
bytes rather than the pixels.

The reference is [this post](https://x.com/jm7Jimin/status/2080881842488820214), media id
`HODHACWbYAAXT5R`. The original is 1376×2432. Both the original and the timeline version
turn out to be 8-bit palette PNGs with a `tRNS` chunk, and the interesting part is what is
in that chunk:

| | original | timeline version |
|---|---|---|
| Colour type | 3 (palette) | 3 (palette) |
| Palette entries | 255 | 255 |
| Alpha values that occur | `{0, 255}` | `{0, 255}` |
| Fully transparent entries | 1 | 1 |
| Colour of that entry | `(0, 0, 0)` | `(0, 0, 0)` |

There is no partial transparency anywhere. Not a single pixel is half-visible. Every pixel
is either fully opaque or fully gone, in both files.

That immediately rules out the background-arithmetic technique, which depends entirely on
intermediate alpha values.

So the effect comes from *which* pixels are transparent, and this is where the thing you can
see by zooming in shows up in the data. In the original, 46.75% of pixels are transparent.
Split them by whether `(x + y)` is even or odd:

- even: **0.00%** transparent
- odd: **93.49%** transparent

Every single transparent pixel sits on one half of a checkerboard, and not one sits on the
other. So 93.5% of the image area is covered by that checkerboard, with exactly every second
pixel deleted inside it. The remaining 6.5% — the sliver you see in the timeline — is left
completely solid.

## What X does to it

X does not serve your upload in the timeline. It serves a smaller variant, and it exposes
several: 150px, 680px, 1200px, 2048px, and the original. Here is the same file at each
size, and what happened to the hidden region:

| Variant | Size | Downscale ratio | Transparent | Isolated transparent pixels |
|---|---|---|---|---|
| original | 1376×2432 | 1.00 | 46.8% | — |
| 2048px | 1159×2048 | 1.19 | 48.3% | 78.0% |
| 1200px | 679×1200 | 2.03 | 92.9% | 0.13% |
| 680px | 385×680 | 3.58 | 92.6% | 0.22% |
| 150px | 150×150 | cropped square | 87.5% | 0.70% |

Look at the 1200px row. The hidden region went from 50% transparent to **100% transparent**.
93.5% of the area was checkerboarded in the original; 92.9% of the preview is transparent.
The region did not become faint. It ceased to exist.

The reason is in the second column of that first table. When X builds a variant it shrinks
the image, and shrinking averages the alpha of neighbouring pixels — in the checkerboard
that average is 0.5. But X then re-encodes the result as a palette PNG with binary
transparency, exactly like the original. There is nowhere to put a 0.5. It has to round.

I measured where it rounds. For every pixel of the 1200px variant I worked out what
fraction of its source footprint was opaque, and compared that against whether the pixel
survived:

| Source coverage | Probability the pixel stays opaque |
|---|---|
| 0.40 – 0.45 | 0.007 |
| 0.50 – 0.55 | 0.005 |
| 0.55 – 0.60 | 0.004 |
| 0.60 – 0.70 | 0.984 |
| 0.70 – 0.80 | 0.999 |
| 0.99 – 1.00 | 1.000 |

A hard step, with nothing in between. The cut sits between 0.55 and 0.60 coverage. A
checkerboard produces exactly 0.50, which falls under it. Solid areas produce 1.00, which
clears it.

The same structure and the same threshold turned up on every post of this kind I pulled
apart, with the ratios landing on 2.03 each time, so this is not one person's quirk of
export settings.

That is the whole trick. Not a colour illusion, not compression, not the background. An
image is shrunk, its transparency is rounded to on-or-off, and a one-pixel checkerboard is
built to sit just below the rounding threshold.

![The same file in four places](../public/figures/states.png)

And because the hidden region ends up *fully* transparent rather than partially
transparent, it does not blend with anything. It just shows whatever is behind it. White in
light mode, dark grey in dark mode, either way indistinguishable from the background. This
is why the effect survives dark mode when the older technique does not.

Here is the alpha channel itself, magnified, with transparent pixels in magenta:

![Alpha structure at three sizes](../public/figures/alpha-zoom.png)

## The checkerboard has to be exactly one pixel

This is the part I did not expect, and it is the constraint that decides everything else.

Each pixel of a variant averages an `R × R` block of source pixels, where `R` is the
downscale ratio. For that average to reliably land on 0.5, the block has to contain a whole
number of checkerboard periods. With 1px cells the period is 2px, so a 2×2 block already
works: two opaque pixels, two transparent ones, every time.

With 4px cells the period is 8px. A 2×2 block falls entirely inside one cell, so coverage is
either 0 or 1, the threshold fires essentially at random, and instead of vanishing the
region turns into coarse mosaic noise.

I ran the pipeline over a range of cell sizes to find the minimum ratio each one needs:

| Cell | Minimum ratio | Required upload size |
|---|---|---|
| **1px** | 2.00 | 2400px |
| 2px | 3.00 | 3600px |
| 3px | 4.80 | 5760px |
| 4px | 5.70 | 6840px |
| 8px | 11.95 | 14340px |

X caps uploads at 4096px. Everything from 3px up is therefore impossible — the image you
would need does not fit. 2px is technically reachable at 3600px with no margin. In practice
1×1 is the only cell size that works, which is why every one of these posts uses it.

![What happens at 1px, 2px and 4px cells](../public/figures/cell-size.png)

## The upload size is a window, not a minimum

The lower bound follows from the above: the timeline is served a variant of at most 1200px,
so the upload needs a long side of at least 2400px to reach a ratio of 2. Below that the
checkerboard speckles instead of disappearing. The reference post is 2432px, sitting just
inside that edge.

There is also an upper bound, and I only found it by getting it wrong.

Reading the variant table, an obvious idea suggests itself: upload at 4096px, so that the
2048px variant is *also* a 2× downscale. Then the artwork stays hidden even when someone
opens the image, and it only appears if they explicitly load the original. A purer version
of the trick. I built that as an option.

It does not work. Posted at 4096px, the hidden region stayed transparent on a phone both
when the image was opened and after pressing and holding. The same file revealed correctly
on desktop.

The straightforward reading is that the mobile press-and-hold does not fetch the true
original — it stops at the 2048px variant. At a 4096px upload that variant hides the
artwork just as thoroughly as the timeline does, so on a phone there is nothing left to
reveal at any point. Desktop does fetch the original, which is why it behaved differently.

So the requirement is two-sided:

| Bound | Reason | Value |
|---|---|---|
| Lower | ratio to the 1200px variant must be ≥ 2, or the timeline speckles | 2400px |
| Upper | ratio to the 2048px variant must be < 2, or mobile never reveals | 4096px |

I should be clear about the evidence here: the lower bound is measured directly and
repeatedly. The upper bound rests on one hands-on test, and the claim about which variant
the mobile gesture requests is inferred from the behaviour rather than observed on the wire.

## The hypothesis I had before measuring

Worth recording, because it was wrong in an interesting way.

When you shrink an image with transparency there are two ways to average the pixels. In
premultiplied space, each pixel's colour is weighted by its alpha, so fully transparent
pixels contribute nothing. In straight space, colour and alpha are averaged separately, so
the colour stored in a transparent pixel — which is invisible when rendered properly —
leaks into its neighbours. This is a well-known class of bug; libgd, PIL, OpenCV and PHP's
GD have all shipped it at some point.

My theory was that X resized naively, in straight space. That would explain the
observation, reported to me, that the background colour seemed irrelevant: the colour
substitution would be happening inside the file, before any compositing. And it implied
something much stronger than "draw a checkerboard" — if the colour of transparent pixels
influences the preview, you could hide a *second full image* in it. Palette PNGs make that
plausible, since `tRNS` assigns alpha per palette index, so you could keep 128 opaque
colours and 128 fully transparent ones, each with its own RGB.

The first measurement killed it. There is one transparent palette entry and its colour is
plain black. No hidden data, and nothing for a naive resize to leak. The background really
is irrelevant, but for a much simpler reason: the region is not blended at all, it is
absent.

## Making one

The requirements, all of which the tool handles:

- Palette PNG, one fully transparent entry, binary alpha. Partial alpha is destroyed by the
  re-encode, so writing it accomplishes nothing.
- A 1×1 checkerboard over everything you want hidden, solid pixels everywhere else.
- Long side between 2400px and 4096px.
- Under 5MB, above which X converts the upload to a format with no transparency. (This
  limit and the 4096px cap are from David Buchanan's
  [tweetable-polyglot-png](https://github.com/DavidBuchanan314/tweetable-polyglot-png)
  write-up; I did not verify them independently.)
- Post the file exactly as exported. Any screenshot or re-save through another app drops
  either the palette or the alpha. Desktop upload is the safer route.

One thing worth knowing that no tool mentions: the revealed half only keeps every second
pixel, so against the viewer's black background it reads at roughly half brightness. If the
reveal looks muddier than your source, that is why. Brightening the hidden region before
encoding compensates for it, at the cost of clipping highlights.

## Reproducing this

None of the above came from documentation. X publishes nothing about how it builds preview
variants, and the write-ups that exist describe a different technique. Everything here was
reverse-engineered: zoom in on one of these images, notice the one-pixel grid, form a theory
about why the grid would be there, then post test files and measure what comes back until
the theory either holds or breaks. Two of my theories broke along the way, and both are
written up above rather than quietly dropped, because the failures are the part that pins
the mechanism down.

Every number comes from scripts in [the repository](https://github.com/damirsch/latent-x)
under `research/`. They fetch the reference post's variants from the CDN and recompute the
palette structure, the checkerboard geometry, the rounding threshold, the per-variant
behaviour and the cell-size limits. The encoder can also be run outside the browser to check
that its output has the same structure as the file X served.

If you find a case where this breaks, I would like to know.
