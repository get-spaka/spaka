import { defineConfig } from "vitest/config";

// CI's runners are much slower than a maker's computer.
export default defineConfig({
  test: { name: "runtime", include: ["src/**/*.test.ts"], testTimeout: process.env.CI ? 15_000 : 5000 },
});
