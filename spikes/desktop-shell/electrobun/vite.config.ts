import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { electrobunViteAliases } from "./.hutch/devkit/api/config/electrobun-vite";

// Builds the app's own interface. Electrobun then copies the result into the
// bundle (see `build.copy` in electrobun.config.ts).
export default defineConfig({
  root: resolve(__dirname, "src/mainview"),
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    // Electrobun 2 does not ship its SDK through npm: imports of
    // "electrobun/view" resolve to the devkit Hutch projects into .hutch/.
    alias: electrobunViteAliases(resolve(__dirname, ".hutch/devkit")),
    // The interface lives in ../shared; make it use this app's copy of React.
    dedupe: ["react", "react-dom"],
  },
  server: { fs: { allow: [resolve(__dirname, "..")] } },
  build: { outDir: resolve(__dirname, "dist-view"), emptyOutDir: true },
});
