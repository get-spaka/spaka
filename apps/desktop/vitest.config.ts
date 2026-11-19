import { defineConfig } from "vitest/config";

export default defineConfig({
  // CI's runners are much slower than a maker's computer, and stall at times: a test failed there is run once more.
  test: {
    name: "desktop",
    include: ["src/**/*.test.ts"],
    environment: "node",
    testTimeout: process.env.CI ? 15_000 : 5000,
    retry: process.env.CI ? 1 : 0,
  },
});
