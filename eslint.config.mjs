import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// Graveyard packages run only inside the sandbox child process (sandbox/),
// never in the Next.js server or the browser. Block direct imports of them
// from app code (Req 1.3, 5.9).
const GRAVEYARD_PACKAGES = ["lodash.set", "lodash.pick", "string", "deep-extend"];

const graveyardImportMessage =
  "Graveyard packages are loaded only by the sandbox child process. Do not import them from app/, lib/ or components/.";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      ".next/**",
      "build/**",
      "node_modules/**",
      "graveyard/node_modules/**",
      "resurrected/**",
      "next-env.d.ts",
    ],
  },
  {
    // Sandbox fixtures must stay CommonJS (they mimic real npm packages).
    files: ["tests/fixtures/**/*.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    files: ["app/**/*.{js,jsx,ts,tsx,mjs,cjs}", "lib/**/*.{js,jsx,ts,tsx,mjs,cjs}", "components/**/*.{js,jsx,ts,tsx,mjs,cjs}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: GRAVEYARD_PACKAGES.map((name) => ({ name, message: graveyardImportMessage })),
          patterns: [
            {
              group: GRAVEYARD_PACKAGES.map((name) => `${name}/*`),
              message: graveyardImportMessage,
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
