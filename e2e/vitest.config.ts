import { defineConfig } from "vitest/config";

// Checks that drive the whole app, launched in the background (see app.ts).
// On CI's runners, much slower than a maker's computer, a check has a minute
// and a half rather than one, an expect.poll fifteen seconds rather than
// vitest's one, and a check that fails is run once more.

export default defineConfig({
  test: {
    name: "e2e",
    root: import.meta.dirname,
    include: ["**/*.e2e.ts"],
    testTimeout: process.env.CI ? 90_000 : 60_000,
    hookTimeout: process.env.CI ? 90_000 : 60_000,
    expect: { poll: { timeout: process.env.CI ? 15_000 : 1_000 } },
    retry: process.env.CI ? 1 : 0,
    fileParallelism: false,
  },
});
