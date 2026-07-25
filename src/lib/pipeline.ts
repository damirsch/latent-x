import { encodePng8, TRANSPARENT_INDEX } from "./png8"
import { medianCut, PaletteMap } from "./quantize"
import { VARIANTS, type Rgba } from "./simulate"

/** X refuses anything larger and will resize it for you, destroying the pixel grid. */
export const MAX_UPLOAD_SIDE = 4096
/** Above this X re-encodes to JPEG and every trace of transparency is gone. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024

/**
 * The timeline is served the `medium` variant at most, so the upload has to be at least
 * twice that for a 1:1 checkerboard to average out to exactly 0.5 coverage everywhere.
 */
export const MIN_SIDE_FOR_FEED = VARIANTS.medium * 2

/**
 * At this size even the `large` variant is a 2x downscale, so the artwork stays hidden
 * when the image is merely opened and only appears once the viewer loads the original.
 */
export const MIN_SIDE_FOR_VIEWER = VARIANTS.large * 2

export type RevealMode = "open" | "fourk"

export const REVEAL_TARGETS: Record<RevealMode, number> = {
	open: MIN_SIDE_FOR_FEED,
	fourk: Math.min(MIN_SIDE_FOR_VIEWER, MAX_UPLOAD_SIDE),
}

/**
 * True where the pixel survives into the visible image.
 *
 * Inside the masked (visible) region everything is kept. Everywhere else a 1:1
 * checkerboard drops every second pixel. Cell size is fixed at one pixel on purpose:
 * measurements show a 2px cell would need a 3600px upload and 3px is impossible inside
 * X's 4096px cap.
 */
export function isKept(x: number, y: number, visible: boolean): boolean {
	return visible || (x + y) % 2 === 0
}

export function buildAlpha(width: number, height: number, visibleMask: Uint8Array): Uint8Array {
	const keep = new Uint8Array(width * height)
	for (let y = 0, p = 0; y < height; y++) {
		for (let x = 0; x < width; x++, p++) {
			keep[p] = isKept(x, y, visibleMask[p] === 1) ? 1 : 0
		}
	}
	return keep
}

export interface EncodeOptions {
	dither: boolean
	maxColors: number
}

export interface EncodeResult {
	bytes: Uint8Array
	width: number
	height: number
	colorCount: number
	keptFraction: number
}

/**
 * Turns a working-resolution image plus a visibility mask into the PNG8 that gets posted.
 */
export async function encodeLatentPng(
	src: Rgba,
	visibleMask: Uint8Array,
	options: EncodeOptions
): Promise<EncodeResult> {
	const { width, height } = src
	const keep = buildAlpha(width, height, visibleMask)
	const { palette, colorCount } = medianCut(src.data, keep, Math.min(options.maxColors, 255))
	const map = new PaletteMap(palette)
	const indices = new Uint8Array(width * height)

	if (options.dither) {
		// Floyd-Steinberg, but error is only diffused between pixels that survive. Pushing
		// error into a dropped pixel would leak it into a colour nobody ever sees.
		const errR = new Float32Array((width + 2) * 2)
		const errG = new Float32Array((width + 2) * 2)
		const errB = new Float32Array((width + 2) * 2)
		let cur = 0

		for (let y = 0; y < height; y++) {
			const next = 1 - cur
			errR.fill(0, next * (width + 2), (next + 1) * (width + 2))
			errG.fill(0, next * (width + 2), (next + 1) * (width + 2))
			errB.fill(0, next * (width + 2), (next + 1) * (width + 2))

			for (let x = 0; x < width; x++) {
				const p = y * width + x
				if (!keep[p]) {
					indices[p] = TRANSPARENT_INDEX
					continue
				}
				const i = p * 4
				const e = cur * (width + 2) + x + 1
				const r = clamp8(src.data[i] + errR[e])
				const g = clamp8(src.data[i + 1] + errG[e])
				const b = clamp8(src.data[i + 2] + errB[e])

				const idx = map.nearest(r, g, b)
				indices[p] = idx
				const [pr, pg, pb] = map.color(idx)
				const dr = r - pr
				const dg = g - pg
				const db = b - pb

				spread(errR, errG, errB, cur, next, width, x, dr, dg, db)
			}
			cur = next
		}
	} else {
		for (let p = 0; p < keep.length; p++) {
			if (!keep[p]) {
				indices[p] = TRANSPARENT_INDEX
				continue
			}
			const i = p * 4
			indices[p] = map.nearest(src.data[i], src.data[i + 1], src.data[i + 2])
		}
	}

	const bytes = await encodePng8({ width, height, indices, palette })

	let kept = 0
	for (let p = 0; p < keep.length; p++) kept += keep[p]

	return { bytes, width, height, colorCount, keptFraction: kept / keep.length }
}

function clamp8(v: number): number {
	return v < 0 ? 0 : v > 255 ? 255 : v | 0
}

function spread(
	errR: Float32Array,
	errG: Float32Array,
	errB: Float32Array,
	cur: number,
	next: number,
	width: number,
	x: number,
	dr: number,
	dg: number,
	db: number
) {
	const row = cur * (width + 2)
	const below = next * (width + 2)
	const add = (arr: Float32Array, at: number, f: number) => {
		arr[at] += f
	}
	add(errR, row + x + 2, (dr * 7) / 16)
	add(errG, row + x + 2, (dg * 7) / 16)
	add(errB, row + x + 2, (db * 7) / 16)
	add(errR, below + x, (dr * 3) / 16)
	add(errG, below + x, (dg * 3) / 16)
	add(errB, below + x, (db * 3) / 16)
	add(errR, below + x + 1, (dr * 5) / 16)
	add(errG, below + x + 1, (dg * 5) / 16)
	add(errB, below + x + 1, (db * 5) / 16)
	add(errR, below + x + 2, dr / 16)
	add(errG, below + x + 2, dg / 16)
	add(errB, below + x + 2, db / 16)
}

export interface SizeAdvice {
	target: number
	willUpscale: boolean
	willDownscale: boolean
}

/** Chooses the working resolution for a source image and a chosen reveal style. */
export function planSize(srcW: number, srcH: number, mode: RevealMode): SizeAdvice {
	const longSide = Math.max(srcW, srcH)
	const target = Math.min(REVEAL_TARGETS[mode], MAX_UPLOAD_SIDE)
	return {
		target,
		willUpscale: longSide < target,
		willDownscale: longSide > target,
	}
}
