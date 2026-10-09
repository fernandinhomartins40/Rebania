import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["../api/test/global-setup.ts"],
    fileParallelism: false,
  },
});
