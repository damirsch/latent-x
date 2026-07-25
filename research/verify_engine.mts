/**
 * Runs the real encoding pipeline outside the browser and checks that the file it
 * produces has the same structure as the PNG X served for the reference post.
 *
 * Usage: npx tsx research/verify_engine.ts
 */
import { readFileSync, writeFileSync } from "node:fs"
import { encodeLatentPng } from "../src/lib/pipeline"
import { inspectPng } from "../src/lib/png8"
import { measureHiding, simulateVariant, VARIANTS } from "../src/lib/simulate"

const meta = JSON.parse(readFileSync("research/test_rgba.json", "utf8"))
const raw = new Uint8ClampedArray(readFileSync("research/test_rgba.bin"))
const { width, height } = meta
const src = { width, height, data: raw }

// Keep an ellipse in the middle visible, hide everything else.
const visible = new Uint8Array(width * height)
const cx = width / 2
const cy = height / 2
const rx = width * 0.18
const ry = height * 0.3
for (let y = 0, p = 0; y < height; y++) {
	for (let x = 0; x < width; x++, p++) {
		const dx = (x - cx) / rx
		const dy = (y - cy) / ry
		visible[p] = dx * dx + dy * dy <= 1 ? 1 : 0
	}
}

const started = Date.now()
const result = await encodeLatentPng(src, visible, { dither: true, maxColors: 255 })
console.log(`encoded in ${Date.now() - started}ms`)
console.log(`  ${result.width}x${result.height}`)
console.log(`  palette colours: ${result.colorCount}`)
console.log(`  kept pixels:     ${(result.keptFraction * 100).toFixed(2)}%`)
console.log(
	`  file size:       ${(result.bytes.length / 1024 / 1024).toFixed(2)} MB` +
		(result.bytes.length > 5 * 1024 * 1024 ? "   OVER THE 5MB LIMIT" : "   under the 5MB limit")
)

writeFileSync("research/out/generated.png", result.bytes)

const info = inspectPng(result.bytes)
console.log("\nstructure of our output:", info)

const reference = inspectPng(new Uint8Array(readFileSync("research/variants/orig.png")))
console.log("structure of X's file:  ", reference)

// Now push our own file through the model of X's pipeline and see if the region vanishes.
const alpha = new Uint8ClampedArray(width * height * 4)
for (let p = 0; p < width * height; p++) {
	const kept = visible[p] === 1 || ((p % width) + Math.floor(p / width)) % 2 === 0
	alpha[p * 4] = raw[p * 4]
	alpha[p * 4 + 1] = raw[p * 4 + 1]
	alpha[p * 4 + 2] = raw[p * 4 + 2]
	alpha[p * 4 + 3] = kept ? 255 : 0
}
const composed = { width, height, data: alpha }

console.log("\nsimulated variants (hidden region should be fully transparent):")
for (const name of ["large", "medium", "small"] as const) {
	const preview = simulateVariant(composed, VARIANTS[name])
	const scale = preview.width / width
	const hiddenAtPreview = new Uint8Array(preview.width * preview.height)
	for (let y = 0; y < preview.height; y++) {
		for (let x = 0; x < preview.width; x++) {
			const sp = Math.min(height - 1, Math.floor(y / scale)) * width + Math.min(width - 1, Math.floor(x / scale))
			hiddenAtPreview[y * preview.width + x] = visible[sp] ? 0 : 1
		}
	}
	const stats = measureHiding(preview, hiddenAtPreview)
	const ratio = Math.max(width, height) / Math.max(preview.width, preview.height)
	console.log(
		`  ${name.padEnd(7)} ${String(preview.width).padStart(5)}x${String(preview.height).padEnd(5)}` +
			` ratio ${ratio.toFixed(2)}  leakage ${(stats.leakage * 100).toFixed(2).padStart(6)}%` +
			`  speckle ${(stats.speckle * 100).toFixed(2).padStart(6)}%`
	)
}
