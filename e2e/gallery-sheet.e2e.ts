import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { PALETTES } from "../apps/desktop/src/shared/palettes.ts";
import { type LaunchedApp, launchApp, runsDir } from "./app.ts";
import { previewDriver } from "./preview-driver.ts";

// The gallery's review sheets (Q203): each block of a kind drawn by the app's
// own thumbnails under three palettes, light, dark and colourful, side by
// side, one picture per kind in e2e/.runs/gallery-sheets/. Run only when asked:
//   UPSTART_GALLERY_SHEET=1 (every kind) or UPSTART_GALLERY_SHEET=hero,faq
const asked = process.env.UPSTART_GALLERY_SHEET ?? "";
const SHEET_PALETTES = ["paper", "midnight", "citrus"];
const outDir = join(runsDir, "gallery-sheets");

describe.skipIf(!asked)("the gallery's review sheets", () => {
  let launched: LaunchedApp;
  const { invoke, until } = previewDriver(() => launched);

  beforeAll(async () => {
    launched = await launchApp();
    await launched.window.getByTestId("conversation").waitFor();
    await invoke("conversation:send", "A bakery in Lyon. Warm colours please.");
    await until(() => launched.window.locator('[data-testid="agent-message"][data-status="done"]').count(), 30_000);
  }, 60_000);
  afterAll(async () => {
    await launched?.close();
  });

  test("one sheet per kind, every block under three palettes", async () => {
    type Block = { id: string; kind: string; name: string; data?: { name: string; family: string } };
    const blocks = ((await invoke("gallery:list")) as Block[]).filter(
      (b) => asked === "1" || asked.split(",").includes(b.kind),
    );
    expect(blocks.length).toBeGreaterThan(0);
    const path = (await invoke("projects:current")).path as string;
    const drawn = new Map<string, string[]>();
    for (const id of SHEET_PALETTES) {
      const colors = PALETTES.find((p) => p.id === id)!.colors;
      await invoke("theme:apply", { ...colors });
      await until(
        async () => readFileSync(join(path, "theme.css"), "utf8").includes(colors["--theme-color-primary"]),
        5_000,
      );
      for (const b of blocks) drawn.set(b.id, [...(drawn.get(b.id) ?? []), await invoke("gallery:thumbnail", b.id)]);
    }

    mkdirSync(outDir, { recursive: true });
    const kinds = [...new Set(blocks.map((b) => b.kind))];
    for (const kind of kinds) {
      const rows = blocks
        .filter((b) => b.kind === kind)
        .map(
          (
            b,
          ) => `<div class="row"><p><b>${b.name}</b> · ${b.id}${b.data ? ` · data: ${b.data.name} (${b.data.family})` : ""}</p>
<div class="cols">${drawn
            .get(b.id)!
            .map((src) => `<img src="${src}">`)
            .join("")}</div></div>`,
        )
        .join("\n");
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;padding:24px;font:14px system-ui;background:#e5e5e5;color:#111}
h1{font-size:20px;margin:0 0 4px} .legend{margin:0 0 16px;color:#555}
.row{margin-bottom:28px} .row p{margin:0 0 6px} .cols{display:grid;grid-template-columns:repeat(3,480px);gap:12px;align-items:start}
img{width:480px;display:block;border:1px solid #bbb;background:#fff}
</style></head><body><h1>${kind}</h1><p class="legend">${SHEET_PALETTES.join(" · ")}</p>${rows}</body></html>`;
      const file = join(outDir, `${kind}.html`);
      writeFileSync(file, html);
      // A window of its own, never shown, pictured whole.
      const opened = launched.app.waitForEvent("window", (page) => page.url().endsWith(`/${kind}.html`));
      await launched.app.evaluate(async ({ BrowserWindow }, target) => {
        const win = new BrowserWindow({ show: false, width: 1560, height: 900 });
        await win.loadFile(target);
      }, file);
      const page = await opened;
      await page.screenshot({ path: join(outDir, `${kind}.png`), fullPage: true });
      await page.close();
    }
  }, 600_000);
});
