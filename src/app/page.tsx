import { Studio } from "@/components/Studio"

export default function Page() {
	return (
		<div className='mx-auto px-5 sm:px-8 py-8 sm:py-12 max-w-6xl'>
			<header className='flex flex-wrap justify-between items-end gap-4 mb-8'>
				<div>
					<h1 className='font-mono text-ink-100 text-lg tracking-tight'>
						latent<span className='text-amber-glow'>.</span>
					</h1>
					<p className='mt-1 max-w-xl text-ink-300 text-sm leading-relaxed'>
						Make an image that hides part of itself in the X timeline and gives it back when someone presses and holds.
					</p>
				</div>
			</header>

			<Studio />

			<footer className='mt-16 pt-6 border-ink-800 border-t text-[11px] text-ink-400 leading-relaxed'>
				<p className='mb-2 text-ink-300'>Why this works</p>
				<p className='max-w-2xl'>
					In the timeline X does not show your picture. It shows a shrunken copy of it. While shrinking, it also
					rebuilds transparency as a plain yes-or-no value per pixel, with nothing in between. This tool makes every
					second pixel of the hidden area transparent, which puts that area exactly on the line where the rounding falls
					to &ldquo;no&rdquo; &mdash; so it drops out of the small copy entirely. The original file is untouched, so the
					moment someone loads it at full size, the picture is all there again.
				</p>
			</footer>
		</div>
	)
}
