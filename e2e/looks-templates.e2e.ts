import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { projectFiles, readTemplateFolder } from "../apps/desktop/src/main/templates/reader.ts";
import { type LaunchedApp, launchApp, runsDir } from "./app.ts";

// The problems the agent's look measures (Q318), over every template: each
// page, at each of the three screens, screen after screen down to its
// bottom, as the agent would see them. A template is right when none is
// measured; a problem left is a fault of the template or a false alarm of
// the measure. A long check, run on demand:
//
//   UPSTART_LOOKS_TEMPLATES=all npx vitest run --config e2e/vitest.config.ts e2e/looks-templates.e2e.ts
//   UPSTART_LOOKS_TEMPLATES=pocket,reel …
//
// Writes e2e/.runs/looks-templates-<names>.json.
const asked = process.env.UPSTART_LOOKS_TEMPLATES ?? "";
const templatesDir = join(import.meta.dirname, "../apps/desktop/templates");
const names =
  asked === "all"
    ? readdirSync(templatesDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !["scripts", "node_modules"].includes(d.name) && !d.name.startsWith("."))
        .map((d) => d.name)
    : asked.split(",").filter(Boolean);
const SCREENS = ["desktop", "tablet", "phone"] as const;
/** At most this many screens down a page. */
const MAX_SCREENS = 30;

describe.skipIf(!names.length)("the looks' measures over the templates", () => {
  let launched: LaunchedApp;

  beforeAll(async () => {
    launched = await launchApp();
    await launched.window.getByTestId("message-input").waitFor();
  }, 60_000);
  afterAll(async () => {
    await launched?.close();
  });

  test(
    "no problem measured on any page, at any screen",
    async () => {
      const found: { template: string; route: string; screen: string; at: number; problem: string }[] = [];
      const timing: { template: string; looks: number; ms: number }[] = [];
      for (const name of names) {
        const files = readTemplateFolder(join(templatesDir, name));
        const copy = join(launched.projectsDir, name);
        mkdirSync(copy, { recursive: true });
        for (const [path, bytes] of projectFiles(files)) {
          mkdirSync(join(copy, path, ".."), { recursive: true });
          writeFileSync(join(copy, path), bytes);
        }
        const project = await launched.app.evaluate(
          // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
          (_electron, path) => (globalThis as any).upstart.projects.openFolder(path),
          copy,
        );
        await launched.window.evaluate(
          // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
          (id) => (window as any).upstart.invoke("projects:open", id),
          project.id,
        );
        // Every page, and the first record page of each kind.
        const routes = (await launched.app.evaluate(() => {
          // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
          const runtime = (globalThis as any).upstart.preview.runtime;
          const all = runtime.routes() as { route: string; file: string; generated?: boolean }[];
          const files = new Set<string>();
          return all
            .filter((r) => {
              if (files.has(r.file)) return false;
              files.add(r.file);
              return true;
            })
            .map((r) => r.route);
        })) as string[];
        const started = Date.now();
        let looks = 0;
        for (const route of routes)
          for (const screen of SCREENS) {
            const seen = new Set<string>();
            for (let i = 0; i < MAX_SCREENS; i++) {
              const at = (await launched.app.evaluate(
                async (_electron, { route, screen, first }) => {
                  // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
                  const preview = (globalThis as any).upstart.preview;
                  const s = first
                    ? await preview.look(route, { screen, fresh: true })
                    : await preview.look(undefined, { screen, steps: [{ action: "scroll", target: "down" }] });
                  return { problems: s.problems ?? [], position: s.position, route: s.route };
                },
                { route, screen, first: i === 0 },
              )) as { problems: string[]; position?: { screen: number; of: number }; route: string };
              looks++;
              for (const problem of at.problems)
                if (!seen.has(problem)) {
                  seen.add(problem);
                  found.push({ template: name, route, screen, at: at.position?.screen ?? 0, problem });
                  console.log(`[${name} ${route} ${screen} ${at.position?.screen}/${at.position?.of}] ${problem}`);
                }
              if (!at.position || at.position.screen >= at.position.of) break;
            }
          }
        timing.push({ template: name, looks, ms: Date.now() - started });
        console.log(
          `[${name}] ${routes.length} pages, ${looks} looks in ${Math.round((Date.now() - started) / 1000)} s`,
        );
      }
      mkdirSync(runsDir, { recursive: true });
      writeFileSync(
        join(runsDir, `looks-templates-${names.join("-")}.json`),
        JSON.stringify({ found, timing }, null, 2),
      );
      expect(found).toEqual([]);
    },
    3 * 60 * 60_000,
  );
});
