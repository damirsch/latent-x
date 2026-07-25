"use client"

import { useEffect, useRef } from "react"

interface Props {
	label: string
	hint: string
	image: ImageData | null
	highlight?: boolean
}

export function PreviewPanel({ label, hint, image, highlight }: Props) {
	const ref = useRef<HTMLCanvasElement>(null)

	useEffect(() => {
		const canvas = ref.current
		if (!canvas || !image) return
		canvas.width = image.width
		canvas.height = image.height
		canvas.getContext("2d")!.putImageData(image, 0, 0)
	}, [image])

	return (
		<figure
			className={`overflow-hidden rounded-lg border ${
				highlight ? "border-amber-glow/40" : "border-ink-700"
			}`}
		>
			<div className="alpha-grid flex aspect-square items-center justify-center">
				<canvas ref={ref} className="max-h-full max-w-full object-contain" />
			</div>
			<figcaption className="flex items-baseline justify-between gap-2 border-t border-ink-700 bg-ink-900 px-2.5 py-1.5">
				<span className={`text-[11px] ${highlight ? "text-amber-glow" : "text-ink-100"}`}>
					{label}
				</span>
				<span className="text-[10px] text-ink-400">{hint}</span>
			</figcaption>
		</figure>
	)
}
