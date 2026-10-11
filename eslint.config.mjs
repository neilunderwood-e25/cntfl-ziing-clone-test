import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  // Private Foundry CLI inputs and run history are not application source.
  {
    ignores: [
      ".foundry/runs/**",
      ".foundry/foundation-inputs/**",
      ".foundry/locks/**",
      ".foundry/migrations/**",
    ],
  },
]);

export default eslintConfig;
