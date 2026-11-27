// Editing in the preview (decisions: Editing, Q90, Q91, Q99). Runs in the
// preview script's isolated world and draws in a closed shadow root that the
// page can neither style nor read (ADR 0008), laid over the page and moved
// with it as it scrolls.
//
// - Edit mode: hovering outlines an element, a click selects it and shows a
//   bar of actions, a double click on a text edits it in place. Links,
//   buttons and forms do nothing.
// - Visitor mode: the page behaves as it will online; nothing is drawn.
// - While the agent works, editing waits (Q91).
//
// The edits are written by the main process (main/editing); this script only
// says what the maker did, where, as the trace gives it.

import {
  dragged,
  FORMATS,
  type Format,
  FROM_DESKTOP,
  FROM_TABLET,
  type Frame,
  frameDeclarations,
  MAX_ZOOM,
  RATIOS,
  readFrame,
  readFrameClasses,
  shownRect,
} from "../../shared/frame";
import {
  BLOCK_DRAG_TYPE as BLOCK_TYPE,
  type EditAction,
  type EditInfo,
  type PageComment,
  type PageTour,
  type PreviewMode,
  type TourAction,
} from "../../shared/ipc";
import { en } from "../../shared/strings/en";
import { COMMENT_STYLE, CommentLayer, type CommentsBridge } from "./comments";
import { attachTips, TIP_STYLE } from "./tip";
import { PageTourLayer, TOUR_STYLE } from "./tour";
import { insertionPoint, type Origin, originOf, sectionList, sectionTarget, textsOf, tracedFrom } from "./trace";

const t = en.editor;

export type EditorBridge = CommentsBridge & {
  edit(action: EditAction): Promise<unknown>;
  /** `record`: the record the element's trace names, for an image of a list of images (Q356). */
  info(file: string, at: number, record?: string): Promise<EditInfo>;
  /** Opens the app's media picker (Q159): the chosen image's address, or null. */
  pickImage(): Promise<string | null>;
  /** A dropped file's path on the disk, or "" when it has none. */
  pathOf(file: File): string;
  /** Asks for edit mode, for a block or an image dragged in from another mode (Q254). */
  toEdit(): void;
  /** Stop on the pill that says the agent is working (Q391). */
  stop(): void;
};

/** The keys that scroll the page, left to it while the agent works (Q410). */
const SCROLL_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "PageUp",
  "PageDown",
  "Home",
  "End",
  " ",
]);

/** The pointer's events kept from the page while the agent works; the wheel still scrolls it, a drop still says to wait. */
const SHIELDED = [
  "click",
  "dblclick",
  "auxclick",
  "contextmenu",
  "mousedown",
  "mouseup",
  "mousemove",
  "mouseover",
  "mouseout",
  "pointerdown",
  "pointerup",
  "pointermove",
  "pointerover",
  "pointerout",
] as const;

/** The record the trace names for an element: its own, or the one around it. */
function recordOf(el: Element): string | undefined {
  return el.closest("[data-spaka-rec]")?.getAttribute("data-spaka-rec") || undefined;
}

/** An image of a record's list of images: the record ("homes/wren") and its place in the list, from its trace. */
function listItemOf(el: Element): { record: string; index: number } | undefined {
  const m = /^(.+)#(\d+)$/.exec(el.getAttribute("data-spaka-rec") ?? "");
  return m ? { record: m[1]!, index: Number(m[2]) } : undefined;
}

/** The image of the same list (same place in the template, same record) under a point, if any. */
function listImageAt(x: number, y: number, of: HTMLElement): HTMLElement | undefined {
  const mine = listItemOf(of);
  if (!mine) return undefined;
  for (const el of document.elementsFromPoint(x, y)) {
    if (el.localName !== "img" || el.getAttribute("data-spaka-src") !== of.getAttribute("data-spaka-src")) continue;
    if (listItemOf(el)?.record === mine.record) return el as HTMLElement;
  }
  return undefined;
}

const ICONS = {
  drag: '<circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/>',
  up: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  down: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  earlier: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  later: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  duplicate:
    '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  delete:
    '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  text: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
  parent: '<path d="M14 9 9 4 4 9"/><path d="M20 20h-7a4 4 0 0 1-4-4V4"/>',
  image:
    '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  frame: '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
};

// The overlays' surfaces and texts follow the interface's appearance (Q330), which
// nativeTheme gives the preview too; the selection keeps its indigo.
const STYLE = `
:host { all: initial; }
:host { --spaka-surface: #fff; --spaka-border: #e4e4e7; --spaka-input: #d4d4d8; --spaka-muted: #71717a; --spaka-hover: #f4f4f5;
  --spaka-text: #18181b; --spaka-text-2: #3f3f46; --spaka-note: #fef3c7; --spaka-note-text: #92400e; --spaka-danger: #b91c1c; }
@media (prefers-color-scheme: dark) {
  :host { --spaka-surface: #27272a; --spaka-border: #3f3f46; --spaka-input: #52525b; --spaka-muted: #a1a1aa; --spaka-hover: #3f3f46;
    --spaka-text: #fafafa; --spaka-text-2: #e4e4e7; --spaka-note: #451a03; --spaka-note-text: #fde68a; --spaka-danger: #f87171; }
}
.layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;
  font: 12px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--spaka-text); }
.box { position: fixed; box-sizing: border-box; border-radius: 3px; display: none; }
.hover { border: 1px solid #6366f1; }
.selected { border: 2px solid #4f46e5; }
.tag { position: absolute; left: -2px; top: -18px; background: #6366f1; color: #fff; padding: 1px 5px;
  border-radius: 3px 3px 0 0; font-size: 10px; white-space: nowrap; }
.bar { position: fixed; display: none; align-items: center; gap: 2px; padding: 3px; background: var(--spaka-surface);
  border: 1px solid var(--spaka-border); border-radius: 8px; box-shadow: 0 4px 16px rgb(0 0 0 / .12); pointer-events: auto; }
.bar button { all: unset; display: grid; place-items: center; width: 26px; height: 26px; border-radius: 5px; cursor: default; color: var(--spaka-text-2); }
.bar button:hover { background: var(--spaka-hover); }
.bar button[disabled] { opacity: .35; }
.bar button svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.bar .sep { width: 1px; height: 18px; background: var(--spaka-border); margin: 0 2px; }
.chip { padding: 0 6px; color: var(--spaka-note-text); background: var(--spaka-note); border-radius: 5px; height: 22px; display: flex; align-items: center; white-space: nowrap; }
.pop { position: fixed; display: none; gap: 4px; padding: 6px; background: var(--spaka-surface); border: 1px solid var(--spaka-border);
  border-radius: 8px; box-shadow: 0 4px 16px rgb(0 0 0 / .12); pointer-events: auto; }
.pop input { all: unset; width: 240px; padding: 4px 6px; border: 1px solid var(--spaka-input); border-radius: 5px; font-size: 12px; }
.pop button { all: unset; padding: 4px 8px; border-radius: 5px; background: #4f46e5; color: #fff; }
.pop button.secondary { background: var(--spaka-hover); color: var(--spaka-text-2); }
.frame { position: fixed; display: none; flex-direction: column; gap: 8px; width: 300px; box-sizing: border-box; padding: 10px;
  background: var(--spaka-surface); border: 1px solid var(--spaka-border); border-radius: 10px; box-shadow: 0 4px 16px rgb(0 0 0 / .12); pointer-events: auto; }
.frame .row { display: flex; align-items: center; gap: 8px; }
.frame .grow { flex: 1; }
.frame .name { color: var(--spaka-muted); }
.frame input[type="range"] { flex: 1; min-width: 0; margin: 0; accent-color: #4f46e5; }
.frame output { width: 36px; text-align: right; color: var(--spaka-muted); font-variant-numeric: tabular-nums; }
.frame .grid { display: grid; grid-template-columns: repeat(3, 20px); gap: 2px; padding: 2px; border: 1px solid var(--spaka-border); border-radius: 6px; }
.frame .grid button { all: unset; display: grid; place-items: center; width: 20px; height: 20px; border-radius: 4px; cursor: default; }
.frame .grid button i { width: 6px; height: 6px; border-radius: 50%; background: var(--spaka-input); }
.frame .grid button:hover { background: var(--spaka-hover); }
.frame .grid button[aria-pressed="true"] i { width: 8px; height: 8px; background: #4f46e5; }
.frame .ratios { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px; padding: 2px; background: var(--spaka-hover); border-radius: 6px; }
.frame .ratios button { all: unset; padding: 5px 2px; border-radius: 4px; text-align: center; white-space: nowrap; color: var(--spaka-text-2); cursor: default; font-variant-numeric: tabular-nums; }
.frame .ratios button[aria-pressed="true"] { background: var(--spaka-surface); color: var(--spaka-text); box-shadow: 0 0 0 1px var(--spaka-border); }
.frame .seg { display: flex; gap: 2px; padding: 2px; background: var(--spaka-hover); border-radius: 6px; }
.frame .seg button { all: unset; flex: 1; padding: 3px 4px; border-radius: 4px; text-align: center; white-space: nowrap; color: var(--spaka-text-2); cursor: default; }
.frame .seg button[aria-pressed="true"] { background: var(--spaka-surface); color: var(--spaka-text); box-shadow: 0 0 0 1px var(--spaka-border); }
.frame .seg button[data-format] { display: flex; align-items: center; justify-content: center; gap: 4px; }
.frame .seg .tick { width: 15px; height: 15px; flex: none; fill: none; stroke: #4f46e5; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; visibility: hidden; }
.frame .seg button[aria-pressed="true"] .tick { visibility: visible; }
.frame .seg .tick .second { display: none; }
.frame .seg button[disabled] .tick .second { display: inline; }
@media (prefers-color-scheme: dark) { .frame .seg .tick { stroke: #a5b4fc; } }
.frame .hint { display: none; color: var(--spaka-muted); }
.frame .acts button { all: unset; padding: 4px 8px; border-radius: 5px; background: #4f46e5; color: #fff; cursor: default; }
.frame .acts button.secondary { background: var(--spaka-hover); color: var(--spaka-text-2); }
.frame button:focus-visible, .frame input:focus-visible { outline: 2px solid #6366f1; outline-offset: 1px; }
.frame-drag { position: fixed; display: none; pointer-events: auto; cursor: grab; touch-action: none; }
.frame-drag.held { cursor: grabbing; }
.toast { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); max-width: 80%; padding: 8px 12px;
  background: #18181b; color: #fafafa; border-radius: 8px; display: none; pointer-events: none; }
.line { position: fixed; left: 0; right: 0; height: 3px; margin-top: -1px; background: #4f46e5; border-radius: 2px; display: none;
  box-shadow: 0 0 0 2px rgb(255 255 255 / .8); }
.bar button[data-act="drag"] { cursor: grab; }
.shield { position: fixed; inset: 0; display: none; pointer-events: auto; cursor: default; }
.shield.shown { display: block; }
.working { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); display: none; align-items: center; gap: 10px;
  height: 40px; padding: 0 6px 0 16px; border-radius: 999px; background: #1c1b2e; color: #f4f4f5; font-size: 13px;
  white-space: nowrap; box-shadow: 0 8px 24px rgb(28 27 46 / .28); pointer-events: auto; animation: spaka-rise .25s ease-out both; }
.working.shown { display: flex; }
.working b { font-weight: 600; }
.working .sub { color: #a1a1c9; }
.working .bars { display: flex; gap: 2px; align-items: center; height: 12px; }
.working .bars i { display: block; width: 3px; height: 12px; border-radius: 2px; background: #b9b8ec; animation: spaka-bar .9s ease-in-out infinite; }
.working .bars i:nth-child(2) { animation-delay: .15s; } .working .bars i:nth-child(3) { animation-delay: .3s; }
.working .bars i:nth-child(4) { animation-delay: .45s; }
.working button { all: unset; display: flex; align-items: center; gap: 5px; height: 28px; padding: 0 12px; border-radius: 999px;
  background: rgb(255 255 255 / .12); color: #fff; font-size: 12px; font-weight: 500; cursor: default; }
.working button:hover { background: rgb(255 255 255 / .2); }
.working button svg { width: 9px; height: 9px; }
.layer.busy .toast { bottom: 68px; }
@keyframes spaka-bar { 0%, 100% { transform: scaleY(.35); } 50% { transform: scaleY(1); } }
@keyframes spaka-rise { from { transform: translate(-50%, 16px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .working, .working .bars i { animation: none; } }
.editing-note { position: fixed; display: none; padding: 3px 7px; background: var(--spaka-note); color: var(--spaka-note-text); border-radius: 5px; white-space: nowrap; }
`;

const f = t.frame;
const HOLDS = [0, 50, 100] as const;
const pressed = (label: string, tip: string, attrs: string) =>
  `<button type="button" ${attrs} data-tip="${tip}" aria-pressed="false">${label}</button>`;

/**
 * The tick before a screen the frame is set for; its room is kept when it is
 * not, so the names do not move. The screen the preview shows has two: it is
 * the one being set, and cannot be turned off.
 */
const CHECK =
  '<svg class="tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 7 17l-5-5"/><path class="second" d="m22 10-7.5 7.5L13 16"/></svg>';

/** The panel that sets an image in its frame (Q490). */
const FRAME_PANEL = `<div class="frame" data-testid="frame-pop" role="group" aria-label="${t.adjust}">
  <div class="row"><span class="name">${f.appliesTo}</span><div class="seg grow" role="group" aria-label="${f.appliesTo}">${[
    ...FORMATS,
  ]
    .reverse()
    .map((format) =>
      pressed(`${CHECK}${f.formats[format]}`, "", `data-format="${format}" data-testid="frame-format-${format}"`),
    )
    .join("")}</div></div>
  <div class="hint sideways" data-testid="frame-sideways"></div>
  <div class="hint others" data-testid="frame-hint">${f.otherFormats}</div>
  <label class="row"><span class="name">${f.zoom}</span><input type="range" min="1" max="${MAX_ZOOM}" step="0.05" value="1" data-testid="frame-zoom"><output>100%</output></label>
  <div class="row">
    <div class="grid" role="group" aria-label="${f.position}">${HOLDS.flatMap((y) =>
      HOLDS.map(
        (x) =>
          `<button type="button" data-x="${x}" data-y="${y}" data-testid="frame-pos-${x}-${y}" data-tip="${f.positions[`${x}-${y}`]}" aria-label="${f.positions[`${x}-${y}`]}" aria-pressed="false"><i></i></button>`,
      ),
    ).join("")}</div>
    <div class="ratios grow" role="group" aria-label="${f.shape}">${pressed(f.original, f.originalTip, 'data-ratio="" data-testid="frame-ratio-original"')}${RATIOS.map(
      ([w, h]) =>
        pressed(`${w}:${h}`, f.ratioTip(`${w}:${h}`), `data-ratio="${w}:${h}" data-testid="frame-ratio-${w}-${h}"`),
    ).join("")}</div>
  </div>
  <div class="row acts"><button type="button" class="secondary" data-act="reset" data-testid="frame-reset" data-tip="${f.resetTip}">${f.reset}</button><span class="grow"></span><button type="button" class="secondary" data-act="cancel" data-testid="frame-cancel" data-tip="${f.cancelTip}">${t.cancel}</button><button type="button" data-act="save" data-testid="frame-save" data-tip="${f.saveTip}">${t.save}</button></div>
</div>`;

/** The screen the page is, as the classes of a frame see it. */
function shownFormat(): Format {
  return matchMedia(FROM_DESKTOP).matches ? "desktop" : matchMedia(FROM_TABLET).matches ? "tablet" : "phone";
}

/** Where an element shows: a zoomed image is scaled past its frame, and cut back to it (Q490). */
function rectOf(el: Element) {
  const r = el.getBoundingClientRect();
  if (el.localName !== "img") return r;
  const style = getComputedStyle(el);
  const zoom = style.clipPath === "none" ? 1 : Number(/^matrix\(([\d.]+), 0, 0, \1,/.exec(style.transform)?.[1] ?? 1);
  if (!(zoom > 1)) return r;
  // The point it is scaled from, in its own frame's pixels.
  const [ox = 0, oy = 0] = style.transformOrigin.split(" ").map(Number.parseFloat);
  return shownRect(r, { zoom, x: (ox / (r.width / zoom)) * 100, y: (oy / (r.height / zoom)) * 100 });
}

const FRAME_STYLES = ["object-fit", "object-position", "aspect-ratio", "transform", "transform-origin", "clip-path"];

/**
 * An image's style without what the panel shows a frame with: after Save it stays on the
 * image until the page is rendered again, and a frame set then must not start from it.
 */
function templateStyle(el: HTMLElement): string | null {
  const style = el.getAttribute("style");
  if (!FRAME_STYLES.some((name) => el.style.getPropertyPriority(name) === "important")) return style;
  const copy = el.cloneNode(false) as HTMLElement;
  for (const name of FRAME_STYLES)
    if (copy.style.getPropertyPriority(name) === "important") copy.style.removeProperty(name);
  return copy.style.length ? copy.getAttribute("style") : null;
}

/** An image being set in its frame: how it was, how it is now, and whether the maker changed it. */
type Framing = {
  el: HTMLImageElement;
  origin: Origin;
  /** Its style and its classes before, put back on Cancel. */
  before: string | null;
  beforeClass: string | null;
  /** The screen the preview shows, whose frame is the one seen changing, and the screens it is set for. */
  format: Format;
  formats: Set<Format>;
  frame: Frame;
  /** Its fit was written with a frame, not by the template: it is written again with this one. */
  ownFit: boolean;
  changed: boolean;
  /** Back to what the template's classes give: the frame is taken out. */
  reset: boolean;
};

type Selected = { el: HTMLElement; origin: Origin; section?: Origin; info?: EditInfo; sectionInfo?: EditInfo };

export class Editor {
  private mode: PreviewMode = "visitor";
  private paused = false;
  private hidden = false;
  private readonly host = document.createElement("spaka-editor");
  private readonly root: ShadowRoot;
  private readonly hover: HTMLElement;
  private readonly selectedBox: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly pop: HTMLElement;
  private readonly toastEl: HTMLElement;
  private readonly note: HTMLElement;
  private readonly line: HTMLElement;
  /** The pill at the bottom of the page while the agent works (Q391). */
  private readonly working: HTMLElement;
  /** Over the page while the agent works, under what the editor draws: the page takes no click or hover (Q410). */
  private readonly shield: HTMLElement;
  private readonly tour: PageTourLayer;
  private hovered: HTMLElement | undefined;
  /** An image of a list being dragged by its handle: the outline shows where it goes, not what the pointer is over. */
  private draggingItem = false;
  private selected: Selected | undefined;
  private editing: { el: HTMLElement; before: string; origin: Origin; field?: string } | undefined;
  private readonly framePop: HTMLElement;
  private readonly frameDrag: HTMLElement;
  private framing: Framing | undefined;
  /** The preview shows a phone or a tablet turned on its side: as wide as a larger screen, whose frame it shows. */
  private sideways = false;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private frame = 0;
  private observed = false;
  private follow: () => void = () => {};

  /** `open`: the drawings can be read by the app's own checks, run in the background. */
  constructor(
    private readonly bridge: EditorBridge,
    private readonly open = false,
  ) {
    this.host.setAttribute("data-spaka-runtime", "");
    // Whatever the page's stylesheets say about unknown elements, the host takes no room.
    this.host.style.cssText =
      "all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;";
    this.root = this.host.attachShadow({ mode: open ? "open" : "closed" });
    this.root.innerHTML = `<style>${STYLE}${COMMENT_STYLE}${TIP_STYLE}${TOUR_STYLE}</style><div class="layer">
      <div class="shield" data-testid="page-shield"></div>
      <div class="box hover"><span class="tag"></span></div>
      <div class="box selected"></div>
      <div class="frame-drag" data-testid="frame-drag" data-tip="${f.drag}"></div>
      <div class="bar" data-testid="editor-bar"></div>
      <div class="pop"><input type="text"><button class="secondary" data-act="cancel" data-tip="${t.cancelTip}"></button><button data-act="save" data-tip="${t.saveTip}"></button></div>
      ${FRAME_PANEL}
      <div class="editing-note"></div>
      <div class="line" data-testid="insertion-line"></div>
      <div class="toast" role="status"></div>
      <div class="working" role="status" data-testid="agent-working"><span class="bars"><i></i><i></i><i></i><i></i></span><b></b><span class="sub"></span><button type="button" data-act="stop" data-tip="${t.stopTip}"><svg viewBox="0 0 10 10" aria-hidden="true"><rect width="10" height="10" rx="2" fill="currentColor"></rect></svg><span></span></button></div></div>`;
    const q = <T extends HTMLElement>(sel: string) => this.root.querySelector(sel) as T;
    this.hover = q(".hover");
    this.selectedBox = q(".selected");
    this.bar = q(".bar");
    this.pop = q(".pop");
    this.framePop = q(".frame");
    this.frameDrag = q(".frame-drag");
    this.toastEl = q(".toast");
    this.note = q(".editing-note");
    this.line = q(".line");
    this.working = q(".working");
    this.shield = q(".shield");
    q(".working b").textContent = t.working;
    q(".working .sub").textContent = `· ${t.workingPaused}`;
    q(".working button span").textContent = t.stop;
    q(".working button").addEventListener("click", () => bridge.stop());
    q<HTMLButtonElement>('.pop [data-act="cancel"]').textContent = t.cancel;
    q<HTMLButtonElement>('.pop [data-act="save"]').textContent = t.save;
    this.comments = new CommentLayer(q(".layer"), bridge, (text) => this.toast(text));
    attachTips(this.root, q(".layer"));
    this.tour = new PageTourLayer(q(".layer"));
    this.listen();
  }

  private readonly comments: CommentLayer;

  setComments(comments: PageComment[]) {
    this.comments.set(comments);
  }

  /** Puts the drawings back in the page: a rendering may have replaced what was around them. */
  attach() {
    if (this.host.isConnected) return;
    document.documentElement.append(this.host);
    // The page's own size changes (a font, an image) move what is drawn over it.
    if (!this.observed) new ResizeObserver(() => this.follow()).observe(document.documentElement);
    this.observed = true;
  }

  /** The tour's veil or bubble over the page (Q337). */
  setTour(tour: PageTour | null, act: (action: TourAction) => void) {
    this.tour.set(tour, act);
  }

  set(mode: PreviewMode, paused: boolean, sideways = false) {
    this.sideways = sideways;
    this.mode = mode;
    // Said on its element too: the app's checks wait for a mode to have reached the page.
    this.host.dataset.mode = mode;
    this.paused = paused;
    this.comments.setPaused(paused);
    // A comment being written belongs to comment mode: the card closes in the others.
    if (mode !== "comment") this.comments.close();
    if (mode !== "edit" || paused) {
      this.commitEdit();
      this.select(undefined);
      this.setHover(undefined);
    }
    // The pill says it (Q391); the toast is for a click or a drop meanwhile.
    this.showWorking();
  }

  setHidden(hidden: boolean) {
    this.hidden = hidden;
    this.host.style.display = hidden ? "none" : "";
    this.showWorking();
  }

  /**
   * The pill shows while the agent works, in every mode, with Stop (Q391). The
   * page meanwhile takes no click, hover or key, and still scrolls (Q410); in
   * comment mode comments are still placed and written (Q412).
   */
  private showWorking() {
    const shown = this.busy;
    this.working.classList.toggle("shown", shown);
    this.working.parentElement?.classList.toggle("busy", shown);
    this.shield.classList.toggle("shown", shown && this.mode !== "comment");
    // What had the focus in the page would still take keys.
    if (shown && document.activeElement instanceof HTMLElement && document.activeElement !== document.body)
      document.activeElement.blur();
  }

  /** The agent works and the page is shown. */
  private get busy() {
    return this.paused && !this.hidden;
  }

  /** After a new rendering: the selected element may have been replaced, found again by its origin. */
  rendered() {
    this.attach();
    const s = this.selected;
    if (s && !s.el.isConnected) {
      const again = document.querySelector<HTMLElement>(
        `[data-spaka-src$=":${s.origin.at}"][data-spaka-src^="${s.origin.file}:"]`,
      );
      if (again) void this.select(again);
      else this.select(undefined);
    }
    // A rendering writes the image's style again: what the maker is setting stays shown.
    if (this.framing?.changed && this.framing.el.isConnected) this.showFrame();
    this.place();
  }

  /** Edit mode, not paused: selecting and editing. */
  private get active() {
    return this.mode === "edit" && !this.paused && !this.hidden;
  }

  /** Comment mode: allowed while the agent works, only sending waits (Q95). */
  private get commenting() {
    return this.mode === "comment" && !this.hidden;
  }

  // ---- events --------------------------------------------------------------

  private listen() {
    const ours = (e: Event) => e.composedPath().includes(this.host);
    const inEdit = (e: Event) => this.editing?.el.contains(e.target as Node);
    window.addEventListener(
      "mousemove",
      (e) => {
        if (this.draggingItem) return;
        if (!(this.active || this.commenting) || ours(e) || this.editing) return this.setHover(undefined);
        this.setHover(tracedFrom(e.target));
      },
      { capture: true, passive: true },
    );
    document.addEventListener("mouseleave", () => this.setHover(undefined));
    // The pointer on the shield: the page's own listeners would see it on the editor's element.
    for (const type of SHIELDED)
      window.addEventListener(
        type,
        (e) => {
          if (!this.busy || !e.composedPath().includes(this.shield)) return;
          e.preventDefault();
          e.stopImmediatePropagation();
        },
        { capture: true },
      );
    // While the agent works the page's scripts see no key; the keys that scroll still scroll (Q410),
    // and the app's shortcuts still reach it.
    for (const type of ["keydown", "keyup", "keypress"] as const)
      window.addEventListener(
        type,
        (e) => {
          if (!this.busy || ours(e) || e.metaKey || e.ctrlKey) return;
          if (!SCROLL_KEYS.has(e.key)) e.preventDefault();
          e.stopImmediatePropagation();
        },
        { capture: true },
      );
    for (const type of ["click", "auxclick", "submit", "pointerup", "mouseup"] as const)
      window.addEventListener(
        type,
        (e) => {
          if (this.mode === "visitor" || ours(e) || inEdit(e)) return;
          // In edit and comment modes, the page's own links, buttons and htmx do nothing.
          e.preventDefault();
          e.stopImmediatePropagation();
          if (type === "click" && this.active) {
            if (this.editing) this.commitEdit();
            void this.select(tracedFrom(e.target));
          }
          if (type === "click" && this.commenting) {
            const el = tracedFrom(e.target);
            if (el) this.comments.openOn(el);
          }
        },
        { capture: true },
      );
    for (const type of ["mousedown", "pointerdown"] as const)
      window.addEventListener(
        type,
        (e) => {
          if (this.mode === "visitor" || ours(e) || inEdit(e)) return;
          // Keeps the page from taking the focus or starting a drag of its own.
          e.preventDefault();
          e.stopImmediatePropagation();
        },
        { capture: true },
      );
    window.addEventListener(
      "dblclick",
      (e) => {
        if (!this.active || ours(e) || inEdit(e)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        const el = tracedFrom(e.target);
        if (el) void this.startEdit(el);
      },
      { capture: true },
    );
    window.addEventListener(
      "keydown",
      (e) => {
        if (this.editing) {
          if (e.key === "Escape") {
            e.preventDefault();
            this.cancelEdit();
          } else if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            this.commitEdit();
          }
          return;
        }
        if (!this.active || !this.selected || ours(e)) return;
        if (e.key === "Escape") this.framing ? this.closeFrame(true) : this.select(undefined);
        else if (this.framing) return;
        else if ((e.key === "Backspace" || e.key === "Delete") && this.canDelete()) {
          e.preventDefault();
          void this.act("delete");
        }
      },
      { capture: true },
    );
    window.addEventListener(
      "focusout",
      (e) => {
        if (this.editing && e.target === this.editing.el) this.commitEdit();
      },
      { capture: true },
    );
    this.listenForBlocks();
    this.listenForFiles();
    const follow = () => {
      cancelAnimationFrame(this.frame);
      this.frame = requestAnimationFrame(() => this.place());
    };
    window.addEventListener("scroll", follow, { capture: true, passive: true });
    window.addEventListener("resize", follow, { passive: true });
    this.follow = follow;
    this.pop.addEventListener("click", (e) => {
      const act = (e.target as HTMLElement).dataset.act;
      if (act === "cancel") this.closePop();
      if (act === "save") void this.saveLink();
    });
    this.pop.querySelector("input")!.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") void this.saveLink();
      if (e.key === "Escape") this.closePop();
    });
    this.listenForFrame();
  }

  // ---- selection -----------------------------------------------------------

  private setHover(el: HTMLElement | undefined) {
    this.hovered = el && el !== this.selected?.el ? el : undefined;
    this.place();
  }

  private async select(el: HTMLElement | undefined) {
    this.closePop();
    const origin = el && originOf(el);
    if (!el || !origin) {
      this.selected = undefined;
      this.place();
      return;
    }
    const section = sectionTarget(el);
    const selected: Selected = { el, origin, section };
    this.selected = selected;
    this.hovered = undefined;
    this.place();
    const [info, sectionInfo] = await Promise.all([
      this.bridge.info(origin.file, origin.at, listItemOf(el) ? recordOf(el) : undefined).catch(() => undefined),
      section && (section.file !== origin.file || section.at !== origin.at)
        ? this.bridge.info(section.file, section.at).catch(() => undefined)
        : undefined,
    ]);
    if (this.selected !== selected) return;
    selected.info = info;
    selected.sectionInfo = sectionInfo ?? info;
    this.drawBar();
    this.place();
  }

  /** What duplicate, delete and move act on: the section when the element is one, else the element. */
  private target(): Origin | undefined {
    return this.selected?.section ?? this.selected?.origin;
  }

  private canDelete(): boolean {
    return !!this.selected?.sectionInfo?.movable || !!this.listItem();
  }

  /** The selected image's place in a record's list of images, and how many the list holds (Q356). */
  private listItem(): { record: string; index: number; count?: number } | undefined {
    const s = this.selected;
    const list = s?.info?.image?.list;
    const item = s && list ? listItemOf(s.el) : undefined;
    return item && { ...item, count: list?.count };
  }

  private drawBar() {
    const s = this.selected;
    if (!s) return;
    const sections = s.section ? sectionList() : [];
    const index = sections.findIndex((x) => x.target.file === s.section?.file && x.target.at === s.section?.at);
    const same = (i: number) => sections[i]?.target.file === s.section?.file;
    const buttons: string[] = [];
    const button = (act: string, icon: keyof typeof ICONS, title: string, enabled = true) =>
      buttons.push(
        `<button data-act="${act}" data-testid="editor-${act}" data-tip="${title}" aria-label="${title}"${enabled ? "" : " disabled"}><svg viewBox="0 0 24 24">${ICONS[icon]}</svg></button>`,
      );
    const parent = tracedFrom(s.el.parentElement);
    button("parent", "parent", t.parent, !!parent);
    if (s.section) {
      button("drag", "drag", t.drag, !!s.sectionInfo?.movable);
      button("up", "up", t.moveUp, index > 0 && same(index - 1));
      button("down", "down", t.moveDown, index >= 0 && index < sections.length - 1 && same(index + 1));
      buttons.push('<span class="sep"></span>');
    }
    const movable = !!s.sectionInfo?.movable;
    // An image of a record's list of images: moved in its list, or taken out of it (Q356).
    const item = this.listItem();
    if (item) {
      const last = item.count === undefined ? false : item.index >= item.count - 1;
      button("item-drag", "drag", t.dragImage);
      button("earlier", "earlier", t.earlier, item.index > 0);
      button("later", "later", t.later, !last);
      buttons.push('<span class="sep"></span>');
    }
    button("duplicate", "duplicate", t.duplicate, movable);
    button(item ? "remove" : "delete", "delete", item ? t.removeImage : t.delete, movable || !!item);
    if (s.info?.text) button("text", "text", t.editText);
    if (s.el.localName === "a") button("link", "link", t.link);
    if (s.info?.image) button("replace", "image", t.replace);
    if (s.info?.image?.frame) button("frame", "frame", t.adjust);
    const shared = s.info?.sharedBy ?? 0;
    if (shared > 0) buttons.push(`<span class="chip" data-testid="editor-shared">${t.shared(shared)}</span>`);
    this.bar.innerHTML = buttons.join("");
    for (const b of this.bar.querySelectorAll<HTMLButtonElement>("button[data-act]"))
      if (b.dataset.act === "drag") this.dragFrom(b);
      else if (b.dataset.act === "item-drag") this.dragImageFrom(b);
      else b.addEventListener("click", () => void this.act(b.dataset.act!));
  }

  /** Reordering by dragging the handle (decisions: drag and drop reorders a page's sections). */
  private dragFrom(handle: HTMLElement) {
    handle.addEventListener("pointerdown", (e) => {
      const target = this.selected?.section;
      if (!target || handle.hasAttribute("disabled")) return;
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      let point: ReturnType<typeof insertionPoint>;
      const move = (ev: PointerEvent) => {
        point = insertionPoint(ev.clientY);
        this.showLine(point && point.file === target.file ? point.top : undefined);
      };
      const up = async () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        this.showLine(undefined);
        if (!point || point.file !== target.file) return;
        // Dropped where it already is: nothing to write.
        const list = sectionList();
        const i = list.findIndex((x) => x.target.file === target.file && x.target.at === target.at);
        const next = list[i + 1]?.target.at ?? null;
        if (point.before?.at === target.at || (point.before?.at ?? null) === next) return;
        if (await this.run({ type: "move", file: target.file, at: target.at, before: point.before?.at ?? null }))
          this.select(undefined);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
    });
  }

  /**
   * An image of a list dragged by its handle onto another image of the same
   * list, which it takes the place of (Q356): the image under the pointer is
   * outlined as it goes.
   */
  private dragImageFrom(handle: HTMLElement) {
    handle.addEventListener("pointerdown", (e) => {
      const s = this.selected;
      const item = this.listItem();
      if (!s || !item) return;
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      this.draggingItem = true;
      let over: HTMLElement | undefined;
      const move = (ev: PointerEvent) => {
        over = listImageAt(ev.clientX, ev.clientY, s.el);
        this.setHover(over);
      };
      const up = async () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        this.draggingItem = false;
        this.setHover(undefined);
        const to = over && listItemOf(over)?.index;
        if (to === undefined || to === item.index) return;
        await this.moveItem(to);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
    });
  }

  /** Moves the selected image of a list to another place in it, the selection following it. */
  private async moveItem(to: number) {
    const s = this.selected;
    const item = this.listItem();
    if (!s || !item) return;
    const ok = await this.run({
      type: "record-item",
      file: s.origin.file,
      at: s.origin.at,
      record: `${item.record}#${item.index}`,
      op: "move",
      to,
    });
    if (ok) this.select(undefined);
  }

  /**
   * A gallery block dragged from the Blocks tab into the page (Q101): the line
   * shows where it will go among the page's sections, and the drop puts it there.
   */
  private listenForBlocks() {
    // Only a drag the maker makes: never one a script of the page makes up (ADR 0011), save in the app's checks.
    const isBlock = (e: DragEvent) => (e.isTrusted || this.open) && !!e.dataTransfer?.types.includes(BLOCK_TYPE);
    let point: ReturnType<typeof insertionPoint>;
    window.addEventListener(
      "dragover",
      (e) => {
        if (!isBlock(e)) return;
        this.toEditForDrop();
        if (!this.active) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        e.dataTransfer!.dropEffect = "copy";
        point = insertionPoint(e.clientY);
        this.showLine(point?.top);
      },
      { capture: true },
    );
    window.addEventListener(
      "dragenter",
      (e) => {
        if (!isBlock(e)) return;
        this.toEditForDrop();
        if (this.paused) this.toast(t.paused);
      },
      { capture: true },
    );
    window.addEventListener(
      "dragleave",
      (e) => {
        // Leaving the page itself, not one of its elements.
        if (isBlock(e) && !e.relatedTarget) this.showLine(undefined);
      },
      { capture: true },
    );
    window.addEventListener(
      "drop",
      (e) => {
        if (!isBlock(e) || !this.active) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        this.showLine(undefined);
        const block = e.dataTransfer!.getData(BLOCK_TYPE);
        const at = point ?? insertionPoint(e.clientY);
        if (!block || !at) return;
        this.select(undefined);
        void this.run({ type: "insert", file: at.file, before: at.before?.at ?? null, block });
      },
      { capture: true },
    );
    window.addEventListener("dragend", () => this.showLine(undefined), { capture: true });
  }

  /**
   * A block or an image file dragged into the page while it is in visitor or
   * comment mode: the preview goes to edit mode, here at once so that this very
   * drag shows its line, and in the app (Q254).
   */
  private toEditForDrop() {
    if (this.mode === "edit") return;
    this.set("edit", this.paused);
    this.bridge.toEdit();
  }

  /**
   * An image file dragged from the Finder onto an image of the page (Q159):
   * the image is outlined, and the drop replaces it. Other files are refused.
   */
  private listenForFiles() {
    const isFiles = (e: DragEvent) => (e.isTrusted || this.open) && !!e.dataTransfer?.types.includes("Files");
    window.addEventListener(
      "dragenter",
      (e) => {
        if (isFiles(e)) this.toEditForDrop();
      },
      { capture: true },
    );
    const imageAt = (e: DragEvent) =>
      document
        .elementsFromPoint(e.clientX, e.clientY)
        .find((el): el is HTMLElement => el.localName === "img" && el.hasAttribute("data-spaka-src"));
    window.addEventListener(
      "dragover",
      (e) => {
        if (!isFiles(e)) return;
        this.toEditForDrop();
        // Never the browser's own drop, which would open the file.
        e.preventDefault();
        e.stopImmediatePropagation();
        const image = this.active ? imageAt(e) : undefined;
        e.dataTransfer!.dropEffect = image ? "copy" : "none";
        this.setHover(image);
      },
      { capture: true },
    );
    window.addEventListener(
      "drop",
      (e) => {
        if (!isFiles(e)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        this.setHover(undefined);
        if (this.mode !== "edit") return;
        if (this.paused) return this.toast(t.paused);
        const image = imageAt(e);
        const file = e.dataTransfer?.files[0];
        if (!image || !file) return this.toast(t.dropOnImage);
        void this.replaceImage(image, { from: this.bridge.pathOf(file) });
      },
      { capture: true },
    );
  }

  /** Replaces an image: chosen in the app's picker, or a file dropped from the disk (Q159). */
  private async replaceImage(el: HTMLElement, chosen?: { from: string }) {
    const origin = originOf(el);
    if (!origin) return;
    const info = await this.bridge.info(origin.file, origin.at, recordOf(el)).catch(() => undefined);
    if (!info?.image) return this.toast(t.notReplaceable);
    const record = info.image.field ? recordOf(el) : undefined;
    if (info.image.field && !record) return this.toast(t.notReplaceable);
    const src = chosen ? "" : await this.bridge.pickImage();
    if (src === null) return;
    await this.run({ type: "image", file: origin.file, at: origin.at, src, record, from: chosen?.from });
  }

  /** The insertion line, at a height in the window, or hidden. */
  showLine(top: number | undefined) {
    this.line.style.display = top === undefined ? "none" : "block";
    if (top !== undefined) this.line.style.top = `${top}px`;
  }

  private async act(act: string) {
    const s = this.selected;
    const target = this.target();
    if (!s || !target) return;
    if (act === "text") return this.startEdit(s.el);
    if (act === "parent") return this.select(tracedFrom(s.el.parentElement));
    if (act === "link") return this.openPop();
    if (act === "replace") return this.replaceImage(s.el);
    if (act === "frame") return this.openFrame();
    const item = this.listItem();
    if (item && (act === "earlier" || act === "later")) return this.moveItem(item.index + (act === "earlier" ? -1 : 1));
    if (item && (act === "remove" || act === "delete")) {
      const record = `${item.record}#${item.index}`;
      if (await this.run({ type: "record-item", file: s.origin.file, at: s.origin.at, record, op: "remove" }))
        this.select(undefined);
      return;
    }
    if (act === "up" || act === "down") {
      const sections = sectionList();
      const i = sections.findIndex((x) => x.target.file === target.file && x.target.at === target.at);
      const before = act === "up" ? sections[i - 1] : sections[i + 2];
      const ok = await this.run({ type: "move", file: target.file, at: target.at, before: before?.target.at ?? null });
      if (ok) this.select(undefined);
      return;
    }
    if (act === "duplicate" || act === "delete") {
      const ok = await this.run({ type: act, file: target.file, at: target.at });
      if (ok) this.select(undefined);
    }
  }

  private async run(action: EditAction): Promise<boolean> {
    try {
      await this.bridge.edit(action);
      return true;
    } catch (error) {
      this.toast(reason(error));
      return false;
    }
  }

  // ---- editing a text in place ---------------------------------------------

  private async startEdit(el: HTMLElement) {
    const origin = originOf(el);
    if (!origin || this.editing) return;
    const info = await this.bridge.info(origin.file, origin.at).catch(() => undefined);
    // A text the app cannot write: a comment for the agent opens on it instead.
    if (!info?.text) {
      this.toast(info?.fromRecord ? t.fromRecord : info?.computed ? t.computed : t.notText);
      return this.comments.openOn(el);
    }
    await this.select(el);
    this.editing = { el, before: el.innerHTML, origin, field: info.field };
    el.setAttribute("contenteditable", "plaintext-only");
    el.setAttribute("spellcheck", "true");
    el.focus();
    // The caret at the end of the text, unless the double click already selected a word.
    const selection = getSelection();
    if (selection && (selection.isCollapsed || !el.contains(selection.anchorNode))) {
      selection.selectAllChildren(el);
      selection.collapseToEnd();
    }
    if (info.sharedBy > 0) this.showNote(t.shared(info.sharedBy));
    this.place();
  }

  private stopEditing() {
    const editing = this.editing;
    if (!editing) return undefined;
    this.editing = undefined;
    editing.el.removeAttribute("contenteditable");
    editing.el.removeAttribute("spellcheck");
    this.note.style.display = "none";
    return editing;
  }

  private commitEdit() {
    const editing = this.stopEditing();
    if (!editing || editing.el.innerHTML === editing.before) return;
    const { file, at } = editing.origin;
    // A record's text field is written in the record (Q148).
    const record = editing.field ? recordOf(editing.el) : undefined;
    const action: EditAction = record
      ? { type: "record-text", file, at, record, text: editing.el.textContent ?? "" }
      : { type: "text", file, at, ...textsOf(editing.el) };
    void this.run(action).then((ok) => {
      if (!ok) editing.el.innerHTML = editing.before;
    });
  }

  private cancelEdit() {
    const editing = this.stopEditing();
    if (editing) editing.el.innerHTML = editing.before;
  }

  private showNote(text: string) {
    this.note.textContent = text;
    this.note.style.display = "block";
  }

  // ---- the link's address --------------------------------------------------

  private openPop() {
    const s = this.selected;
    if (!s) return;
    const input = this.pop.querySelector("input")!;
    input.placeholder = t.linkPlaceholder;
    input.value = s.el.getAttribute("href") ?? "";
    this.pop.style.display = "flex";
    this.place();
    input.focus();
    input.select();
  }

  private closePop() {
    this.pop.style.display = "none";
    this.closeFrame(true);
  }

  // ---- an image in its frame (Q490) ----------------------------------------

  private async openFrame() {
    const s = this.selected;
    if (s?.el.localName !== "img") return;
    // Asked again: a frame may have been written since the image was selected.
    const frames = (await this.bridge.info(s.origin.file, s.origin.at).catch(() => undefined))?.image?.frame;
    if (!frames || this.selected !== s) return;
    this.closePop();
    const el = s.el as HTMLImageElement;
    const format = shownFormat();
    const same = (other: Format) => JSON.stringify(frames[other]) === JSON.stringify(frames[format]);
    this.framing = {
      el,
      origin: s.origin,
      before: templateStyle(el),
      beforeClass: el.getAttribute("class"),
      format,
      // The screens set as this one is: all of them, until one is set apart.
      formats: new Set(FORMATS.filter(same)),
      frame: frames[format] ?? readFrame(getComputedStyle(el)),
      ownFit: !!frames[format]?.fit,
      changed: false,
      reset: false,
    };
    this.framePop.style.display = "flex";
    this.syncFrame();
    this.place();
    this.framePop.querySelector<HTMLInputElement>('input[type="range"]')!.focus();
  }

  /** Closes the panel; `restore` puts the image back as it was before it opened. */
  private closeFrame(restore: boolean) {
    const fr = this.framing;
    if (!fr) return;
    this.framing = undefined;
    if (restore && fr.changed) {
      const put = (name: string, value: string | null) =>
        value === null ? fr.el.removeAttribute(name) : fr.el.setAttribute(name, value);
      put("style", fr.before);
      put("class", fr.beforeClass);
    }
    fr.el.removeAttribute("data-spaka-zoomed");
    this.framePop.style.display = "none";
    this.frameDrag.style.display = "none";
    this.place();
  }

  /** The frame as it will be written: with the image's own corners, which a zoom would otherwise cut square. */
  private frameToWrite(fr: Framing): Frame {
    const radius = getComputedStyle(fr.el).borderRadius;
    // How the image fills its frame is the template's to say, unless a frame said it (below).
    const { fit, ...frame } = fr.frame;
    return { ...frame, ...(fr.ownFit ? { fit } : {}), ...(/[1-9]/.test(radius) ? { radius } : {}) };
  }

  /** Shows on the image itself what the panel says: the page is the preview. */
  private showFrame() {
    const fr = this.framing;
    if (!fr) return;
    // From the style the image has in its template, which Save leaves as it is: what shows is what will be written.
    if (fr.before === null) fr.el.removeAttribute("style");
    else fr.el.setAttribute("style", fr.before);
    // Without the classes a frame was written with: the one shown replaces them, and a saved
    // zoom or proportions the panel no longer has would otherwise still show (a zoom of 100%
    // or Auto set nothing over them). The other screens' do not apply at this width.
    fr.el.className = readFrameClasses(fr.beforeClass ?? "").rest.join(" ");
    // What contains it cuts what a zoom makes go past (the runtime's rule), while it is being set too.
    fr.el.toggleAttribute("data-spaka-zoomed", !fr.reset && fr.frame.zoom > 1);
    if (fr.reset) {
      // As the template has it.
      fr.frame = readFrame(getComputedStyle(fr.el));
      fr.ownFit = false;
    }
    // Important, as the classes a frame is written with are: what is being set shows over what was saved.
    else
      for (const [name, value] of frameDeclarations(this.frameToWrite(fr)))
        fr.el.style.setProperty(name, value, "important");
  }

  /** The panel's controls, as the frame is. */
  private syncFrame() {
    const fr = this.framing;
    if (!fr) return;
    const { frame } = fr;
    const press = (b: HTMLElement, on: boolean) => b.setAttribute("aria-pressed", String(on));
    this.framePop.querySelector<HTMLInputElement>('input[type="range"]')!.value = String(frame.zoom);
    this.framePop.querySelector("output")!.textContent = `${Math.round(frame.zoom * 100)}%`;
    for (const b of this.framePop.querySelectorAll<HTMLElement>("[data-x]"))
      press(b, Number(b.dataset.x) === frame.x && Number(b.dataset.y) === frame.y);
    for (const b of this.framePop.querySelectorAll<HTMLButtonElement>("[data-format]")) {
      const format = b.dataset.format as Format;
      press(b, fr.formats.has(format));
      // The screen shown is always one of them: it is the one seen changing.
      b.disabled = format === fr.format;
      b.dataset.tip = (format === fr.format ? f.shownTip : f.formatTip)(f.formats[format]);
    }
    this.framePop.querySelector<HTMLElement>(".hint.others")!.style.display =
      fr.formats.size < FORMATS.length ? "block" : "none";
    // A device on its side is as wide as the next screen up, whose frame is the one set here.
    const turned = !this.sideways
      ? ""
      : fr.format === "tablet"
        ? f.sidewaysPhone
        : fr.format === "desktop"
          ? f.sidewaysTablet
          : "";
    const sideways = this.framePop.querySelector<HTMLElement>(".hint.sideways")!;
    sideways.textContent = turned;
    sideways.style.display = turned ? "block" : "none";
    for (const b of this.framePop.querySelectorAll<HTMLElement>("[data-ratio]")) {
      press(b, b.dataset.ratio === (frame.ratio ? frame.ratio.join(":") : ""));
    }
  }

  /** One gesture of the maker's on the frame, shown at once. */
  private setFrame(change: Partial<Frame>) {
    const fr = this.framing;
    if (!fr) return;
    fr.frame = { ...fr.frame, ...change };
    // Proportions that are not the image's own would stretch it: it fills its frame instead.
    if (change.ratio && !fr.frame.fit) {
      fr.frame.fit = "cover";
      fr.ownFit = true;
    }
    fr.changed = true;
    fr.reset = false;
    this.showFrame();
    this.syncFrame();
    this.place();
  }

  private async saveFrame() {
    const fr = this.framing;
    if (!fr) return;
    if (!fr.changed) return this.closeFrame(true);
    const ok = await this.run({
      type: "image-frame",
      file: fr.origin.file,
      at: fr.origin.at,
      frame: fr.reset ? null : this.frameToWrite(fr),
      formats: [...fr.formats],
    });
    // The rendering that follows writes the same style: the image stays as it is shown.
    if (ok && this.framing === fr) this.closeFrame(false);
  }

  private listenForFrame() {
    const pop = this.framePop;
    pop.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("button");
      const fr = this.framing;
      if (!b || !fr) return;
      if (b.dataset.format) {
        const format = b.dataset.format as Format;
        if (!fr.formats.delete(format)) fr.formats.add(format);
        // The screens it is for are part of what is saved.
        fr.changed = true;
        this.showFrame();
        this.syncFrame();
        this.place();
      } else if (b.dataset.x) this.setFrame({ x: Number(b.dataset.x), y: Number(b.dataset.y) });
      else if (b.dataset.ratio !== undefined) {
        const ratio = RATIOS.find(([w, h]) => `${w}:${h}` === b.dataset.ratio);
        this.setFrame({ ratio: ratio && [ratio[0], ratio[1]] });
      } else if (b.dataset.act === "reset") {
        fr.changed = true;
        fr.reset = true;
        this.showFrame();
        this.syncFrame();
        this.place();
      } else if (b.dataset.act === "cancel") this.closeFrame(true);
      else if (b.dataset.act === "save") void this.saveFrame();
    });
    pop.querySelector('input[type="range"]')!.addEventListener("input", (e) => {
      this.setFrame({ zoom: Number((e.target as HTMLInputElement).value) });
    });
    pop.addEventListener("keydown", (e) => {
      // The page's own shortcuts see none of what is typed here.
      e.stopPropagation();
      if (e.key === "Escape") this.closeFrame(true);
    });
    // The image dragged in its frame, while the panel is open: it follows the pointer.
    const drag = this.frameDrag;
    let from: { x: number; y: number; frame: Frame } | undefined;
    drag.addEventListener("pointerdown", (e) => {
      if (!this.framing || e.button !== 0) return;
      e.preventDefault();
      drag.setPointerCapture(e.pointerId);
      drag.classList.add("held");
      from = { x: e.clientX, y: e.clientY, frame: this.framing.frame };
    });
    drag.addEventListener("pointermove", (e) => {
      const fr = this.framing;
      if (!from || !fr) return;
      const moved = dragged(
        from.frame,
        e.clientX - from.x,
        e.clientY - from.y,
        { width: fr.el.clientWidth, height: fr.el.clientHeight },
        { width: fr.el.naturalWidth, height: fr.el.naturalHeight },
      );
      if (moved.x !== fr.frame.x || moved.y !== fr.frame.y) this.setFrame({ x: moved.x, y: moved.y });
    });
    for (const type of ["pointerup", "pointercancel"] as const)
      drag.addEventListener(type, () => {
        from = undefined;
        drag.classList.remove("held");
      });
  }

  private async saveLink() {
    const s = this.selected;
    if (!s) return;
    const href = this.pop.querySelector("input")!.value;
    if (await this.run({ type: "link", file: s.origin.file, at: s.origin.at, href })) this.closePop();
  }

  // ---- drawing -------------------------------------------------------------

  private toast(text: string) {
    this.toastEl.textContent = text;
    this.toastEl.style.display = "block";
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastEl.style.display = "none";
    }, 3500);
  }

  /** Lays the outlines, the bar and the box over the elements, where they are now. */
  private place() {
    this.comments.place();
    const fit = (box: HTMLElement, el: Element | undefined) => {
      if (!el?.isConnected) {
        box.style.display = "none";
        return undefined;
      }
      const r = rectOf(el);
      Object.assign(box.style, {
        display: "block",
        left: `${r.left}px`,
        top: `${r.top}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
      });
      return r;
    };
    const hoverRect = fit(this.hover, this.active || this.commenting ? this.hovered : undefined);
    if (hoverRect && this.hovered) this.hover.querySelector(".tag")!.textContent = this.hovered.localName;
    const r = fit(this.selectedBox, this.active ? this.selected?.el : undefined);
    // The preview shows another screen: what was being set was for the one before.
    if (this.framing && shownFormat() !== this.framing.format) this.closeFrame(true);
    const framing = this.framing;
    const showBar = !!r && !!this.selected?.info && !this.editing && !framing;
    this.bar.style.display = showBar ? "flex" : "none";
    if (!r) {
      this.pop.style.display = "none";
      return;
    }
    const barHeight = 34;
    const above = r.top - barHeight - 6;
    const top = above >= 4 ? above : Math.min(r.bottom + 6, innerHeight - barHeight - 4);
    const left = Math.max(4, Math.min(r.left, innerWidth - (this.bar.offsetWidth || 220) - 4));
    if (showBar) Object.assign(this.bar.style, { top: `${top}px`, left: `${left}px` });
    if (this.pop.style.display !== "none")
      Object.assign(this.pop.style, { top: `${Math.min(r.bottom + 6, innerHeight - 44)}px`, left: `${left}px` });
    if (this.editing) Object.assign(this.note.style, { top: `${Math.max(4, r.top - 26)}px`, left: `${left}px` });
    if (framing) {
      // Under the image, or over its foot when the window ends first.
      const height = this.framePop.offsetHeight;
      Object.assign(this.framePop.style, {
        top: `${Math.max(4, Math.min(r.bottom + 6, innerHeight - height - 4))}px`,
        left: `${Math.max(4, Math.min(r.left, innerWidth - this.framePop.offsetWidth - 4))}px`,
      });
      // An image without a size of its own (some drawings) has nothing to drag.
      fit(this.frameDrag, framing.el.naturalWidth > 0 ? framing.el : undefined);
    }
  }
}

/** The reason an edit was refused, without what Electron puts around it. */
function reason(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, "");
}
