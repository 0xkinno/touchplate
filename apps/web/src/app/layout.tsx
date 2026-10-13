import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { Nav } from "@/components/Nav";
import "./globals.css";

const display = localFont({ src: "../fonts/Satoshi-Variable.woff2", variable: "--font-tp-display", weight: "300 900", display: "swap" });
const serif = localFont({ src: "../fonts/InstrumentSerif-Italic.woff2", variable: "--font-tp-serif", style: "italic", weight: "400", display: "swap" });
const mono = localFont({ src: "../fonts/GeistMono-Variable.woff2", variable: "--font-tp-mono", weight: "400", display: "swap" });

export const metadata: Metadata = {
  title: "Touchplate",
  description: "Touchplate proves who made an image first, even after the internet strips the credit.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${serif.variable} ${mono.variable}`}>
      <body>
        <svg className="grain" width="100%" height="100%" aria-hidden="true">
          <filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" stitchTiles="stitch" /></filter>
          <rect width="100%" height="100%" filter="url(#g)" />
        </svg>
        <Nav />
        <main className="pt-24">{children}</main>
      </body>
    </html>
  );
}
