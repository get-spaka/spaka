// The editing script the app injects into the preview. Same source for both
// shells; each shell supplies the transport (how messages reach the app and
// come back). It has no dependency and keeps all its state in this closure.
//
// What it does (criteria 1 to 3 of the spike):
//   - reports when each piece of the page reaches the DOM and gets a frame;
//   - highlights the element under the pointer;
//   - reports a click to the app instead of letting the page handle it;
//   - lets a text be edited in place (double click), and reports the change;
//   - shows where a dragged block would land, and reports the drop;
//   - inserts a block's HTML at a given place when the app says so.

export const BLOCK_MIME = "application/x-upstart-block";
export const BLOCK_TEXT_PREFIX = "upstart-block:";

const TEXT_TAGS = "h1,h2,h3,h4,h5,h6,p,span,a,button,li,blockquote,figcaption,label";

/**
 * @param {{ send: (message: object) => void, onMessage: (handler: (message: any) => void) => void }} transport
 */
export function installEditor(transport) {
  const send = (type, data = {}) =>
    transport.send({ type, at: Math.round(performance.now()), ...data });

  // Isolation probe: the page's own script looks for this global.
  window.__upstartEditor = { version: 1 };

  let mode = "edit"; // "edit" intercepts clicks; "browse" leaves the page alone
  let editing = null; // { el, before }
  let host = null;
  let box = null;
  let label = null;
  let line = null;

  // --- overlay -----------------------------------------------------------
  // A plain element with a closed shadow root: the page's styles do not reach
  // it and the page's scripts cannot look inside.
  function overlay() {
    if (host && host.isConnected) return true;
    if (!document.documentElement) return false;
    host = document.createElement("div");
    host.setAttribute("data-upstart-overlay", "");
    host.style.cssText =
      "position:fixed;inset:0;pointer-events:none;z-index:2147483647;margin:0;padding:0;border:0;";
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `
      <style>
        .box { position: fixed; display: none; box-sizing: border-box;
               border: 2px solid #2563eb; background: rgba(37, 99, 235, .08);
               border-radius: 3px; transition: all 60ms linear; }
        .label { position: fixed; display: none; font: 600 11px/1.6 ui-sans-serif, system-ui, sans-serif;
                 color: #fff; background: #2563eb; padding: 0 6px; border-radius: 3px 3px 0 0;
                 white-space: nowrap; }
        .line { position: fixed; display: none; left: 12px; right: 12px; height: 4px;
                background: #f97316; border-radius: 2px; box-shadow: 0 0 0 3px rgba(249, 115, 22, .25); }
        .line::after { content: "drop here"; position: absolute; left: 50%; top: -9px;
                       transform: translateX(-50%); font: 600 11px/1.6 ui-sans-serif, system-ui, sans-serif;
                       color: #fff; background: #f97316; padding: 0 8px; border-radius: 10px; }
      </style>
      <div class="box"></div><div class="label"></div><div class="line"></div>`;
    box = root.querySelector(".box");
    label = root.querySelector(".label");
    line = root.querySelector(".line");
    document.documentElement.appendChild(host);
    return true;
  }

  const isOurs = (el) => !!host && (el === host || host.contains(el));

  function describe(el) {
    const rect = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      selector: pathTo(el),
      piece: el.closest("[data-piece]")?.getAttribute("data-piece") ?? null,
      text: (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 80),
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    };
  }

  function pathTo(el) {
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.body) {
      if (node.id) {
        parts.unshift(`#${node.id}`);
        break;
      }
      let nth = 1;
      let sibling = node;
      while ((sibling = sibling.previousElementSibling)) {
        if (sibling.tagName === node.tagName) nth++;
      }
      parts.unshift(`${node.tagName.toLowerCase()}:nth-of-type(${nth})`);
      node = node.parentElement;
    }
    return parts.join(" > ");
  }

  // --- highlight ---------------------------------------------------------
  function highlight(el) {
    if (!overlay()) return;
    if (!el || isOurs(el) || el === document.documentElement || el === document.body) {
      box.style.display = "none";
      label.style.display = "none";
      return;
    }
    const r = el.getBoundingClientRect();
    box.style.cssText += `;display:block;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;`;
    label.textContent = el.tagName.toLowerCase();
    label.style.cssText += `;display:block;left:${r.left}px;top:${Math.max(0, r.top - 18)}px;`;
  }

  let lastPointer = null;
  let hoverReported = null;
  document.addEventListener(
    "mousemove",
    (e) => {
      lastPointer = { x: e.clientX, y: e.clientY };
      if (mode !== "edit" || editing) return;
      highlight(e.target);
      // Report the first few distinct hovers so a test can see them arrive.
      const selector = pathTo(e.target);
      if (selector !== hoverReported) {
        hoverReported = selector;
        send("hover", {
          element: describe(e.target),
          highlightDrawn: !!box && box.style.display === "block",
          highlight: box ? { left: box.style.left, top: box.style.top, width: box.style.width } : null,
        });
      }
    },
    true,
  );
  document.addEventListener(
    "scroll",
    () => {
      if (mode !== "edit" || editing || !lastPointer) return;
      highlight(document.elementFromPoint(lastPointer.x, lastPointer.y));
    },
    true,
  );
  document.addEventListener("mouseleave", () => highlight(null), true);

  // --- click -------------------------------------------------------------
  document.addEventListener(
    "click",
    (e) => {
      if (mode !== "edit") return;
      if (editing && editing.el.contains(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      send("click", { element: describe(e.target) });
    },
    true,
  );

  // --- inline text editing -----------------------------------------------
  function finishEditing(commit) {
    if (!editing) return;
    const { el, before } = editing;
    editing = null;
    el.removeAttribute("contenteditable");
    el.style.outline = "";
    if (!commit) {
      el.textContent = before;
      send("text-edit-cancelled", { element: describe(el) });
      return;
    }
    const after = el.textContent ?? "";
    send("text-edited", { element: describe(el), before, after, changed: before !== after });
  }

  document.addEventListener(
    "dblclick",
    (e) => {
      if (mode !== "edit") return;
      const el = e.target.closest?.(TEXT_TAGS);
      if (!el || isOurs(el)) return;
      e.preventDefault();
      e.stopPropagation();
      if (editing) finishEditing(true);
      editing = { el, before: el.textContent ?? "" };
      highlight(null);
      el.setAttribute("contenteditable", "plaintext-only");
      el.style.outline = "2px solid #f97316";
      el.focus();
      send("text-edit-started", { element: describe(el) });
    },
    true,
  );
  let reportKeys = false;
  document.addEventListener(
    "keydown",
    (e) => {
      // Registered before any of the page's scripts run, in the capture phase:
      // the editing script sees a key before the page does.
      if (reportKeys) send("key", { key: (e.metaKey ? "meta+" : "") + (e.ctrlKey ? "ctrl+" : "") + e.key });
      if (!editing) return;
      if (e.key === "Enter") {
        e.preventDefault();
        finishEditing(true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        finishEditing(false);
      }
    },
    true,
  );
  document.addEventListener(
    "focusout",
    (e) => {
      if (editing && e.target === editing.el) finishEditing(true);
    },
    true,
  );

  // --- drop of a block ---------------------------------------------------
  const sections = () => Array.from(document.querySelectorAll("main > section"));

  function slotAt(clientY) {
    const list = sections();
    let index = 0;
    for (const section of list) {
      const r = section.getBoundingClientRect();
      if (clientY > r.top + r.height / 2) index++;
    }
    let y;
    if (list.length === 0) y = 80;
    else if (index < list.length) y = list[index].getBoundingClientRect().top;
    else y = list[list.length - 1].getBoundingClientRect().bottom;
    return { index, y };
  }

  function showLine(clientY) {
    if (!overlay()) return null;
    const slot = slotAt(clientY);
    const y = Math.min(Math.max(slot.y - 2, 4), window.innerHeight - 8);
    line.style.cssText += `;display:block;top:${y}px;`;
    return slot;
  }
  function hideLine() {
    if (line) line.style.display = "none";
  }

  const carriesBlock = (dt) => {
    const types = Array.from(dt?.types ?? []);
    return types.includes(BLOCK_MIME) || types.includes("text/plain");
  };

  let dragOverReported = false;
  document.addEventListener(
    "dragover",
    (e) => {
      if (!carriesBlock(e.dataTransfer)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      highlight(null);
      const slot = showLine(e.clientY);
      if (!dragOverReported) {
        dragOverReported = true;
        send("drag-entered", { types: Array.from(e.dataTransfer.types), index: slot?.index });
      }
    },
    true,
  );
  document.addEventListener(
    "dragleave",
    (e) => {
      if (e.relatedTarget === null) {
        hideLine();
        dragOverReported = false;
      }
    },
    true,
  );
  document.addEventListener(
    "drop",
    (e) => {
      if (!carriesBlock(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      const slot = slotAt(e.clientY);
      hideLine();
      dragOverReported = false;
      let blockId = e.dataTransfer.getData(BLOCK_MIME);
      const plain = e.dataTransfer.getData("text/plain");
      let carriedAs = BLOCK_MIME;
      if (!blockId && plain.startsWith(BLOCK_TEXT_PREFIX)) {
        blockId = plain.slice(BLOCK_TEXT_PREFIX.length);
        carriedAs = "text/plain";
      }
      send("drop", {
        via: "native drag and drop",
        blockId: blockId || null,
        carriedAs,
        index: slot.index,
        types: Array.from(e.dataTransfer.types),
      });
    },
    true,
  );

  function insertBlock(index, html, blockId) {
    const main = document.querySelector("main");
    if (!main) return;
    const template = document.createElement("template");
    template.innerHTML = html;
    const inserted = template.content.firstElementChild;
    main.insertBefore(template.content, sections()[index] ?? null);
    inserted?.scrollIntoView({ block: "center", behavior: "smooth" });
    if (inserted) {
      inserted.style.outline = "3px solid #f97316";
      setTimeout(() => (inserted.style.outline = ""), 1200);
    }
    send("inserted", { blockId, index, sections: sections().length });
  }

  // --- progressive arrival -----------------------------------------------
  const seen = new Set();
  const observer = new MutationObserver(() => {
    for (const el of document.querySelectorAll("[data-piece]")) {
      const id = el.getAttribute("data-piece");
      if (seen.has(id)) continue;
      seen.add(id);
      // Two reports: when the piece reaches the DOM, and when the engine next
      // draws a frame (which only happens while the window is being displayed).
      const domAt = Math.round(performance.now());
      send("piece", { id, domAt });
      requestAnimationFrame(() => send("piece-frame", { id, domAt, frameAt: Math.round(performance.now()) }));
    }
  });
  observer.observe(document, { childList: true, subtree: true });

  window.addEventListener("load", () => {
    const loadAt = Math.round(performance.now());
    // Leave the page's own load handler time to run before reading its probe.
    setTimeout(() => {
      const paint = {};
      for (const entry of performance.getEntriesByType("paint")) {
        paint[entry.name] = Math.round(entry.startTime);
      }
      send("loaded", {
        loadAt,
        paint,
        pieces: seen.size,
        visibility: document.visibilityState,
        userAgent: navigator.userAgent,
        probes: {
          editorSeesPageGlobal: typeof window.__pageSecret !== "undefined",
          editorSeesPagePrototypePatch: [].__pagePatched === true,
          pageSaid: document.getElementById("page-probe")?.textContent ?? null,
        },
      });
    }, 150);
  });

  // --- messages from the app ---------------------------------------------
  const handlers = {
    "set-mode": (m) => {
      mode = m.mode;
      if (mode !== "edit") {
        highlight(null);
        finishEditing(true);
      }
      send("mode", { mode });
    },
    "insert-block": (m) => insertBlock(m.index, m.html, m.blockId),
    // Pointer-based drop, for shells where a native drag does not cross from
    // the app's interface into the preview: the app follows the pointer and
    // tells the preview where it is.
    "drag-over": (m) => {
      highlight(null);
      showLine(m.y);
    },
    "drag-end": () => hideLine(),
    "drop-at": (m) => {
      const slot = slotAt(m.y);
      hideLine();
      send("drop", { via: "pointer relayed by the app", blockId: m.blockId, index: slot.index });
    },
    ping: (m) => send("pong", { echo: m.echo ?? null }),
    // --- added for the <iframe> follow-up: measurements a test asks for ----
    measure: () =>
      send("measured", {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        scrollHeight: document.documentElement.scrollHeight,
        scrollY: Math.round(window.scrollY),
        devicePixelRatio: window.devicePixelRatio,
        mdUp: matchMedia("(min-width: 768px)").matches,
        lgUp: matchMedia("(min-width: 1024px)").matches,
        visibility: document.visibilityState,
        hasFocus: document.hasFocus(),
        href: location.href,
      }),
    // Counts the frames the engine draws for `ms` milliseconds, scrolling the
    // page meanwhile if asked, and reports the longest gap between two frames.
    frames: (m) => {
      const started = performance.now();
      let last = started;
      let count = 0;
      let longest = 0;
      const top = document.documentElement.scrollHeight - window.innerHeight;
      const tick = (now) => {
        count++;
        longest = Math.max(longest, now - last);
        last = now;
        const progress = Math.min(1, (now - started) / m.ms);
        if (m.scroll) window.scrollTo(0, Math.round(top * progress));
        if (progress < 1) requestAnimationFrame(tick);
        else {
          if (m.scroll) window.scrollTo(0, 0);
          send("frames-done", { frames: count, ms: Math.round(now - started), longestGapMs: Math.round(longest), id: m.id ?? null });
        }
      };
      requestAnimationFrame(tick);
    },
    "report-keys": (m) => {
      reportKeys = !!m.on;
    },
    // Tells the app where an element is, so that a test can aim real input at it.
    locate: (m) => {
      const el = document.querySelector(m.selector);
      send("located", { selector: m.selector, rect: el ? describe(el).rect : null });
    },
    // Runs the script's own behaviours with events built by hand. It checks
    // the script in this web engine; it does not check that real pointer and
    // keyboard input reaches the preview, which only a person (or the
    // shell's own input injection) can show.
    "self-check": () => {
      const centre = (el, dy) => {
        const r = el.getBoundingClientRect();
        return {
          clientX: r.left + r.width / 2,
          clientY: dy === undefined ? r.top + r.height / 2 : r.top + dy,
          bubbles: true,
          cancelable: true,
        };
      };
      const title = document.querySelector("h1");
      title.dispatchEvent(new MouseEvent("mousemove", centre(title)));
      title.dispatchEvent(new MouseEvent("click", centre(title)));
      title.dispatchEvent(new MouseEvent("dblclick", centre(title)));
      const editable = title.isContentEditable;
      title.textContent = `${title.textContent} (edited)`;
      title.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));

      let dragError = null;
      try {
        const data = new DataTransfer();
        data.setData(BLOCK_MIME, "stats");
        data.setData("text/plain", BLOCK_TEXT_PREFIX + "stats");
        const target = sections()[1];
        target.dispatchEvent(new DragEvent("dragover", { ...centre(target, 4), dataTransfer: data }));
        target.dispatchEvent(new DragEvent("drop", { ...centre(target, 4), dataTransfer: data }));
      } catch (error) {
        dragError = String(error);
      }
      send("self-check-done", { becameEditable: editable, dragError });
    },
  };

  transport.onMessage((message) => {
    const handler = handlers[message?.type];
    if (handler) handler(message);
  });

  send("editor-ready", { href: location.href });

  return {
    /** Lets a shell add its own message handlers (for instance a capture workaround). */
    handle(type, handler) {
      handlers[type] = handler;
    },
    send,
  };
}
