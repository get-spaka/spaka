import { defineConfig } from "vitest/config";

// Checks that drive the whole app, launched in the background (see app.ts).
export default defineConfig({
  test: {
    name: "e2e",
    root: import.meta.dirname,
    include: ["**/*.e2e.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
