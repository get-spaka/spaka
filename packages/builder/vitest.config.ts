import { defineConfig } from "vitest/config";

export default defineConfig({ test: { name: "builder", include: ["src/**/*.test.ts"] } });
