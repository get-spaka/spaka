// Electrobun main process (Bun) of the spike. Throwaway code.
import { BrowserView, BrowserWindow, BuildConfig, PATHS, Utils } from "electrobun/main";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCannedServer } from "../../../canned-server/server.mjs";
import { runAgentTurn } from "../../../shared/agent-turn.js";
import { createSpikeOut } from "../../../shared/spike-out.js";
import type { SpikeRPC } from "../rpc";

const out = createSpikeOut(() => Utils.quit());
out.mark("main-start");

const debug = (...args: unknown[]) => {
  if (process.env.SPIKE_DEBUG) console.log("[spike]", ...args);
};

const PORT = 4518;
// Files listed under `build.copy` land in Resources/app/.
const resources = join(PATHS.RESOURCES_FOLDER, "app");
// The official binary, copied into the bundle as published.
const claudeBinary = join(resources, "claude", "claude");

// "native" is the system's web engine; "cef" the Chromium this build bundles.
const renderer: "native" | "cef" = BuildConfig.getSync().defaultRenderer ?? "native";

const server = await startCannedServer({ port: PORT, vendorDir: join(resources, "canned-vendor") });

const rpc = BrowserView.defineRPC<SpikeRPC>({
  maxRequestTime: 600_000,
  handlers: {
    requests: {
      info: () => ({
        previewUrl: server.url,
        selftest: out.selftest,
        renderer,
        // How the canned page is delivered on first load, e.g.
        // SPIKE_PREVIEW_QUERY="mode=push&delay=60" for server-sent events.
        previewQuery: process.env.SPIKE_PREVIEW_QUERY ?? "delay=90",
        versions: {
          electrobun: "2.0.6",
          bun: Bun.version,
          renderer: renderer === "cef" ? "bundled Chromium (CEF)" : "native (WKWebView)",
        },
      }),
      saveCapture: ({ name, dataUrl }) => {
        const png = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
        const dir = out.dir ?? join(tmpdir(), "upstart-spike");
        mkdirSync(dir, { recursive: true });
        const file = join(dir, `electrobun-capture-${name}.png`);
        writeFileSync(file, png);
        return { file, bytes: png.length };
      },
      agentTurn: async ({ prompt }) => {
        const cwd = join(tmpdir(), "upstart-spike", "electrobun-project");
        mkdirSync(cwd, { recursive: true });
        debug("agentTurn: importing the SDK");
        const { query } = await import("@anthropic-ai/claude-agent-sdk");
        debug("agentTurn: SDK imported, starting the turn");
        const result = await runAgentTurn({
          query,
          prompt,
          cwd,
          executablePath: claudeBinary,
          onEvent: (event: any) => {
            debug("agentTurn event", event.type);
            win.webview.rpc?.send.agentEvent(event);
          },
        });
        debug("agentTurn: turn finished", result.ok, result.durationMs);
        const full = { ...result, cwd, binary: claudeBinary };
        // Written from the main process: it holds the result whether or not
        // the interface is in a state to receive it.
        out.save("agent", { ...full, launchEnvPath: process.env.PATH });
        out.mark("agent-done");
        return full;
      },
      sleep: async ({ ms, chatter = 0 }) => {
        for (let i = 0; i < chatter; i++) {
          await new Promise((r) => setTimeout(r, ms / (chatter + 1)));
          win.webview.rpc?.send.agentEvent({ type: "text", delta: "." });
        }
        await new Promise((r) => setTimeout(r, ms / (chatter + 1)));
        debug("sleep answered", ms, chatter);
        return { slept: ms };
      },
    },
    messages: {
      mark: ({ name }) => {
        out.mark(name);
        if (name === "preview-loaded" && process.env.SPIKE_LATE_CAPTURE) void lateCapture();
      },
      report: (result) => {
        debug("report received");
        out.report({ ...result, launchEnvPath: process.env.PATH });
      },
    },
  },
});

// Diagnostic (SPIKE_LATE_CAPTURE=<seconds>): can the preview still be
// captured some time after loading, driven from the main process alone? The
// main process reaches the preview's webview directly, without going through
// the interface.
let previewView: BrowserView | null = null;
const slices: string[] = [];
BrowserView.on("created", (view) => {
  previewView = view;
  (view as any).on("host-message", (event: any) => {
    const message = event?.data?.detail ?? event?.detail;
    if (message?.type === "capture-slice" && message.id === "late") slices.push(message.data);
  });
});
async function lateCapture() {
  const seconds = Number(process.env.SPIKE_LATE_CAPTURE);
  await new Promise((r) => setTimeout(r, seconds * 1000));
  const asked = Date.now();
  previewView?.executeJavascript(
    `window.__upstartEditorReceive && window.__upstartEditorReceive({ type: "capture", id: "late" })`,
  );
  for (let i = 0; i < 100 && slices.length === 0; i++) await new Promise((r) => setTimeout(r, 200));
  out.save("late-capture", {
    askedSecondsAfterLoad: seconds,
    answered: slices.length > 0,
    waitedMs: Date.now() - asked,
    slices: slices.length,
  });
  out.mark("late-capture-done");
}

const win = new BrowserWindow({
  title: "Upstart spike — Electrobun",
  // In development the interface can come from a Vite server instead of the
  // bundle, which gives hot module replacement (SPIKE_VIEW_URL=http://localhost:5173/).
  url: process.env.SPIKE_VIEW_URL ?? "views://mainview/index.html",
  frame: { width: 1440, height: 900, x: 80, y: 60 },
  rpc,
});
out.mark("window-created");
