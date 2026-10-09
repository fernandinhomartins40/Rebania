import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Em desenvolvimento a API é servida pelo proxy do Vite na MESMA origem,
// como em produção (Nginx), para que o cookie httpOnly SameSite=Strict funcione.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/v1": { target: process.env.API_PROXY_TARGET ?? "http://127.0.0.1:3000", changeOrigin: false } },
  },
  build: { sourcemap: true, target: "es2022" },
  test: { environment: "jsdom", include: ["src/**/*.test.{ts,tsx}"], setupFiles: ["src/test-setup.ts"] },
});
