import type { Rgba } from "./simulate"

/** 1 = stays visible in the feed, 0 = hidden behind the checkerboard. */
export type Mask = Uint8Array

export function emptyMask(width: number, height: number): Mask {
	return new Uint8Array(width * height)
}

export function luminance(r: number, g: number, b: number): number {
	return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export type AutoMode = "dark" | "bright" | "none" | "all"

/**
 * Seeds a mask from image brightness. Keeping the dark parts visible is what produces the
 * classic teaser where only outlines and clothing survive in the timeline.
 */
export function autoMask(src: Rgba, mode: AutoMode, threshold: number): Mask {
	const mask = emptyMask(src.width, src.height)
	if (mode === "none") return mask
	if (mode === "all") return mask.fill(1)

	const cut = threshold * 255
	for (let p = 0; p < mask.length; p++) {
		const i = p * 4
		const l = luminance(src.data[i], src.data[i + 1], src.data[i + 2])
		mask[p] = (mode === "dark" ? l <= cut : l >= cut) ? 1 : 0
	}
	return mask
}

/** Nearest-neighbour rescale. The mask is binary, so interpolation would be wrong. */
export function resampleMask(
	mask: Mask,
	srcW: number,
	srcH: number,
	dstW: number,
	dstH: number
): Mask {
	if (srcW === dstW && srcH === dstH) return mask
	const out = emptyMask(dstW, dstH)
	for (let y = 0; y < dstH; y++) {
		const sy = Math.min(srcH - 1, Math.floor((y * srcH) / dstH))
		for (let x = 0; x < dstW; x++) {
			const sx = Math.min(srcW - 1, Math.floor((x * srcW) / dstW))
			out[y * dstW + x] = mask[sy * srcW + sx]
		}
	}
	return out
}

/**
 * Applies the checkerboard and returns an RGBA buffer with binary alpha.
 *
 * `revealGain` brightens the hidden region. Half of its pixels are dropped, so in the
 * viewer it blends 50/50 with the black backdrop and reads about half as bright as the
 * original; a gain near 2 cancels that out at the cost of clipping the highlights.
 */
export function composeChecker(src: Rgba, mask: Mask, revealGain = 1): Rgba {
	const out = new Uint8ClampedArray(src.data.length)
	for (let y = 0, p = 0; y < src.height; y++) {
		for (let x = 0; x < src.width; x++, p++) {
			const i = p * 4
			const visible = mask[p] === 1
			if (!visible && (x + y) % 2 !== 0) {
				out[i + 3] = 0
				continue
			}
			const gain = visible ? 1 : revealGain
			out[i] = src.data[i] * gain
			out[i + 1] = src.data[i + 1] * gain
			out[i + 2] = src.data[i + 2] * gain
			out[i + 3] = 255
		}
	}
	return { width: src.width, height: src.height, data: out }
}

/** Applies `revealGain` without touching alpha, for the full-resolution export path. */
export function applyGain(src: Rgba, mask: Mask, revealGain: number): Rgba {
	if (revealGain === 1) return src
	const out = new Uint8ClampedArray(src.data)
	for (let p = 0; p < mask.length; p++) {
		if (mask[p] === 1) continue
		const i = p * 4
		out[i] = src.data[i] * revealGain
		out[i + 1] = src.data[i + 1] * revealGain
		out[i + 2] = src.data[i + 2] * revealGain
	}
	return { width: src.width, height: src.height, data: out }
}
