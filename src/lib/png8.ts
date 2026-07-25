import { zlib } from "fflate"

/**
 * Minimal PNG8 encoder.
 *
 * Writes colour type 3 (indexed) with a `tRNS` chunk. X re-encodes every image it serves
 * into exactly this shape with strictly binary alpha, so anything else (RGBA32, partial
 * alpha) is either flattened to JPEG on upload or thrown away on the way out.
 *
 * The transparent entry always lives at palette index 0, which lets `tRNS` be a single
 * byte: every later index is implicitly opaque.
 */

const CRC_TABLE = (() => {
	const t = new Uint32Array(256)
	for (let n = 0; n < 256; n++) {
		let c = n
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
		t[n] = c >>> 0
	}
	return t
})()

function crc32(bytes: Uint8Array): number {
	let c = 0xffffffff
	for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
	return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array {
	const out = new Uint8Array(12 + data.length)
	const view = new DataView(out.buffer)
	view.setUint32(0, data.length)
	for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
	out.set(data, 8)
	view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
	return out
}

export const TRANSPARENT_INDEX = 0

export interface Png8Input {
	width: number
	height: number
	/** One palette index per pixel. Index 0 means fully transparent. */
	indices: Uint8Array
	/** Flat RGB triplets. Entry 0 is the transparent slot and its colour is never shown. */
	palette: Uint8Array
}

/**
 * Prefixes each scanline with filter type 0. Indexed data gains nothing from the other
 * filters, since neighbouring palette indices have no numeric relationship, and filtering
 * would only make the deflate stream noisier.
 */
function toScanlines(width: number, height: number, indices: Uint8Array): Uint8Array {
	const raw = new Uint8Array(height * (width + 1))
	for (let y = 0; y < height; y++) {
		raw[y * (width + 1)] = 0
		raw.set(indices.subarray(y * width, (y + 1) * width), y * (width + 1) + 1)
	}
	return raw
}

export async function encodePng8(input: Png8Input): Promise<Uint8Array> {
	const { width, height, indices, palette } = input
	const paletteEntries = palette.length / 3
	if (paletteEntries < 1 || paletteEntries > 256) {
		throw new Error(`palette must hold 1-256 entries, got ${paletteEntries}`)
	}

	const ihdr = new Uint8Array(13)
	const ihdrView = new DataView(ihdr.buffer)
	ihdrView.setUint32(0, width)
	ihdrView.setUint32(4, height)
	ihdr[8] = 8 // bit depth
	ihdr[9] = 3 // colour type: indexed
	ihdr[10] = 0 // deflate
	ihdr[11] = 0 // adaptive filtering
	ihdr[12] = 0 // no interlace

	// IDAT carries a zlib stream, not a bare deflate one: it needs the 2-byte header and
	// the trailing adler32 that `zlib` adds and `deflate` does not.
	const compressed = await new Promise<Uint8Array>((resolve, reject) => {
		zlib(toScanlines(width, height, indices), { level: 9 }, (err, data) =>
			err ? reject(err) : resolve(data)
		)
	})

	const parts = [
		new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", ihdr),
		chunk("PLTE", palette),
		chunk("tRNS", new Uint8Array([0])),
		chunk("IDAT", compressed),
		chunk("IEND", new Uint8Array(0)),
	]

	const total = parts.reduce((n, p) => n + p.length, 0)
	const out = new Uint8Array(total)
	let offset = 0
	for (const p of parts) {
		out.set(p, offset)
		offset += p.length
	}
	return out
}

export interface Png8Info {
	width: number
	height: number
	paletteEntries: number
	transparentIndices: number
	alphaValues: number[]
}

/** Reads back a PNG's structure. Used to verify our own output and to inspect X's. */
export function inspectPng(bytes: Uint8Array): Png8Info | null {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	let i = 8
	let width = 0
	let height = 0
	let paletteEntries = 0
	let trns: Uint8Array | null = null

	while (i + 8 <= bytes.length) {
		const len = view.getUint32(i)
		const type = String.fromCharCode(bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7])
		const data = bytes.subarray(i + 8, i + 8 + len)
		if (type === "IHDR") {
			width = view.getUint32(i + 8)
			height = view.getUint32(i + 12)
			if (bytes[i + 8 + 9] !== 3) return null
		} else if (type === "PLTE") {
			paletteEntries = len / 3
		} else if (type === "tRNS") {
			trns = data
		} else if (type === "IEND") {
			break
		}
		i += 12 + len
	}

	const alphaValues = trns ? Array.from(new Set(trns)).sort((a, b) => a - b) : [255]
	return {
		width,
		height,
		paletteEntries,
		transparentIndices: trns ? Array.from(trns).filter((a) => a === 0).length : 0,
		alphaValues,
	}
}
