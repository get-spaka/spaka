import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, SLOW } from "./app.ts";

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

const PROBLEMS = page(
  "Problems — Wick",
  `<main class="p-6">
  <div style="width: 900px" class="bg-base-200">A banner far too wide for a phone</div>
  <h2 class="overflow-hidden h-6 w-40">A heading far too long to fit in its small box, cut at the bottom</h2>
  <p style="opacity: 0">Still hidden once the page settled</p>
  <img src="/media/missing.jpg" alt="A missing picture" class="w-40 h-20">
  <a href="/reservations">Book a table</a>
  <a href="/visit">Visit us</a>
  <div class="group"><p class="opacity-0 group-hover:opacity-100">Shown on hover only</p></div>
  <span class="sr-only">For screen readers only</span>
  <details><summary>More</summary><p>Inside a closed disclosure</p></details>
</main>`,
);

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

/** A made-up turn of the agent's: one look on a phone after clicking the menu, then a sentence. */
function lookRecording(file: string) {
  const LOOK = "mcp__spaka__look_at_preview";
  const input = { route: "/", screen: "phone", steps: [{ action: "click", target: "parts/header.liquid:4" }] };
  const event = (t: number, e: object) => ({ t, m: { type: "stream_event", parent_tool_use_id: null, event: e } });
  const lines = [
    event(100, { type: "message_start", message: {} }),
    event(110, {
      type: "content_block_start",
      index: 0,
      content_block: { type: "tool_use", id: "look1", name: LOOK, input: {} },
    }),
    event(120, {
      type: "content_block_delta",
      index: 0,
      delta: { type: "input_json_delta", partial_json: JSON.stringify(input) },
    }),
    event(130, { type: "content_block_stop", index: 0 }),
    {
      t: 131,
      m: {
        type: "assistant",
        parent_tool_use_id: null,
        message: { role: "assistant", content: [{ type: "tool_use", id: "look1", name: LOOK, input }] },
      },
    },
    // The recorded answer, which the look run for real replaces.
    {
      t: 150,
      m: {
        type: "user",
        parent_tool_use_id: null,
        message: { role: "user", content: [{ type: "tool_result", tool_use_id: "look1", content: "recorded" }] },
      },
    },
    event(200, { type: "message_start", message: {} }),
    event(210, { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
    event(220, { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "The menu opens." } }),
    event(230, { type: "content_block_stop", index: 0 }),
    {
      t: 300,
      m: {
        type: "result",
        subtype: "success",
        is_error: false,
        result: "The menu opens.",
        duration_ms: 300,
        total_cost_usd: 0,
      },
    },
  ];
  writeFileSync(file, `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`);
}

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
        const seen = await (globalThis as any).spaka.preview.look(route, options);
        return { ...seen, png: !!seen.png };
      },
      { route, options },
    ) as Promise<Seen>;
  /** Code run in the agent's view. */
  const inView = (code: string) =>
    launched.app.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      (_electron, code) => (globalThis as any).spaka.preview.agentView.run(code),
      code,
    );
  /** Code run in the maker's preview. */
  const inPreview = (code: string) =>
    launched.app.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      (_electron, code) => (globalThis as any).spaka.preview.view.webContents.executeJavaScript(code),
      code,
    );
  const until = async (read: () => Promise<unknown>, timeout = 8000) => {
    timeout *= SLOW;
    const started = Date.now();
    for (;;) {
      const value = await read().catch(() => undefined);
      if (value) return value;
      if (Date.now() - started > timeout) throw new Error(`timed out waiting for: ${read}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  };

  beforeAll(async () => {
    const recording = join(mkdtempSync(join(tmpdir(), "spaka-looks-")), "looks.jsonl");
    lookRecording(recording);
    launched = await launchApp({ env: { SPAKA_AGENT_REPLAY: recording } });
    await launched.window.getByTestId("message-input").waitFor();
    const project = await launched.window.evaluate(() =>
      // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
      (window as any).spaka.invoke("projects:create", "Wick"),
    );
    folder = project.path;
    writeFileSync(join(folder, "theme.css"), ":root { --theme-color-primary: #b45309; }\n");
    mkdirSync(join(folder, "parts"));
    mkdirSync(join(folder, "pages"));
    writeFileSync(join(folder, "parts/header.liquid"), HEADER);
    writeFileSync(join(folder, "pages/index.liquid"), HOME);
    writeFileSync(join(folder, "pages/visit.liquid"), page("Visit — Wick", `<main><h1>Visit us</h1></main>`));
    writeFileSync(join(folder, "pages/problems.liquid"), PROBLEMS);
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
    // No test record either.
    expect(existsSync(join(folder, ".spaka/test-records"))).toBe(false);
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

  test("the problems on the screen looked at are measured, each with its file and line (Q318)", async () => {
    const phone = (await launched.app.evaluate(async () => {
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      const seen = await (globalThis as any).spaka.preview.look("/problems", { screen: "phone" });
      return seen.problems;
    })) as string[];
    expect(phone).toEqual([
      expect.stringMatching(
        /^The page is wider than the screen \(\d+ px on a 393 px screen\), so it scrolls sideways: div "A banner far too wide for a phone" \(pages\/problems\.liquid:7\) runs from 24 to 924 px\.$/,
      ),
      expect.stringMatching(
        /^Text cut off: h2 "A heading far too long to fit in its sm…" \(pages\/problems\.liquid:8\) needs \d+ px of height and has 24\.$/,
      ),
      'Still hidden on the screen once the page settled (opacity 0 or visibility: hidden): p "Still hidden once the page settled" (pages/problems.liquid:9).',
      'Images that did not load: img "A missing picture" (pages/problems.liquid:10) from /media/missing.jpg.',
      'Links to an address no page has: /reservations (a "Book a table" (pages/problems.liquid:11)).',
    ]);
    // On desktop the banner fits.
    const desktop = (await launched.app.evaluate(async () => {
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      const seen = await (globalThis as any).spaka.preview.look("/problems", { screen: "desktop" });
      return seen.problems;
    })) as string[];
    expect(desktop.some((p) => p.startsWith("The page is wider"))).toBe(false);
    expect(desktop).toHaveLength(4);
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
      (globalThis as any).spaka.preview.endTurn(),
    );
    await look("/");
    await expect(inView("document.getElementById('menu').open")).resolves.toBe(false);
    await expect(inPreview("location.pathname + ' ' + window.__notMoved")).resolves.toBe("/ true");
    // The view is never shown and never takes the focus (Q314).
    const shown = await launched.app.evaluate(({ BrowserWindow }) => {
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      const agent = (globalThis as any).spaka.preview.agentView.contents;
      return BrowserWindow.getAllWindows()
        .filter((w) => w.webContents === agent)
        .map((w) => ({ visible: w.isVisible(), focused: w.isFocused() }));
    });
    expect(shown).toEqual([{ visible: false, focused: false }]);
  });

  test("a turn's look, played back, runs for real; its line names the page, the screen and the click (Q320)", async () => {
    await launched.window.evaluate(() =>
      // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
      (window as any).spaka.invoke("conversation:send", "Check the menu on a phone"),
    );
    const item = (await until(async () => {
      const { items } = await launched.window.evaluate(() =>
        // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
        (window as any).spaka.invoke("conversation:get"),
      );
      const last = items.at(-1);
      return last?.kind === "agent" && last.status !== "working" ? last : undefined;
    }, 30_000)) as { status: string; parts: { kind: string; activity?: { label: string; state: string } }[] };
    expect(item.status).toBe("done");
    expect(item.parts.flatMap((p) => (p.activity ? [p.activity] : []))).toEqual([
      expect.objectContaining({ label: "Looking at the home page on a phone after clicking “Menu”", state: "done" }),
    ]);
    const replayed = (await launched.app.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      () => (globalThis as any).spaka.replayed as string[],
    )) as string[];
    expect(replayed.find((l) => l.startsWith("[mcp__spaka__look_at_preview] "))).toMatch(
      /^\[mcp__spaka__look_at_preview\] Page: \/ \(“Wick”\), on a phone \(393×852\), screen 1 of \d+\.[\s\S]*1\. clicked summary "Menu" \(parts\/header\.liquid:4\)/,
    );
  });
});
