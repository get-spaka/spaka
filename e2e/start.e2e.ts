import { cpSync, existsSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, runsDir } from "./app.ts";

// The start screen (Q245, Q249, Q263, Q264): with no website open, the sidebar
// and one large panel of templates. Chips filter them, originals first with
// a badge; a thumbnail moves on hover, a click chooses it, View shows it large
// and moving, its pages to go to; an imported template is shown, then added.
// The first message creates the website from the chosen template, and the
// window takes its usual layout.
describe("the start screen", () => {
  let launched: LaunchedApp;
  const main = <T>(code: string): Promise<T> =>
    launched.app.evaluate(
      // biome-ignore lint/security/noGlobalEval: the step, written by the check itself
      (_electron, code) => eval(code),
      code,
    ) as Promise<T>;
  const viewer = <T>(js: string): Promise<T> =>
    main<T>(`globalThis.upstart.templateViewer.view.webContents.executeJavaScript(${JSON.stringify(js)})`);
  const until = async <T>(read: () => Promise<T>, timeout = 15_000): Promise<T> => {
    const started = Date.now();
    for (;;) {
      const value = await read().catch(() => undefined);
      if (value) return value;
      if (Date.now() - started > timeout) throw new Error(`timed out waiting for: ${read}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  };

  beforeAll(async () => {
    launched = await launchApp();
    await launched.window.getByTestId("start").waitFor();
  });
  afterAll(async () => {
    await launched?.close();
  });

  test("the templates, originals first with their badge, and a chip per category they have", async () => {
    const w = launched.window;
    await w.getByTestId("template-card").first().waitFor();
    const cards = w.getByTestId("template-card");
    const ids = await cards.evaluateAll((els) => els.map((el) => el.getAttribute("data-template")));
    expect(ids).toEqual(expect.arrayContaining(["reel", "ember", "corner", "beacon"]));
    // The originals come first (Q264), each with its badge (Q263).
    const originals = await cards.evaluateAll((els) =>
      els.map((el) => !!el.querySelector('[data-testid="template-original"]')),
    );
    const firstStandard = originals.indexOf(false);
    expect(firstStandard).toBeGreaterThan(0);
    expect(originals.slice(firstStandard).every((o) => !o)).toBe(true);
    const chips = await w.getByTestId("template-chip").evaluateAll((els) => els.map((el) => el.dataset.category));
    expect(chips).toEqual(["all", "business", "portfolio", "blog", "launch", "event", "app"]);
    await w.locator('[data-testid="template-chip"][data-category="event"]').click();
    await expect(cards.evaluateAll((els) => els.map((el) => el.getAttribute("data-template")))).resolves.toEqual([
      "marquee",
    ]);
    await w.locator('[data-testid="template-chip"][data-category="all"]').click();
    await expect(cards.count()).resolves.toBe(ids.length);
    await launched.capture("start");
  });

  test("a thumbnail moves on hover; a click chooses it and the message box says so", async () => {
    const w = launched.window;
    const card = w.locator('[data-testid="template-card"][data-template="ember"]');
    await card.hover();
    await card.getByTestId("template-hover").waitFor();
    await expect(card.getByTestId("template-hover").getAttribute("src")).resolves.toMatch(/^data:image\/webp/);
    await expect(w.getByTestId("chosen-template-none").isVisible()).resolves.toBe(true);
    await card.locator("button[aria-pressed]").click();
    await expect(card.getAttribute("data-chosen")).resolves.toBe("true");
    await expect(w.getByTestId("chosen-template").textContent()).resolves.toBe("Starting from Ember");
    await w.getByTestId("chosen-template-clear").click();
    await expect(w.getByTestId("chosen-template-none").isVisible()).resolves.toBe(true);
  });

  test("View shows a template large, real and moving, its pages to go to", async () => {
    const w = launched.window;
    const card = w.locator('[data-testid="template-card"][data-template="reel"]');
    await card.hover();
    await card.getByTestId("template-view").click();
    await w.getByTestId("template-large").waitFor();
    // The native view lies over the frame, its page the template's home, in visitor mode.
    await until(() => main<boolean>("globalThis.upstart.templateViewer.view.getVisible()"));
    await until(() => w.locator('[data-testid="template-frame"][data-route="/"]').count());
    const frame = await w.getByTestId("template-frame").boundingBox();
    const bounds = await main<{ width: number; height: number }>("globalThis.upstart.templateViewer.view.getBounds()");
    expect(Math.abs(bounds.width - frame!.width)).toBeLessThan(2);
    expect(Math.abs(bounds.height - frame!.height)).toBeLessThan(2);
    await until(() => viewer<boolean>("document.documentElement.hasAttribute('data-up-moving')"));
    await expect(viewer<string>("document.title")).resolves.toMatch(/Halfvolt/);
    // Its pages, from the select and from its own links.
    const pages = await w
      .getByTestId("template-page")
      .evaluate((el: HTMLSelectElement) => [...el.options].map((o) => o.value));
    expect(pages).toEqual(expect.arrayContaining(["/", "/work", "/studio", "/contact"]));
    await w.getByTestId("template-page").selectOption("/studio");
    await until(() => w.locator('[data-testid="template-frame"][data-route="/studio"]').count());
    await until(() => viewer<boolean>("location.pathname === '/studio'"));
    await viewer("document.querySelector('a[href=\"/contact\"]').click(), true");
    await until(() => w.locator('[data-testid="template-frame"][data-route="/contact"]').count());
    await launched.capture("start-view");
    // The template itself, as the native view draws it over the frame.
    await new Promise((r) => setTimeout(r, 1500));
    const png = await main<string>(
      "globalThis.upstart.templateViewer.view.webContents.capturePage().then((i) => i.toPNG().toString('base64'))",
    );
    writeFileSync(join(runsDir, "start-view-page.png"), Buffer.from(png, "base64"));
    // Chosen from here, then back to the grid: the view is hidden.
    await w.getByTestId("template-choose").click();
    await expect(w.getByTestId("chosen-template").textContent()).resolves.toBe("Starting from Reel");
    await w.getByTestId("template-back").click();
    await w.getByTestId("template-card").first().waitFor();
    await until(async () => !(await main<boolean>("globalThis.upstart.templateViewer.view.getVisible()")));
  });

  test("an imported template is shown before it is added, then listed and chosen", async () => {
    const w = launched.window;
    const dir = join(mkdtempSync(join(tmpdir(), "upstart-import-")), "lighthouse");
    const beacon = join(import.meta.dirname, "../apps/desktop/templates/beacon");
    cpSync(beacon, dir, { recursive: true });
    const manifest = JSON.parse(readFileSync(join(dir, "template.json"), "utf8"));
    writeFileSync(join(dir, "template.json"), JSON.stringify({ ...manifest, id: "lighthouse", name: "Lighthouse" }));
    const skills = join(dir, ".upstart/skills");
    renameSync(join(skills, "beacon-design"), join(skills, "lighthouse-design"));
    const skill = join(skills, "lighthouse-design/SKILL.md");
    writeFileSync(skill, readFileSync(skill, "utf8").replace("name: beacon-design", "name: lighthouse-design"));
    await main(`globalThis.upstart.checks.importPath = ${JSON.stringify(dir)}`);

    await w.getByTestId("template-import").click();
    await w.getByTestId("template-import-dialog").waitFor();
    await expect(w.getByTestId("template-import-dialog").textContent()).resolves.toContain("Lighthouse");
    await w.getByTestId("template-import-add").click();
    await w.locator('[data-testid="template-card"][data-template="lighthouse"]').waitFor();
    await expect(w.getByTestId("chosen-template").textContent()).resolves.toBe("Starting from Lighthouse");
    // Back to Reel for the website.
    await w.locator('[data-testid="template-card"][data-template="reel"] button[aria-pressed]').click();
    await expect(w.getByTestId("chosen-template").textContent()).resolves.toBe("Starting from Reel");
  });

  test("the first message creates the website from the chosen template; the window takes its usual layout", async () => {
    const w = launched.window;
    await w.getByTestId("message-input").fill("A ceramics studio in Lisbon.");
    await w.getByTestId("message-input").press("Enter");
    await w.getByTestId("conversation").waitFor();
    await w.getByTestId("preview").waitFor();
    await expect(w.getByTestId("start").count()).resolves.toBe(0);
    await expect(w.getByTestId("project-name").textContent()).resolves.toBe("A ceramics studio in Lisbon");
    const project = await w.evaluate(() =>
      // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
      (window as any).upstart.invoke("projects:current"),
    );
    expect(project.template).toEqual({ id: "reel", version: "1.0.0" });
    expect(JSON.parse(readFileSync(join(project.path, ".upstart/project.json"), "utf8")).template.id).toBe("reel");
    // The template is copied into the website, without its manifest and pictures (Q229, Q246)…
    for (const path of [
      "pages/work.liquid",
      "parts/header.liquid",
      "scripts/libraries.json",
      ".upstart/skills/reel-design/SKILL.md",
      ".upstart/template-texts.json",
    ])
      expect(existsSync(join(project.path, path)), path).toBe(true);
    expect(existsSync(join(project.path, "template.json"))).toBe(false);
    // The preview shows the template's site at once, its pages among them.
    const routes = await main<string[]>("globalThis.upstart.preview.state().routes.map((r) => r.route)");
    expect(routes).toEqual(expect.arrayContaining(["/", "/work", "/studio", "/contact"]));
    await until(() => main<boolean>("globalThis.upstart.preview.view.getVisible()"));
    expect(existsSync(join(project.path, "pictures"))).toBe(false);
    // …the conversation shows the maker's words, and the agent gets them with what adapting the template means.
    await expect(w.getByTestId("maker-message").textContent()).resolves.toBe("A ceramics studio in Lisbon.");
    const received = await main<string[]>("globalThis.upstart.replayed");
    expect(received.at(-1)).toContain('template "Reel"');
    expect(received.at(-1)).toContain("reel-design skill");
    expect(received.at(-1)?.endsWith("A ceramics studio in Lisbon.")).toBe(true);
    await expect(main<boolean>("globalThis.upstart.templateViewer.view.getVisible()")).resolves.toBe(false);
    await launched.capture("start-sent");
  });

  test("the Blocks tab shows this design's blocks first, and one dragged into the page goes in (Q235)", async () => {
    const w = launched.window;
    await until(() => w.locator('[data-testid="agent-message"][data-status="done"]').count(), 30_000);
    const project = await w.evaluate(() =>
      // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
      (window as any).upstart.invoke("projects:current"),
    );
    await w.getByTestId("tab-blocks").click();
    const design = w.getByTestId("blocks-design");
    await design.waitFor();
    const ids = await design.getByTestId("block").evaluateAll((els) => els.map((el) => el.getAttribute("data-block")));
    expect(ids).toHaveLength(7);
    expect(ids).toEqual(expect.arrayContaining(["hero-reel-kinetic", "team-reel-pile", "gallery-reel-horizontal"]));
    // First in the tab, and not again in the kinds' groups below.
    const first = await w.getByTestId("block").first().getAttribute("data-block");
    expect(ids).toContain(first);
    await expect(w.locator('[data-testid="blocks-group"] [data-block="team-reel-pile"]').count()).resolves.toBe(0);
    await design.locator("img").first().waitFor({ timeout: 20_000 });
    await launched.capture("start-design-blocks");

    // Dragged into the home page, below its first section.
    const page = (js: string) =>
      main<unknown>(`globalThis.upstart.preview.view.webContents.executeJavaScript(${JSON.stringify(js)})`);
    await w.evaluate(() =>
      // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
      (window as any).upstart.invoke("preview:navigate", "/"),
    );
    await until(() => page("!!document.querySelector('upstart-editor') && location.pathname === '/'"));
    const home = () => readFileSync(join(project.path, "pages/index.liquid"), "utf8");
    const before = home();
    const drag = (type: string) => `(() => {
      const first = document.querySelector('main > *, body > section');
      const r = first.getBoundingClientRect();
      const data = new DataTransfer();
      data.setData('application/x-upstart-block', 'team-reel-pile');
      const event = new DragEvent(${JSON.stringify(type)}, { bubbles: true, cancelable: true, dataTransfer: data,
        clientX: 200, clientY: Math.round(Math.min(r.bottom - 2, r.top + r.height * 0.75)) });
      return !document.elementFromPoint(200, 10).dispatchEvent(event);
    })()`;
    await page(drag("dragover"));
    await page(drag("drop"));
    await until(async () => home() !== before);
    expect(home()).toContain("{% render 'team-reel-pile' %}");
    const part = readFileSync(join(project.path, "parts/team-reel-pile.liquid"), "utf8");
    // The design's own markup, its texts as lorem ipsum for the site's own (Q223).
    const block = readFileSync(
      join(import.meta.dirname, "../apps/desktop/templates/reel/blocks/team/team-reel-pile/block.liquid"),
      "utf8",
    );
    expect(part.split("\n")[0]).toBe(block.split("\n")[0]);
    expect(part).toContain("{{ member.obsession }}");
    expect(part).toMatch(/\b(?:lorem|ipsum|amet|adipiscing)\b/i);
    expect(existsSync(join(project.path, "data/team/_datasource.yaml"))).toBe(true);
  });
});
