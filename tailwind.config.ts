import type { Config } from "tailwindcss";
import { colorTokens } from "./lib/report/contrast";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: { ...colorTokens },
      fontFamily: {
        display: ["Georgia", "Palatino", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
