import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp } from "./app.ts";

// The agent's look at a page (Q314–Q324): in a view of its own, on a screen
// it names, after steps done as a person would, the view's state kept until
// the end of the turn, the maker's preview never moved.

const page = (title: string, body: string) =>
  `<!doctype html>\n<html lang="en">\n<head><title>${title}</title></head>\n<body>\n{% render 'header' %}\n${body}\n</body>\n</html>\n`;

const HEADER = `<header class="navbar bg-base-200">
  <a href="/" class="btn btn-ghost">Wick</a>
  <details class="dropdown" id="menu">
    <summary class="btn">Menu</summary>
    <ul class="menu dropdown-content bg-base-100 rounded-box w-52 p-2 shadow">
      <li><a href="/visit">Visit us</a></li>
      <li><a href="https://example.com/">Elsewhere</a></li>
    </ul>
  </details>
</header>
`;

const HOME = page(
  "Wick",
  `<main>
  <section class="min-h-screen p-10"><h1 class="text-5xl">A bar by the sea</h1></section>
  <section class="min-h-screen p-10" id="faq">
    <details id="hours"><summary>When are you open?</summary><p>From five until late.</p></details>
  </section>
  <section class="min-h-screen p-10" id="contact">
    <form hx-post="/_data/contact" hx-target="this" hx-swap="outerHTML">
      <input name="email" type="email" placeholder="Your e-mail" class="input">
      <button type="submit" class="btn">Send</button>
    </form>
  </section>
</main>`,
);

type Seen = {
  route: string | null;
  screen?: string;
  position?: { screen: number; of: number; parts: string[] };
  steps?: { done: boolean; line: string }[];
  refused?: { method: string; url: string }[];
  png?: boolean;
};

describe("the agent's look at a page", () => {
  let launched: LaunchedApp;
  let folder: string;

  const look = (route?: string, options: object = {}) =>
    launched.app.evaluate(
      async (_electron, { route, options }) => {
        // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
        const seen = await (globalThis as any).upstart.preview.look(route, options);
        return { ...seen, png: !!seen.png };
      },
      { route, options },
    ) as Promise<Seen>;
  /** Code run in the agent's view. */
  const inView = (code: string) =>
    launched.app.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      (_electron, code) => (globalThis as any).upstart.preview.agentView.run(code),
      code,
    );
  /** Code run in the maker's preview. */
  const inPreview = (code: string) =>
    launched.app.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      (_electron, code) => (globalThis as any).upstart.preview.view.webContents.executeJavaScript(code),
      code,
    );
  const until = async (read: () => Promise<unknown>, timeout = 8000) => {
    const started = Date.now();
    for (;;) {
      const value = await read().catch(() => undefined);
      if (value) return value;
      if (Date.now() - started > timeout) throw new Error(`timed out waiting for: ${read}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  };

  beforeAll(async () => {
    launched = await launchApp();
    await launched.window.getByTestId("message-input").waitFor();
    const project = await launched.window.evaluate(() =>
      // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
      (window as any).upstart.invoke("projects:create", "Wick"),
    );
    folder = project.path;
    writeFileSync(join(folder, "theme.css"), ":root { --theme-color-primary: #b45309; }\n");
    mkdirSync(join(folder, "parts"));
    mkdirSync(join(folder, "pages"));
    writeFileSync(join(folder, "parts/header.liquid"), HEADER);
    writeFileSync(join(folder, "pages/index.liquid"), HOME);
    writeFileSync(join(folder, "pages/visit.liquid"), page("Visit — Wick", `<main><h1>Visit us</h1></main>`));
    await until(() => inPreview("document.querySelector('h1')?.textContent === 'A bar by the sea'"));
    await inPreview("window.__notMoved = true");
  });
  afterAll(async () => {
    await launched?.close();
  });

  test("a click opens the menu; the answer says where the view is", async () => {
    const seen = await look("/", { steps: [{ action: "click", target: "parts/header.liquid:4" }] });
    expect(seen).toMatchObject({ route: "/", screen: "desktop", png: true });
    expect(seen.steps).toEqual([
      { step: expect.anything(), done: true, line: 'clicked summary "Menu" (parts/header.liquid:4)' },
    ]);
    expect(seen.position?.screen).toBe(1);
    expect(seen.position?.of).toBeGreaterThanOrEqual(3);
    expect(seen.position?.parts).toEqual(expect.arrayContaining(["parts/header.liquid", "pages/index.liquid"]));
    await expect(inView("document.getElementById('menu').open")).resolves.toBe(true);
  });

  test("the state is kept from one look to the next in the turn, through a file written (Q324)", async () => {
    writeFileSync(join(folder, "pages/index.liquid"), HOME.replace("A bar by the sea", "A bar by the harbour"));
    await until(() => inView("document.querySelector('h1').textContent === 'A bar by the harbour'"));
    const seen = await look();
    expect(seen.route).toBe("/");
    await expect(inView("document.getElementById('menu').open")).resolves.toBe(true);
  });

  test("a link within the website is followed; one to another website is not", async () => {
    const away = await look(undefined, { steps: [{ action: "click", target: "a[href^='https']" }] });
    expect(away.steps?.[0]?.line).toBe(
      'clicked a "Elsewhere" (parts/header.liquid:7): the link leads to another website (https://example.com/), which is never opened',
    );
    expect(away.route).toBe("/");
    const went = await look(undefined, { steps: [{ action: "click", target: "a[href='/visit']" }] });
    expect(went.steps?.[0]?.line).toBe('clicked a "Visit us" (parts/header.liquid:6): went to /visit');
    expect(went.route).toBe("/visit");
    await expect(inView("document.querySelector('h1').textContent")).resolves.toBe("Visit us");
  });

  test("a field is filled; the form is not sent (Q322)", async () => {
    const seen = await look("/", {
      steps: [
        { action: "type", target: "input[name=email]", text: "ana@example.com" },
        { action: "click", target: "form button" },
      ],
    });
    expect(seen.steps?.map((s) => s.done)).toEqual([true, true]);
    expect(seen.refused).toEqual([{ method: "POST", url: expect.stringMatching(/\/_data\/contact$/) }]);
    await expect(inView("location.pathname + ' ' + document.querySelector('input[name=email]').value")).resolves.toBe(
      "/ ana@example.com",
    );
  });

  test("`at` ends the look on a part further down, scrolled to as a person would", async () => {
    const seen = await look("/", { at: "#faq", steps: [{ action: "click", target: "#hours summary" }] });
    expect(seen.steps?.map((s) => s.line)).toEqual([
      'clicked summary "When are you open?" (pages/index.liquid:9)',
      `scrolled to section "When are you open? From five until late." (pages/index.liquid:8)`,
    ]);
    expect(seen.position?.screen).toBe(2);
    await expect(inView("document.getElementById('hours').open")).resolves.toBe(true);
  });

  test("a step that cannot be done stops the others", async () => {
    const seen = await look("/", {
      steps: [
        { action: "click", target: "parts/nowhere.liquid" },
        { action: "press", key: "Tab" },
      ],
    });
    expect(seen.steps).toEqual([
      {
        step: expect.anything(),
        done: false,
        line: "could not click parts/nowhere.liquid: no element of the page comes from parts/nowhere.liquid",
      },
    ]);
  });

  test("on a phone, Tab moves the focus, which the answer names", async () => {
    const seen = await look("/", { screen: "phone", fresh: true, steps: [{ action: "press", key: "Tab" }] });
    expect(seen.screen).toBe("phone");
    expect(seen.steps?.[0]?.line).toBe('pressed Tab: the focus is on a "Wick" (parts/header.liquid:2)');
    await expect(inView("innerWidth")).resolves.toBe(393);
  });

  test("the turn over, the next look starts from a fresh page; the maker's preview never moved", async () => {
    await look("/", { steps: [{ action: "click", target: "parts/header.liquid:4" }] });
    await expect(inView("document.getElementById('menu').open")).resolves.toBe(true);
    await launched.app.evaluate(() =>
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      (globalThis as any).upstart.preview.endTurn(),
    );
    await look("/");
    await expect(inView("document.getElementById('menu').open")).resolves.toBe(false);
    await expect(inPreview("location.pathname + ' ' + window.__notMoved")).resolves.toBe("/ true");
  });
});
