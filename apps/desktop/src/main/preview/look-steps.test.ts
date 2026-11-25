// The agent's steps before a look (Q317, Q321–Q324): how they are read,
// how a target names an element, the keys, and the answer's text.
import { describe, expect, test } from "vitest";
import { keyEvent, lookText, mark, readSteps, readTarget, runSteps, type StepView } from "./look-steps";

describe("the steps the agent gives", () => {
  test("are read in order, with what each needs", () => {
    expect(
      readSteps([
        { action: "click", target: "parts/header.liquid:14" },
        { action: "press", key: "Tab" },
        { action: "type", target: "#email", text: "ana@example.com" },
        { action: "scroll", target: "down" },
      ]),
    ).toEqual({
      steps: [
        { action: "click", target: "parts/header.liquid:14" },
        { action: "press", key: "Tab" },
        { action: "type", target: "#email", text: "ana@example.com" },
        { action: "scroll", target: "down" },
      ],
    });
    expect(readSteps(undefined)).toEqual({ steps: [] });
  });

  test("a step that cannot be read is refused, saying which and why", () => {
    const problem = (steps: unknown) => {
      const read = readSteps(steps);
      return "problem" in read ? read.problem : "";
    };
    expect(problem({ action: "click" })).toMatch(/must be a list/);
    expect(problem([{ action: "drag", target: "a" }])).toMatch(/^Step 1: `action` must be one of hover, click/);
    expect(problem([{ action: "press", key: "Tab" }, { action: "click" }])).toMatch(/^Step 2: click needs a `target`/);
    expect(problem([{ action: "scroll" }])).toMatch(/"down", "up", "top", "bottom"/);
    expect(problem([{ action: "press" }])).toMatch(/press needs a `key`/);
    expect(problem([{ action: "press", key: "F13" }])).toMatch(/"F13" is not one Spaka can press/);
    expect(problem([{ action: "type", target: "input" }])).toMatch(/type needs the `text`/);
    expect(problem(Array.from({ length: 13 }, () => ({ action: "press", key: "Tab" })))).toMatch(/At most 12/);
  });
});

describe("a target", () => {
  test("names a part by its file, a line of it, a CSS selector, or a move", () => {
    expect(readTarget("parts/header.liquid")).toEqual({ kind: "part", file: "parts/header.liquid" });
    expect(readTarget("parts/header.liquid:14")).toEqual({ kind: "part", file: "parts/header.liquid", line: 14 });
    expect(readTarget("parts/header")).toEqual({ kind: "part", file: "parts/header.liquid" });
    expect(readTarget("pages/work/[name].liquid:3")).toEqual({
      kind: "part",
      file: "pages/work/[name].liquid",
      line: 3,
    });
    expect(readTarget("header nav > a")).toEqual({ kind: "selector", selector: "header nav > a" });
    expect(readTarget("button[aria-label='Menu']")).toEqual({
      kind: "selector",
      selector: "button[aria-label='Menu']",
    });
    expect(readTarget("bottom")).toEqual({ kind: "move", move: "bottom" });
  });

  test("finds the first element whose source is that file, or that line of it", () => {
    expect(mark({ kind: "part", file: "parts/header.liquid", line: 14 })).toContain(
      'startsWith("parts/header.liquid:14:")',
    );
    expect(mark({ kind: "part", file: "parts/header.liquid" })).toContain('startsWith("parts/header.liquid:")');
    expect(mark({ kind: "selector", selector: 'a[href="/menu"]' })).toContain(
      'document.querySelector("a[href=\\"/menu\\"]")',
    );
  });
});

describe("keys", () => {
  test("are pressed by their names, with modifiers", () => {
    expect(keyEvent("Tab")).toMatchObject({ key: "Tab", keyCode: 9, modifiers: 0 });
    expect(keyEvent("Shift+Tab")).toMatchObject({ key: "Tab", modifiers: 8 });
    expect(keyEvent("escape")).toMatchObject({ key: "Escape", keyCode: 27 });
    expect(keyEvent("Enter")).toMatchObject({ key: "Enter", text: "\r" });
    expect(keyEvent("Down")).toMatchObject({ key: "ArrowDown" });
    expect(keyEvent("Arrow Left")).toMatchObject({ key: "ArrowLeft" });
    expect(keyEvent("Hyper+Tab")).toBeUndefined();
    expect(keyEvent("F13")).toBeUndefined();
  });
});

describe("doing the steps", () => {
  /** A view whose page answers each script from a list, and records what is sent. */
  const fake = (answers: (code: string) => unknown) => {
    const sent: { method: string; params?: object }[] = [];
    const view: StepView = {
      run: async (code) => answers(code),
      send: async (method, params) => {
        sent.push({ method, params });
      },
      settle: async () => {},
      screen: () => "phone",
      afterAction: async () => ({ went: "/visit" }),
    };
    return { view, sent };
  };

  test("a click on an element on the screen: moved to, pressed, released, and where it led", async () => {
    const { view, sent } = fake((code) => {
      if (code.includes('data-spaka-look", ""')) return 'a "Visit" (parts/header.liquid:9)';
      if (code.includes("y >= 0 && y < innerHeight")) return true;
      if (code.includes("elementFromPoint")) return { x: 200, y: 40, editable: false };
      return undefined;
    });
    const done = await runSteps(view, [{ action: "click", target: "parts/header.liquid:9" }]);
    expect(done).toEqual([
      {
        step: { action: "click", target: "parts/header.liquid:9" },
        done: true,
        line: 'clicked a "Visit" (parts/header.liquid:9): went to /visit',
      },
    ]);
    expect(sent.map((s) => (s.params as { type: string }).type)).toEqual([
      "mouseMoved",
      "mousePressed",
      "mouseReleased",
    ]);
  });

  test("a step that cannot be done stops the sequence, saying why", async () => {
    const { view, sent } = fake((code) => {
      if (code.includes("elementFromPoint"))
        return { problem: 'it is covered by div "We use cookies" (parts/cookies.liquid:2)' };
      if (code.includes("y >= 0 && y < innerHeight")) return true;
      if (code.includes('data-spaka-look", ""')) return 'button "Menu" (parts/header.liquid:20)';
      return null;
    });
    const done = await runSteps(view, [
      { action: "click", target: "parts/header.liquid:20" },
      { action: "press", key: "Escape" },
    ]);
    expect(done).toEqual([
      {
        step: { action: "click", target: "parts/header.liquid:20" },
        done: false,
        line: 'could not click button "Menu" (parts/header.liquid:20): it is covered by div "We use cookies" (parts/cookies.liquid:2)',
      },
    ]);
    expect(sent).toEqual([]);
    const missing = await runSteps(fake(() => null).view, [{ action: "hover", target: "parts/menu.liquid:3" }]);
    expect(missing[0]!.line).toBe(
      "could not hover parts/menu.liquid:3: no element of the page comes from line 3 of parts/menu.liquid",
    );
  });
});

describe("the answer's text", () => {
  test("says the page, the screen, where on the page, the steps, what was not sent, the errors and notes", () => {
    const text = lookText({
      route: "/menu",
      screen: "phone",
      position: {
        path: "/menu",
        title: "Menu — Ember",
        screen: 2,
        of: 6,
        parts: ["parts/header.liquid", "pages/menu.liquid"],
      },
      steps: [
        {
          step: { action: "click", target: "button.burger" },
          done: true,
          line: 'clicked button "Menu" (parts/header.liquid:20)',
        },
        { step: { action: "click", target: "#book" }, done: false, line: "could not click #book: no element matches" },
      ],
      refused: [{ method: "POST", url: "http://127.0.0.1:5173/_data/contact" }],
      errors: ["Uncaught TypeError: x is undefined (scripts/menu.js:4)"],
      notes: ["pages/menu.liquid: unknown filter money"],
    });
    expect(text).toBe(
      [
        "Page: /menu (“Menu — Ember”), on a phone (393×852), screen 2 of 6.",
        "On this screen: parts/header.liquid, pages/menu.liquid.",
        'Steps:\n1. clicked button "Menu" (parts/header.liquid:20)\n2. could not click #book: no element matches\nThe steps after it were not done.',
        "The page tried to send POST /_data/contact (a form, most likely); nothing was sent.",
        "Errors in the page:\nUncaught TypeError: x is undefined (scripts/menu.js:4)",
        "Rendering notes:\npages/menu.liquid: unknown filter money",
      ].join("\n\n"),
    );
    expect(lookText({ route: null, errors: [], notes: [] })).toBe("No page is shown.\n\nNo errors in the page.");
  });
});
