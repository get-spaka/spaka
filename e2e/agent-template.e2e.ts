// "Starting from a template" with the real agent, in the packaged app (templates
// slice 10, Q229, Q246, Q247). Opt-in like agent.e2e.ts: UPSTART_REAL_AGENT=1,
// with .cache/agent-config signed in, and the app packaged first.
// The maker chooses a template, downloaded from the public repository's latest
// release, and describes a business of their own: Reel for a ceramics studio,
// in English; Corner for a cheese shop, in French (UPSTART_TEMPLATE_CASE runs
// one). The agent should rewrite every text and record for it, in the maker's
// language, replace the images, keep the design and its effects, and leave
// none of the template's sentences.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { sentencesOf, templateTexts } from "../apps/desktop/src/main/templates/adapt.ts";
import { readTemplateFolder } from "../apps/desktop/src/main/templates/reader.ts";
import { type LaunchedApp, launchApp, runsDir, SLOW } from "./app.ts";

const real = process.env.UPSTART_REAL_AGENT === "1";
const configDir = join(import.meta.dirname, "../.cache/agent-config");
const dataRoot = join(import.meta.dirname, "../.cache/agent-template-data");
const CASES = [
  {
    // An original, moving design, its work replaced by a potter's series.
    name: "reel",
    template: "reel",
    message:
      "A website for Terra Lenta, a small ceramics studio in Lisbon run by two potters, Inês and Tomás: the pieces we make (tableware and vases, each a series), the wheel-throwing classes we teach on weekends, and how to visit the studio in Marvila.",
    business: /terra lenta/i,
    invented: /halfvolt|keileweg|rotterdam/i,
    effects: ["data-kinetic", "data-reel", "data-tilt", "data-cursor"],
    lang: "en",
  },
  {
    // A standard design, the maker writing in French: the site is in French.
    name: "corner",
    template: "corner",
    message:
      "Un site pour la Fromagerie Bastide, une petite fromagerie de quartier à Toulouse, rue des Filatiers : nos fromages du moment, les plateaux à commander pour les fêtes, nos horaires et comment venir.",
    business: /bastide/i,
    invented: /marlow/i,
    effects: ["data-reveal", "data-open-now"],
    lang: "fr",
  },
];
const only = process.env.UPSTART_TEMPLATE_CASE;

const walk = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.name.startsWith(".") ? [] : e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      )
    : [];
const TEXT_FILE = /^(?:pages|parts|fragments)\/.+\.(?:liquid|html?)$|^data\/[^/]+\/[^_][^/]*\.md$/;

describe.skipIf(!real).each(CASES.filter((c) => !only || c.name === only))(
  "Starting from $template with the real agent, packaged",
  ({ name, template: TEMPLATE, message, business, invented, effects, lang }) => {
    let launched: LaunchedApp;
    const shots = join(runsDir, `agent-template-${name}`);
    const record = join(runsDir, `real-agent-template-${name}.jsonl`);
    const report: Record<string, unknown> = {};
    const dataDir = () => join(dataRoot, name);
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
      rmSync(dataDir(), { recursive: true, force: true });
      launched = await launchApp({
        packaged: true,
        env: {
          UPSTART_AGENT_REPLAY: "",
          UPSTART_AGENT_CONFIG_DIR: configDir,
          UPSTART_AGENT_RECORD: record,
          UPSTART_DATA_DIR: dataDir(),
        },
      });
      await launched.window.getByTestId("start").waitFor();
    }, 90_000 * SLOW);
    afterAll(async () => {
      writeFileSync(join(runsDir, `real-agent-template-${name}.json`), JSON.stringify(report, null, 2));
      await launched?.close();
    });

    test(
      "a business of the maker's: rewritten, in the maker's language, its design and effects kept",
      async () => {
        const w = launched.window;
        // Chosen on the start screen, then described, as a maker does.
        await w.locator(`[data-testid="template-card"][data-template="${TEMPLATE}"] button[aria-pressed]`).click();
        await w.getByTestId("message-input").fill(message);
        const started = Date.now();
        await w.getByTestId("message-input").press("Enter");
        await w.getByTestId("conversation").waitFor({ timeout: 120_000 });
        for (;;) {
          const state = await invoke("conversation:get");
          const last = state?.items.at(-1);
          if (last?.kind === "agent" && last.status !== "working") break;
          if (Date.now() - started > 1_800_000) throw new Error("the agent did not finish in 30 minutes");
          await new Promise((r) => setTimeout(r, 1000));
        }
        report.turnMs = Date.now() - started;
        const project = await invoke("projects:current");
        const path: string = project.path;
        report.project = path;
        const read = (file: string) => (existsSync(join(path, file)) ? readFileSync(join(path, file), "utf8") : "");
        const checks: Record<string, boolean> = {};

        // The template, downloaded from the release into the app's cache, recorded in the project.
        const version: string = project.template?.version ?? "";
        const cached = join(dataDir(), "template-cache/templates", TEMPLATE, version);
        checks["started from the template"] = project.template?.id === TEMPLATE;
        checks["downloaded into the cache"] = existsSync(join(cached, "template.json"));
        const files = readTemplateFolder(cached);
        const original = (file: string) => files.get(file)?.toString("utf8") ?? "";

        // Every text rewritten: none of the template's sentences, nor its invented business, left.
        const template = new Set(templateTexts(files).map((s) => s.toLowerCase().replace(/\s+/g, " ")));
        const siteFiles = walk(path)
          .map((f) => relative(path, f))
          .filter((f) => TEXT_FILE.test(f));
        const left = siteFiles.flatMap((file) =>
          sentencesOf(file, read(file))
            .filter((s) => template.has(s.toLowerCase().replace(/\s+/g, " ")))
            .map((s) => `${file}: ${s}`),
        );
        report.templateTextsLeft = left;
        checks["no template text left"] = left.length === 0;
        report.inventedLeft = siteFiles.filter((f) => invented.test(read(f)));
        checks["no invented business left"] = (report.inventedLeft as string[]).length === 0;
        checks["about the maker's business"] = business.test(siteFiles.map(read).join("\n"));
        // Upstart named what was left at the end of a turn, if anything was (Q246).
        report.toldOfTemplateTexts = messages().filter(
          (m) => m?.type === "user" && JSON.stringify(m).includes("of the template's invented business"),
        ).length;

        // The images replaced, with their credits; none of the template's still shown.
        report.findImages = calls("mcp__upstart__find_images").length;
        report.useImage = calls("mcp__upstart__use_image").length;
        const templateMedia = [...files.keys()].filter((f) => f.startsWith("media/") && !f.endsWith(".json"));
        const shown = siteFiles.map(read).join("\n") + read("theme.css");
        report.templateImagesShown = templateMedia.filter((f) => shown.includes(f.slice("media/".length)));
        report.templateImagesKept = templateMedia.filter((f) => existsSync(join(path, f)));
        checks["images found"] = (report.useImage as number) >= 3;
        checks["no template image shown"] = (report.templateImagesShown as string[]).length === 0;

        // The design kept: the theme, the scripts and the effects' attributes.
        checks["theme kept"] = read("theme.css") === original("theme.css");
        const scripts = [...files.keys()].filter((f) => f.startsWith("scripts/"));
        report.scriptsChanged = scripts.filter((f) => read(f) !== original(f));
        checks["scripts kept"] = (report.scriptsChanged as string[]).length === 0;
        const markup = siteFiles.map(read).join("\n");
        report.effects = Object.fromEntries(effects.map((a) => [a, markup.includes(a)]));
        checks["effects kept"] = Object.values(report.effects as Record<string, boolean>).every(Boolean);
        report.lang = /<html[^>]*lang="([\w-]+)/.exec(read("pages/index.liquid"))?.[1];
        checks["in the maker's language"] = String(report.lang).startsWith(lang);

        // Its pages, each linked in the navigation.
        const pages = walk(join(path, "pages")).map((f) => relative(path, f));
        report.pages = pages;
        const routes = pages
          .filter((p) => !p.includes("["))
          .map((p) => p.replace(/^pages/, "").replace(/(\/index)?\.liquid$/, "") || "/");
        const nav = walk(join(path, "data/navigation"))
          .map((f) => readFileSync(f, "utf8"))
          .join("\n");
        report.routes = routes;
        report.unlinked = routes.filter(
          (r) => r !== "/" && !new RegExp(`href:\\s*["']?${r}/?["']?\\s*$`, "m").test(nav),
        );
        checks["every page linked"] = (report.unlinked as string[]).length === 0;

        // Moving in the preview, in visitor mode; a picture of each page and of one record's page.
        await invoke("preview:navigate", "/");
        await new Promise((r) => setTimeout(r, 3_000));
        checks["moving in the preview"] = await preview<boolean>(
          "document.documentElement.hasAttribute('data-up-moving')",
        ).catch(() => false);
        const recordPages = pages.filter((p) => p.includes("["));
        const recordRoutes = recordPages.flatMap((p) => {
          const ds = /\[([^\]]+)\]/.exec(p)?.[1] ?? "";
          const first = walk(join(path, "data", ds)).find(
            (f) => f.endsWith(".md") && !f.split("/").at(-1)!.startsWith("_"),
          );
          return first
            ? [`/${p.split("/").slice(1, -1).join("/")}/${first.split("/").at(-1)!.replace(/\.md$/, "")}`]
            : [];
        });
        report.recordRoutes = recordRoutes;
        const errors: Record<string, string[]> = {};
        for (const route of [...routes, ...recordRoutes]) {
          await invoke("preview:navigate", route);
          await new Promise((r) => setTimeout(r, 3_000));
          await preview("window.scrollTo(0, 0)").catch(() => {});
          const name = route === "/" ? "home" : route.slice(1).replaceAll("/", "_");
          writeFileSync(join(shots, `${name}.png`), Buffer.from(await capture(), "base64"));
          // The page the runtime answers with when a page cannot be rendered.
          const error = await preview<string | null>(
            "document.title === 'Render error' ? document.body.textContent.trim().slice(0, 300) : null",
          ).catch(() => null);
          if (error) errors[route] = [error];
        }
        report.pageErrors = errors;
        checks["no page errors"] = Object.keys(errors).length === 0;

        report.checks = checks;
        expect(Object.entries(checks).filter(([, ok]) => !ok)).toEqual([]);
      },
      2_000_000 * SLOW,
    );
  },
);
