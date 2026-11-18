import type { NextConfig } from "next";

// Node-run code under lib/ and sandbox/ uses NodeNext-style `.js` import
// specifiers that point at `.ts` sources. Turbopack has no equivalent of
// webpack's extensionAlias, so `next build` runs with --webpack (see package.json).
const nextConfig: NextConfig = {
  experimental: {
    extensionAlias: {
      ".js": [".ts", ".tsx", ".js"],
    },
  },
};
export default nextConfig;
