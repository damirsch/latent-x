"use client"

import { useCallback, useState } from "react"
import { ImageUp } from "lucide-react"

interface Props {
	onImage: (image: HTMLImageElement, fileName: string) => void
}

export function Dropzone({ onImage }: Props) {
	const [over, setOver] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const load = useCallback(
		(file: File) => {
			if (!file.type.startsWith("image/")) {
				setError("That is not an image file.")
				return
			}
			setError(null)
			const img = new Image()
			img.onload = () => onImage(img, file.name)
			img.onerror = () => setError("Could not decode that image.")
			img.src = URL.createObjectURL(file)
		},
		[onImage]
	)

	return (
		<div
			onDragOver={(e) => {
				e.preventDefault()
				setOver(true)
			}}
			onDragLeave={() => setOver(false)}
			onDrop={(e) => {
				e.preventDefault()
				setOver(false)
				const file = e.dataTransfer.files?.[0]
				if (file) load(file)
			}}
			onPaste={(e) => {
				const file = e.clipboardData.files?.[0]
				if (file) load(file)
			}}
			className={`flex min-h-[420px] flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition ${
				over ? "border-amber-glow/60 bg-amber-glow/5" : "border-ink-700 bg-ink-900"
			}`}
		>
			<ImageUp size={32} className="mb-4 text-ink-400" />
			<p className="mb-1 text-sm text-ink-100">Drop an image, or paste one</p>
			<p className="mb-6 max-w-sm text-xs leading-relaxed text-ink-400">
				Nothing is uploaded. The image is read, checkerboarded and encoded entirely inside this
				tab.
			</p>
			<label className="cursor-pointer rounded-lg bg-amber-glow px-4 py-2 text-sm font-medium text-ink-950 transition hover:brightness-110">
				Choose a file
				<input
					type="file"
					accept="image/*"
					className="hidden"
					onChange={(e) => {
						const file = e.target.files?.[0]
						if (file) load(file)
					}}
				/>
			</label>
			{error && <p className="mt-4 text-xs text-red-400">{error}</p>}
		</div>
	)
}
