/**
 * Median cut colour quantisation.
 *
 * The output palette has to fit 256 entries and index 0 is reserved for the transparent
 * slot, so there are 255 colours to work with. Only pixels that actually survive into the
 * final image contribute to the histogram: the ones the checkerboard drops are invisible
 * and would only pull the palette towards colours nobody ever sees.
 */

const HIST_BITS = 5
const HIST_SIZE = 1 << (HIST_BITS * 3)
const LUT_BITS = 6
const LUT_SIZE = 1 << (LUT_BITS * 3)

interface Box {
	min: [number, number, number]
	max: [number, number, number]
	keys: Int32Array
	count: number
}

function histKey(r: number, g: number, b: number): number {
	const s = 8 - HIST_BITS
	return ((r >> s) << (HIST_BITS * 2)) | ((g >> s) << HIST_BITS) | (b >> s)
}

function keyToRgb(key: number): [number, number, number] {
	const mask = (1 << HIST_BITS) - 1
	const s = 8 - HIST_BITS
	const half = 1 << (s - 1)
	return [
		(((key >> (HIST_BITS * 2)) & mask) << s) + half,
		(((key >> HIST_BITS) & mask) << s) + half,
		((key & mask) << s) + half,
	]
}

function boxBounds(keys: Int32Array, counts: Uint32Array): Box {
	const min: [number, number, number] = [255, 255, 255]
	const max: [number, number, number] = [0, 0, 0]
	let count = 0
	for (let i = 0; i < keys.length; i++) {
		const [r, g, b] = keyToRgb(keys[i])
		if (r < min[0]) min[0] = r
		if (g < min[1]) min[1] = g
		if (b < min[2]) min[2] = b
		if (r > max[0]) max[0] = r
		if (g > max[1]) max[1] = g
		if (b > max[2]) max[2] = b
		count += counts[keys[i]]
	}
	return { min, max, keys, count }
}

/**
 * @param rgba source pixels
 * @param include per-pixel flag: only pixels set to 1 feed the histogram
 * @param maxColors palette size excluding the transparent entry
 */
export function medianCut(rgba: Uint8ClampedArray, include: Uint8Array, maxColors: number) {
	const counts = new Uint32Array(HIST_SIZE)
	for (let p = 0, i = 0; p < include.length; p++, i += 4) {
		if (!include[p]) continue
		counts[histKey(rgba[i], rgba[i + 1], rgba[i + 2])]++
	}

	const present: number[] = []
	for (let k = 0; k < HIST_SIZE; k++) if (counts[k]) present.push(k)
	if (present.length === 0) present.push(0)

	let boxes: Box[] = [boxBounds(Int32Array.from(present), counts)]

	while (boxes.length < maxColors) {
		// Split the box with the largest population that still has room to be divided.
		let target = -1
		let best = 0
		for (let i = 0; i < boxes.length; i++) {
			const b = boxes[i]
			if (b.keys.length < 2) continue
			if (b.count > best) {
				best = b.count
				target = i
			}
		}
		if (target < 0) break

		const box = boxes[target]
		const ranges = [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]]
		const axis = ranges.indexOf(Math.max(...ranges))

		const sorted = Array.from(box.keys).sort((a, b) => keyToRgb(a)[axis] - keyToRgb(b)[axis])

		// Split at the weighted median so both halves carry a similar number of pixels.
		const half = box.count / 2
		let acc = 0
		let cut = 1
		for (let i = 0; i < sorted.length; i++) {
			acc += counts[sorted[i]]
			if (acc >= half) {
				cut = Math.min(Math.max(i, 1), sorted.length - 1)
				break
			}
		}

		boxes.splice(
			target,
			1,
			boxBounds(Int32Array.from(sorted.slice(0, cut)), counts),
			boxBounds(Int32Array.from(sorted.slice(cut)), counts)
		)
	}

	boxes = boxes.filter((b) => b.keys.length > 0)

	// Palette index 0 is the transparent slot; real colours start at 1.
	const palette = new Uint8Array((boxes.length + 1) * 3)
	boxes.forEach((box, i) => {
		let r = 0
		let g = 0
		let b = 0
		let n = 0
		for (const key of box.keys) {
			const c = counts[key]
			const [kr, kg, kb] = keyToRgb(key)
			r += kr * c
			g += kg * c
			b += kb * c
			n += c
		}
		const o = (i + 1) * 3
		palette[o] = n ? Math.round(r / n) : 0
		palette[o + 1] = n ? Math.round(g / n) : 0
		palette[o + 2] = n ? Math.round(b / n) : 0
	})

	return { palette, colorCount: boxes.length }
}

/**
 * Nearest-palette-entry lookup, memoised on a 6-bit-per-channel key. Scanning all 255
 * entries per pixel would be far too slow on a 4096px image, and building the full table
 * eagerly wastes time on colours the image never uses, so entries are filled on demand.
 */
export class PaletteMap {
	private lut = new Int16Array(LUT_SIZE).fill(-1)

	constructor(private palette: Uint8Array) {}

	nearest(r: number, g: number, b: number): number {
		const s = 8 - LUT_BITS
		const key = ((r >> s) << (LUT_BITS * 2)) | ((g >> s) << LUT_BITS) | (b >> s)
		const cached = this.lut[key]
		if (cached >= 0) return cached

		let bestIndex = 1
		let bestDist = Infinity
		// Skip entry 0: it is the transparent slot and its colour is never rendered.
		for (let i = 1; i * 3 < this.palette.length; i++) {
			const o = i * 3
			const dr = r - this.palette[o]
			const dg = g - this.palette[o + 1]
			const db = b - this.palette[o + 2]
			// Weighted to roughly match perceived brightness rather than raw RGB distance.
			const d = dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114
			if (d < bestDist) {
				bestDist = d
				bestIndex = i
			}
		}
		this.lut[key] = bestIndex
		return bestIndex
	}

	color(index: number): [number, number, number] {
		const o = index * 3
		return [this.palette[o], this.palette[o + 1], this.palette[o + 2]]
	}
}
