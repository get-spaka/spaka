import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

export default defineConfig({
  main: {
    build: {
      // The workspace's own packages are TypeScript sources: bundle them.
      externalizeDeps: { exclude: ["@upstart/runtime"] },
      rollupOptions: { input: { index: resolve(__dirname, "src/main/index.ts") } },
    },
  },
  preload: {
    build: {
      // Sandboxed preloads must each be a single CommonJS file.
      isolatedEntries: true,
      externalizeDeps: false,
      rollupOptions: {
        input: {
          app: resolve(__dirname, "src/preload/app.ts"),
          preview: resolve(__dirname, "src/preload/preview.ts"),
        },
        output: { format: "cjs", entryFileNames: "[name].cjs" },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    plugins: [react(), tailwindcss()],
    resolve: { alias: { "@": resolve(__dirname, "src/renderer") } },
    build: {
      rollupOptions: { input: { index: resolve(__dirname, "src/renderer/index.html") } },
    },
  },
});
