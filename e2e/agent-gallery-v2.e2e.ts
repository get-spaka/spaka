// "Gallery v2" with the real agent, in the packaged app (the enlarged
// gallery, step 13). Opt-in like agent.e2e.ts: UPSTART_REAL_AGENT=1, with
// .cache/agent-config signed in, and the app packaged first.
// One message asks for a restaurant: a menu, the team, events and a booking
// form. The agent should take each from the gallery with use_block, write the
// restaurant's own records, give the header and footer the navigation, write
// an event's page from the block's detail, and link every page it makes.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, runsDir } from "./app.ts";

const real = process.env.UPSTART_REAL_AGENT === "1";
const configDir = join(import.meta.dirname, "../.cache/agent-config");
const dataDir = join(import.meta.dirname, "../.cache/gallery-v2-data");
const shots = join(runsDir, "gallery-v2");

const walk = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      )
    : [];

describe.skipIf(!real)("Gallery v2 with the real agent, packaged", () => {
  let launched: LaunchedApp;
  const record = join(runsDir, "real-agent-gallery-v2.jsonl");
  const report: Record<string, unknown> = {};
  const invoke = (channel: string, ...args: unknown[]) =>
    launched.window.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
      ([channel, args]) => (window as any).upstart.invoke(channel, ...args),
      [channel, args] as const,
    );
  const preview = <T>(code: string): Promise<T> =>
    launched.app.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      (_electron, code) => (globalThis as any).upstart.preview.view.webContents.executeJavaScript(code),
      code,
    );
  const capture = (): Promise<string> =>
    launched.app.evaluate(async () =>
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      ((await (globalThis as any).upstart.preview.view.webContents.capturePage()) as Electron.NativeImage)
        .toPNG()
        .toString("base64"),
    );
  const messages = () =>
    readFileSync(record, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line).m);
  const calls = (name: string) =>
    messages()
      .filter((m) => m?.type === "assistant")
      .flatMap((m) => m.message.content)
      .filter((c: { type: string; name?: string }) => c.type === "tool_use" && c.name === name)
      .map((c: { input: unknown }) => c.input);

  beforeAll(async () => {
    mkdirSync(runsDir, { recursive: true });
    rmSync(shots, { recursive: true, force: true });
    mkdirSync(shots, { recursive: true });
    rmSync(record, { force: true });
    rmSync(dataDir, { recursive: true, force: true });
    launched = await launchApp({
      packaged: true,
      env: {
        UPSTART_AGENT_REPLAY: "",
        UPSTART_AGENT_CONFIG_DIR: configDir,
        UPSTART_AGENT_RECORD: record,
        UPSTART_DATA_DIR: dataDir,
      },
    });
    await launched.window.getByTestId("conversation").waitFor();
  }, 90_000);
  afterAll(async () => {
    writeFileSync(join(runsDir, "real-agent-gallery-v2.json"), JSON.stringify(report, null, 2));
    await launched?.close();
  });

  test("a restaurant with its menu, team, events and a booking form", async () => {
    const started = Date.now();
    await invoke(
      "conversation:send",
      "A website for Le Petit Four, a small bistro in Lyon: our menu, the team, upcoming events like wine evenings, and a form to book a table.",
    );
    for (;;) {
      const { items } = await invoke("conversation:get");
      const last = items.at(-1);
      if (last?.kind === "agent" && last.status !== "working") break;
      if (Date.now() - started > 900_000) throw new Error("the agent did not finish in 15 minutes");
      await new Promise((r) => setTimeout(r, 500));
    }
    report.turnMs = Date.now() - started;
    const path: string = (await invoke("projects:current")).path;
    report.project = path;
    const read = (file: string) => (existsSync(join(path, file)) ? readFileSync(join(path, file), "utf8") : "");
    const checks: Record<string, boolean> = {};

    // The gallery searched, and its blocks put in with use_block.
    report.searches = calls("mcp__upstart__find_blocks");
    const placed = calls("mcp__upstart__use_block") as { page: string; blocks: { block: string; name: string }[] }[];
    report.placed = placed.map((p) => ({ page: p.page, blocks: p.blocks.map((b) => b.block) }));
    const ids = placed.flatMap((p) => p.blocks.map((b) => b.block));
    checks.searched = (report.searches as unknown[]).length >= 1;
    for (const kind of ["menu", "team", "events"])
      checks[`placed ${kind}`] = ids.some((id) => id.startsWith(`${kind}-`));

    // The restaurant's own records, not the gallery's samples.
    let samples: Record<string, string> = {};
    try {
      samples = JSON.parse(read(".upstart/gallery-samples.json"));
    } catch {}
    report.samplesLeft = Object.entries(samples)
      .filter(([file, sum]) => createHash("sha256").update(read(file)).digest("hex") === sum && read(file) !== "")
      .map(([file]) => file);
    checks["no samples left"] = (report.samplesLeft as string[]).length === 0;
    // Each record under a sample's name holds what that name says (Q218): one the
    // agent rewrote is renamed after its title; one it kept the sample's person or day for is right.
    const idOf = (title: string) =>
      title
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    const galleryDir = join(import.meta.dirname, "../apps/desktop/gallery");
    report.misnamed = ids.flatMap((id) => {
      const dir = readdirSync(galleryDir)
        .map((kind) => join(galleryDir, kind, id, "data"))
        .find(existsSync);
      if (!dir) return [];
      const ds: string | undefined = JSON.parse(readFileSync(join(dir, "../block.json"), "utf8")).data?.name;
      if (!ds || ds === "navigation") return [];
      const field = /-\s*name:\s*([\w-]+)\s*\n(?:\s+\w+:.*\n)*?\s+kind:\s*text\b/.exec(
        read(`data/${ds}/_datasource.yaml`),
      )?.[1];
      return readdirSync(dir)
        .filter((f) => f.endsWith(".md") && existsSync(join(path, "data", ds, f)))
        .filter((f) => {
          const title = new RegExp(`^${field}:\\s*["']?(.+?)["']?\\s*$`, "m").exec(read(`data/${ds}/${f}`))?.[1];
          return !!title && !idOf(title).startsWith(f.replace(/\.md$/, "").replace(/-\d+$/, ""));
        })
        .map((f) => `data/${ds}/${f}`);
    });
    checks["records named after themselves"] = (report.misnamed as string[]).length === 0;
    const datasources = readdirSync(join(path, "data"), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    report.datasources = Object.fromEntries(
      datasources.map((d) => [d, readdirSync(join(path, "data", d)).filter((f) => f !== "_datasource.yaml").length]),
    );

    // The navigation, read by the header and the footer.
    const parts = walk(join(path, "parts")).map((f) => relative(path, f));
    const header = parts.find((p) => /header/.test(p));
    const footer = parts.find((p) => /footer/.test(p));
    report.parts = parts;
    checks.navigation = datasources.includes("navigation");
    checks["header reads navigation"] = !!header && /data\.navigation|data\["navigation"\]/.test(read(header));
    checks["footer reads navigation"] = !!footer && /data\.navigation|data\["navigation"\]/.test(read(footer));

    // An event's page, written from the block's detail in the home page's frame.
    const pages = walk(join(path, "pages")).map((f) => relative(path, f));
    report.pages = pages;
    const eventPage = pages.find((p) => /^pages\/[^/]*events?[^/]*\/\[[^\]]+\]\.liquid$/.test(p));
    report.eventPage = eventPage;
    checks["event page"] = !!eventPage;
    checks["event page in the frame"] =
      !!eventPage && /render 'header'|render "header"/.test(read(eventPage)) && /footer/.test(read(eventPage));

    // The booking form: a collected datasource with its answer.
    const bookings = datasources.find((d) => /book|reserv/.test(d));
    const definition = bookings ? read(`data/${bookings}/_datasource.yaml`) : "";
    const answer = /^answer:\s*([\w-]+)/m.exec(definition)?.[1];
    report.bookings = { name: bookings, answer };
    checks["booking form collected"] = /^collected:\s*true\s*$/m.test(definition);
    checks["booking answer"] = !!answer && read(`fragments/${answer}.liquid`) !== "";
    checks["booking form posts"] = walk(join(path, "parts"))
      .concat(walk(join(path, "pages")))
      .some((f) => readFileSync(f, "utf8").includes(`hx-post="/_data/${bookings}"`));

    // Every page it made has its link in the navigation.
    const routes = pages
      .filter((p) => !p.includes("["))
      .map((p) => p.replace(/^pages/, "").replace(/(\/index)?\.liquid$/, "") || "/");
    const nav = walk(join(path, "data/navigation"))
      .map((f) => readFileSync(f, "utf8"))
      .join("\n");
    report.routes = routes;
    report.unlinked = routes.filter((r) => r !== "/" && !new RegExp(`href:\\s*["']?${r}/?["']?\\s*$`, "m").test(nav));
    checks["every page linked"] = (report.unlinked as string[]).length === 0;

    // In English.
    checks.english = /<html[^>]*lang="en/.test(read("pages/index.liquid"));

    // A picture of every page, and of one event's page.
    const eventRecord = eventPage
      ? walk(join(path, "data", /\[([^\]]+)\]/.exec(eventPage) ? eventPage.split("/")[1]! : ""))
          .map((f) => relative(path, f))
          .find((f) => f.endsWith(".md"))
      : undefined;
    const eventRoute =
      eventPage && eventRecord
        ? `/${eventPage.split("/")[1]}/${eventRecord.split("/").at(-1)!.replace(/\.md$/, "")}`
        : undefined;
    report.eventRoute = eventRoute;
    for (const route of [...routes, ...(eventRoute ? [eventRoute] : [])]) {
      await invoke("preview:navigate", route);
      await new Promise((r) => setTimeout(r, 2_500));
      await preview("window.scrollTo(0, 0)").catch(() => {});
      const name = route === "/" ? "home" : route.slice(1).replaceAll("/", "_");
      writeFileSync(join(shots, `${name}.png`), Buffer.from(await capture(), "base64"));
    }

    report.checks = checks;
    expect(Object.entries(checks).filter(([, ok]) => !ok)).toEqual([]);
  }, 1_000_000);
});
