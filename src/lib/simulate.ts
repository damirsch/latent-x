/**
 * Model of X's image variant pipeline, derived by measuring a real post
 * (see research/FINDINGS.md).
 *
 * Two steps matter:
 *   1. The image is box-downscaled to the variant's long side.
 *   2. It is re-encoded as PNG8 with strictly binary alpha, so the resampled alpha is
 *      thresholded. The cut was measured to sit between 0.55 and 0.60 coverage.
 *
 * Step 2 is the whole trick. A 1:1 checkerboard resamples to exactly 0.50 coverage, lands
 * under the threshold, and the region turns fully transparent rather than merely faint.
 */

export const ALPHA_THRESHOLD = 0.575

/** Long side in pixels of each variant X serves. */
export const VARIANTS = {
	thumb: 150,
	small: 680,
	medium: 1200,
	large: 2048,
	orig: Infinity,
} as const

export type VariantName = keyof typeof VARIANTS

export interface Rgba {
	width: number
	height: number
	data: Uint8ClampedArray
}

/**
 * Downscales with a box filter and then binarises alpha, exactly as X does.
 *
 * Colour is averaged in premultiplied space so that fully transparent pixels contribute
 * nothing to the result. That detail matters: with straight (non-premultiplied) averaging
 * the colour of transparent pixels would bleed into their neighbours, and measurements on
 * the real files show X does not do that.
 */
export function simulateVariant(src: Rgba, targetLongSide: number, binarize = true): Rgba {
	const longSide = Math.max(src.width, src.height)
	if (!Number.isFinite(targetLongSide) || targetLongSide >= longSide) {
		return { width: src.width, height: src.height, data: new Uint8ClampedArray(src.data) }
	}

	const scale = targetLongSide / longSide
	const ow = Math.max(1, Math.round(src.width * scale))
	const oh = Math.max(1, Math.round(src.height * scale))

	// Integral images over premultiplied colour and alpha make each output pixel O(1).
	const w = src.width
	const h = src.height
	const stride = w + 1
	const sumR = new Float64Array(stride * (h + 1))
	const sumG = new Float64Array(stride * (h + 1))
	const sumB = new Float64Array(stride * (h + 1))
	const sumA = new Float64Array(stride * (h + 1))

	for (let y = 0; y < h; y++) {
		let rowR = 0
		let rowG = 0
		let rowB = 0
		let rowA = 0
		const above = y * stride
		const cur = (y + 1) * stride
		for (let x = 0; x < w; x++) {
			const i = (y * w + x) * 4
			const a = src.data[i + 3] / 255
			rowR += src.data[i] * a
			rowG += src.data[i + 1] * a
			rowB += src.data[i + 2] * a
			rowA += a
			sumR[cur + x + 1] = sumR[above + x + 1] + rowR
			sumG[cur + x + 1] = sumG[above + x + 1] + rowG
			sumB[cur + x + 1] = sumB[above + x + 1] + rowB
			sumA[cur + x + 1] = sumA[above + x + 1] + rowA
		}
	}

	const rect = (s: Float64Array, x0: number, y0: number, x1: number, y1: number) =>
		s[y1 * stride + x1] - s[y0 * stride + x1] - s[y1 * stride + x0] + s[y0 * stride + x0]

	const out = new Uint8ClampedArray(ow * oh * 4)
	for (let oy = 0; oy < oh; oy++) {
		const y0 = Math.round((oy * h) / oh)
		const y1 = Math.max(y0 + 1, Math.round(((oy + 1) * h) / oh))
		for (let ox = 0; ox < ow; ox++) {
			const x0 = Math.round((ox * w) / ow)
			const x1 = Math.max(x0 + 1, Math.round(((ox + 1) * w) / ow))
			const area = (y1 - y0) * (x1 - x0)

			const aSum = rect(sumA, x0, y0, x1, y1)
			const coverage = aSum / area
			const o = (oy * ow + ox) * 4

			// X binarises alpha; a browser scaling the original for display does not, so the
			// same resampler serves both cases with the threshold switched off.
			if (binarize ? coverage > ALPHA_THRESHOLD : aSum > 0) {
				out[o] = rect(sumR, x0, y0, x1, y1) / aSum
				out[o + 1] = rect(sumG, x0, y0, x1, y1) / aSum
				out[o + 2] = rect(sumB, x0, y0, x1, y1) / aSum
				out[o + 3] = binarize ? 255 : Math.round(coverage * 255)
			} else {
				out[o + 3] = 0
			}
		}
	}

	return { width: ow, height: oh, data: out }
}

/** Flattens an RGBA buffer onto a solid background, the way a viewer would show it. */
export function compositeOver(src: Rgba, bg: [number, number, number]): ImageData {
	const out = new Uint8ClampedArray(src.data.length)
	for (let i = 0; i < src.data.length; i += 4) {
		const a = src.data[i + 3] / 255
		out[i] = src.data[i] * a + bg[0] * (1 - a)
		out[i + 1] = src.data[i + 1] * a + bg[1] * (1 - a)
		out[i + 2] = src.data[i + 2] * a + bg[2] * (1 - a)
		out[i + 3] = 255
	}
	return new ImageData(out, src.width, src.height)
}

export interface CoverageStats {
	/** Fraction of preview pixels that stay opaque inside the region meant to be hidden. */
	leakage: number
	/** How speckled the hidden region is. Near 0 means a clean vanish. */
	speckle: number
}

/** Measures whether the hidden region actually disappears at a given variant size. */
export function measureHiding(preview: Rgba, hiddenMaskAtPreview: Uint8Array): CoverageStats {
	let hidden = 0
	let opaque = 0
	for (let p = 0; p < hiddenMaskAtPreview.length; p++) {
		if (!hiddenMaskAtPreview[p]) continue
		hidden++
		if (preview.data[p * 4 + 3] > 0) opaque++
	}
	if (!hidden) return { leakage: 0, speckle: 0 }

	const { width: w, height: h } = preview
	let isolated = 0
	let transparent = 0
	for (let y = 1; y < h - 1; y++) {
		for (let x = 1; x < w - 1; x++) {
			const p = y * w + x
			if (!hiddenMaskAtPreview[p] || preview.data[p * 4 + 3] > 0) continue
			transparent++
			const n =
				(preview.data[(p - w) * 4 + 3] > 0 ? 1 : 0) +
				(preview.data[(p + w) * 4 + 3] > 0 ? 1 : 0) +
				(preview.data[(p - 1) * 4 + 3] > 0 ? 1 : 0) +
				(preview.data[(p + 1) * 4 + 3] > 0 ? 1 : 0)
			if (n >= 3) isolated++
		}
	}

	return {
		leakage: opaque / hidden,
		speckle: transparent ? isolated / transparent : 0,
	}
}
