"use client"

import { AlertTriangle, CheckCircle2, Info } from "lucide-react"

import { MAX_FILE_BYTES, type RevealMode, type SizeAdvice } from "@/lib/pipeline"

interface Props {
	sizePlan: SizeAdvice | null
	revealMode: RevealMode
	maskCoverage: number
	exported: { size: number; colors: number } | null
}

type Level = "ok" | "info" | "warn"

interface Note {
	level: Level
	text: string
}

export function Warnings({ sizePlan, revealMode, maskCoverage, exported }: Props) {
	const notes: Note[] = []

	if (maskCoverage < 0.005) {
		notes.push({
			level: "warn",
			text: "Nothing is marked as visible, so the whole picture disappears in the timeline. That works as a blank teaser, but usually you want to keep a detail or two.",
		})
	} else if (maskCoverage > 0.95) {
		notes.push({
			level: "warn",
			text: "Almost the entire image is marked visible, so there is nothing left to reveal.",
		})
	}

	if (sizePlan?.willUpscale) {
		notes.push({
			level: "info",
			text: `Your image is smaller than ${sizePlan.target}px, so it will be scaled up. The effect needs the extra size: on a small picture the hidden area comes out as visible speckle instead of disappearing.`,
		})
	}
	if (sizePlan?.willDownscale) {
		notes.push({
			level: "info",
			text: `Your image is larger than ${sizePlan.target}px, so it will be scaled down to a size X accepts.`,
		})
	}

	notes.push(
		revealMode === "open"
			? {
					level: "info",
					text: "Tapping the image is already enough to bring the hidden part back, though it looks grainy at first. Holding it loads the original and cleans it up.",
				}
			: {
					level: "info",
					text: "The hidden part stays hidden even after someone taps the image. It only appears once they press and hold to load the original, which makes the reveal more of a surprise.",
				}
	)

	if (exported && exported.size > MAX_FILE_BYTES) {
		notes.push({
			level: "warn",
			text: "The file is over 5 MB. X converts uploads that large into a format with no transparency, which removes the effect. Try the smaller reveal style, or a source image with less fine detail.",
		})
	}

	return (
		<div className="space-y-2">
			{notes.map((note, i) => (
				<Row key={i} level={note.level}>
					{note.text}
				</Row>
			))}
			<Row level="ok">
				Attach the downloaded file exactly as it is. A screenshot, or any re-save through another
				app, drops the transparency and the effect with it. Posting from a desktop browser is the
				safer route, since phone apps are more likely to re-encode what you upload.
			</Row>
		</div>
	)
}

function Row({ level, children }: { level: Level; children: React.ReactNode }) {
	const Icon = level === "warn" ? AlertTriangle : level === "ok" ? CheckCircle2 : Info
	const tone =
		level === "warn"
			? "border-amber-glow/30 bg-amber-glow/5 text-amber-glow"
			: level === "ok"
				? "border-ink-700 bg-ink-900 text-ink-300"
				: "border-ink-700 bg-ink-900 text-ink-300"

	return (
		<div className={`flex gap-2 rounded-md border px-3 py-2 text-[11px] leading-relaxed ${tone}`}>
			<Icon size={13} className="mt-px shrink-0" />
			<p>{children}</p>
		</div>
	)
}
