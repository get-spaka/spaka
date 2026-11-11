// The "Blog" scenario with the real agent (step 3), shared by agent-blog.e2e.ts
// and the packaged check: a bakery with a blog of three posts asked for in
// one message. While the agent works, what the preview shows of the blog is
// watched (stand-in records, then the real ones, and whether the page ever
// goes blank once something was on it); then the datasource, its record
// pages, the images found with their credits and the /credits page.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "vitest";
import type { LaunchedApp } from "./app.ts";

export const BLOG_MESSAGE =
  "A website for Le Fournil, a bakery in Lyon, with a blog of three short posts: our opening day, how we make our sourdough, and our Christmas menu. Each post has its own page. Use a photo for at least two of the posts.";

type Route = { route: string; file: string; group?: string; title?: string; generated?: boolean };

export type BlogReport = {
  turnMs: number;
  firstContentMs?: number;
  standInsSeenMs?: number;
  realRecordsSeenMs?: number;
  blankAfterContent: number;
  datasource?: string;
  records: string[];
  recordRoutes: string[];
  imageSearches: unknown[];
  imagesUsed: unknown[];
  media: { path: string; alt?: string; license?: string; author?: string }[];
  credits: boolean;
};

export async function buildBlog(launched: LaunchedApp, record: string, timeout = 900_000): Promise<BlogReport> {
  const invoke = (channel: string, ...args: unknown[]) =>
    launched.window.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
      ([channel, args]) => (window as any).upstart.invoke(channel, ...args),
      [channel, args] as const,
    );
  const page = (code: string) =>
    launched.app.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      (_electron, code) => (globalThis as any).upstart.preview.view.webContents.executeJavaScript(code),
      code,
    );
  const routes = async () =>
    // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
    ((await launched.app.evaluate(() => (globalThis as any).upstart.preview.state())) as { routes: Route[] }).routes;

  const started = Date.now();
  const report: BlogReport = {
    turnMs: 0,
    blankAfterContent: 0,
    records: [],
    recordRoutes: [],
    imageSearches: [],
    imagesUsed: [],
    media: [],
    credits: false,
  };
  await invoke("conversation:send", BLOG_MESSAGE);
  let hadContent = false;
  for (;;) {
    const seen = (await page(`({
      text: document.body ? document.body.innerText.trim().length : 0,
      standIns: document.querySelectorAll('[data-up-rec=""]').length,
      real: document.querySelectorAll('[data-up-rec]:not([data-up-rec=""])').length,
    })`).catch(() => undefined)) as { text: number; standIns: number; real: number } | undefined;
    const at = Date.now() - started;
    if (seen) {
      if (seen.text > 40 && !hadContent) {
        hadContent = true;
        report.firstContentMs = at;
      } else if (hadContent && seen.text < 5) report.blankAfterContent++;
      if (seen.standIns && report.standInsSeenMs === undefined) report.standInsSeenMs = at;
      if (seen.real && report.realRecordsSeenMs === undefined) report.realRecordsSeenMs = at;
    }
    const { items } = await invoke("conversation:get");
    const last = items.at(-1);
    if (last?.kind === "agent" && last.status !== "working") {
      expect(last.status).toBe("done");
      break;
    }
    if (at > timeout) throw new Error(`the agent did not finish in ${timeout / 60_000} minutes`);
    await new Promise((r) => setTimeout(r, 150));
  }
  report.turnMs = Date.now() - started;
  const project = (await invoke("projects:current")) as { path: string };
  const path = project.path;

  // A datasource of at least three records, and a page per record.
  const data = join(path, "data");
  const datasources = existsSync(data)
    ? readdirSync(data).filter((d) => existsSync(join(data, d, "_datasource.yaml")))
    : [];
  report.datasource = datasources.find((d) => readdirSync(join(data, d)).filter((f) => f.endsWith(".md")).length >= 3);
  expect(report.datasource, `datasources: ${datasources.join(", ")}`).toBeTruthy();
  report.records = readdirSync(join(data, report.datasource!)).filter((f) => f.endsWith(".md"));
  const all = await routes();
  const recordRoutes = all.filter((r) => r.group);
  report.recordRoutes = recordRoutes.map((r) => r.route);
  expect(recordRoutes.length).toBeGreaterThanOrEqual(3);

  // Images found and used through Upstart's tools, with their alt text and credits.
  const messages = readFileSync(record, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line).m);
  const uses = (name: string) =>
    messages
      .filter((m) => m?.type === "assistant")
      .flatMap((m) => m.message.content)
      .filter((c: { type: string; name?: string }) => c.type === "tool_use" && c.name === `mcp__upstart__${name}`)
      .map((c: { input: unknown }) => c.input);
  report.imageSearches = uses("find_images");
  report.imagesUsed = uses("use_image");
  expect(report.imageSearches.length).toBeGreaterThanOrEqual(1);
  expect(report.imagesUsed.length).toBeGreaterThanOrEqual(2);
  const media = join(path, "media");
  for (const file of existsSync(media) ? readdirSync(media) : []) {
    if (!/\.(jpe?g|png|webp|gif|avif)$/i.test(file)) continue;
    const infoPath = join(media, file.replace(/\.[^.]+$/, ".json"));
    const info = existsSync(infoPath) ? JSON.parse(readFileSync(infoPath, "utf8")) : {};
    report.media.push({
      path: `media/${file}`,
      alt: info.alt,
      license: info.credit?.license,
      author: info.credit?.author,
    });
  }
  expect(report.media.length).toBeGreaterThanOrEqual(2);
  for (const m of report.media) expect(m.alt, m.path).toBeTruthy();
  // Images that ask for credits give the site its credits page.
  report.credits = all.some((r) => r.route === "/credits");
  const needsCredit = report.media.some((m) => /^cc[\s-]*by\b/i.test(m.license ?? ""));
  if (needsCredit) expect(report.credits).toBe(true);

  // A record's page shows its record.
  const first = recordRoutes[0]!;
  await invoke("preview:navigate", first.route);
  await new Promise((r) => setTimeout(r, 1500));
  const text = String(await page("document.body.innerText"));
  if (first.title) expect(text).toContain(first.title);

  // Written in English (Q88).
  expect(text).toMatch(/\b(the|and|our|we)\b/i);
  return report;
}
