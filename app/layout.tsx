import type { ReactNode } from "react";
import { Cinzel, Inter } from "next/font/google";
import "./globals.css";

const display = Cinzel({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const body = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });

export const metadata = {
  title: "Revenant",
  description: "Bring dead npm packages back to life and gather evidence that the rebuild behaves like the original.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body style={{ fontFamily: "var(--font-body), system-ui, sans-serif" }}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:bg-tomb focus:p-2"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
