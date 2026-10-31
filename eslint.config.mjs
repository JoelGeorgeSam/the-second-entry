import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // PGlite's raw SQL boundary returns structurally unknown rows; strict TypeScript
  // still validates all domain and API inputs before those values are used.
  { rules: { "@typescript-eslint/no-explicit-any": "off" } },
  globalIgnores([".next/**", ".tmp/**", "coverage/**", "ml/artifacts/**"]),
]);
