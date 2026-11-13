import { cpSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";
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
    await expect(main<boolean>("globalThis.upstart.templateViewer.view.getVisible()")).resolves.toBe(false);
    await launched.capture("start-sent");
  });
});
