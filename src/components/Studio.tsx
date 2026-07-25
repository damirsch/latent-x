"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Download, Eraser, ImageUp, Loader2, Paintbrush, RotateCcw } from "lucide-react"

import {
	applyGain,
	autoMask,
	composeChecker,
	emptyMask,
	resampleMask,
	type AutoMode,
	type Mask,
} from "@/lib/mask"
import { encodeLatentPng, MAX_FILE_BYTES, planSize, REVEAL_TARGETS, type RevealMode } from "@/lib/pipeline"
import { compositeOver, simulateVariant, VARIANTS, type Rgba } from "@/lib/simulate"
import { Dropzone } from "./Dropzone"
import { MaskCanvas } from "./MaskCanvas"
import { PreviewPanel } from "./PreviewPanel"
import { Warnings } from "./Warnings"

/** Long side used for the interactive previews. Ratios are preserved, so the simulation
 *  behaves exactly as it would at full resolution, just cheaper. */
const PREVIEW_LONG = 720

const FEED_LIGHT: [number, number, number] = [255, 255, 255]
const FEED_DARK: [number, number, number] = [21, 32, 43]
const VIEWER_BG: [number, number, number] = [0, 0, 0]

function drawToRgba(image: HTMLImageElement, longSide: number): Rgba {
	const scale = longSide / Math.max(image.naturalWidth, image.naturalHeight)
	const w = Math.max(1, Math.round(image.naturalWidth * scale))
	const h = Math.max(1, Math.round(image.naturalHeight * scale))
	const canvas = document.createElement("canvas")
	canvas.width = w
	canvas.height = h
	const ctx = canvas.getContext("2d", { willReadFrequently: true })!
	ctx.imageSmoothingEnabled = true
	ctx.imageSmoothingQuality = "high"
	ctx.drawImage(image, 0, 0, w, h)
	const data = ctx.getImageData(0, 0, w, h)
	return { width: w, height: h, data: data.data }
}

export function Studio() {
	const [image, setImage] = useState<HTMLImageElement | null>(null)
	const [fileName, setFileName] = useState("latent")
	const [revealMode, setRevealMode] = useState<RevealMode>("open")
	const [brushSize, setBrushSize] = useState(90)
	const [erasing, setErasing] = useState(false)
	const [revealGain, setRevealGain] = useState(1)
	const [dither, setDither] = useState(true)
	const [autoThreshold, setAutoThreshold] = useState(0.45)
	const [busy, setBusy] = useState(false)
	const [exported, setExported] = useState<{ size: number; colors: number } | null>(null)
	const [maskVersion, setMaskVersion] = useState(0)

	const workRef = useRef<Rgba | null>(null)
	const maskRef = useRef<Mask | null>(null)

	const workLong = REVEAL_TARGETS[revealMode]

	// Rebuild the working buffer whenever the source or the target resolution changes.
	useEffect(() => {
		if (!image) {
			workRef.current = null
			maskRef.current = null
			return
		}
		const work = drawToRgba(image, workLong)
		const previous = maskRef.current
		const previousWork = workRef.current
		workRef.current = work
		maskRef.current =
			previous && previousWork
				? resampleMask(previous, previousWork.width, previousWork.height, work.width, work.height)
				: emptyMask(work.width, work.height)
		setMaskVersion((v) => v + 1)
	}, [image, workLong])

	const preview = useMemo(() => {
		if (!image) return null
		return drawToRgba(image, PREVIEW_LONG)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [image])

	// Three states of the same file, each rendered through the measured model of X's pipeline.
	const states = useMemo(() => {
		const work = workRef.current
		if (!preview || !work || !maskRef.current) return null
		void maskVersion

		const previewMask = resampleMask(
			maskRef.current,
			work.width,
			work.height,
			preview.width,
			preview.height
		)
		const composed = composeChecker(preview, previewMask, revealGain)
		const previewLong = Math.max(preview.width, preview.height)

		const at = (variantLong: number, binarize: boolean) =>
			simulateVariant(composed, (previewLong * variantLong) / workLong, binarize)

		return {
			feed: at(VARIANTS.medium, true),
			opened: at(VARIANTS.large, true),
			held: composed,
		}
	}, [preview, revealGain, maskVersion, workLong])

	const paint = useCallback((x: number, y: number, radius: number, on: boolean) => {
		const work = workRef.current
		const mask = maskRef.current
		if (!work || !mask) return
		const r2 = radius * radius
		const x0 = Math.max(0, Math.floor(x - radius))
		const x1 = Math.min(work.width - 1, Math.ceil(x + radius))
		const y0 = Math.max(0, Math.floor(y - radius))
		const y1 = Math.min(work.height - 1, Math.ceil(y + radius))
		for (let py = y0; py <= y1; py++) {
			const dy = py - y
			for (let px = x0; px <= x1; px++) {
				const dx = px - x
				if (dx * dx + dy * dy <= r2) mask[py * work.width + px] = on ? 1 : 0
			}
		}
	}, [])

	const applyAuto = useCallback(
		(mode: AutoMode) => {
			const work = workRef.current
			if (!work) return
			maskRef.current = autoMask(work, mode, autoThreshold)
			setMaskVersion((v) => v + 1)
		},
		[autoThreshold]
	)

	const handleExport = useCallback(async () => {
		const work = workRef.current
		const mask = maskRef.current
		if (!work || !mask) return
		setBusy(true)
		setExported(null)
		try {
			// Yield once so the spinner paints before the main thread is tied up.
			await new Promise((r) => setTimeout(r, 16))
			const source = applyGain(work, mask, revealGain)
			const result = await encodeLatentPng(source, mask, { dither, maxColors: 255 })
			const blob = new Blob([result.bytes as unknown as BlobPart], { type: "image/png" })
			const url = URL.createObjectURL(blob)
			const a = document.createElement("a")
			a.href = url
			a.download = `${fileName.replace(/\.[^.]+$/, "")}-latent.png`
			a.click()
			URL.revokeObjectURL(url)
			setExported({ size: result.bytes.length, colors: result.colorCount })
		} finally {
			setBusy(false)
		}
	}, [dither, fileName, revealGain])

	const maskCoverage = useMemo(() => {
		void maskVersion
		const mask = maskRef.current
		if (!mask) return 0
		let n = 0
		for (let i = 0; i < mask.length; i += 7) if (mask[i]) n++
		return n / Math.ceil(mask.length / 7)
	}, [maskVersion])

	const sizePlan = image ? planSize(image.naturalWidth, image.naturalHeight, revealMode) : null

	if (!image) {
		return (
			<Dropzone
				onImage={(img, name) => {
					setImage(img)
					setFileName(name)
					setExported(null)
				}}
			/>
		)
	}

	return (
		<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
			<section className="space-y-4">
				<div className="flex flex-wrap items-center gap-2">
					<ToolButton active={!erasing} onClick={() => setErasing(false)} icon={<Paintbrush size={14} />}>
						Keep visible
					</ToolButton>
					<ToolButton active={erasing} onClick={() => setErasing(true)} icon={<Eraser size={14} />}>
						Hide
					</ToolButton>
					<div className="flex items-center gap-2 rounded-md border border-ink-700 bg-ink-850 px-3 py-1.5">
						<span className="text-xs text-ink-400">Brush</span>
						<input
							type="range"
							min={10}
							max={400}
							value={brushSize}
							onChange={(e) => setBrushSize(Number(e.target.value))}
							className="w-24"
						/>
						<span className="w-8 font-mono text-xs text-ink-300">{brushSize}</span>
					</div>
					<button
						onClick={() => applyAuto("none")}
						className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-ink-700 px-3 py-1.5 text-xs text-ink-300 transition hover:border-ink-600 hover:text-ink-100"
					>
						<RotateCcw size={13} /> Clear
					</button>
					<label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-ink-700 px-3 py-1.5 text-xs text-ink-300 transition hover:border-ink-600 hover:text-ink-100">
						<ImageUp size={13} /> Replace
						<input
							type="file"
							accept="image/*"
							className="hidden"
							onChange={(e) => {
								const file = e.target.files?.[0]
								if (!file) return
								const img = new Image()
								img.onload = () => {
									setImage(img)
									setFileName(file.name)
									maskRef.current = null
									workRef.current = null
									setExported(null)
								}
								img.src = URL.createObjectURL(file)
							}}
						/>
					</label>
				</div>

				<MaskCanvas
					source={preview}
					mask={maskRef.current}
					workWidth={workRef.current?.width ?? 0}
					workHeight={workRef.current?.height ?? 0}
					brushSize={brushSize}
					erasing={erasing}
					version={maskVersion}
					onPaint={(x, y, r) => {
						paint(x, y, r, !erasing)
						setMaskVersion((v) => v + 1)
					}}
				/>

				<div className="flex flex-wrap gap-2 text-xs">
					<span className="self-center text-ink-400">Start from brightness:</span>
					<AutoButton onClick={() => applyAuto("dark")}>Keep dark parts</AutoButton>
					<AutoButton onClick={() => applyAuto("bright")}>Keep bright parts</AutoButton>
					<AutoButton onClick={() => applyAuto("all")}>Keep everything</AutoButton>
					<div className="flex items-center gap-2">
						<input
							type="range"
							min={5}
							max={95}
							value={autoThreshold * 100}
							onChange={(e) => setAutoThreshold(Number(e.target.value) / 100)}
							className="w-20"
						/>
						<span className="w-8 font-mono text-ink-400">{Math.round(autoThreshold * 100)}</span>
					</div>
				</div>
			</section>

			<section className="space-y-4">
				<div className="grid grid-cols-2 gap-3">
					<PreviewPanel
						label="In the timeline"
						hint="light mode"
						image={states ? compositeOver(states.feed, FEED_LIGHT) : null}
					/>
					<PreviewPanel
						label="In the timeline"
						hint="dark mode"
						image={states ? compositeOver(states.feed, FEED_DARK) : null}
					/>
					<PreviewPanel
						label="Image opened"
						hint={revealMode === "open" ? "partial reveal" : "still hidden"}
						image={states ? compositeOver(states.opened, VIEWER_BG) : null}
					/>
					<PreviewPanel
						label="Press and hold"
						hint="full reveal"
						image={states ? compositeOver(states.held, VIEWER_BG) : null}
						highlight
					/>
				</div>

				<div className="space-y-3 rounded-lg border border-ink-700 bg-ink-900 p-4">
					<Field label="Reveal style">
						<div className="grid grid-cols-2 gap-2">
							<ModeButton
								active={revealMode === "open"}
								onClick={() => setRevealMode("open")}
								title="On open"
								sub="2400px"
							/>
							<ModeButton
								active={revealMode === "fourk"}
								onClick={() => setRevealMode("fourk")}
								title="On 4K load"
								sub="4096px"
							/>
						</div>
					</Field>

					<Field label={`Reveal brightness  ${revealGain.toFixed(2)}x`}>
						<input
							type="range"
							min={100}
							max={200}
							value={revealGain * 100}
							onChange={(e) => setRevealGain(Number(e.target.value) / 100)}
							className="w-full"
						/>
						<p className="mt-1 text-[11px] leading-relaxed text-ink-400">
							The hidden half keeps only every second pixel, so it reads about half as bright once
							revealed. Push this up to compensate, at the cost of clipping highlights.
						</p>
					</Field>

					<label className="flex cursor-pointer items-center gap-2 text-xs text-ink-300">
						<input
							type="checkbox"
							checked={dither}
							onChange={(e) => setDither(e.target.checked)}
							className="accent-amber-glow"
						/>
						Dither &mdash; smoother gradients, slightly larger file
					</label>
				</div>

				<Warnings
					sizePlan={sizePlan}
					revealMode={revealMode}
					maskCoverage={maskCoverage}
					exported={exported}
				/>

				<button
					onClick={handleExport}
					disabled={busy}
					className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-glow px-4 py-3 text-sm font-medium text-ink-950 transition hover:brightness-110 disabled:opacity-60"
				>
					{busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
					{busy ? "Preparing the file…" : "Download PNG"}
				</button>

				{exported && (
					<p className="text-center text-xs text-ink-400">
						{(exported.size / 1024 / 1024).toFixed(2)} MB · {exported.colors} colours
						{exported.size > MAX_FILE_BYTES && (
							<span className="text-red-400"> · over X&apos;s 5 MB limit</span>
						)}
					</p>
				)}
			</section>
		</div>
	)
}

function ToolButton({
	active,
	onClick,
	icon,
	children,
}: {
	active: boolean
	onClick: () => void
	icon: React.ReactNode
	children: React.ReactNode
}) {
	return (
		<button
			onClick={onClick}
			className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition ${
				active
					? "border-amber-glow/50 bg-amber-glow/10 text-amber-glow"
					: "border-ink-700 text-ink-300 hover:border-ink-600 hover:text-ink-100"
			}`}
		>
			{icon}
			{children}
		</button>
	)
}

function AutoButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
	return (
		<button
			onClick={onClick}
			className="rounded-md border border-ink-700 px-2.5 py-1 text-ink-300 transition hover:border-ink-600 hover:text-ink-100"
		>
			{children}
		</button>
	)
}

function ModeButton({
	active,
	onClick,
	title,
	sub,
}: {
	active: boolean
	onClick: () => void
	title: string
	sub: string
}) {
	return (
		<button
			onClick={onClick}
			className={`rounded-md border px-3 py-2 text-left transition ${
				active
					? "border-amber-glow/50 bg-amber-glow/10"
					: "border-ink-700 hover:border-ink-600"
			}`}
		>
			<div className={`text-xs ${active ? "text-amber-glow" : "text-ink-100"}`}>{title}</div>
			<div className="font-mono text-[10px] text-ink-400">{sub}</div>
		</button>
	)
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div>
			<div className="mb-1.5 text-[11px] uppercase tracking-wide text-ink-400">{label}</div>
			{children}
		</div>
	)
}
