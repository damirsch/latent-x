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
		<div className='mx-auto px-5 sm:px-8 py-8 sm:py-12 max-w-3xl'>
			<Link
				href='/'
				className='inline-flex items-center gap-1.5 mb-6 sm:mb-8 text-ink-400 hover:text-amber-glow text-xs transition'
			>
				<ArrowLeft size={13} />
				Back to the tool
			</Link>

			<article
				className='prose-pre:bg-ink-900 prose-invert prose-h2:mt-10 prose-h1:mb-0 prose-h2:mb-3 prose-img:border prose-pre:border prose-hr:border-ink-800 prose-img:border-ink-700 prose-pre:border-ink-700 prose-td:border-ink-800 prose-img:rounded-lg max-w-none prose-headings:font-normal prose-strong:font-medium prose-th:font-medium prose-h1:font-semibold prose-h2:font-semibold prose-a:text-amber-glow prose-code:text-amber-glow prose-h2:text-ink-100 prose-li:text-[15px] prose-li:text-ink-300 prose-p:text-[15px] prose-p:text-ink-300 prose-strong:text-ink-100 prose-table:text-[13px] prose-td:text-ink-300 prose-th:text-ink-100 prose-h2:text-lg prose-h1:text-2xl hover:prose-a:underline prose-a:no-underline prose-code:before:content-none prose-code:after:content-none prose-p:leading-relaxed prose-headings:tracking-tight prose'
				dangerouslySetInnerHTML={{ __html: html }}
			/>
		</div>
	)
}
