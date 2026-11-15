// The agent's steps in its own view of a page before the picture (Q317,
// Q321–Q324): hover, click, scroll, press a key, type in a field, each aimed
// at a part of the page by the file the agent wrote ("parts/header.liquid",
// or a line of it) or at a CSS selector. A step is done as a person would do
// it, through the DevTools protocol's input events, once its element is on
// the screen, visible, enabled and not covered; a step that cannot be done
// stops the sequence and says why. A form is never sent: the view refuses
// any request other than a GET (agent-view.ts).

/** The screens the agent names (Q315): a laptop, and the tablet and phone of Q110. */
export const SCREENS = {
  desktop: { width: 1440, height: 900, scale: 1, mobile: false },
  // At scale 1: a picture Claude reads without shrinking it (spikes/looks/REPORT.md).
  tablet: { width: 820, height: 1180, scale: 1, mobile: true },
  phone: { width: 393, height: 852, scale: 2, mobile: true },
} as const;
export type ScreenName = keyof typeof SCREENS;
export const SCREEN_NAMES = Object.keys(SCREENS) as ScreenName[];

export const STEP_ACTIONS = ["hover", "click", "scroll", "press", "type"] as const;
export type StepAction = (typeof STEP_ACTIONS)[number];
export type LookStep = { action: StepAction; target?: string; key?: string; text?: string };

/** At most this many steps in one look. */
export const MAX_STEPS = 12;
/** The scroll steps that need no element: a screen down or up, the top or the bottom of the page. */
const MOVES = ["down", "up", "top", "bottom"] as const;
type Move = (typeof MOVES)[number];

/** Reads the steps the agent gave, or says what is wrong with them. */
export function readSteps(input: unknown): { steps: LookStep[] } | { problem: string } {
  if (input === undefined || input === null) return { steps: [] };
  if (!Array.isArray(input)) return { problem: "`steps` must be a list of steps." };
  if (input.length > MAX_STEPS) return { problem: `At most ${MAX_STEPS} steps in one look.` };
  const steps: LookStep[] = [];
  for (const [i, raw] of input.entries()) {
    const at = `Step ${i + 1}`;
    const step = (raw ?? {}) as Record<string, unknown>;
    const action = step.action;
    if (typeof action !== "string" || !STEP_ACTIONS.includes(action as StepAction))
      return { problem: `${at}: \`action\` must be one of ${STEP_ACTIONS.join(", ")}.` };
    const target = typeof step.target === "string" && step.target.trim() ? step.target.trim() : undefined;
    const key = typeof step.key === "string" && step.key.trim() ? step.key.trim() : undefined;
    const text = typeof step.text === "string" ? step.text : undefined;
    if (action !== "press" && !target)
      return {
        problem: `${at}: ${action} needs a \`target\`: a part ("parts/header.liquid", or "parts/header.liquid:14") or a CSS selector${action === "scroll" ? ', or "down", "up", "top", "bottom"' : ""}.`,
      };
    if (action === "press" && !key) return { problem: `${at}: press needs a \`key\`, e.g. "Tab" or "Escape".` };
    if (action === "press" && !keyEvent(key!))
      return { problem: `${at}: the key "${key}" is not one Upstart can press.` };
    if (action === "type" && text === undefined) return { problem: `${at}: type needs the \`text\` to type.` };
    steps.push({ action: action as StepAction, target, key, text });
  }
  return { steps };
}

/** What a target names: a part of the page by its file and maybe its line, a CSS selector, or a move. */
export type Target =
  | { kind: "part"; file: string; line?: number }
  | { kind: "selector"; selector: string }
  | { kind: "move"; move: Move };

export function readTarget(target: string): Target {
  if ((MOVES as readonly string[]).includes(target)) return { kind: "move", move: target as Move };
  const part = /^((?:parts|pages|fragments|blocks)\/[^\s:,>+~]+?)(\.liquid)?(?::(\d+))?$/.exec(target);
  if (part) return { kind: "part", file: `${part[1]}.liquid`, line: part[3] ? Number(part[3]) : undefined };
  return { kind: "selector", selector: target };
}

/** A key the agent may press, as DevTools sends it. */
type KeyEvent = { key: string; code: string; keyCode: number; text?: string; modifiers: number };

const KEYS: Record<string, Omit<KeyEvent, "modifiers">> = {
  tab: { key: "Tab", code: "Tab", keyCode: 9 },
  enter: { key: "Enter", code: "Enter", keyCode: 13, text: "\r" },
  escape: { key: "Escape", code: "Escape", keyCode: 27 },
  esc: { key: "Escape", code: "Escape", keyCode: 27 },
  space: { key: " ", code: "Space", keyCode: 32, text: " " },
  arrowup: { key: "ArrowUp", code: "ArrowUp", keyCode: 38 },
  arrowdown: { key: "ArrowDown", code: "ArrowDown", keyCode: 40 },
  arrowleft: { key: "ArrowLeft", code: "ArrowLeft", keyCode: 37 },
  arrowright: { key: "ArrowRight", code: "ArrowRight", keyCode: 39 },
  home: { key: "Home", code: "Home", keyCode: 36 },
  end: { key: "End", code: "End", keyCode: 35 },
  pageup: { key: "PageUp", code: "PageUp", keyCode: 33 },
  pagedown: { key: "PageDown", code: "PageDown", keyCode: 34 },
  backspace: { key: "Backspace", code: "Backspace", keyCode: 8 },
};
const MODIFIERS: Record<string, number> = { alt: 1, ctrl: 2, control: 2, meta: 4, cmd: 4, shift: 8 };

/** "Shift+Tab", "Escape", "ArrowDown": the event to send, or undefined for a key Upstart does not press. */
export function keyEvent(name: string): KeyEvent | undefined {
  const parts = name.split("+").map((p) => p.trim().toLowerCase().replace(/\s+/g, ""));
  const last = parts.pop() ?? "";
  const key = KEYS[last] ?? KEYS[`arrow${last}`];
  if (!key) return undefined;
  let modifiers = 0;
  for (const m of parts) {
    const bit = MODIFIERS[m];
    if (bit === undefined) return undefined;
    modifiers |= bit;
  }
  return { ...key, modifiers };
}

/** What the steps need of the agent's view. */
export type StepView = {
  /** Runs code in the page and gives back its value. */
  // biome-ignore lint/suspicious/noExplicitAny: what the page answers
  run(code: string): Promise<any>;
  /** Sends a DevTools command. */
  send(method: string, params?: object): Promise<unknown>;
  settle(): Promise<void>;
  screen(): ScreenName;
  /** Waits for a page the view went to, if it is going to one; says where it went, or where it would not. */
  afterAction(): Promise<{ went?: string; refusedLink?: string }>;
};

/** One step done, or the step that could not be. */
export type StepDone = { step: LookStep; done: boolean; line: string };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Does the steps in order, as a person would; stops at the first that cannot
 * be done. Each line says what was done, on what, and where it led.
 */
export async function runSteps(view: StepView, steps: LookStep[]): Promise<StepDone[]> {
  const done: StepDone[] = [];
  for (const step of steps) {
    const result = await runStep(view, step);
    done.push({ step, ...result });
    if (!result.done) break;
  }
  return done;
}

async function runStep(view: StepView, step: LookStep): Promise<{ done: boolean; line: string }> {
  const height = SCREENS[view.screen()].height;
  if (step.action === "press") {
    const key = keyEvent(step.key!)!;
    await press(view, key);
    const after = await view.afterAction();
    await view.settle();
    return { done: true, line: `pressed ${step.key}${await focusNote(view)}${wentNote(after)}` };
  }
  const target = readTarget(step.target!);
  if (target.kind === "move") {
    await move(view, target.move, height);
    return {
      done: true,
      line: `scrolled ${target.move === "top" || target.move === "bottom" ? "to the " : ""}${target.move}`,
    };
  }
  const found = await view.run(mark(target));
  if (!found) return { done: false, line: `could not ${step.action} ${step.target}: ${noElement(target)}` };
  const named = found as string;
  if (step.action === "scroll") {
    await scrollTo(view, height, "top");
    return { done: true, line: `scrolled to ${named}` };
  }
  // On the screen first, as a person would scroll to it, then checked.
  if (!(await view.run(IN_VIEW))) await scrollTo(view, height, "middle");
  const check = (await view.run(ACTIONABLE)) as { problem?: string; x: number; y: number; editable?: boolean };
  if (check.problem) return { done: false, line: `could not ${step.action} ${named}: ${check.problem}` };
  const { x, y } = check;
  if (step.action === "hover") {
    await view.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await view.settle();
    return { done: true, line: `hovered ${named}` };
  }
  if (step.action === "type" && !check.editable)
    return { done: false, line: `could not type into ${named}: it is not a field one can type into` };
  await view.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await view.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await view.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  if (step.action === "type") {
    // What the field held is replaced, as by selecting it and typing.
    await view.run(SELECT_FIELD);
    await view.send("Input.insertText", { text: step.text });
    await view.settle();
    return { done: true, line: `typed ${JSON.stringify(step.text)} into ${named}` };
  }
  const after = await view.afterAction();
  await view.settle();
  return { done: true, line: `clicked ${named}${wentNote(after)}` };
}

function wentNote(after: { went?: string; refusedLink?: string }): string {
  if (after.went) return `: went to ${after.went}`;
  if (after.refusedLink) return `: the link leads to another website (${after.refusedLink}), which is never opened`;
  return "";
}

async function focusNote(view: StepView): Promise<string> {
  const focused = (await view.run(FOCUSED)) as string | null;
  return focused ? `: the focus is on ${focused}` : "";
}

function noElement(target: Target): string {
  if (target.kind === "part")
    return target.line
      ? `no element of the page comes from line ${target.line} of ${target.file}`
      : `no element of the page comes from ${target.file}`;
  return "no element matches";
}

async function press(view: StepView, key: KeyEvent) {
  const base = {
    key: key.key,
    code: key.code,
    windowsVirtualKeyCode: key.keyCode,
    nativeVirtualKeyCode: key.keyCode,
    modifiers: key.modifiers,
  };
  // A key that types a character goes down with its text, so that Enter follows a link and Space presses a button.
  await view.send(
    "Input.dispatchKeyEvent",
    key.text && !key.modifiers
      ? { ...base, type: "keyDown", text: key.text, unmodifiedText: key.text }
      : { ...base, type: "rawKeyDown" },
  );
  await view.send("Input.dispatchKeyEvent", { ...base, type: "keyUp" });
}

/** The wheel, as a person scrolls: a screen down or up, or to the top or the bottom of the page. */
async function move(view: StepView, to: Move, height: number) {
  if (to === "top" || to === "bottom") {
    const target = to === "top" ? 0 : await view.run("document.documentElement.scrollHeight - innerHeight");
    await wheelTo(view, height, target);
  } else {
    const now = (await view.run("scrollY")) as number;
    await wheelTo(view, height, now + (to === "down" ? height : -height) * 0.9);
  }
  await view.settle();
}

/**
 * Scrolls until the marked element is at the top of the screen, or in its
 * middle, as a person would: a jump to the screen before it, then the wheel
 * for the last screen, so that smooth scrolling, pinned sections and scroll
 * timelines see a scroll arriving (spikes/looks/REPORT.md).
 */
async function scrollTo(view: StepView, height: number, where: "top" | "middle") {
  const target =
    (await view.run(`(() => { const el = document.querySelector("[data-up-look]"); const r = el.getBoundingClientRect();
    const at = r.top + scrollY - ${where === "top" ? "innerHeight * 0.08" : "(innerHeight - Math.min(r.height, innerHeight)) / 2"};
    return Math.max(0, Math.min(at, document.documentElement.scrollHeight - innerHeight)); })()`)) as number;
  await wheelTo(view, height, target);
  await view.settle();
}

async function wheelTo(view: StepView, height: number, target: number) {
  const now = (await view.run("scrollY")) as number;
  // Further than a screen: jump to the screen before, then wheel the last one.
  if (Math.abs(target - now) > height) {
    const from = target - Math.sign(target - now) * height;
    await view.run(`scrollTo({ top: ${Math.round(from)}, behavior: "instant" })`);
    await view.run("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))");
  }
  let last = Number.NaN;
  let stuck = 0;
  for (let i = 0; i < 40; i++) {
    const y = (await view.run("scrollY")) as number;
    const left = target - y;
    if (Math.abs(left) < 4) break;
    if (Math.abs(y - last) < 1) {
      if (++stuck > 8) break;
    } else stuck = 0;
    last = y;
    const delta = Math.sign(left) * Math.min(Math.abs(left), height / 2.5);
    const { width } = SCREENS[view.screen()];
    await view.send("Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x: Math.round(width / 2),
      y: Math.round(height / 2),
      deltaX: 0,
      deltaY: Math.round(delta),
    });
    await wait(40);
  }
}

/** In the page: marks the element the target names and gives its name for the answer, or null. */
export function mark(target: Exclude<Target, { kind: "move" }>): string {
  const find =
    target.kind === "part"
      ? `[...document.querySelectorAll("[data-up-src]")].find((e) => e.getAttribute("data-up-src").startsWith(${JSON.stringify(
          `${target.file}:${target.line !== undefined ? `${target.line}:` : ""}`,
        )}))`
      : `(() => { try { return document.querySelector(${JSON.stringify(target.selector)}); } catch { return null; } })()`;
  return `(() => {
    for (const old of document.querySelectorAll("[data-up-look]")) old.removeAttribute("data-up-look");
    const el = ${find};
    if (!el) return null;
    el.setAttribute("data-up-look", "");
    ${NAME_OF}
    return nameOf(el);
  })()`;
}

/** In the page, a function: an element as the answer names it, `button "Book a table" (parts/header.liquid:14)`. */
const NAME_OF = `const nameOf = (el) => {
  const text = (el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.getAttribute("alt") || el.innerText || el.textContent || "").replace(/\\s+/g, " ").trim();
  const src = (el.closest("[data-up-src]") || el).getAttribute("data-up-src");
  const at = src ? " (" + src.replace(/:\\d+$/, "") + ")" : "";
  return el.tagName.toLowerCase() + (text ? " " + JSON.stringify(text.length > 40 ? text.slice(0, 39) + "…" : text) : "") + at;
};`;

/** In the page: whether the marked element's middle is on the screen. */
const IN_VIEW = `(() => { const r = document.querySelector("[data-up-look]").getBoundingClientRect();
  const y = r.top + r.height / 2, x = r.left + r.width / 2;
  return y >= 0 && y < innerHeight && x >= 0 && x < innerWidth; })()`;

/** In the page: whether the marked element can be acted on, and where its middle is; why not otherwise. */
const ACTIONABLE = `(() => {
  ${NAME_OF}
  const el = document.querySelector("[data-up-look]");
  const r = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  if (r.width === 0 || r.height === 0 || style.display === "none") return { problem: "it is not shown (no size)" };
  if (style.visibility === "hidden") return { problem: "it is hidden (visibility: hidden)" };
  let opacity = 1;
  for (let e = el; e; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity);
  if (opacity < 0.05) return { problem: "it is invisible (opacity 0)" };
  if (el.matches(":disabled") || el.getAttribute("aria-disabled") === "true") return { problem: "it is disabled" };
  const x = Math.round(Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1));
  const y = Math.round(Math.min(Math.max(r.top + Math.min(r.height / 2, innerHeight / 2), 0), innerHeight - 1));
  if (r.bottom < 0 || r.top >= innerHeight || r.right < 0 || r.left >= innerWidth) return { problem: "it is off the screen and could not be scrolled to" };
  const hit = document.elementFromPoint(x, y);
  if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) return { problem: "it is covered by " + nameOf(hit) };
  const editable = el.matches("input:not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]):not([type=hidden]), textarea, [contenteditable]:not([contenteditable=false])");
  return { x, y, editable };
})()`;

/** In the page: the field just clicked has its content selected, so that typing replaces it. */
const SELECT_FIELD = `(() => { const el = document.activeElement; if (el && typeof el.select === "function") el.select();
  else if (el && el.isContentEditable) document.getSelection().selectAllChildren(el); })()`;

/** In the page: the element with the focus, named, or null. */
const FOCUSED = `(() => { ${NAME_OF} const el = document.activeElement; return el && el !== document.body ? nameOf(el) : null; })()`;

/** Where the view is: the page, which screen of how many, and the files of what is on that screen. */
export type Position = { path: string; title: string; screen: number; of: number; parts: string[] };

/** In the page: where the view is (Position). */
export const POSITION = `(() => {
  const h = innerHeight, H = document.documentElement.scrollHeight;
  const of = Math.max(1, Math.ceil(H / h - 0.02));
  // The screen whose middle the view's middle is in; the last one at the bottom.
  const screen = scrollY + h >= H - 2 ? of : Math.min(of, Math.floor((scrollY + h / 2) / h) + 1);
  const parts = [];
  for (const el of document.body ? document.body.querySelectorAll("[data-up-src]") : []) {
    const r = el.getBoundingClientRect();
    if (r.bottom <= 0 || r.top >= h || r.width === 0 || r.height === 0) continue;
    const file = el.getAttribute("data-up-src").replace(/:\\d+:\\d+$/, "");
    if (!parts.includes(file)) parts.push(file);
  }
  return { path: location.pathname, title: document.title, screen, of, parts };
})()`;

/** What the agent sees when it looks at a page (Q314–Q318). */
export type Seen = {
  route: string | null;
  screen?: ScreenName;
  png?: Buffer;
  /** Where the view is: which screen of how many, and the parts on it (Q316). */
  position?: Position;
  /** The steps done, or the one that could not be (Q317). */
  steps?: StepDone[];
  /** What the page tried to send; nothing was sent (Q322). */
  refused?: { method: string; url: string }[];
  errors: string[];
  notes: string[];
};

/** How the agent looks: on which screen, after which steps, ending at which part (Q315–Q317, Q324). */
export type LookOptions = { screen?: ScreenName; fresh?: boolean; steps?: LookStep[]; at?: string };

const SCREEN_WORDS: Record<ScreenName, string> = { desktop: "on desktop", tablet: "on a tablet", phone: "on a phone" };

/** The answer's text, beside the picture. */
export function lookText(seen: Omit<Seen, "png">): string {
  const lines: string[] = [];
  if (seen.route === null) lines.push("No page is shown.");
  else {
    const s = seen.screen && SCREENS[seen.screen];
    const where = s && seen.screen ? `, ${SCREEN_WORDS[seen.screen]} (${s.width}×${s.height})` : "";
    const p = seen.position;
    lines.push(
      `Page: ${seen.route}${p?.title ? ` (“${p.title}”)` : ""}${where}${p ? `, screen ${p.screen} of ${p.of}` : ""}.`,
    );
    if (p?.parts.length)
      lines.push(`On this screen: ${p.parts.slice(0, 16).join(", ")}${p.parts.length > 16 ? ", …" : ""}.`);
  }
  if (seen.steps?.length) {
    const stopped = seen.steps.at(-1)?.done === false;
    lines.push(
      `Steps:\n${seen.steps.map((s, i) => `${i + 1}. ${s.line}`).join("\n")}${stopped ? "\nThe steps after it were not done." : ""}`,
    );
  }
  for (const r of seen.refused ?? [])
    lines.push(`The page tried to send ${r.method} ${pathOf(r.url)} (a form, most likely); nothing was sent.`);
  lines.push(seen.errors.length ? `Errors in the page:\n${seen.errors.join("\n")}` : "No errors in the page.");
  if (seen.notes.length) lines.push(`Rendering notes:\n${seen.notes.join("\n")}`);
  return lines.join("\n\n");
}

function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname === "127.0.0.1" || u.hostname === "localhost" ? u.pathname : url;
  } catch {
    return url;
  }
}
