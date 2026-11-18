import type { ReactNode } from "react";
import { Cinzel, Inter } from "next/font/google";
import { SiteFooter, SiteHeader } from "../components/SiteChrome";
import { REPO_URL } from "./_lib/package-copy";
import "./globals.css";

const display = Cinzel({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const body = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });

export const metadata = {
  title: "Revenant",
  description:
    "Replace a dead npm package and see how closely the replacement behaves like the original. Evidence, not proof.",
};

export const viewport = {
  themeColor: "#0b0a10",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-screen">
        <a
          href="#main"
          className="sr-only z-50 focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:rounded focus:bg-tomb focus:p-2"
        >
          Skip to content
        </a>
        <SiteHeader repoUrl={REPO_URL} />
        {children}
        <SiteFooter repoUrl={REPO_URL} />
      </body>
    </html>
  );
}
