import type { Config } from "tailwindcss";
import { colorTokens } from "./lib/report/contrast";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: { ...colorTokens },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "Palatino", "serif"],
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      maxWidth: {
        page: "72rem",
      },
    },
  },
  plugins: [],
};

export default config;
