import { defineConfig } from "vitest/config";

// Unit tests of every package. The checks that drive the whole app live in e2e/.
export default defineConfig({
  test: {
    projects: ["packages/*", "apps/desktop"],
  },
});
