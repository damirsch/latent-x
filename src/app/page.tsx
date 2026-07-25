import { Studio } from "@/components/Studio"

export default function Page() {
	return (
		<div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
			<header className="mb-8 flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="font-mono text-lg tracking-tight text-ink-100">
						latent<span className="text-amber-glow">.</span>
					</h1>
					<p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-300">
						Make an image that hides part of itself in the X timeline and gives it back when
						someone presses and holds.
					</p>
				</div>
				<p className="max-w-xs text-[11px] leading-relaxed text-ink-400">
					Post the file from a desktop browser. Phone apps are more likely to re-encode an upload
					into a format without transparency, and the effect does not survive that.
				</p>
			</header>

			<Studio />

			<footer className="mt-16 border-t border-ink-800 pt-6 text-[11px] leading-relaxed text-ink-400">
				<p className="mb-2 text-ink-300">Why this works</p>
				<p className="max-w-2xl">
					In the timeline X does not show your picture. It shows a shrunken copy of it. While
					shrinking, it also rebuilds transparency as a plain yes-or-no value per pixel, with
					nothing in between. This tool makes every second pixel of the hidden area transparent,
					which puts that area exactly on the line where the rounding falls to &ldquo;no&rdquo;
					&mdash; so it drops out of the small copy entirely. The original file is untouched, so
					the moment someone loads it at full size, the picture is all there again.
				</p>
			</footer>
		</div>
	)
}
