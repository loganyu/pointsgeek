import type { Metadata } from "next";
import localFont from "next/font/local";
import { Source_Serif_4 } from "next/font/google";
import { ThemeProvider } from "./theme-provider";
import { PREFERENCES_SCRIPT_SRC } from "./preferences-script";
import "./globals.css";

// Self-hosted Geist variable fonts. One .woff2 per family covers every
// weight, which plays well with a future offline/PWA story.
const geistSans = localFont({
  src: [
    {
      path: "../../public/fonts/Geist[wght].woff2",
      style: "normal",
      weight: "100 900",
    },
    {
      path: "../../public/fonts/Geist-Italic[wght].woff2",
      style: "italic",
      weight: "100 900",
    },
  ],
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = localFont({
  src: [
    {
      path: "../../public/fonts/GeistMono[wght].woff2",
      style: "normal",
      weight: "100 900",
    },
    {
      path: "../../public/fonts/GeistMono-Italic[wght].woff2",
      style: "italic",
      weight: "100 900",
    },
  ],
  variable: "--font-geist-mono",
  display: "swap",
});

// Source Serif 4 — only used on the marketing landing for hero
// headline + section h2s, plus the italic accent variant. Loaded via
// next/font/google rather than self-hosted to keep the apps/web
// /public/fonts/ folder Geist-only; if we ever go fully offline the
// Geist split-loader pattern can be repeated for this. The 400/500
// weights cover headline + body usage; italic style enables the
// "*One statement.*" accent without a second `Source_Serif_4` call.
const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-source-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PointsGeek",
  description: "Track your credit card points and miles",
  icons: {
    // SVG first — Chrome prefers it for the tab and it stays crisp at any
    // size. PNGs are fallbacks; `app/favicon.ico` (the purple tile) is
    // auto-wired by Next's file convention for the legacy /favicon.ico.
    icon: [
      { url: "/brand/favicon.svg", type: "image/svg+xml" },
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/brand/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif.variable} h-full antialiased`}
    >
      <head>
        {/* Inline preference-mirroring script lives in <head> so it
         *  executes before the body renders and React doesn't try to
         *  hydrate it — sidesteps both the "script inside component"
         *  warning and the cascading hydration mismatch that warning
         *  produces. */}
        <script dangerouslySetInnerHTML={{ __html: PREFERENCES_SCRIPT_SRC }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
