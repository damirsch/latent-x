# How the "press and hold" images on X actually work

There is a format going around on X right now: an image that looks like one thing in the
timeline and turns into something else the moment you open it or press and hold. A glowing
emblem alone on an empty field becomes a full illustration.

I wanted to make these, so I went looking for an explanation, and every write-up I could
find described a different technique than the one these posts actually use. So I took one of
the images apart myself: zoomed in until I noticed something none of the articles mentioned,
formed a theory about it, and posted test files until the theory stopped being wrong.

If you just want to make one: **[the tool is here](https://latent-x.vercel.app/)**. It runs
entirely in your browser and nothing gets uploaded.

## The explanation everyone gives, and what it costs

The technique you will find documented, in English and in Japanese, is about background
colours. X shows images against white in the timeline and against black in the fullscreen
viewer. So you build a semi-transparent PNG where every pixel is solved for both outcomes at
once:

```
seen on white = colour × α + white × (1 − α)
seen on black = colour × α + black × (1 − α)
```

Two equations, two unknowns. Solve them and each pixel's colour and transparency fall out.

This is real and it works. But look at what it assumes. The file is solved for two specific
backgrounds, so change either one and the arithmetic no longer holds. Put that same file on
an arbitrary background and what you see is `seen on black + bg × (1 − α)`. On black you get
the hidden picture, on white you get the cover picture, and on the dark grey of dark mode you
get something very close to the hidden picture — showing up in the timeline, where the cover
was supposed to be. Nothing is left to reveal. The people who documented the technique say so
directly: light mode only.

There is a second cost. Transparency cannot go above fully opaque, which forces the cover
image to be at least as bright as the hidden one at every single pixel. That is why every
example of this technique is a black line drawing paired with a white one.

Both of those bothered me, because the posts going viral right now work fine in dark mode and
they are full-colour renders. Whatever they are doing, it is not this.

## The clue is visible if you just zoom in

Download one of these images and magnify it. The hidden part is not a smooth translucent
wash, which is what the arithmetic above would produce. It is a grid: one pixel of picture,
one fully transparent pixel, alternating in both directions, all the way across.

That reframes the problem. Nobody would draw a one-pixel grid to make a colour illusion. You
would draw it if you expected the image to be **shrunk** — because shrinking averages
neighbouring pixels, and a grid like that is built to land on a particular average.

So the question was never how the pixels get composited against a background. It was what
happens to them on the way through X's resizer.

## What is actually in the file

The reference I worked from is [this post](https://x.com/jm7Jimin/status/2080881842488820214).
I pulled the original and every preview size X exposes, and looked at the bytes.

Both the original and the timeline version are 8-bit palette PNGs, and in both of them every
pixel is either fully opaque or fully transparent. Nothing is half-visible anywhere. That
alone rules out the technique above, which lives entirely in the in-between values.

So the effect comes from *which* pixels are transparent — and here the grid shows up in the
data. Sort the transparent pixels by whether `x + y` is even or odd and the split is
absolute: **every single one of them lands on the same side, and not one on the other.**
They sit on one half of a checkerboard and never on the other half. That checkerboard covers
all but a small fraction of the picture, and inside it exactly every second pixel has been
deleted. The remainder — the emblem you see in the timeline — is left completely solid.

## What X does to it

X does not serve your upload in the timeline. It serves a smaller variant, from a handful of
fixed sizes; the two that matter here are 1200px and 2048px.

Pull the 1200px one and the hidden region has gone from half transparent to **entirely
transparent**. Not faint. Gone.

The reason is that palette. Building a variant means shrinking the image, and shrinking
averages the transparency of neighbouring pixels, which across a checkerboard comes out at
half. But X then re-encodes the result the same way it received it: a palette PNG with one
transparent entry and no in-between values. There is nowhere to put a half. It has to round.

I measured where it rounds, by working out for each preview pixel how much of its source area
had been opaque and comparing that against whether it survived. The result is a hard step
with nothing on either side of it: a checkerboard's half coverage rounds down to fully
transparent, solid areas round up to fully opaque, and no pixel lands anywhere in between.

That is the whole trick. An image gets shrunk, its transparency gets rounded to on-or-off,
and a one-pixel checkerboard is built to sit just below where the rounding falls.

![The same file in four places](../public/figures/states.png)

Every post of this kind I pulled apart had the same structure and the same rounding
behaviour, so this is not one person's quirk of export settings.

## Why this one survives dark mode

Because the hidden region does not end up partly transparent. It ends up *entirely*
transparent, so it is not blended with anything — it just shows whatever is behind it. White
in light mode, dark grey in dark mode, and in both cases indistinguishable from the
surrounding background.

The background stops being part of the mechanism at all. That is the practical difference
between this and the older technique, and it is why these posts work for everyone.

Here is the transparency itself, magnified, with transparent pixels marked in magenta — the
original, the 2048px variant, and the 1200px variant:

![Alpha structure at three sizes](../public/figures/alpha-zoom.png)

The middle panel is the interesting one. That variant is barely smaller than the original,
which is not enough to average the checkerboard evenly, so the rounding fires almost at
random and the region breaks into speckle instead of disappearing. Two of the constraints
below come straight out of that failure mode.

## The checkerboard has to be exactly one pixel

Each pixel of a variant averages a block of source pixels — a 2×2 block when the image is
halved. For that average to reliably come out at a half, the block has to contain a whole
number of checkerboard squares.

With one-pixel squares it always does: any 2×2 block holds two opaque pixels and two
transparent ones. With four-pixel squares, a 2×2 block falls entirely inside a single square,
so coverage is either none or all, the rounding fires arbitrarily, and the region turns into
coarse mosaic noise.

Bigger squares can be rescued by shrinking harder, but the requirement climbs steeply — a
two-pixel square already needs the image to be shrunk threefold — and X caps uploads at
4096px, so anything above two pixels would need a file that does not fit. One pixel is
effectively the only square size available, which is why every one of these posts uses it.

![What happens at 1px, 2px and 4px cells](../public/figures/cell-size.png)

## The upload size is a window, not a minimum

The lower bound follows from all of the above. The timeline is served a variant of at most
1200px, and the checkerboard needs the image halved to average cleanly, so the upload needs a
long side of at least 2400px. Below that the timeline shows speckle instead of nothing.

There is an upper bound too, and I only found it by getting it wrong.

An idea suggests itself: upload at 4096px, so that the 2048px variant is a halving as well.
Then the picture stays hidden even when someone opens it, and appears only if they explicitly
load the original — a purer version of the trick. I built it as an option in the tool.

It does not work. Posted at 4096px, the hidden region stayed transparent on a phone both when
the image was opened and after pressing and holding. The same file revealed correctly on
desktop.

The straightforward reading is that the mobile press-and-hold never fetches the true
original — it stops at the 2048px variant. At a 4096px upload, that variant hides the picture
just as thoroughly as the timeline does, so on a phone there is nothing left to reveal at any
point. Desktop does fetch the original, which is why it behaved differently.

So the requirement has two sides. At least 2400px, or the timeline speckles instead of going
clean. Under 4096px, or the variant the reveal actually loads hides the picture too. The
reference post sits at 2432px, right at the lower edge.

To be clear about the evidence: the lower bound is measured directly and repeatedly. The
upper bound rests on one hands-on test, and the claim about which variant the mobile gesture
requests is inferred from the behaviour rather than observed on the wire.

## Making one

The requirements, all of which the tool handles:

- A palette PNG with one transparent entry and no partial transparency. Partial transparency
  is destroyed by the re-encode, so writing it accomplishes nothing.
- A one-pixel checkerboard over everything you want hidden, solid pixels everywhere else.
- Long side between 2400px and 4096px.
- Under 5MB, above which X converts the upload to a format with no transparency. (This limit
  and the 4096px cap come from David Buchanan's
  [tweetable-polyglot-png](https://github.com/DavidBuchanan314/tweetable-polyglot-png)
  write-up; I did not verify them independently.)
- Post the file exactly as exported. Any screenshot or re-save through another app drops
  either the palette or the transparency. Desktop upload is the safer route.

One thing worth knowing that no tool mentions: the revealed region keeps only every second
pixel, so against the viewer's dark background it reads at roughly half brightness. If your
reveal looks muddier than the source, that is why. Brightening the hidden region before
encoding compensates for it, at the cost of clipping highlights.

## Reproducing this

None of this came from documentation. X publishes nothing about how it builds previews, and
the write-ups that exist describe a different technique. It was reverse engineered: zoom in,
notice the grid, work out why a grid would be there at all, then post test files and measure
what comes back until the theory either holds or breaks. The 4096px idea is one that broke,
and it is written up rather than quietly dropped, because that failure is what pinned down
the upper bound.

The measurements behind every claim here are scripts in
[the repository](https://github.com/damirsch/latent-x) under `research/`. They fetch the
reference post's variants and recompute the palette structure, the checkerboard geometry, the
rounding threshold, the per-variant behaviour and the square-size limits. The encoder can
also be run outside the browser to confirm its output has the same structure as the file X
serves.

If you find a case where this breaks, I would like to know.
