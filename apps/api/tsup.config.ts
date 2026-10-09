import { defineConfig } from "tsup";

// Empacota os pacotes internos (@rebania/*) que exportam TypeScript fonte.
export default defineConfig({
  entry: ["src/server.ts", "src/cli/bootstrap.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  sourcemap: true,
  clean: true,
  // Pacotes internos (@rebania/*) exportam TS fonte e entram no bundle;
  // dependências de terceiros ficam em node_modules (pnpm deploy --prod).
  skipNodeModulesBundle: true,
  noExternal: [/^@rebania\//],
});
