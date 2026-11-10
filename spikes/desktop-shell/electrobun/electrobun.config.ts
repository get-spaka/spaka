import type { ElectrobunConfig } from "electrobun";

// SPIKE_CEF=1 builds the variant that bundles Chromium (CEF) instead of
// using the system's web engine, into its own folders and under its own name.
const cef = process.env.SPIKE_CEF === "1";

export default {
  app: {
    name: cef ? "Upstart Spike Electrobun CEF" : "Upstart Spike Electrobun",
    identifier: cef ? "dev.upstart.spike.electrobun.cef" : "dev.upstart.spike.electrobun",
    version: "0.0.1",
  },
  build: {
    ...(cef ? { buildFolder: "build-cef", artifactFolder: "artifacts-cef" } : {}),
    mainProcess: "bun",
    bun: {
      entrypoint: "src/bun/index.ts",
    },
    views: {
      // The editing script injected into the preview, as one self-contained file.
      previewpreload: {
        entrypoint: "src/preview-preload/index.ts",
        format: "iife",
      },
    },
    copy: {
      "dist-view/index.html": "views/mainview/index.html",
      "dist-view/assets": "views/mainview/assets",
      "../canned-server/vendor": "canned-vendor",
      // Anthropic's official binary, shipped as published.
      "node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude": "claude/claude",
    },
    mac: {
      codesign: false,
      notarize: false,
      ...(cef ? { bundleCEF: true, defaultRenderer: "cef" as const } : {}),
    },
  },
  release: {
    generatePatch: false,
  },
} satisfies ElectrobunConfig;
