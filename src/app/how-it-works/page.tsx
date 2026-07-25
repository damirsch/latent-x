import { readFile } from "node:fs/promises"
import path from "node:path"
import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { marked } from "marked"

export const metadata: Metadata = {
	title: "How the press-and-hold images on X actually work",
	description:
		"Measured from a live post: X rounds transparency to on-or-off when it builds previews, and a one-pixel checkerboard sits just under the threshold.",
}

export default async function Page() {
	const source = await readFile(path.join(process.cwd(), "content/how-it-works.md"), "utf8")

	// The markdown keeps repo-relative image paths so it renders on GitHub too.
	const html = await marked.parse(source.replace(/\.\.\/public\/figures\//g, "/figures/"))

	return (
		<div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-12">
			<Link
				href="/"
				className="mb-10 inline-flex items-center gap-1.5 text-xs text-ink-400 transition hover:text-amber-glow"
			>
				<ArrowLeft size={13} />
				Back to the tool
			</Link>

			<article
				className="prose prose-invert max-w-none
					prose-headings:font-normal prose-headings:tracking-tight
					prose-h1:text-2xl prose-h1:mb-8
					prose-h2:mt-14 prose-h2:text-lg prose-h2:text-ink-100
					prose-p:text-[15px] prose-p:leading-relaxed prose-p:text-ink-300
					prose-li:text-[15px] prose-li:text-ink-300
					prose-strong:text-ink-100 prose-strong:font-medium
					prose-a:text-amber-glow prose-a:no-underline hover:prose-a:underline
					prose-code:text-amber-glow prose-code:before:content-none prose-code:after:content-none
					prose-pre:border prose-pre:border-ink-700 prose-pre:bg-ink-900
					prose-table:text-[13px]
					prose-th:text-ink-100 prose-th:font-medium
					prose-td:text-ink-300 prose-td:border-ink-800
					prose-img:rounded-lg prose-img:border prose-img:border-ink-700
					prose-hr:border-ink-800"
				dangerouslySetInnerHTML={{ __html: html }}
			/>
		</div>
	)
}
