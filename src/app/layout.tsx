import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
})

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
})

const siteUrl =
	process.env.NEXT_PUBLIC_SITE_URL ??
	(process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")

const title = "Latent — make press-and-hold images for X"
const description =
	"Hide part of a picture so it vanishes in the X timeline and comes back when someone presses and holds the image. Free, and it runs entirely in your browser."

export const metadata: Metadata = {
	metadataBase: new URL(siteUrl),
	title,
	description,
	openGraph: { title, description, type: "website" },
	twitter: { card: "summary_large_image", title, description },
}

export const viewport: Viewport = {
	themeColor: "#08080a",
	width: "device-width",
	initialScale: 1,
}

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode
}>) {
	return (
		<html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
			<body className="min-h-full">{children}</body>
		</html>
	)
}
