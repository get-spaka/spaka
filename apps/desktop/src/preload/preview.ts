// Upstart's script inside the preview. With contextIsolation it runs in a
// JavaScript world of its own: it shares the page's DOM and nothing else, so
// the project's scripts can neither break it nor reach it (ADR 0008).
//
// It morphs the page into each new rendering the main process sends while
// the agent writes (ADR 0009), reports what the page does, and carries the
// editing the maker does in the page (editor/).
import { ipcRenderer } from "electron";
import { Idiomorph } from "idiomorph";
import type { FromPreview, PreviewInvokes, ToPreview } from "../shared/ipc";
import { Editor } from "./editor/editor";

const send = (message: FromPreview) => ipcRenderer.send("preview:event", message);
const invoke = <C extends keyof PreviewInvokes>(channel: C, ...args: Parameters<PreviewInvokes[C]>) =>
  ipcRenderer.invoke(channel, ...args) as Promise<ReturnType<PreviewInvokes[C]>>;

const editor = new Editor(
  {
    edit: (action) => invoke("preview:edit", action),
    info: (file, at) => invoke("preview:edit-info", file, at),
  },
  process.argv.includes("--upstart-checks"),
);

ipcRenderer.on("preview:message", (_event, message: ToPreview) => {
  if (message.type === "render") render(message.html, message.final);
  else if (message.type === "theme") setTheme(message.css);
  else if (message.type === "editor") editor.set(message.mode, message.paused);
  else if (message.type === "chrome") {
    editor.setHidden(message.hidden);
    // Answered once the page has drawn itself without them.
    requestAnimationFrame(() => requestAnimationFrame(() => send({ type: "chrome-hidden" })));
  }
});

/** Scripts that have run: those of the page as loaded, and those this script re-created. */
const ran = new WeakSet<Element>();

window.addEventListener("DOMContentLoaded", () => {
  for (const script of document.querySelectorAll("script")) ran.add(script);
  editor.attach();
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
  editor.rendered();
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

function setTheme(css: string) {
  const style = document.getElementById("up-theme");
  if (style && style.textContent !== css) style.textContent = css;
}
