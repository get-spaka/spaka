// Pages added for the follow-up test (the preview embedded as an <iframe>):
// a second page to move to, and a page that misbehaves on purpose.

export const aboutPage = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>About — Fernweh</title>
<link rel="stylesheet" href="/vendor/daisyui.css">
<script src="/vendor/tailwind.js"></script>
<script src="/vendor/htmx.js"></script>
</head>
<body class="bg-base-100 text-base-content antialiased">
<main class="mx-auto max-w-2xl px-6 py-20">
  <section data-piece="about">
    <h1 class="text-4xl font-extrabold">About Fernweh</h1>
    <p class="py-6 text-lg opacity-80">A second page of the same project, to test moving from one page to another inside the preview.</p>
    <a id="back-home" class="btn btn-primary" href="/?delay=0">Back to the home page</a>
  </section>
</main>
</body>
</html>
`;

// A project's page is not trusted by the app. This one tries what such a page
// could try against the app around it, once when it loads and once more from
// a click (some browser rules relax after a user gesture). It writes what
// happened into #hostile-report.
export const hostilePage = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>A page that misbehaves</title>
<style>
  body { font: 16px system-ui, sans-serif; margin: 24px; }
  button { font-size: 20px; padding: 16px 28px; }
  pre { white-space: pre-wrap; font-size: 12px; }
</style>
</head>
<body>
<main>
<section data-piece="hostile">
<h1>A page that misbehaves</h1>
<p>It tries to reach the app around it. Used by the spike only.</p>
<p><button id="gesture">Click me</button> <input id="grab" placeholder="tries to take the keyboard focus"></p>
<iframe src="/nested" width="300" height="50"></iframe>
<pre id="hostile-report">{}</pre>
</section>
</main>
<script>
(function () {
  var q = new URLSearchParams(location.search);
  var report = { onLoad: null, onClick: null };
  var attempt = function (f) {
    try { var v = f(); return v === undefined ? "no error" : String(v); }
    catch (e) { return e.name + ": " + e.message; }
  };
  var run = function (tag) {
    var r = {};
    r.node = [typeof require, typeof process, typeof electronIpc, typeof ipcRenderer].join(" / ");
    r.framed = window.top !== window;
    r.readParentDocument = attempt(function () { return "read: " + parent.document.title; });
    r.readParentBridge = attempt(function () { return "typeof parent.electronIpc: " + typeof parent.electronIpc; });
    r.readTopHref = attempt(function () { return "read: " + top.location.href; });
    r.postMessageToParent = attempt(function () { parent.postMessage({ type: "drop", forged: true, from: "page:" + tag }, "*"); });
    r.windowOpen = attempt(function () { var w = window.open("/popup?by=" + tag); return w ? "a window was returned" : "null"; });
    if (q.get("alert") !== "0") {
      r.alert = attempt(function () { var t = performance.now(); alert("from the page"); return "returned after " + Math.round(performance.now() - t) + " ms"; });
    }
    r.focus = attempt(function () {
      document.getElementById("grab").focus();
      return "activeElement: " + (document.activeElement && document.activeElement.id) + ", document.hasFocus(): " + document.hasFocus();
    });
    if (q.get("top") !== "0") {
      r.navigateTop = attempt(function () { top.location = location.origin + "/took-over?by=" + tag; });
    }
    return r;
  };
  var write = function () { document.getElementById("hostile-report").textContent = JSON.stringify(report); };
  report.onLoad = run("load");
  write();
  document.getElementById("gesture").addEventListener("click", function () { report.onClick = run("click"); write(); });
  window.busy = function (ms) { var end = performance.now() + ms; while (performance.now() < end) {} return "busy for " + ms + " ms"; };
  window.hang = function () { for (;;) {} };
})();
</script>
</body>
</html>
`;

export const nestedPage = `<!doctype html><html><head><meta charset="utf-8"><title>nested</title></head>
<body style="font: 12px system-ui; margin: 8px">A frame inside the project's page (an embedded video, a map…).</body></html>
`;

export const tookOverPage = `<!doctype html><html><head><meta charset="utf-8"><title>TOOK OVER</title></head>
<body><h1>The page navigated the window that contained it.</h1></body></html>
`;

export const popupPage = `<!doctype html><html><head><meta charset="utf-8"><title>popup</title></head><body>popup</body></html>
`;
