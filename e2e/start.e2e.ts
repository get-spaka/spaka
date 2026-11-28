import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, runsDir, SLOW } from "./app.ts";

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
    main<T>(`globalThis.spaka.templateViewer.view.webContents.executeJavaScript(${JSON.stringify(js)})`);
  const until = async <T>(read: () => Promise<T>, timeout = 15_000): Promise<T> => {
    timeout *= SLOW;
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

  test("the templates, by name, and a chip per category they have", async () => {
    const w = launched.window;
    // From scratch at first: the templates folded away, neither zone the maker's yet.
    await expect(w.getByTestId("start-way-scratch").getAttribute("aria-pressed")).resolves.toBe("true");
    await expect(w.getByTestId("start-templates").getAttribute("data-folded")).resolves.toBe("true");
    await expect(w.getByTestId("start-templates").getAttribute("data-active")).resolves.toBeNull();
    await expect(w.getByTestId("start-prompt").getAttribute("data-active")).resolves.toBeNull();
    await expect(w.getByTestId("chosen-template-none").isVisible()).resolves.toBe(true);
    // From a template: they unfold.
    await w.getByTestId("start-way-template").click();
    await expect(w.getByTestId("start-templates").getAttribute("data-folded")).resolves.toBeNull();
    await w.getByTestId("template-card").first().waitFor();
    const cards = w.getByTestId("template-card");
    const ids = await cards.evaluateAll((els) => els.map((el) => el.getAttribute("data-template") ?? ""));
    expect(ids).toEqual(expect.arrayContaining(["reel", "ember", "corner", "beacon"]));
    // By name, with no badge for the original designs any more (Q396); each name is its id.
    expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)));
    const chips = await w.getByTestId("template-chip").evaluateAll((els) => els.map((el) => el.dataset.category));
    expect(chips).toEqual(["all", "business", "portfolio", "blog", "launch", "event", "app"]);
    await w.locator('[data-testid="template-chip"][data-category="event"]').click();
    const events = await cards.evaluateAll((els) => els.map((el) => el.getAttribute("data-template")));
    // Every event template and no other, by their manifests: a new template changes the list.
    const folder = join(import.meta.dirname, "../apps/desktop/templates");
    const category = (id: string): string => {
      const manifest = join(folder, id, "template.json");
      return existsSync(manifest) ? JSON.parse(readFileSync(manifest, "utf8")).category : "";
    };
    expect(events.sort()).toEqual(
      readdirSync(folder)
        .filter((id) => category(id) === "event")
        .sort(),
    );
    expect(events).toEqual(expect.arrayContaining(["kindly", "marquee", "plinth"]));
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
    // From a template, none chosen yet: nothing is sent.
    await expect(w.getByTestId("chosen-template-missing").isVisible()).resolves.toBe(true);
    await card.locator("button[aria-pressed]").click();
    await expect(card.getAttribute("data-chosen")).resolves.toBe("true");
    await expect(w.getByTestId("chosen-template").textContent()).resolves.toBe("Starting from Ember");
    // Cleared, it is still a start from a template: nothing is sent until one is chosen.
    await w.getByTestId("chosen-template-clear").click();
    await expect(w.getByTestId("chosen-template-missing").isVisible()).resolves.toBe(true);
    await expect(w.getByTestId("start-way-template").getAttribute("aria-pressed")).resolves.toBe("true");
    await w.getByTestId("message-input").fill("A ceramics studio in Lisbon.");
    await expect(w.getByTestId("send").isDisabled()).resolves.toBe(true);
    await w.getByTestId("message-input").press("Enter");
    await expect(w.getByTestId("start").isVisible()).resolves.toBe(true);
    await w.getByTestId("message-input").fill("");
  });

  test("the zone the maker is in has a thicker border: the templates, or the message box", async () => {
    const w = launched.window;
    const templates = w.getByTestId("start-templates");
    const box = w.getByTestId("start-prompt");
    // Three zones, one under the other: the two ways to start, the templates, the message box.
    for (const id of ["start-top", "start-templates", "start-prompt"])
      await expect(w.getByTestId(id).isVisible()).resolves.toBe(true);
    const form = w.locator('[data-tour="conversation"]');
    const active = async () => {
      const lit = {
        templates: (await templates.getAttribute("data-active")) === "true",
        box: (await box.getAttribute("data-active")) === "true",
      };
      // The message box's own frame is the one drawn thicker, not the whole zone.
      expect((await form.getAttribute("data-active")) === "true").toBe(lit.box);
      return lit;
    };
    await w.getByTestId("start-way-template").click();
    await expect(active()).resolves.toEqual({ templates: true, box: false });
    await expect(w.getByTestId("start-way-template").getAttribute("aria-pressed")).resolves.toBe("true");
    await launched.capture("start-zone-templates");
    // Choosing a template takes the maker to the message box.
    const card = w.locator('[data-testid="template-card"][data-template="ember"]');
    await card.locator("button[aria-pressed]").click();
    await expect(active()).resolves.toEqual({ templates: false, box: true });
    await expect(w.evaluate(() => document.activeElement?.getAttribute("data-testid"))).resolves.toBe("message-input");
    await launched.capture("start-zone-prompt");
    // Choosing another one changes the template only: the message box stays lit, the templates never are.
    await w.evaluate(() => {
      const zone = document.querySelector('[data-testid="start-templates"]')!;
      const page = window as unknown as { litTemplates: boolean };
      page.litTemplates = false;
      new MutationObserver(() => {
        if (zone.hasAttribute("data-active")) page.litTemplates = true;
      }).observe(zone, { attributes: true, attributeFilter: ["data-active"] });
    });
    await w.locator('[data-testid="template-card"][data-template="reel"] button[aria-pressed]').click();
    await expect(w.getByTestId("chosen-template").textContent()).resolves.toBe("Starting from Reel");
    await expect(active()).resolves.toEqual({ templates: false, box: true });
    await expect(w.evaluate(() => (window as unknown as { litTemplates: boolean }).litTemplates)).resolves.toBe(false);
    await w.locator('[data-testid="template-card"][data-template="ember"] button[aria-pressed]').click();
    // Choosing it again leaves it, and the maker is back among the templates.
    await card.locator("button[aria-pressed]").click();
    await expect(active()).resolves.toEqual({ templates: true, box: false });
    await w.getByTestId("start-way-scratch").click();
    await expect(active()).resolves.toEqual({ templates: false, box: true });
    await expect(w.getByTestId("start-way-scratch").getAttribute("aria-pressed")).resolves.toBe("true");
    // From scratch, the templates fold away and the message box, taller, rises to the middle.
    await expect(templates.getAttribute("data-folded")).resolves.toBe("true");
    await expect(w.getByTestId("chosen-template-none").isVisible()).resolves.toBe(true);
    await until(async () => ((await templates.boundingBox())?.height ?? 2) < 2);
    const field = await w.getByTestId("message-input").boundingBox();
    expect(field!.height).toBeGreaterThan(150);
    await launched.capture("start-scratch");
    // Back to the templates: they unfold.
    await w.getByTestId("start-way-template").click();
    await expect(templates.getAttribute("data-folded")).resolves.toBeNull();
    await until(async () => ((await templates.boundingBox())?.height ?? 0) > 200);
    // A click anywhere in a zone makes it the maker's.
    await w.getByRole("heading", { name: "Templates" }).click();
    await expect(active()).resolves.toEqual({ templates: true, box: false });
  });

  test("View shows a template large, real and moving, its pages to go to", async () => {
    const w = launched.window;
    const card = w.locator('[data-testid="template-card"][data-template="reel"]');
    await card.hover();
    await card.getByTestId("template-view").click();
    await w.getByTestId("template-large").waitFor();
    // The native view lies over the frame, its page the template's home, in visitor mode.
    await until(() => main<boolean>("globalThis.spaka.templateViewer.view.getVisible()"));
    await until(() => w.locator('[data-testid="template-frame"][data-route="/"]').count());
    const frame = await w.getByTestId("template-frame").boundingBox();
    const bounds = await main<{ width: number; height: number }>("globalThis.spaka.templateViewer.view.getBounds()");
    expect(Math.abs(bounds.width - frame!.width)).toBeLessThan(2);
    expect(Math.abs(bounds.height - frame!.height)).toBeLessThan(2);
    await until(() => viewer<boolean>("document.documentElement.hasAttribute('data-spaka-moving')"));
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
      "globalThis.spaka.templateViewer.view.webContents.capturePage().then((i) => i.toPNG().toString('base64'))",
    );
    writeFileSync(join(runsDir, "start-view-page.png"), Buffer.from(png, "base64"));
    // Chosen from here, then back to the grid: the view is hidden.
    await w.getByTestId("template-choose").click();
    await expect(w.getByTestId("chosen-template").textContent()).resolves.toBe("Starting from Reel");
    await w.getByTestId("template-back").click();
    await w.getByTestId("template-card").first().waitFor();
    await until(async () => !(await main<boolean>("globalThis.spaka.templateViewer.view.getVisible()")));
  });

  test("an imported template is shown before it is added, then listed and chosen", async () => {
    const w = launched.window;
    const dir = join(mkdtempSync(join(tmpdir(), "spaka-import-")), "lighthouse");
    const beacon = join(import.meta.dirname, "../apps/desktop/templates/beacon");
    cpSync(beacon, dir, { recursive: true });
    const manifest = JSON.parse(readFileSync(join(dir, "template.json"), "utf8"));
    writeFileSync(join(dir, "template.json"), JSON.stringify({ ...manifest, id: "lighthouse", name: "Lighthouse" }));
    const skills = join(dir, ".spaka/skills");
    renameSync(join(skills, "beacon-design"), join(skills, "lighthouse-design"));
    const skill = join(skills, "lighthouse-design/SKILL.md");
    writeFileSync(skill, readFileSync(skill, "utf8").replace("name: beacon-design", "name: lighthouse-design"));
    await main(`globalThis.spaka.checks.importPath = ${JSON.stringify(dir)}`);

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
    // Nothing but the templates and the message box: the agent asks the template's choices (Q297).
    await expect(w.getByTestId("template-questions").count()).resolves.toBe(0);
    // No plan mode from a template: the card of pages and the adaptation stand for it (Q312).
    await expect(w.getByTestId("mode-select").count()).resolves.toBe(0);
    await w.getByTestId("message-input").fill("A ceramics studio in Lisbon.");
    await w.getByTestId("message-input").press("Enter");
    await w.getByTestId("conversation").waitFor();
    await w.getByTestId("preview").waitFor();
    await expect(w.getByTestId("start").count()).resolves.toBe(0);
    await expect(w.getByTestId("project-name").textContent()).resolves.toBe("A ceramics studio in Lisbon");
    const project = await w.evaluate(() =>
      // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
      (window as any).spaka.invoke("projects:current"),
    );
    const reel = join(import.meta.dirname, "../apps/desktop/templates/reel/template.json");
    expect(project.template).toEqual({ id: "reel", version: JSON.parse(readFileSync(reel, "utf8")).version });
    expect(JSON.parse(readFileSync(join(project.path, ".spaka/project.json"), "utf8")).template.id).toBe("reel");
    // The template is copied into the website, without its manifest and pictures (Q229, Q246)…
    for (const path of [
      "pages/work.liquid",
      "parts/header.liquid",
      "scripts/libraries.json",
      ".spaka/skills/reel-design/SKILL.md",
      ".spaka/template-texts.json",
    ])
      expect(existsSync(join(project.path, path)), path).toBe(true);
    expect(existsSync(join(project.path, "template.json"))).toBe(false);
    expect(existsSync(join(project.path, "TEMPLATE.md"))).toBe(false);
    // The preview shows the template's site at once, its pages among them.
    const routes = await main<string[]>("globalThis.spaka.preview.state().routes.map((r) => r.route)");
    expect(routes).toEqual(expect.arrayContaining(["/", "/work", "/studio", "/contact"]));
    await until(() => main<boolean>("globalThis.spaka.preview.view.getVisible()"));
    expect(existsSync(join(project.path, "pictures"))).toBe(false);
    // …the conversation shows the maker's words, and the agent gets them with what adapting the template means.
    await expect(w.getByTestId("maker-message").textContent()).resolves.toBe("A ceramics studio in Lisbon.");
    const received = await main<string[]>("globalThis.spaka.replayed");
    expect(received.at(-1)).toContain('template "Reel"');
    expect(received.at(-1)).toContain("reel-design skill");
    expect(received.at(-1)?.endsWith("A ceramics studio in Lisbon.")).toBe(true);
    // Its guide with the first message, kept beside the website while it is adapted (Q299, Q302)…
    const guide = readFileSync(join(import.meta.dirname, "../apps/desktop/templates/reel/TEMPLATE.md"), "utf8").trim();
    expect(received.at(-1)).toContain(`<template-guide>\n${guide}\n</template-guide>`);
    expect(existsSync(join(project.path, ".spaka/adaptation/TEMPLATE.md"))).toBe(true);
    // …and the card of pages first, listing the template's page types, home first (Q302, Q306).
    expect(received.at(-1)).toMatch(
      /1\. First, before you change any file: show the maker the card of pages with choose_pages/,
    );
    const listed = [...(received.at(-1) ?? "").matchAll(/^ {2}- (\/[a-z-]*) \(/gm)].map((m) => m[1]);
    expect(listed[0]).toBe("/");
    expect(listed).toEqual(expect.arrayContaining(["/work", "/studio", "/contact"]));
    await expect(main<boolean>("globalThis.spaka.templateViewer.view.getVisible()")).resolves.toBe(false);
    await launched.capture("start-sent");
  });

  test("the Blocks tab shows this design's blocks first, and one dragged into the page goes in (Q235)", async () => {
    const w = launched.window;
    await until(() => w.locator('[data-testid="agent-message"][data-status="done"]').count(), 30_000);
    const project = await w.evaluate(() =>
      // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
      (window as any).spaka.invoke("projects:current"),
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
      main<unknown>(`globalThis.spaka.preview.view.webContents.executeJavaScript(${JSON.stringify(js)})`);
    await w.evaluate(() =>
      // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
      (window as any).spaka.invoke("preview:navigate", "/"),
    );
    await until(() => page("!!document.querySelector('spaka-editor') && location.pathname === '/'"));
    const home = () => readFileSync(join(project.path, "pages/index.liquid"), "utf8");
    const before = home();
    const drag = (type: string) => `(() => {
      const first = document.querySelector('main > *, body > section');
      const r = first.getBoundingClientRect();
      const data = new DataTransfer();
      data.setData('application/x-spaka-block', 'team-reel-pile');
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

  test("the adaptation's list shows the home page to look at; a click picks the next page, Continue sends it (Q303, Q313)", async () => {
    const w = launched.window;
    await w.getByTestId("tab-conversation").click();
    const bar = w.getByTestId("adaptation-bar");
    await bar.waitFor();
    // The replayed turn showed no card: its end keeps every page type, the home page adapted.
    const status = (route: string) =>
      w.locator(`[data-testid="adaptation-step"][data-route="${route}"]`).getAttribute("data-status");
    await expect(status("/")).resolves.toBe("ready");
    await expect(status("/studio")).resolves.toBe("todo");
    const steps = await w
      .getByTestId("adaptation-step")
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-route")));
    expect(steps[0]).toBe("/");
    await launched.capture("start-adaptation-bar");
    // A click on a page to do makes it the next one.
    await w.locator('[data-testid="adaptation-step"][data-route="/studio"] button').first().click();
    await until(async () => (await w.getByTestId("adaptation-continue").textContent()) === "Continue: Studio");
    await w.getByTestId("adaptation-continue").click();
    await until(async () => (await status("/studio")) === "doing" || (await status("/studio")) === "ready", 30_000);
    await expect(status("/")).resolves.toBe("done");
    const received = await main<string[]>("globalThis.spaka.replayed");
    expect(received.at(-1)).toMatch(/Next page of the adaptation: Studio \(\/studio\)\. Adapted already: /);
    await expect(w.getByTestId("maker-message").last().textContent()).resolves.toBe("Continue: Studio");
    await until(
      () =>
        w
          .locator('[data-testid="agent-message"]')
          .last()
          .getAttribute("data-status")
          .then((s) => s === "done"),
      30_000,
    );

    // The pages still showing the template's contents are marked in the grid (Q305)…
    const toAdapt = (route: string) =>
      w.locator(`[data-testid="page-thumb"][data-route="${route}"] [data-testid="page-to-adapt"]`).count();
    await until(async () => (await toAdapt("/work")) === 1).catch(async (error) => {
      const thumbs = await w
        .getByTestId("page-thumb")
        .evaluateAll((els) =>
          els.map(
            (el) =>
              `${el.getAttribute("data-route")}:${el.querySelector('[data-testid="page-to-adapt"]') ? "to adapt" : "-"}`,
          ),
        );
      const steps = await w.evaluate(() =>
        // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
        (window as any).spaka.invoke("adaptation:get"),
      );
      throw new Error(`${error.message}; thumbnails ${JSON.stringify(thumbs)}; adaptation ${JSON.stringify(steps)}`);
    });
    await expect(toAdapt("/contact")).resolves.toBe(1);
    await expect(toAdapt("/")).resolves.toBe(0);
    await expect(toAdapt("/studio")).resolves.toBe(0);
    // …and named before publishing, which stays possible (Q311).
    await w.getByTestId("export-open").click();
    const warning = w.getByTestId("publish-adaptation");
    await warning.waitFor();
    await expect(warning.textContent()).resolves.toMatch(/Work and Contact still show the template's contents/);
    await expect(w.getByTestId("publish-choice").count()).resolves.toBe(0);
    await launched.capture("start-publish-warning");
    await w.getByTestId("publish-anyway").click();
    await w.getByTestId("publish-choice").first().waitFor();
    await w.getByTestId("export-close").click();
  });
});
