// Throwaway local server shared by both shells. It delivers the canned page
// piece by piece, the way spike 1's runtime is expected to deliver a page that
// the agent is still writing.
//
//   GET /                 the page as one chunked response, a few lines at a time
//                         ?delay=35  milliseconds between chunks (0 = at once)
//                         ?lines=3   lines per chunk
//   GET /?mode=push       an empty page that receives each piece over SSE
//   GET /push             the SSE stream used by mode=push
//   GET /fragments/voices htmx fragment
//   POST /subscribe       htmx fragment
//   GET /vendor/*         Tailwind browser build, daisyUI, htmx
//
// Runs unchanged under Node (Electron's main process) and Bun (Electrobun's).
import http from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { head, pieces, tail, fragments, heroSvg } from "./page.mjs";
import { aboutPage, hostilePage, nestedPage, tookOverPage, popupPage } from "./extra-pages.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const types = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

function chunksOf(text, linesPerChunk) {
  const lines = text.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i += linesPerChunk) {
    const part = lines.slice(i, i + linesPerChunk).join("\n");
    out.push(i + linesPerChunk < lines.length ? part + "\n" : part);
  }
  return out.filter((c) => c.length > 0);
}

// Experiment (SPIKE_OAC=1): ask the browser for an origin-keyed agent cluster.
const extraHeaders = process.env.SPIKE_OAC ? { "origin-agent-cluster": "?1" } : {};

async function streamPage(res, { delay, lines }) {
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    ...extraHeaders,
  });
  res.write(head);
  for (const piece of pieces) {
    for (const chunk of chunksOf(piece.html, lines)) {
      if (delay > 0) await sleep(delay);
      if (res.destroyed) return;
      res.write(chunk);
    }
  }
  if (delay > 0) await sleep(delay);
  res.end(tail);
}

function pushShell(res) {
  // Same head and tail, an empty <main>, and a script that appends each piece
  // as the server pushes it.
  const script = `<script>
  (function () {
    var main = document.querySelector("main");
    var source = new EventSource("/push" + location.search);
    source.addEventListener("piece", function (e) {
      main.insertAdjacentHTML("beforeend", JSON.parse(e.data).html);
      if (window.htmx && htmx.process) htmx.process(main.lastElementChild);
    });
    source.addEventListener("done", function () { source.close(); });
  })();
</script>
`;
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(head + tail.replace("</body>", script + "</body>"));
}

async function pushPieces(res, { delay }) {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-store",
    connection: "keep-alive",
  });
  for (const piece of pieces) {
    await sleep(Math.max(delay, 1) * 12);
    if (res.destroyed) return;
    res.write(`event: piece\ndata: ${JSON.stringify(piece)}\n\n`);
  }
  res.write("event: done\ndata: {}\n\n");
  res.end();
}

/**
 * @param {{ port?: number, vendorDir?: string }} [options]
 * @returns {Promise<{ port: number, url: string, close: () => void }>}
 */
export function startCannedServer(options = {}) {
  const here = dirname(fileURLToPath(import.meta.url));
  const vendorDir = options.vendorDir ?? join(here, "vendor");
  const port = options.port ?? 4517;

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const delay = Number(url.searchParams.get("delay") ?? 35);
      const lines = Math.max(1, Number(url.searchParams.get("lines") ?? 3));

      if (url.pathname === "/") {
        if (url.searchParams.get("mode") === "push") return pushShell(res);
        return await streamPage(res, { delay, lines });
      }
      if (url.pathname === "/push") return await pushPieces(res, { delay });
      if (url.pathname === "/health") {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ ok: true, runtime: process.versions.bun ? "bun" : "node" }));
      }
      if (url.pathname === "/img/hero.svg") {
        res.writeHead(200, { "content-type": "image/svg+xml" });
        return res.end(heroSvg);
      }
      if (url.pathname === "/fragments/voices") {
        await sleep(250);
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        return res.end(fragments.voices);
      }
      if (url.pathname === "/subscribe" && req.method === "POST") {
        let body = "";
        for await (const chunk of req) body += chunk;
        const email = new URLSearchParams(body).get("email") ?? "you";
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        return res.end(fragments.subscribed(email.replace(/[<>&"]/g, "")));
      }
      // --- added for the <iframe> follow-up ---------------------------------
      const html = (body) => {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...extraHeaders });
        res.end(body);
      };
      if (url.pathname === "/about") return html(aboutPage);
      if (url.pathname === "/hostile") return html(hostilePage);
      if (url.pathname === "/nested") return html(nestedPage);
      if (url.pathname === "/took-over") return html(tookOverPage);
      if (url.pathname === "/popup") return html(popupPage);
      if (url.pathname === "/cookie/set") {
        // What a project with a visitor session would send.
        res.writeHead(200, {
          "content-type": "application/json",
          "cache-control": "no-store",
          "set-cookie": [
            "up_default=1; Path=/",
            "up_lax=1; Path=/; SameSite=Lax",
            "up_strict=1; Path=/; SameSite=Strict",
            "up_none=1; Path=/; SameSite=None; Secure",
          ],
        });
        return res.end("{}");
      }
      if (url.pathname === "/cookie/echo") {
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        return res.end(JSON.stringify({ cookie: req.headers.cookie ?? "" }));
      }
      if (url.pathname.startsWith("/vendor/")) {
        const name = normalize(url.pathname.slice("/vendor/".length));
        if (name.includes("..") || name.includes("/")) throw new Error("bad path");
        const ext = name.slice(name.lastIndexOf("."));
        const data = await readFile(join(vendorDir, name));
        res.writeHead(200, {
          "content-type": types[ext] ?? "application/octet-stream",
          "cache-control": "max-age=3600",
        });
        return res.end(data);
      }
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
    } catch (error) {
      if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain" });
      res.end(String(error));
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      resolve({
        port,
        url: `http://127.0.0.1:${port}/`,
        close: () => server.close(),
      });
    });
  });
}
