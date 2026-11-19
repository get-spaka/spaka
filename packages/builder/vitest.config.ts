import { defineConfig } from "vitest/config";

// CI's runners are much slower than a maker's computer, and stall at times: a test failed there is run once more.
export default defineConfig({
  test: {
    name: "builder",
    include: ["src/**/*.test.ts"],
    testTimeout: process.env.CI ? 15_000 : 5000,
    retry: process.env.CI ? 1 : 0,
  },
});
