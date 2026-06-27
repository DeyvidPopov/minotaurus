// app/layout.tsx — root HTML + providers + font loading

import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Minotaurus — SSOT Architecture Platform",
  description: "A connected source of truth for your software architecture.",
};

// Fonts are self-hosted via next/font (the `geist` package ships local woff2),
// served from the app origin so they satisfy the production CSP (`font-src
// 'self'`) — the previous render-blocking Google Fonts <link> was actually
// BLOCKED in production by that CSP, and also pulled 5 unused families. Only the
// two families the app references (Geist / Geist Mono) load now; their CSS
// variables (--font-geist-sans / --font-geist-mono) feed --font-sans/--font-mono
// in globals.css.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      data-font="geist"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
