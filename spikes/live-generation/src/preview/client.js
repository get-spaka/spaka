// Runs inside the previewed page. Receives the server's pushes, morphs the page,
// and logs its own timestamps for the spike's measurements. Throwaway spike code.
(() => {
  if (window.__up) return;
  const up = (window.__up = {
    t0: 0,
    mode: "stream",
    marks: {}, // name -> ms since t0
    mutationTimes: [], // ms since t0 of every batch of visible mutations
    applies: 0,
    applyMs: [],
    unstyledFrames: 0,
    checkedFrames: 0,
    errors: [],
    done: false,
  });
  const now = () => (up.t0 ? Date.now() - up.t0 : 0);
  const mark = (name) => {
    if (up.marks[name] === undefined && up.t0) {
      up.marks[name] = now();
      hud();
    }
  };
  window.addEventListener("error", (e) => up.errors.push(String(e.message)));

  // ---- a small heads-up display, outside <body> so that morphing never touches it
  const host = document.createElement("div");
  host.id = "up-hud";
  host.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:2147483647;pointer-events:none";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `<style>
    .hud{font:12px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;color:#fff;background:rgba(17,17,17,.82);
      border-radius:8px;padding:6px 10px;max-width:560px;box-shadow:0 2px 10px rgba(0,0,0,.25)}
    .row{display:flex;gap:10px;align-items:baseline;white-space:nowrap}
    .t{font-size:15px;font-weight:700;min-width:58px}
    .label{opacity:.7}
    .status{opacity:.9;overflow:hidden;text-overflow:ellipsis;max-width:520px;white-space:nowrap}
    .marks{opacity:.75}
  </style><div class="hud"><div class="row"><span class="t" id="t">0.0 s</span><span class="label" id="label"></span></div>
  <div class="status" id="status">waiting for the request</div><div class="marks" id="marks"></div></div>`;
  const $ = (id) => shadow.getElementById(id);
  const attachHud = () => document.documentElement.appendChild(host);
  let statusText = "";
  function hud() {
    if (!host.isConnected) attachHud();
    const m = up.marks;
    const s = (v) => (v === undefined ? "…" : (v / 1000).toFixed(1) + " s");
    $("marks").textContent = `first change ${s(m.firstChange)} · first section ${s(m.firstSection)} · home complete ${s(m.homeComplete)}`;
    if (statusText) $("status").textContent = statusText;
  }
  const tick = () => {
    if (up.t0 && !up.done) $("t").textContent = (now() / 1000).toFixed(1) + " s";
    requestAnimationFrame(tick);
  };

  // ---- what counts as a visible change, a first section
  let lastVisibleMutation = 0;
  let lastChanged = null;
  const observer = new MutationObserver((records) => {
    let visible = false;
    for (const r of records) {
      if (r.type === "attributes" && r.attributeName && r.attributeName.startsWith("data-up-")) continue;
      visible = true;
      const node = r.type === "childList" && r.addedNodes.length ? r.addedNodes[r.addedNodes.length - 1] : r.target;
      lastChanged = node.nodeType === 1 ? node : node.parentElement;
    }
    if (!visible || !up.t0 || up.done) return;
    const t = now();
    up.mutationTimes.push(t);
    lastVisibleMutation = t;
    if (document.body.innerText.trim().length > 0) mark("firstContent");
    mark("firstChange");
    checkSection();
    follow();
  });

  /** A real section: a top-level block with a heading, some text, and some height. */
  function isSection(el) {
    if (!(el instanceof HTMLElement)) return false;
    const heading = el.querySelector("h1, h2, h3");
    if (!heading || heading.innerText.trim().length < 3) return false;
    if (el.innerText.trim().length < 60) return false;
    return el.getBoundingClientRect().height >= 120;
  }
  function topLevelBlocks() {
    const main = document.querySelector("main");
    const blocks = [...document.body.children].filter((e) => e !== main && e.tagName !== "SCRIPT");
    if (main) blocks.push(...main.children);
    return blocks;
  }
  function checkSection() {
    if (up.marks.firstSectionComplete !== undefined) return;
    const blocks = topLevelBlocks();
    const i = blocks.findIndex(isSection);
    if (i < 0) return;
    mark("firstSection"); // a section has its heading and some text
    // It is complete once the stream has moved on to something after it.
    const later = blocks.slice(i + 1).some((b) => b instanceof HTMLElement && b.innerText.trim().length > 0);
    if (later || up.fileFinal) mark("firstSectionComplete");
  }

  // ---- keep what is being written in view
  let scrollTarget = null;
  function follow() {
    if (!lastChanged || !lastChanged.isConnected || up.noFollow) return;
    const rect = lastChanged.getBoundingClientRect();
    const margin = 140;
    if (rect.bottom > innerHeight - margin) scrollTarget = scrollY + rect.bottom - innerHeight + margin;
    else if (rect.top < 0) scrollTarget = Math.max(0, scrollY + rect.top - margin);
  }
  function scrollStep() {
    if (scrollTarget !== null) {
      const max = document.documentElement.scrollHeight - innerHeight;
      const target = Math.min(scrollTarget, Math.max(0, max));
      const d = target - scrollY;
      if (Math.abs(d) < 1) scrollTarget = null;
      else scrollTo(0, scrollY + d * 0.18);
    }
    requestAnimationFrame(scrollStep);
  }

  // ---- applying a pushed page
  function syncAttributes(from, to) {
    for (const a of [...to.attributes]) if (!from.hasAttribute(a.name)) to.removeAttribute(a.name);
    for (const a of [...from.attributes]) if (to.getAttribute(a.name) !== a.value) to.setAttribute(a.name, a.value);
  }
  function syncHead(doc) {
    if (doc.title && document.title !== doc.title) document.title = doc.title;
    const mine = [...document.head.querySelectorAll("link[rel=stylesheet]:not([data-up-runtime]), style[data-up-page]")];
    const wanted = [...doc.head.querySelectorAll("link[rel=stylesheet], style")].filter((e) => e.getAttribute("type") !== "text/tailwindcss");
    const key = (e) => e.outerHTML.replace(/ data-up-page=""/, "");
    const have = new Map(mine.map((e) => [key(e), e]));
    for (const w of wanted) {
      const k = key(w);
      if (have.has(k)) have.delete(k);
      else {
        const clone = w.cloneNode(true);
        if (clone.tagName === "STYLE") clone.setAttribute("data-up-page", "");
        document.head.appendChild(clone);
      }
    }
    for (const stale of have.values()) stale.remove();
  }
  function runScripts(root) {
    for (const old of root.querySelectorAll("script:not([data-up-ran])")) {
      const s = document.createElement("script");
      for (const a of old.attributes) s.setAttribute(a.name, a.value);
      s.setAttribute("data-up-ran", "");
      s.textContent = old.textContent;
      old.replaceWith(s);
    }
  }
  let buildsSeen = 0;
  function tailwindBuilds() {
    return performance.getEntriesByType("measure").filter((m) => /^Build #\d+/.test(m.name));
  }

  function applyHtml(msg) {
    const started = performance.now();
    // Approach B: what is on screen was built by instructions and is about to be replaced by what the files render.
    const shown = msg.swap ? { text: document.body.innerText.replace(/\s+/g, " ").trim(), elements: document.body.querySelectorAll("*").length, height: document.documentElement.scrollHeight } : null;
    const doc = new DOMParser().parseFromString(msg.html, "text/html");
    if (msg.route && msg.route !== location.pathname) {
      history.replaceState(null, "", msg.route);
      scrollTo(0, 0);
      scrollTarget = null;
    }
    up.fileFinal = !!msg.final;
    syncHead(doc);
    syncAttributes(doc.documentElement, document.documentElement);
    syncAttributes(doc.body, document.body);
    Idiomorph.morph(document.body, [...doc.body.childNodes], {
      morphStyle: "innerHTML",
      ignoreActiveValue: true,
      callbacks: {
        beforeNodeAdded: (n) => !(n.nodeType === 1 && n.tagName === "SCRIPT" && !msg.final),
        afterNodeAdded: (n) => {
          if (n.nodeType === 1 && !up.noFx && n.animate)
            n.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 240, easing: "ease-out" });
        },
      },
    });
    up.applies++;
    up.applyMs.push(performance.now() - started);
    // Was the stylesheet ready when this change was painted?
    const before = tailwindBuilds().length;
    requestAnimationFrame(() => {
      up.checkedFrames++;
      const builds = tailwindBuilds();
      const pending = performance.getEntriesByType("mark").filter((m) => /^Build #\d+ .*\(start\)$/.test(m.name)).length > builds.length;
      if (pending) up.unstyledFrames++;
      buildsSeen = Math.max(buildsSeen, builds.length, before);
    });
    if (msg.final) {
      runScripts(document.body);
      if (window.htmx) htmx.process(document.body);
      checkSection();
    }
    if (msg.homeComplete && msg.route === "/") requestAnimationFrame(() => mark("homeComplete"));
    if (shown) {
      const text = document.body.innerText.replace(/\s+/g, " ").trim();
      let common = 0;
      while (common < text.length && common < shown.text.length && text[common] === shown.text[common]) common++;
      up.swap = {
        sameText: text === shown.text,
        textBefore: shown.text.length,
        textAfter: text.length,
        commonPrefix: common,
        elementsBefore: shown.elements,
        elementsAfter: document.body.querySelectorAll("*").length,
        heightBefore: shown.height,
        heightAfter: document.documentElement.scrollHeight,
      };
    }
    hud();
  }

  function report(extra) {
    const times = up.mutationTimes;
    let longest = 0;
    let longestAt = 0;
    const end = up.marks.done ?? now();
    const points = [...times, end];
    for (let i = 1; i < points.length; i++) {
      if (points[i] - points[i - 1] > longest) {
        longest = points[i] - points[i - 1];
        longestAt = points[i - 1];
      }
    }
    // The same, but only until the home page is complete.
    let longestBeforeHome = 0;
    const homeEnd = up.marks.homeComplete ?? end;
    const before = [...times.filter((t) => t <= homeEnd), homeEnd];
    for (let i = 1; i < before.length; i++) longestBeforeHome = Math.max(longestBeforeHome, before[i] - before[i - 1]);
    const builds = tailwindBuilds().map((m) => m.duration);
    const stats = (a) => (a.length ? { n: a.length, mean: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2), max: +Math.max(...a).toFixed(2) } : { n: 0 });
    return {
      marks: up.marks,
      longestStillMs: Math.round(longest),
      longestStillAtMs: Math.round(longestAt),
      longestStillBeforeHomeMs: Math.round(longestBeforeHome),
      mutationBatches: times.length,
      applies: up.applies,
      applyMs: stats(up.applyMs),
      tailwindBuildMs: stats(builds),
      unstyledFrames: up.unstyledFrames,
      checkedFrames: up.checkedFrames,
      errors: up.errors,
      elements: document.body.querySelectorAll("*").length,
      traced: document.body.querySelectorAll("[data-up-src]").length,
      docHeight: document.documentElement.scrollHeight,
      route: location.pathname,
      swap: up.swap ?? null,
      ...extra,
    };
  }
  up.report = report;

  // ---- the channel
  function connect() {
    const es = new EventSource("/__up/events");
    const on = (name, fn) => es.addEventListener(name, (e) => fn(JSON.parse(e.data)));
    on("hello", (m) => {
      if (m.t0) up.t0 = m.t0;
      // Approach C: a reload was asked for while this page was loading; it shows an older state.
      const loadedSeq = Number(document.querySelector('meta[name="up-reload-seq"]')?.content ?? 0);
      if (m.reloadSeq > loadedSeq && !m.finished) {
        sessionStorage.setItem("up-marks", JSON.stringify({ t0: up.t0, marks: up.marks, mutationTimes: up.mutationTimes, homeComplete: m.homeComplete, status: statusText }));
        location.reload();
        return;
      }
      if (m.homeComplete && m.mode === "reload" && location.pathname === "/") requestAnimationFrame(() => mark("homeComplete"));
      up.mode = m.mode;
      $("label").textContent = m.label || "";
      if (m.finished) {
        // The run is over: this page is part of the tour of the result.
        up.done = true;
        up.marks = m.finished.marks;
        statusText = m.finished.text;
        $("t").textContent = ((m.finished.marks.done ?? 0) / 1000).toFixed(1) + " s";
        hud();
      }
      fetch("/__up/report", { method: "POST", body: JSON.stringify({ kind: "ready", route: location.pathname, reloaded: !!sessionStorage.getItem("up-marks") }) });
    });
    on("start", (m) => {
      up.t0 = m.t0;
      up.marks = {};
      up.mutationTimes = [];
      sessionStorage.removeItem("up-marks");
      $("label").textContent = m.label || "";
      statusText = "request sent";
      hud();
    });
    on("status", (m) => {
      statusText = m.text;
      mark("firstStatus");
      hud();
    });
    on("theme", (m) => {
      const style = document.getElementById("up-theme");
      if (style && style.textContent !== m.css) {
        style.textContent = m.css;
        if (up.t0 && m.css.trim()) {
          up.mutationTimes.push(now());
          mark("firstTheme");
          mark("firstChange");
        }
      }
    });
    on("html", applyHtml);
    on("mark", (m) => requestAnimationFrame(() => mark(m.name)));
    on("reload", (m) => {
      // Approach C: keep the measurements across the reload.
      up.mutationTimes.push(now());
      sessionStorage.setItem("up-marks", JSON.stringify({ t0: up.t0, marks: up.marks, mutationTimes: up.mutationTimes, homeComplete: m.homeComplete, status: statusText }));
      if (m.route && m.route !== location.pathname) location.href = m.route;
      else location.reload();
    });
    on("done", (m) => {
      mark("done");
      up.done = true;
      // The build is over: stop following, so the page can be scrolled freely.
      up.noFollow = true;
      scrollTarget = null;
      statusText = m.text || "done";
      hud();
      setTimeout(() => fetch("/__up/report", { method: "POST", body: JSON.stringify({ kind: "final", ...report() }) }), 400);
    });
  }

  function boot() {
    attachHud();
    // After a reload (approach C) pick the measurements up where they were.
    const saved = sessionStorage.getItem("up-marks");
    if (saved) {
      const s = JSON.parse(saved);
      up.t0 = s.t0;
      up.marks = s.marks;
      up.mutationTimes = s.mutationTimes;
      statusText = s.status || "";
      up.fileFinal = true;
      if (document.body.innerText.trim().length > 0) mark("firstContent");
      mark("firstChange");
      requestAnimationFrame(() => {
        checkSection();
        if (s.homeComplete && location.pathname === "/") mark("homeComplete");
        hud();
      });
    }
    const q = new URLSearchParams(location.search);
    up.noFx = q.has("nofx");
    up.noFollow = q.has("nofollow");
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
    connect();
    tick();
    scrollStep();
    hud();
  }
  if (document.body) boot();
  else document.addEventListener("DOMContentLoaded", boot);
})();
