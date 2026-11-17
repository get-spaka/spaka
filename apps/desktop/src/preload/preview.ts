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
/** The agent's own view (Q314): the page as a visitor sees it, with no editing. */
const agent = process.argv.includes("--upstart-agent");

const editor =
  thumbnail || agent
    ? undefined
    : new Editor(
        {
          edit: (action) => invoke("preview:edit", action),
          info: (file, at, record) => invoke("preview:edit-info", file, at, record),
          pickImage: () => invoke("preview:pick-image"),
          toEdit: () => void invoke("preview:to-edit"),
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
  else if (message.type === "theme") setTheme(message.css, message.styles);
  else if (message.type === "clip") thumbStyle(message.top);
  else if (message.type === "editor") {
    editor?.set(message.mode, message.paused);
    if (!thumbnail) setMoving(message.mode === "visitor");
  } else if (message.type === "comments") editor?.setComments(message.comments);
  else if (message.type === "tour") editor?.setTour(message.tour, (action) => send({ type: "tour", action }));
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
  if (thumbnail) thumbStyle(clipped);
  else hideScrollbar();
  send({ type: "loaded", path: location.pathname, title: document.title });
});

function render(html: string, final: boolean) {
  const started = performance.now();
  const doc = new DOMParser().parseFromString(html, "text/html");
  // The site's modules stop first, on the page their start changed, which they put back;
  // they start again once the rendering is complete (ADR 0011).
  if (moving) pageWorld("window.__upStart && window.__upStart.stop()");
  syncHead(doc);
  syncAttributes(document.documentElement, doc.documentElement);
  if (moving) document.documentElement.setAttribute("data-up-moving", "");
  syncAttributes(document.body, doc.body);
  Idiomorph.morph(document.body, [...doc.body.childNodes], {
    morphStyle: "innerHTML",
    ignoreActiveValue: true,
    callbacks: {
      // In the agent's view, what a visitor opened or typed stays through a new rendering (Q324).
      beforeAttributeUpdated: (name: string, node: Element, type: "update" | "remove") =>
        !(agent && keptByVisitor(name, node, type)),
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
    // The site's modules start again on the new rendering (ADR 0011).
    if (moving) pageWorld("window.__upStart && window.__upStart.start()");
  }
  editor?.rendered();
  send({ type: "rendered", ms: performance.now() - started });
}

/** A disclosure the visitor opened, or a field they typed into: the rendering leaves it as it is. */
function keptByVisitor(name: string, node: Element, type: "update" | "remove"): boolean {
  if (name === "open" && type === "remove")
    return node instanceof HTMLDetailsElement || node instanceof HTMLDialogElement;
  if (name === "value" && (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement))
    return node.value !== node.defaultValue;
  return false;
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

/**
 * Whether the page moves: in visitor mode its animations play and its
 * modules start; otherwise it shows its final state, to be edited (Q242).
 * Leaving visitor mode loads the page again, for the HTML its modules have
 * not changed.
 */
let moving = false;
function setMoving(on: boolean) {
  if (on === moving) return;
  moving = on;
  if (on) {
    document.documentElement.setAttribute("data-up-moving", "");
    pageWorld("window.__upStart && window.__upStart.go()");
  } else if (document.querySelector("script[data-wait]")) location.reload();
  else document.documentElement.removeAttribute("data-up-moving");
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
function hideScrollbar() {
  if (!document.head || document.getElementById("up-scroll")) return;
  const style = document.createElement("style");
  style.id = "up-scroll";
  style.textContent = "html{scrollbar-width:none!important}";
  document.head.append(style);
}

function setTheme(css: string, styles?: string) {
  const style = document.getElementById("up-theme");
  if (style && style.textContent !== css) style.textContent = css;
  // Tailwind's browser build watches its style: a change compiles the page again.
  const own = document.getElementById("up-styles");
  if (own && styles !== undefined && own.textContent !== styles) own.textContent = styles;
}
