---
status: accepted; the agent running in a signed and notarised app is not yet verified
---

# Electron is the desktop shell

Upstart's desktop app is built on Electron. A spike built the same small app on Electron 45 and on Electrobun 2.0 and scored both on seven criteria ([report](../../spikes/desktop-shell/REPORT.md)). Electrobun failed one of them and needed a workaround on two that visual editing depends on.

The preview has to show a project the way its visitors will see it, on every operating system the app runs on. Electron ships the same Chromium everywhere. Electrobun renders with each system's own web engine: WebKit on macOS, WebView2 on Windows, and on Linux a WebKitGTK whose version depends on the distribution. Electron also runs the editing script in a world of its own, so a project's scripts can neither break it nor reach it, and it captures the preview faithfully even while the app is in the background, which the agent needs to check its own work.

## Considered options

- **Electrobun on the system's web engine**: a 145 MB download against 258 MB, and 171 MB of memory at rest against 202 MB. It fails identical rendering, runs the editing script in the page's own world, and has no faithful capture of the preview short of native code for each system.
- **Electrobun with Chromium bundled**: answers the rendering, but measured larger (261 MB), heavier (306 MB at rest) and slower to start (0.8 s against 0.26 s) than Electron, and it keeps the other two weaknesses.

## Consequences

- The download is about 260 MB. Anthropic's agent binary weighs more than Electron itself, so a lighter shell could only ever have saved part of it.
- Updating itself requires the macOS build to be signed, which is planned, and on Linux a separate updater library.
- The spike did not verify everything. Rendering on Windows and Linux was judged from documentation only. Auto-update was not exercised, and the agent was not run in a signed and notarised app. Dragging a block from the sidebar into the preview with a real pointer was verified in a follow-up on 2026-11-10, with the screen unlocked.
- The preview is embedded as a native view (Electron's `WebContentsView`), not as an iframe, decided on 2026-11-10 from that follow-up. In an iframe Chromium refuses a native drag from the sidebar into a frame of another origin, the editing script needs an experimental Electron setting, the project's ordinary cookies are blocked, the page can take the keyboard focus, and a capture of the whole page takes two to three times as long.
- The interface can draw nothing over a native view. A tour bubble that points into the page is drawn by the editing script inside the preview. What starts in the interface and overlaps the preview (a menu, a bubble, a dimming of the whole window) is drawn in a second, transparent view kept above the preview, tested in the same follow-up with a real pointer. That view takes every click inside its bounds, so it is sized to what it shows; it costs one more process of 16 MB; and the keyboard focus has to be handed back to the interface when it hides. A bubble that follows an element while the page scrolls was not tested.
- Loading a page into the preview's view takes the keyboard focus from the interface, which has to be given back.
- Left for a person to judge: how a relayed drag feels, whether the view lags when the window is resized, trackpad scrolling and pinching, a file dragged from the Finder, and everything on Windows and Linux.
