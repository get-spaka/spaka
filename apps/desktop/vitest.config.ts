import { defineConfig } from "vitest/config";

export default defineConfig({
  // CI's runners are much slower than a maker's computer.
  test: {
    name: "desktop",
    include: ["src/**/*.test.ts"],
    environment: "node",
    testTimeout: process.env.CI ? 15_000 : 5000,
  },
});
