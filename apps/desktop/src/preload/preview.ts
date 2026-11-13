// Upstart's script inside the preview. With contextIsolation it runs in a
// JavaScript world of its own: it shares the page's DOM and nothing else, so
// the project's scripts can neither break it nor reach it (ADR 0008).
//
// It morphs the page into each new rendering the main process sends while
// the agent writes (ADR 0009), reports what the page does, and carries the
// editing the maker does in the page (editor/).
import { ipcRenderer, webUtils } from "electron";
import { Idiomorph } from "idiomorph";
import type { FromPreview, PreviewInvokes, ToPreview } from "../shared/ipc";
import { Editor } from "./editor/editor";

const send = (message: FromPreview) => ipcRenderer.send("preview:event", message);
const invoke = <C extends keyof PreviewInvokes>(channel: C, ...args: Parameters<PreviewInvokes[C]>) =>
  ipcRenderer.invoke(channel, ...args) as Promise<ReturnType<PreviewInvokes[C]>>;

/**
 * A thumbnail of the "All pages" view (Q129–Q132): the page as it renders,
 * nothing else. It takes no click on its content; the click, the right click
 * and the pointer coming and going are passed on.
 */
const thumbnail = process.argv.includes("--upstart-thumbnail");

const editor = thumbnail
  ? undefined
  : new Editor(
      {
        edit: (action) => invoke("preview:edit", action),
        info: (file, at) => invoke("preview:edit-info", file, at),
        pickImage: () => invoke("preview:pick-image"),
        pathOf: (file) => webUtils.getPathForFile(file),
        save: (comment) => invoke("preview:comment-save", comment),
        remove: (id) => invoke("preview:comment-remove", id),
        send: () => invoke("preview:comments-send"),
        discard: () => invoke("preview:comments-discard"),
      },
      process.argv.includes("--upstart-checks"),
    );

if (thumbnail) {
  const stop = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  for (const type of ["mousedown", "mouseup", "dblclick", "auxclick", "keydown", "submit"])
    addEventListener(type, stop, true);
  addEventListener("wheel", stop, { capture: true, passive: false });
  addEventListener(
    "click",
    (event) => {
      stop(event);
      send({ type: "thumb", action: "click" });
    },
    true,
  );
  addEventListener(
    "contextmenu",
    (event) => {
      stop(event);
      send({ type: "thumb", action: "menu" });
    },
    true,
  );
  // The pointer comes from, or goes to, outside the page.
  addEventListener("mouseover", (event) => !event.relatedTarget && send({ type: "thumb", action: "enter" }));
  addEventListener("mouseout", (event) => !event.relatedTarget && send({ type: "thumb", action: "leave" }));
}

ipcRenderer.on("preview:message", (_event, message: ToPreview) => {
  if (message.type === "render") render(message.html, message.final);
  else if (message.type === "theme") setTheme(message.css);
  else if (message.type === "clip") thumbStyle(message.top);
  else if (message.type === "editor") editor?.set(message.mode, message.paused);
  else if (message.type === "comments") editor?.setComments(message.comments);
  else if (message.type === "chrome") {
    editor?.setHidden(message.hidden);
    // Answered once the page has drawn itself without them.
    requestAnimationFrame(() => requestAnimationFrame(() => send({ type: "chrome-hidden" })));
  }
});

/** Scripts that have run: those of the page as loaded, and those this script re-created. */
const ran = new WeakSet<Element>();

window.addEventListener("DOMContentLoaded", () => {
  for (const script of document.querySelectorAll("script")) ran.add(script);
  editor?.attach();
  skeletonStyle();
  if (thumbnail) thumbStyle(clipped);
  else hideScrollbar();
  send({ type: "loaded", path: location.pathname, title: document.title });
});
window.addEventListener("error", (event) => {
  send({
    type: "error",
    message: event.message,
    source: event.filename ? `${event.filename}:${event.lineno}` : undefined,
  });
});

function render(html: string, final: boolean) {
  const started = performance.now();
  const doc = new DOMParser().parseFromString(html, "text/html");
  syncHead(doc);
  syncAttributes(document.documentElement, doc.documentElement);
  syncAttributes(document.body, doc.body);
  Idiomorph.morph(document.body, [...doc.body.childNodes], {
    morphStyle: "innerHTML",
    ignoreActiveValue: true,
    callbacks: {
      // Half a script is never run; scripts run once the files are complete.
      beforeNodeAdded: (node: Node) => !(node instanceof HTMLScriptElement && !final),
      afterNodeAdded: (node: Node) => {
        if (node instanceof HTMLElement && !final)
          node.animate(
            [
              { opacity: 0, transform: "translateY(6px)" },
              { opacity: 1, transform: "none" },
            ],
            {
              duration: 240,
              easing: "ease-out",
            },
          );
      },
    },
  });
  if (final) {
    runScripts(document.body);
    // htmx lives in the page's world: ask it, from there, to take the new elements in hand.
    pageWorld("window.htmx && htmx.process(document.body)");
  }
  editor?.rendered();
  send({ type: "rendered", ms: performance.now() - started });
}

/**
 * The page's own stylesheets (marked data-up-page by the runtime) and its
 * title follow the new rendering. What the runtime or a library put in the
 * head (Tailwind's generated styles among them) is left alone.
 */
function syncHead(doc: Document) {
  if (doc.title !== document.title) document.title = doc.title;
  const own = (root: Document) => [...root.head.querySelectorAll("[data-up-page]")];
  const wanted = own(doc).map((el) => el.outerHTML);
  const present = own(document);
  for (const el of present) if (!wanted.includes(el.outerHTML)) el.remove();
  const kept = new Set(own(document).map((el) => el.outerHTML));
  for (const html of wanted) {
    if (kept.has(html)) continue;
    const template = document.createElement("template");
    template.innerHTML = html;
    document.head.append(template.content);
  }
}

function syncAttributes(target: Element, source: Element) {
  for (const { name } of [...target.attributes]) if (!source.hasAttribute(name)) target.removeAttribute(name);
  for (const { name, value } of [...source.attributes])
    if (target.getAttribute(name) !== value) target.setAttribute(name, value);
}

/** Scripts added by a morph are inert: re-create them so the page runs them, once. */
function runScripts(root: Element) {
  for (const old of root.querySelectorAll("script")) {
    if (ran.has(old)) continue;
    const script = document.createElement("script");
    for (const { name, value } of [...old.attributes]) script.setAttribute(name, value);
    script.textContent = old.textContent;
    ran.add(script);
    old.replaceWith(script);
  }
}

function pageWorld(code: string) {
  const script = document.createElement("script");
  script.setAttribute("data-up-runtime", "");
  script.textContent = code;
  document.documentElement.append(script);
  script.remove();
}

/**
 * A thumbnail stays at the top of its page, without scrollbars; one partly
 * scrolled out of the grid moves its page up by what is hidden. In a style of
 * its own in the head, which the renderings leave alone.
 */
let clipped = 0;
function thumbStyle(top: number) {
  clipped = top;
  if (!document.head) return;
  let style = document.getElementById("up-thumb");
  if (!style) {
    style = document.createElement("style");
    style.id = "up-thumb";
    document.head.append(style);
  }
  style.textContent = `html{overflow:hidden!important;scrollbar-width:none!important${top ? `;translate:0 ${-top}px` : ""}}`;
}

/**
 * The page scrolls without drawing a scrollbar (Q143): it keeps its whole
 * width, as its thumbnail has, and a zoom lands without a shift. In a style
 * of its own in the head, which the renderings leave alone.
 */
/**
 * A section the agent placed from the gallery and has not made its own yet
 * (marked data-up-skeleton by main, Q222) keeps its layout, colors and
 * shapes; its texts become bars in their own color, its pictures and icons
 * blocks, softly pulsing. Nothing in the page is changed but this style.
 */
function skeletonStyle() {
  if (!document.head || document.getElementById("up-skeleton")) return;
  const style = document.createElement("style");
  style.id = "up-skeleton";
  style.textContent = `
@property --up-skel { syntax: "<percentage>"; inherits: true; initial-value: 22%; }
@keyframes up-skel { 50% { --up-skel: 10%; } }
html:has([data-up-skeleton]) { animation: up-skel 1.6s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { html:has([data-up-skeleton]) { animation: none; } }
:where([data-up-skeleton], [data-up-skeleton] *) {
  -webkit-text-fill-color: transparent !important;
  text-decoration-line: underline !important;
  text-decoration-style: solid !important;
  text-decoration-thickness: 0.62em !important;
  text-underline-offset: -0.5em !important;
  text-decoration-skip-ink: none !important;
  text-decoration-color: color-mix(in oklab, currentColor var(--up-skel), transparent) !important;
  text-shadow: none !important;
  cursor: default;
}
:where([data-up-skeleton], [data-up-skeleton] *)::placeholder { -webkit-text-fill-color: transparent !important; }
:where([data-up-skeleton] img, [data-up-skeleton] video, [data-up-skeleton] svg, [data-up-skeleton] canvas, [data-up-skeleton] iframe) {
  object-position: -99999px 0 !important;
  background: color-mix(in oklab, currentColor var(--up-skel), transparent) !important;
  border-radius: 0.375rem;
}
:where([data-up-skeleton] svg *) { fill-opacity: 0 !important; stroke-opacity: 0 !important; }
:where([data-up-skeleton] iframe) { opacity: 0.4; }
`;
  document.head.append(style);
}

function hideScrollbar() {
  if (!document.head || document.getElementById("up-scroll")) return;
  const style = document.createElement("style");
  style.id = "up-scroll";
  style.textContent = "html{scrollbar-width:none!important}";
  document.head.append(style);
}

function setTheme(css: string) {
  const style = document.getElementById("up-theme");
  if (style && style.textContent !== css) style.textContent = css;
}
