"use client"

import { useEffect, useRef, useState } from "react"

import { resampleMask, type Mask } from "@/lib/mask"
import type { Rgba } from "@/lib/simulate"

interface Props {
	source: Rgba | null
	mask: Mask | null
	workWidth: number
	workHeight: number
	brushSize: number
	erasing: boolean
	version: number
	onPaint: (x: number, y: number, radius: number) => void
}

export function MaskCanvas({
	source,
	mask,
	workWidth,
	workHeight,
	brushSize,
	erasing,
	version,
	onPaint,
}: Props) {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const paintingRef = useRef(false)
	const lastRef = useRef<{ x: number; y: number } | null>(null)
	const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)

	useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas || !source || !mask || !workWidth) return
		void version

		canvas.width = source.width
		canvas.height = source.height
		const ctx = canvas.getContext("2d")!

		const small = resampleMask(mask, workWidth, workHeight, source.width, source.height)
		const out = new Uint8ClampedArray(source.data.length)
		for (let p = 0; p < small.length; p++) {
			const i = p * 4
			if (small[p]) {
				out[i] = source.data[i]
				out[i + 1] = source.data[i + 1]
				out[i + 2] = source.data[i + 2]
			} else {
				// Hidden areas are dimmed and cooled so the kept region reads at a glance.
				out[i] = source.data[i] * 0.32
				out[i + 1] = source.data[i + 1] * 0.32 + 8
				out[i + 2] = source.data[i + 2] * 0.34 + 18
			}
			out[i + 3] = 255
		}
		ctx.putImageData(new ImageData(out, source.width, source.height), 0, 0)
	}, [source, mask, workWidth, workHeight, version])

	const toWork = (e: React.PointerEvent<HTMLCanvasElement>) => {
		const rect = e.currentTarget.getBoundingClientRect()
		return {
			x: ((e.clientX - rect.left) / rect.width) * workWidth,
			y: ((e.clientY - rect.top) / rect.height) * workHeight,
			display: { x: e.clientX - rect.left, y: e.clientY - rect.top, w: rect.width },
		}
	}

	const stroke = (x: number, y: number) => {
		const radius = brushSize / 2
		const last = lastRef.current
		if (last) {
			// Interpolate along the drag so fast movements do not leave gaps.
			const dist = Math.hypot(x - last.x, y - last.y)
			const steps = Math.ceil(dist / (radius * 0.4))
			for (let s = 1; s <= steps; s++) {
				onPaint(last.x + ((x - last.x) * s) / steps, last.y + ((y - last.y) * s) / steps, radius)
			}
		} else {
			onPaint(x, y, radius)
		}
		lastRef.current = { x, y }
	}

	if (!source) return null

	const displayBrush = cursor ? (brushSize / workWidth) * 100 : 0

	return (
		<div className="relative overflow-hidden rounded-lg border border-ink-700 bg-ink-900">
			<canvas
				ref={canvasRef}
				className="block w-full cursor-none touch-none select-none"
				onPointerDown={(e) => {
					e.currentTarget.setPointerCapture(e.pointerId)
					paintingRef.current = true
					lastRef.current = null
					const { x, y } = toWork(e)
					stroke(x, y)
				}}
				onPointerMove={(e) => {
					const { x, y, display } = toWork(e)
					setCursor({ x: display.x, y: display.y })
					if (paintingRef.current) stroke(x, y)
				}}
				onPointerUp={() => {
					paintingRef.current = false
					lastRef.current = null
				}}
				onPointerLeave={() => {
					paintingRef.current = false
					lastRef.current = null
					setCursor(null)
				}}
			/>
			{cursor && (
				<div
					className="pointer-events-none absolute rounded-full border"
					style={{
						left: `${cursor.x}px`,
						top: `${cursor.y}px`,
						width: `${displayBrush}%`,
						aspectRatio: "1",
						transform: "translate(-50%, -50%)",
						borderColor: erasing ? "rgba(255,110,110,0.9)" : "rgba(255,176,32,0.9)",
						boxShadow: "0 0 0 1px rgba(0,0,0,0.6) inset",
					}}
				/>
			)}
			<div className="pointer-events-none absolute bottom-2 left-2 rounded bg-ink-950/80 px-2 py-1 font-mono text-[10px] text-ink-400">
				{workWidth}x{workHeight}
			</div>
		</div>
	)
}
