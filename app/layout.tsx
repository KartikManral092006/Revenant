import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { ScrollProgress } from "../components/motion/ScrollProgress";
import { SmoothScroll } from "../components/motion/SmoothScroll";
import { SiteFooter, SiteHeader } from "../components/SiteChrome";
import { REPO_URL } from "./_lib/package-copy";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata = {
  title: "Revenant",
  description:
    "Replace a dead npm package and see how closely the replacement behaves like the original. Evidence, not proof.",
};

export const viewport = {
  themeColor: "#09090b",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen">
        <a
          href="#main"
          className="sr-only z-50 focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:rounded focus:bg-surface focus:p-2"
        >
          Skip to content
        </a>
        <SmoothScroll />
        <ScrollProgress />
        <SiteHeader repoUrl={REPO_URL} />
        {children}
        <SiteFooter repoUrl={REPO_URL} />
      </body>
    </html>
  );
}
