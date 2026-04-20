import type { Metadata } from "next";
import localFont from "next/font/local";
import { ThemeProvider } from "./theme-provider";
import { PreferencesScript } from "./preferences-script";
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

export const metadata: Metadata = {
  title: "PointsGeek",
  description: "Track your credit card points and miles",
  icons: {
    icon: [
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/brand/favicon-mono.svg", type: "image/svg+xml" },
    ],
    apple: "/brand/icon-128.png",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <PreferencesScript />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
