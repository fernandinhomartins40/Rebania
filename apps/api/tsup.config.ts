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
  noExternal: [/^@rebania\//],
});
