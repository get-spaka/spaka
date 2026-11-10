import { resolve } from "node:path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const shared = resolve(__dirname, "..");

export default defineConfig({
  main: {
    build: {
      rollupOptions: { input: { index: resolve(__dirname, "src/main/index.ts") } },
    },
  },
  preload: {
    build: {
      // Sandboxed preloads must be single CommonJS files.
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
    // The interface lives in ../shared; make it use this app's copy of React.
    resolve: { dedupe: ["react", "react-dom"] },
    server: { fs: { allow: [shared] } },
    build: {
      minify: true,
      rollupOptions: { input: { index: resolve(__dirname, "src/renderer/index.html") } },
    },
  },
});
