import { defineConfig } from "vitest/config";

// Checks that drive the whole app, launched in the background (see app.ts).
// On CI's runners, much slower than a maker's computer, every wait is three
// times as long and a check that fails is run once more.
const slow = process.env.CI ? 3 : 1;

export default defineConfig({
  test: {
    name: "e2e",
    root: import.meta.dirname,
    include: ["**/*.e2e.ts"],
    testTimeout: 60_000 * slow,
    hookTimeout: 60_000 * slow,
    retry: process.env.CI ? 1 : 0,
    fileParallelism: false,
  },
});
