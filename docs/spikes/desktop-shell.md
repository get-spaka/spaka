# Spike 2 — desktop shell: Electron or Electrobun?

Ran on 2026-11-09, with a follow-up in Electron on 2026-11-10.

## What we learned

- Electrobun renders with a different web engine on each operating system (WKWebView on macOS, WebView2 on Windows, WebKitGTK on Linux, whose version changes with the distribution), and its own documentation says so. Electron ships one Chromium everywhere (156.0.8078.80 for Electron 45.2.3), so only Electron can show a project the same way on every system.
- Anthropic's agent binary dominates the app's size: 324 MB, more than Electron's own 245 MB of frameworks. Compressed the same way, Electrobun's download is 60 MB smaller (141.8 MB against 201.6 MB), it uses 31 MB less memory at rest (171 MB against 202 MB), and it starts no sooner (348 ms against 263 ms to the interface).
- Bundling Chromium into Electrobun to get the same rendering everywhere gives up all of that and more: a 261 MB download against Electron's 258, 306 MB at rest against 202, 0.82 s to the interface against 0.26.
- Electron runs the editing script in a JavaScript world of its own, so the page can neither see it nor change the built-ins it uses. Electrobun 2.0.6 runs preload scripts in the page's own world, and the issue asking for isolated worlds has been open since 2026-02-07 without a reply.
- Electron can capture the preview from the main process even while the window is not displayed: 125 ms for the visible part and 301 ms for the whole page through the DevTools protocol. Electrobun has no capture API; the in-page workaround takes 2.4 s and gives a picture with visible defects.
- A block dragged natively from the sidebar into the preview works with a real pointer when the preview is a `WebContentsView`, and is refused by Chromium, by design, when the preview is a cross-origin `<iframe>`. The injected test of the iframe drag passed: automated tests would have reported a drag that no maker can perform.
- The `<iframe>` lets the interface draw anything over the preview, but its page loses ordinary cookies, can take the keyboard from the conversation, and needs an experimental Electron option for the isolated editing script. A second, transparent `WebContentsView` above the preview draws bubbles, dimming and menus instead, for one more process of 16 MB and no slower start-up (332 ms to the interface).
- Figures taken on a locked screen understate Electron: with the window displayed it takes 353 ms to the interface and 271 MB at rest, most of the memory difference being the GPU process, which holds 134 MB once it really draws.

It decided that Electron is the desktop shell, with the preview kept in a `WebContentsView`: see [ADR 0008](../adr/0008-electron-is-the-desktop-shell.md).

## Summary

**Recommendation: Electron.**

Electrobun 2.0.6 fails criterion 5 under the rule the framing sets: it renders with a different web engine on each operating system, and its own documentation says so. It also has no isolated world for the editing script and, short of native code for each system, no faithful way to capture the preview. What it gains is real but modest once Anthropic's 324 MB agent binary is inside the app: a download about 110 MB smaller, 31 MB less memory at rest, and a start-up time that is no better. Bundling Chromium into Electrobun to fix criterion 5 makes it larger, slower to start and heavier than Electron. There is no tie to break.

**What the first night left open, and what has closed since.** On 2026-11-09 the Mac's screen was locked for the whole session, so nobody had dragged a block from the sidebar into the preview with a real pointer, in either shell. On 2026-11-10, with the screen unlocked, that drag was done in Electron with a real pointer and it works. The same day the preview was also tried as an `<iframe>`; the outcome is to keep the `WebContentsView`. Both are in [Follow-up, 2026-11-10](#follow-up-2026-11-10-the-preview-as-an-iframe). Electrobun's open points stay as listed under [What stayed unanswered](#what-stayed-unanswered).

Tested on 2026-11-09, macOS 27.0.1, Apple Silicon:

- **Electron 45.2.3** (Chromium 156.0.8078.80, Node 24.22.2), packaged with electron-builder 26.18.
- **Electrobun 2.0.6** (Bun 1.4.4 main process, the system's WKWebView), packaged with its own tool, Hutch 0.29.
- **Electrobun 2.0.6 with Chromium bundled** (CEF, Chromium 156.0.8078.17): the same app built with one option changed. It is not a third candidate; it is the documented answer to criterion 5, so it was measured.

All three apps are unsigned. Windows and Linux were judged from documentation only.

## How the test was run

Both apps share one interface (React and Tailwind, three columns), one editing script, one agent turn and one local server. Only the bridge to the shell differs. The canned page is a launch page written with Tailwind 4.3.5, daisyUI 5.7.50 themed through CSS variables, and htmx 4.0.1; the server sends it a few lines at a time over about 3.9 s, or pushes its five sections over server-sent events.

Each app can test itself: it runs the same checks in both shells and writes the results to disk. That is how every figure below was produced.

**The locked screen.** The Mac's displays went to sleep at 21:25, an hour before the first launch, and the screen stayed locked. A window on a locked screen is not drawn, and no pointer can be moved. So:

- every measurement below was taken with the window not displayed;
- drawing was timed in Electron by switching off Chromium's "this window is covered" detection, and in Electrobun only in the Chromium build, which kept drawing by itself;
- pointer and keyboard input was injected through Electron's own input API. Electrobun has none, so there the editing script was exercised with events built by hand, which checks the script but not that real input reaches the preview.

## The seven criteria

| # | Criterion | Electron | Electrobun (system web engine) |
|---|---|---|---|
| 1 | The canned page appears progressively | **Pass** | **Pass** — arrival measured, drawing not observed |
| 2 | An editing script is injected, isolated from the page's scripts; it highlights, reports a click, edits a text in place | **Pass** | **Pass with a workaround** — it works, but nothing isolates it |
| 3 | A block dragged from the sidebar is dropped at a chosen place | **Pass** — with a real pointer since 2026-11-10 | **Unanswered** — only the preview's half was exercised |
| 4 | The preview is captured as an image | **Pass** | **Pass with a workaround** — the image is not faithful |
| 5 | Same rendering on macOS, Windows and Linux | **Pass** (documentation) | **Fail** (documentation) |
| 6 | The agent completes a turn from inside the packaged app | **Pass** | **Pass** |
| 7a | Auto-update (documented mechanism) | **Pass** | **Pass with doubts** |
| 7b | Download size | 258–265 MB | **145–149 MB** |
| 7c | Memory at rest | 202 MB | **171 MB** |
| 7d | Start-up time | **0.26 s** | 0.35 s, and 9–10 s the first time |
| 7e | Comfort of development | **Better** | Worse |

## Measurements

Packaged apps, this Mac, screen locked. MB are millions of bytes.

| | Electron | Electrobun | Electrobun + Chromium |
|---|---|---|---|
| **Download, as each tool builds it** | zip 257.5 MB · DMG 265.0 MB | tar.zst 144.6 MB · DMG 148.8 MB | tar.zst 260.8 MB · DMG 266 MB |
| Download, both compressed the same way (zstd -19) | 201.6 MB | 141.8 MB | 256.5 MB |
| … without the agent binary | 91.4 MB | 31.6 MB | 146.2 MB |
| App on disk | 592 MB | 423 MB | 769 MB |
| … of which the agent binary | 324 MB | 324 MB | 324 MB |
| **Memory at rest** (physical footprint, all processes, 30 s after the preview loaded) | 202 MB | 171 MB | 306 MB |
| **Start-up**: `open` → main process running | 136 ms | 116 ms | 579 ms |
| **Start-up**: `open` → interface mounted (median of 10, min–max) | 263 ms (247–278) | 348 ms (342–370) | 817 ms (786–828) |
| First start of a fresh copy → interface mounted | 2.1–2.4 s | 9.3–10.6 s (6 runs) | 14.5–15.0 s |
| Agent turn from the packaged app (one Write, one Bash) | 4.1 s | 4.4 s | 7.9 s |
| Packaging time | 48 s | 28 s | 50 s |

Reading notes:

- **The agent binary dominates.** Anthropic's binary (`@anthropic-ai/claude-agent-sdk-darwin-arm64`, version 2.1.321) is 324 MB, more than Electron itself (245 MB of frameworks). Electrobun's shell is about 60 MB lighter than Electron's when compressed (31.6 against 91.4 MB), but both carry the same 110 MB of compressed agent.
- **Half of the download gap is compression.** Electrobun packs with zstd; electron-builder's zip and DMG compress the agent binary less well. Compressed the same way the gap is 60 MB, not 113.
- **Memory** is the sum of the app's own processes and of the system web-engine processes macOS holds the app responsible for (WKWebView renders in helper processes that are not children of the app). The gap is 31 MB. The figures are for windows that were not being drawn; they should be taken again on an unlocked screen.
- **Start-up** is from `open` (bare environment, as from Finder) to the moment the React interface exists. Electron's interface is up 85 ms sooner. The first start of a newly installed Electrobun app unpacks a 423 MB archive in place, which takes 9 to 10 s, and the launcher that did the unpacking was still running after the app had quit, in all 7 first starts.
- **The agent turn's duration** is the model's, not the shell's; the three figures are single runs.

## Criterion by criterion

### 1. The canned page appears progressively

The editing script records when each of the five sections reaches the DOM and when the next frame is drawn. The page's stream ends at about 3.86 s.

| ms after navigation | hero | features | pricing | voices | join |
|---|---|---|---|---|---|
| Electron — in the DOM | 96 | 554 | 1380 | 2847 | 3489 |
| Electron — drawn | 1020 | 1020 | 1380 | 2848 | 3489 |
| Electrobun — in the DOM | 97 | 554 | 1375 | 2836 | 3476 |
| Electrobun + Chromium — drawn | 303 | 551 | 1372 | 2834 | 3471 |

Each section is in the page as soon as the server sends it, in both shells, and Chromium draws it within a few milliseconds. (Electron's first frame came at 1.0 s; with the display asleep that says little.) The pushed delivery (server-sent events, each section inserted on arrival) behaves the same: sections arrived at 0.8, 1.5, 2.2, 3.0 and 3.7 s in both.

For Electrobun's WKWebView the arrival is measured and the drawing is not: WebKit does not draw a window that is not displayed. Nothing suggests it would fail, but it has not been seen.

One real defect on the way: `<electrobun-webview>` creates its native view from a `requestAnimationFrame` callback, which WebKit never runs while the window is not displayed. Until worked around, the preview never loaded.

### 2. The editing script

**Electron — pass.** The preview is a `WebContentsView` whose preload runs in a JavaScript world of its own (`contextIsolation`, on by default since Electron 12). Three probes confirm it: the script does not see a global the page sets, does not see a method the page adds to `Array.prototype`, and the page does not see a global the script sets. The page gets no Node and no IPC. Real input injected with `webContents.sendInputEvent` then did what the criterion asks: moving over a heading drew the highlight on it, a click was reported to the app instead of reaching the page, a double click made the heading editable, typing replaced the selected word ("Leaving next month?" became "Leaving OK month?") and Enter reported the change.

**Electrobun — pass with a workaround.** The same script does the same things, but Electrobun 2.0.6 runs preload scripts in the page's own world, in WKWebView and in its Chromium build alike. All three probes come out the other way. What separates the script from the page is only that it is wrapped in a function and draws its overlay in a closed shadow root. Consequences for Upstart:

- a page script that redefines a built-in changes it for the editing script too;
- the app reaches the script by evaluating a call to a global in the page (`executeJavascript`), and the script reports through `window.__electrobunSendToHost`; a page script can call or replace both;
- the `sandbox` attribute removes the page's access to Electrobun's RPC, which is the part that matters most, and it was on in this test.

The maintainer's own issue "Add isolated world support for preload scripts" has been open since 2026-02-07 without a reply; it confirms that preloads use the page's world and says WebView2 has no API to do otherwise.

In Electrobun the behaviors were driven by events built by hand inside the page. Whether a real pointer and keyboard reach the `<electrobun-webview>` layer is not verified.

### 3. Dragging a block from the sidebar into the preview

The interface and the preview are separate web views in both shells, so a drag has to cross from one to the other. That crossing is the part a locked screen cannot show.

**Electron — pass. (As written on 2026-11-09: short of a real pointer. The real-pointer drag was done on 2026-11-10 and works; see the follow-up.)** Through the DevTools protocol a real drag was started on a gallery block in the interface (the block's own `dragstart` handler filled the data), the dragged data was handed over, and it was delivered to the preview as drag events. The editing script saw the block's type during `dragover`, showed the insertion line, reported the drop with the block's id and the position, and the app inserted the block there. This runs Chromium's real drag-and-drop code on both sides. The hop it skips is macOS carrying the drag from one view to the other.

**Electrobun — unanswered.** Only the preview's half ran, with a drag event built by hand: the script accepted the block and reported the drop. Whether a drag started in the interface arrives in the native webview layered above it is unknown. Electrobun's documentation says nothing about it.

**A fallback exists in both.** The app follows the pointer itself and tells the preview where it is. The preview's side of it works in both shells. Whether the interface keeps receiving pointer moves once the pointer is over the preview needed a real pointer too; in Electron it does (2026-11-10).

### 4. Capturing the preview

**Electron — pass.** Two ways, both from the main process:

- `webContents.capturePage()`: 88 ms for the visible part. It copies what the window shows, so it failed while the screen was locked ("Current display surface not available for capture").
- `Page.captureScreenshot` through `webContents.debugger`: 125 ms for the visible part, 301 ms for the whole page (1600 × 5852 px), and it worked with the screen locked (about 0.5 s). The agent can therefore look at the preview while the app is in the background.

**Electrobun — pass with a workaround.** There is no API that turns a webview into an image, and `executeJavascript()` returns no value. The workaround is for the page to draw itself (the `modern-screenshot` library: DOM to SVG to canvas) and send the image back in slices. It takes 2.4 s and the result is wrong in ways an agent checking its own work would notice: a gray block beside the hero image where the page has a soft shadow, and colored slivers on the right edge of two buttons. It did still answer 20 s after start in a window that was not displayed. In the Chromium build the same workaround takes 0.2 s and the image is clean, so the defects are WebKit's. A faithful capture in the native build would need native code for each operating system.

### 5. Same rendering on macOS, Windows and Linux

Judged from documentation; every source is listed at the end.

**Electron — pass.** Electron ships its own Chromium with the app on every platform: "by bundling the latest version of Chromium, V8, and Node.js directly with the application binary". The release page of 45.2.3 lists one Chromium version, 156.0.8078.80, which is what the app reported here. What bundling one engine does not make identical is what the operating system supplies: fonts, emoji, text smoothing, scrollbars. Electron's documentation does not discuss these, and they were not tested.

**Electrobun — fail.** Its documentation: "System webviews render your UI by default — WKWebView on macOS, WebView2 on Windows, WebKitGTK on Linux", and "System webviews are different browser engines and versions. Test layout, media permissions, keyboard handling, downloads, context menus, and any API that is sensitive to browser-engine behavior on all three platforms." Three engines, of which two are not Chromium and one changes with the Linux distribution:

- WebKitGTK is 2.50.4 on Ubuntu 22.04, 2.52.6 on 24.04 and 26.04, 2.50.6 on Debian 12, 2.52.3 on Debian 13 and 2.54.2 on Fedora 43 to 45. The 2.54 release replaced the compositor, and "CSS blend modes, which TextureMapper never implemented, now work in composited layers".
- daisyUI 5's own changelog says of its dropdown's anchor positioning: "Currently only works on Chromium-based browsers. Other browsers will position the dropdown on the middle of the screen, like a modal". Whether the WebKitGTK versions above support it could not be established from a primary source.
- Tailwind 4 needs Safari 16.4, Chrome 111 or Firefox 128; no primary source maps a WebKitGTK version to a Safari version.
- Electrobun's README lists Windows 11 and Ubuntu 24.04 as "Official", other Linux distributions as "Community", and says nothing of Windows 10, where Microsoft notes that "a small number of Windows 10 devices don't have the WebView2 Runtime installed".

A project previewed on a maker's Mac would be rendered by Safari's engine and, published, mostly seen in Chromium. That is a second mismatch, beside the one between operating systems.

### 6. The agent completes a turn from inside the packaged app

**Both pass.** Each packaged, unsigned app was started with `open` and an emptied environment (`PATH=/usr/bin:/bin:/usr/sbin:/sbin`, what Finder gives), and ran one turn through the Claude Agent SDK 0.3.321: create an HTML file, then run `ls -la`. Both turns succeeded with one Write and one Bash call, on the machine's existing sign-in (the SDK reported `apiKeySource: "none"`). No credential was read or handled.

- Electron: the SDK runs in the main process under Node. The binary has to sit outside the asar archive (`asarUnpack`) and be passed as `pathToClaudeCodeExecutable`.
- Electrobun: the SDK runs under Bun, bundled into the main process; the binary is copied into the bundle with `build.copy` and passed the same way.

One difference showed up afterwards. In Electron the interface received the turn's result although its window was not displayed. In Electrobun's WKWebView the main process finished the turn and the interface never got the answer: in a window that is not displayed, answers from the main process stopped arriving somewhere between 6 and 14 s after launch. The Chromium build did not do this. Whether the answers arrive once the window is shown again is not known. For an app whose agent works for a minute while the maker looks elsewhere, this would have to be understood before choosing Electrobun.

### 7. Auto-update, size, memory, start-up, comfort

Size, memory and start-up are in the table above.

**Auto-update — Electron: pass.** Three documented routes. The built-in `autoUpdater` covers macOS and Windows ("There is no built-in support for auto-updater on Linux") and requires a signed app on macOS. update.electronjs.org is a free service for apps with a public GitHub repository that publish to GitHub Releases, signed on macOS. `electron-updater`, from electron-builder, adds Linux (AppImage, DEB, Pacman, RPM), Windows through NSIS, GitHub Releases or any static host, staged rollouts and signature validation on macOS and Windows. All three need the macOS build signed, which Upstart plans. The packaging done here already produced the zip and block-map files `electron-updater` reads. None of it was exercised.

**Auto-update — Electrobun: pass with doubts.** An `Updater` API is built in. Updates are static files on any HTTPS host, GitHub Releases included; a delta patch is generated when the previous release can be reached, with a fall-back to the full archive; a helper swaps the app and tries to restore the previous one on failure. The doubts:

- integrity rests on a SHA-256 in the manifest, which the documentation says "is not a signature of the manifest";
- "Windows release signing is not currently part of Hutch's packaging pipeline";
- an issue opened on the day of this test reports that, for an app with many files, the 2.0.6 update helper hangs at 100 % CPU on the first update made from a 2.0.6 app; another, open since August, that unattended updates never apply on Windows. Neither has a reply.

**Comfort of development — my account.**

*Electron.* electron-vite's development mode had the interface up 0.6 s after the command, and an edit to the shared interface was applied in place without a restart. Everything comes from npm. The documentation is complete and versioned; every quotation I checked matched the 45.2.3 tag. The DevTools protocol and input injection are available from inside the app, which is what made this spike testable on an unattended machine and would make the editing features testable in CI. What I tripped on:

- an exception while the main process loads opens a modal dialog and the process then waits for a click; on a locked screen that looked like a hang;
- electron-vite's ESM output already defines `require`, so my own `createRequire` variable of that name was a syntax error;
- the Electron npm package now downloads its binary on first use, not at install;
- the preview's `WebContentsView` is a native layer above the interface, so nothing in the interface can be drawn over it. An `<iframe>` avoids that; it was tested on 2026-11-10 (see the follow-up).

*Electrobun.* The configuration is short; Electrobun's development mode builds and launches in 3.3 s; a stable build with DMG, update archive and manifests takes 28 s; the Bun main process ran the server and the Agent SDK unchanged. What I tripped on:

- **The 2.x toolchain.** The npm package is a bootstrap; a separate tool, Hutch, downloads its own engine, a second runtime and Bun, and the SDK is not in `node_modules` but in a generated `.hutch/devkit`. `electrobun init` runs an installer script, so the project here was written by hand. Imports need an alias helper to work with Vite.
- **Reloading.** By default an edit rebuilds and relaunches the whole app (2.9 s). Hot reload of the interface works once it is served by Vite, which I had to wire up myself.
- **Documentation.** I learned the API from the SDK's source more than from the pages: what the `preload` attribute accepts, the event names, the RPC. The pages are silent on capture, drag and drop, and isolation. `<electrobun-webview>` ignores the build's default renderer.
- **Defects met in one evening:** the webview that is never created while the window is not displayed; answers that stop reaching a window that is not displayed; the unpacking launcher left running after the first start; an app bundle that rewrites itself on first start (how that sits with signing and notarization was out of scope).
- **Debugging.** With the screen locked no inspector could be opened in either shell. In Electrobun the main process's console output reaches the terminal in dev builds only.

## The obvious objection: bundle Chromium into Electrobun

Electrobun can ship Chromium (`bundleCEF: true`), the same pinned version on every platform. On paper that answers criterion 5. Measured here, it gives up everything Electrobun had over Electron and more: a 261 MB download against Electron's 258, 306 MB at rest against 202, 0.82 s to the interface against 0.26. It keeps Electrobun's weaknesses: preloads still share the page's world, there is still no capture API, and on Linux the documentation adds that GTK 3 and WebKitGTK must be installed "even when CEF is bundled" and that one process cannot mix the two renderers.

## Follow-up, 2026-11-10: the preview as an `<iframe>`

Matt chose Electron and asked for one more test, in Electron only: the preview embedded as an `<iframe>` in the interface's own document, next to the `WebContentsView` of the first test. The reason is what a `WebContentsView` cannot do: it is a native layer above the interface, so the interface can draw nothing over the preview.

**Recommendation: keep the `WebContentsView`, and add a transparent view above it for what the interface has to draw over the preview.** The iframe does what it was tried for: the interface draws over the preview. It costs more than it gives:

- Chromium refuses a native drag from the interface into the iframe, by design. Only the drag the app relays itself works there.
- The project's page becomes a third-party page inside the app, and its ordinary cookies stop working.
- The page can take the keyboard away from the conversation.
- The isolated editing script depends on an Electron option that is still marked experimental.

Each of these has a way round, and each way round was tested, but together they are four fragile pieces where the `WebContentsView` needs none. Its own gap, drawing over the preview, closes without leaving it: a second, transparent view laid over the preview draws the bubble, the dimming and the menu, and was tested the same day. See [What to do about drawing over the preview](#what-to-do-about-drawing-over-the-preview).

The screen was unlocked this time, so the open points of the first report were closed for Electron as well. In particular **a block was dragged from the sidebar into the preview with a real pointer, and with the `WebContentsView` it works.**

### How it was tested

Same app, one switch. With the iframe, the window is created with `nodeIntegrationInSubFrames`, the window's preload also runs in the preview's frame and installs the same editing script there, and the main process finds the preview through `webContents.mainFrame.frames`.

One set of checks runs in both embeddings. Three kinds of input were used, and they do not prove the same thing:

- **Injected input.** `webContents.sendInputEvent` for the `WebContentsView`. It never reaches an iframe that runs in another process (Electron hands the event to the main frame's process only), so the iframe got its input through the DevTools protocol's `Input` domain.
- **A real pointer and keyboard**, driven by Claude's desktop control with Matt's permission: operating-system events, a real macOS drag session. Not Matt's hand.
- **Pictures of the screen** taken by macOS (`screencapture`), where what matters is what is really displayed.

Matt was working on the Mac meanwhile and the spike's window was sometimes covered. Every check except the capture ones therefore ran with Chromium's "this window is covered" detection off.

### The two embeddings, criterion by criterion

| | `WebContentsView` | `<iframe>` |
|---|---|---|
| **1. Progressive display** | **Pass.** Each section drawn 1 to 14 ms after it arrives | **Pass.** Same, 0 to 1 ms |
| **2. Editing script in an isolated world** | **Pass.** A preload of its own | **Pass with a caveat.** Same isolation, through an option Electron marks experimental |
| … highlights, reports a click, edits a text (real pointer and keyboard) | **Pass** | **Pass** |
| … the page gets no Node, no IPC, cannot reach the interface | **Pass** | **Pass**, provided every IPC handler checks which frame is speaking |
| **3. Native drag from the sidebar, real pointer** | **Pass** | **Fail.** Chromium refuses it |
| … drag relayed by the app (pointer events), real pointer | **Pass**, the dragged block's label hidden under the preview | **Pass**, the label drawn over the preview |
| **4. Capture, visible part** | **Pass.** 0.1 s, also hidden, covered or minimized | **Pass.** 0.1 s, same |
| … whole page | **Pass.** 0.3 s, nothing moves on screen | **Pass with a workaround.** 0.8 s with the preview jumping on screen, or 0.7 s from a second hidden window |
| **5. What the interface can draw over the preview** | **Nothing** by itself; a bubble, a dimming or a menu through a second transparent view | **Anything** |
| The page's own cookies | All work | Only `SameSite=None; Secure` ones |
| The page takes the keyboard by calling `focus()` | No | Yes |
| Loading the preview takes the keyboard | Yes, when the main process loads it | No |
| A page that hangs | Interface unaffected; process must be killed | Same |
| A page whose process dies | Main process is told | Main process is not told |
| Responsive widths, zoom-out | Yes (`setBounds`, zoom factor) | Yes (CSS width, CSS transform) |
| Memory at rest, window displayed | 271 MB | 268 MB |
| Start-up to interface mounted, window displayed | 353 ms | 364 ms |

### 1. Progressive display

No difference. With the display on, each section was drawn within a few milliseconds of reaching the DOM in both:

| ms after navigation | hero | features | pricing | voices | join |
|---|---|---|---|---|---|
| View — in the DOM / drawn | 109 / 123 | 552 / 554 | 1374 / 1375 | 2828 / 2829 | 3464 / 3467 |
| Iframe — in the DOM / drawn | 101 / 102 | 556 / 557 | 1375 / 1375 | 2831 / 2831 | 3469 / 3469 |

This also answers what the first report left open about drawing in Electron (its figures came from a display that was asleep).

### 2. The editing script

**It can be injected into the iframe in an isolated world.** The three probes come out as in the `WebContentsView`: the script does not see the page's global, does not see the page's change to `Array.prototype`, and the page does not see the script's global. A script of the page finds no `require`, no `process`, no `electronIpc`; reading `parent.document`, `parent.electronIpc` or `top.location.href` throws a `SecurityError`. The script then did its three jobs with a real pointer and keyboard: the heading under the pointer was highlighted, a double click made it editable, typing replaced the selected word and Enter reported the change ("Everything a trip needs, REAL it doesn't"). The same in the `WebContentsView`.

What the iframe needs that the view does not:

- **`nodeIntegrationInSubFrames`.** Electron's documentation calls it an "Experimental option for enabling Node.js support in sub-frames such as iframes and child windows. All your preloads will load for every iframe". Despite the name, with `sandbox` and `contextIsolation` on it gives a frame's page no Node: only the preload runs there. But it runs in *every* frame, including frames the project's page embeds itself (checked with a nested frame: the preload ran there, two levels down). The preload has to decide where it is.
- **A sender check on every IPC channel.** Any frame's preload can now speak to the main process. The spike refuses interface channels unless the message comes from the window's main frame, and editor channels unless it comes from the main frame's direct child. A request for an interface channel made from the preview's frame was refused.
- **A channel the page can use.** A framed page can post messages to the window around it; the hostile page's forged "drop" message arrived in the interface, indistinguishable by its source from the frame the editing script lives in. The interface must never act on `message` events. The spike's own traffic goes through the main process, where the sender is checked. A round trip interface → main → editing script → main → interface takes 0.2 ms (median of 50) in both embeddings.

**A page that misbehaves**, in the iframe with `sandbox="allow-scripts allow-same-origin allow-forms"`:

- navigating the window (`top.location = …`): refused by Chromium, when the page loads and from a click;
- `window.open`: returns nothing; `alert()`: ignored;
- keeping its thread busy for 1.5 s: the interface's timer never waited more than 13 ms, because the frame runs in a process of its own.

Without the `sandbox` attribute the click-triggered navigation is allowed by Chromium and stopped by the main process's `will-navigate` handler; `window.open` reaches `setWindowOpenHandler`, which denies it. Both guards belong in the app in either embedding. (In one run without the attribute the interface's timer paused once for 0.3 s; in the others it showed 11 ms.)

### 3. Drag and drop

This is where the injected test and the real pointer disagree, and the real pointer is right.

**Native drag, `WebContentsView`: pass.** A gallery block was pressed, dragged across the conversation and released over the preview with a real pointer. macOS drew the dragged block under the pointer the whole way, the editing script showed the insertion line, and the drop inserted the block: "Dropped “Stats row” at position 1 (native drag and drop)". This closes the hop the first report could not check.

**Native drag, iframe: fail, by design.** The same gesture: the dragged block follows the pointer, nothing happens in the preview, the release does nothing. Chromium refuses a drag that starts in one frame of a page and ends in a frame of another origin: "the renderer-side check for https://crbug.com/59081 to prevent drags between cross-origin frames within the same page" (`drag_controller.cc`), with a matching check in the browser process. It failed the same way with the frame in a process of its own and with the frame in the interface's process. Making the two the same origin would remove the wall between the page and the interface, so it is not a way out.

The injected version of this test passed: the DevTools protocol delivers the drag events past both checks. Automated tests of this feature would have reported a drag that no maker can perform.

**Drag relayed by the app: pass in both, with a real pointer.** The interface captures the pointer, follows it, and tells the editing script where it is. In both embeddings the interface kept receiving the pointer over the preview, the insertion line followed, and the release inserted the block ("pointer relayed by the app"). With the iframe the interface's label of the dragged block is visible over the preview; with the view it disappears under it. (The injected version failed in the iframe: the protocol ignores pointer capture. Again the real pointer decides.) The first night's handle had a defect, fixed today: pressing it also started a native drag of the block around it.

So with the iframe, dragging a block into the preview has one implementation, the relayed one; with the view it has two.

### 4. Capture

**The visible part: no difference.** `capturePage` (cropped to the iframe's place for the iframe) takes about 0.1 s, the DevTools protocol about 0.12 s, and both worked in all four states tried, in both embeddings: displayed, covered by another window, hidden, minimized. In the last three the page's `visibilityState` was `hidden`. For the iframe the capture is a crop of the window, so anything the interface draws over the preview is in the picture unless it is hidden first.

**The whole page is the iframe's weak spot.**

- The iframe has no DevTools target that can be captured: "Command can only be executed on top-level targets".
- Making the frame as tall as its page and capturing beyond the window's edge gives a picture whose lower two thirds are blank: the frame's process only draws what the real window shows.
- Also telling the engine that the window is that tall works: 0.8 s, complete picture. While it lasts the preview jumps to the window's corner and covers the sidebar and the conversation. Nobody sees it when the app is in the background. It also changes the height the page believes its viewport has.
- A second, hidden window that loads the same address: 0.7 s, complete, nothing moves. It is another rendering of the page, not the preview the maker is looking at, and it is not in the iframe's storage partition.

With the `WebContentsView` the whole page takes 0.3 s through the DevTools protocol and nothing moves.

### 5. What the interface can draw over the preview

With the iframe, anything: the preview is an element of the interface. The spike draws a tour bubble anchored to the page's title, a ring around the title and a dimming over the whole window. macOS's own picture of the screen shows them over the preview; a click on the bubble's button reached the interface and not the page. The same code in the `WebContentsView` app dims the sidebar and the conversation, and the preview stays bright with the bubble hidden behind it.

The iframe also takes CSS: at 390 and 768 px wide the page's breakpoints follow, and scaled to half size with a transform the page lays out 1600 px wide and the pointer still lands on the right element.

### What the iframe changes for the worse

**Cookies.** The server sets four cookies as a project with a visitor session would, and the page sets a fifth from script. In the `WebContentsView` all five are stored and sent back. In the iframe only the one marked `SameSite=None; Secure` survives: the page is a third party inside a window whose address is a file, and Chromium withholds ordinary cookies there. A project with a sign-in or a cart would not behave in the preview as it does for its visitors. Ways round, all tested:

- Serve the interface from the preview's own site (`http://127.0.0.1`, another port): all five cookies work, but the frame then shares the interface's process, and the page's 1.5 s of work froze the interface for 1.5 s.
- Add Chromium's `--isolate-origins` switch for the preview's origin: no effect, still one process.
- Have the preview's pages send the `Origin-Agent-Cluster: ?1` header as well: cookies work and the frame is back in a process of its own. This is a request the browser may honor, not a guarantee.

**Keyboard focus.** While the conversation's text box had the focus, the hostile page called `focus()` on one of its fields, with no click from anybody: the next key typed went into the page. It happened in most loads, and every time the page called `focus()` again later. In the `WebContentsView` the same call changed nothing. A Blink feature that forbids this (`BlockingFocusWithoutUserActivation`, switched on with `enableBlinkFeatures`, plus an `allow` attribute on the iframe) stopped it in the test; it is not a shipped feature.

The `WebContentsView` has a focus problem of its own: when the main process loads a page into it (`loadURL`), the view takes the keyboard from the interface, with an ordinary page. A page that moves to another page by itself does not.

**A page that dies or hangs.** When the frame's process was killed, the main process received no event (it receives `render-process-gone` for the view). When the page looped forever, the interface stayed responsive in both embeddings and no `unresponsive` event came; loading the page again did not recover it in either, because the new page went to the same stuck process. Killing that process did: `forcefullyCrashRenderer()` for the view, and for the iframe only `process.kill` on the frame's process id.

**Things the preview no longer has to itself.** History: moving to another page inside the iframe adds an entry to the window's history, and the window's "back" took the preview back while the interface stayed put. Session, zoom factor, DevTools and input injection also belong to the window. A key pressed while the preview has the focus is seen by `before-input-event` on the window (on the view, for the view) and by the editing script before the page; the interface's own document does not see it in either embedding.

**htmx and page changes work the same** in both: the "load more" button fetched its fragment, the form posted in place, the editing script was injected again on the next page.

**Performance is the same**: 92 frames in a 1.5 s scroll, longest gap 18 ms, in both, and unchanged while the interface's thread was kept busy for 0.7 s.

### What to do about drawing over the preview

Staying with the `WebContentsView`, the three things Matt named:

- **The block being dragged** is already visible over the preview: macOS draws it during a native drag.
- **A tour bubble that points at something in the page** can be drawn by the editing script inside the preview, where it already draws the highlight and the insertion line, in a closed shadow root the page cannot style or read. Not built in this spike, but it uses nothing new.
- **A menu or a bubble that starts in the interface and overlaps the preview** needs something above the preview. A second, transparent `WebContentsView` does it; Matt asked for it to be tested, and it works.

**The overlay view, as tested.** The app keeps one more view, transparent, above the preview. It holds a page of the app's own, loaded once at start-up and hidden until needed. Two uses were tried:

- **A bubble that dims the whole window**: the view covers the window. macOS's picture of the screen shows the dimming over the interface and the preview alike, the ring around the page's title and the bubble under it. With a real pointer, a click on the dimmed preview closed the bubble and did not reach the page.
- **A box that hangs under a header button and overlaps the preview**: the view is only as large as the box. With a real pointer, clicks on the page's title and on a link just beside the box reached the page while the box was open, a click on the box's button closed it, and a native drag of a block into the preview still worked with the box open.

What it takes and what it costs:

- **A view takes every click inside its bounds, transparent or not.** So the view has to be given the bounds of what it shows, and the transparent margin kept for a shadow swallows clicks too. A shape with a hole in it cannot let clicks through the hole.
- **Keyboard.** Showing the view does not take the keyboard: letters typed while the box was open went on into the conversation's text box. A click in the view does take it, and the view keeps it once hidden, so the next keys went nowhere. Handing the keyboard back to the interface when the view hides fixed it (typed and checked).
- **The preview's capture is untouched**: the picture taken while the bubble was shown is byte for byte the one taken without it.
- **Cost**: one more process of 16 MB, held from start-up. Start-up was not slower (332 ms to the interface mounted, median of 10). The view's page had drawn 1 ms after being asked to show, as timed by the main process.
- **Not tested**: a bubble that has to follow an element while the page scrolls or the window is resized (its place travels through the main process, so it may trail), the label of a block during the relayed drag, reaching the view's content with the Tab key, and Windows and Linux.

If drawing freely over the preview turns out to matter more than the rest, the iframe is workable, with this list attached: the relayed drag only, the interface served from the preview's site with the `Origin-Agent-Cluster` header on the project's pages, the focus feature switched on, a sender check on every IPC channel, and whole-page captures taken from a hidden window.

### What a real pointer still has to confirm

The real pointer here was driven by software. What is left for a person:

- how the relayed drag and the insertion line feel, and whether the `WebContentsView` lags behind the interface when a column or the window is resized;
- scrolling the preview with a trackpad or a wheel, pinch, and the context menu, in both embeddings;
- a file dragged from the Finder onto the preview;
- everything on Windows and Linux.

Not tested at all: `<webview>` (Electron's documentation: "We do not recommend you to use WebViews"), and a guard in the interface that takes the focus back from the iframe.

### The first report's open points, for Electron

- **Item 1, real-pointer drag:** closed. It works with the `WebContentsView`; it is refused in the iframe.
- **Item 2, real pointer and keyboard:** closed for Electron, in both embeddings.
- **Item 4, figures with the window displayed:** 353 ms from `open` to the interface mounted (median of 10, 336–372) and 271 MB at rest for the `WebContentsView`; 364 ms (337–390) and 268 MB for the iframe. The first night's 263 ms and 202 MB were from a locked screen; most of the difference in memory is the GPU process, which holds 134 MB once it really draws. Electrobun was not measured again, so these figures must not be set against last night's Electrobun figures.
- **Items 3 and 5** are about Electrobun and were not reopened. The Electrobun apps were not rebuilt; the files they share with Electron changed slightly today.

## What stayed unanswered

As written on 2026-11-09. Items 1, 2 and 4 have since been closed for Electron, and item 9 has been tested: see the end of the follow-up above.

1. **A real pointer dragging a block from the sidebar into the preview**, in either shell (criterion 3). For Electron the remaining doubt is one hop inside macOS; for Electrobun it is the whole crossing.
2. **Real pointer and keyboard input reaching Electrobun's preview** (criterion 2). In Electron it was injected through Electron's input API, not typed by a person.
3. **Electrobun's WKWebView drawing the page progressively** (criterion 1). Arrival was measured; drawing was not seen.
4. **Memory and start-up with windows actually displayed.** All figures are from a locked screen.
5. **Whether an Electrobun interface catches up** on the answers it missed while its window was not displayed, and whether the same happens when the window is merely covered or minimized rather than behind a locked screen.
6. **Rendering on Windows and Linux**, for both shells: nothing was run there. For Electron the differences the operating system introduces (fonts, emoji, scrollbars) are undocumented and untested.
7. **Auto-update in practice**, for both: no signing, no host, nothing published.
8. **The agent in a signed and notarized app**, as the framing already sets aside for the first signed build.
9. **Electron's other embedding.** Only `WebContentsView` was tried. An `<iframe>` would let the interface draw over the preview; whether the editing script can be injected there in an isolated world was not tested.
10. Electrobun's Windows 10 support, its behavior when the WebView2 runtime is missing, and CSS anchor positioning in WebKitGTK: not found in any primary source.

For Electrobun, items 1, 2, 3 and 5 still need about ten minutes on an unlocked screen.

## Sources

All read on 2026-11-09. Electron and Electrobun documentation was read at the tags of the versions tested, as raw files, and each quotation checked against the file.

**Electron** (`https://raw.githubusercontent.com/electron/electron/v45.2.3/docs/…`)

- Why Electron — bundled Chromium, size: https://raw.githubusercontent.com/electron/electron/v45.2.3/docs/why-electron.md
- Release 45.2.3 — Chromium, Node and V8 versions: https://releases.electronjs.org/release/v45.2.3
- README — supported platforms: https://raw.githubusercontent.com/electron/electron/v45.2.3/README.md
- autoUpdater: https://raw.githubusercontent.com/electron/electron/v45.2.3/docs/api/auto-updater.md
- Updating applications, update.electronjs.org: https://raw.githubusercontent.com/electron/electron/v45.2.3/docs/tutorial/updates.md
- Web embeds (iframe, webview, WebContentsView): https://raw.githubusercontent.com/electron/electron/v45.2.3/docs/tutorial/web-embeds.md
- Context isolation: https://raw.githubusercontent.com/electron/electron/v45.2.3/docs/tutorial/context-isolation.md
- webContents (`capturePage`, `debugger`, `sendInputEvent`): https://raw.githubusercontent.com/electron/electron/v45.2.3/docs/api/web-contents.md
- electron-builder 26, auto update: https://www.electron.build/v26/docs/features/auto-update

**Electrobun** (documentation read at version 2.0.6; public site https://docs.electrobun.dev/)

- What is Electrobun — default engines: https://docs.electrobun.dev/electrobun/guides/what-is-electrobun/
- Compatibility — targets, Linux packages: https://docs.electrobun.dev/electrobun/guides/compatability/
- Cross-platform development — "different browser engines": https://docs.electrobun.dev/electrobun/guides/cross-platform-development/
- Bundling CEF: https://docs.electrobun.dev/electrobun/apis/bundling-cef/
- `<electrobun-webview>` — preload, sandbox, layering: https://docs.electrobun.dev/electrobun/apis/browser/electrobun-webview-tag/
- BrowserView — `executeJavascript()` returns nothing: https://docs.electrobun.dev/electrobun/apis/browser-view/
- Updates guide and Updater API: https://docs.electrobun.dev/electrobun/guides/updates/ and https://docs.electrobun.dev/electrobun/apis/updater/
- Bundling and distribution — artifacts per platform: https://docs.electrobun.dev/electrobun/guides/bundling-and-distribution/
- Code signing — Windows not covered: https://docs.electrobun.dev/electrobun/guides/code-signing/
- Hot reloading: https://docs.electrobun.dev/electrobun/guides/hot-reloading/
- README — platform support table: https://raw.githubusercontent.com/blackboardsh/electrobun/v2.0.6/README.md
- Hutch and migration to 2.x: https://docs.electrobun.dev/electrobun/guides/hutch/ and https://docs.electrobun.dev/electrobun/guides/migrating-to-v2/
- Pinned Chromium version: `shared/cef-version.ts` in the 2.0.6 SDK as downloaded
- Issue 140, isolated world for preloads (open): https://github.com/blackboardsh/electrobun/issues/140
- Issue 605, update helper hangs in 2.0.6 (open): https://github.com/blackboardsh/electrobun/issues/605
- Issue 535, Windows updates never apply (open): https://github.com/blackboardsh/electrobun/issues/535
- Issue 568, Wayland still forced to X11 (open): https://github.com/blackboardsh/electrobun/issues/568

**Web engines and the page's libraries**

- Tailwind CSS — browser versions required: https://tailwindcss.com/docs/compatibility
- daisyUI 5 changelog — dropdown anchor positioning: https://daisyui.com/docs/changelog/
- htmx 4 migration guide — `fetch()`, constructable stylesheets: https://four.htmx.org/migration-guide-htmx-4/
- WebKitGTK in Ubuntu: https://packages.ubuntu.com/search?keywords=libwebkit2gtk-4.1-0&searchon=names&suite=all&section=all
- WebKitGTK in Debian: https://tracker.debian.org/pkg/webkit2gtk
- WebKitGTK in Fedora: https://packages.fedoraproject.org/pkgs/webkitgtk/webkit2gtk4.1/
- WebKitGTK 2.54 highlights: https://webkitgtk.org/2026/09/16/webkitgtk-2.54-highlights.html
- WebView2 distribution — evergreen runtime, Windows 10 gap: https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution
- WebView2 evergreen and fixed versions: https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/evergreen-vs-fixed-version

**Read on 2026-11-10, for the follow-up**

- Electron — web embeds (`<iframe>`, `<webview>`, `WebContentsView`): https://raw.githubusercontent.com/electron/electron/v45.2.3/docs/tutorial/web-embeds.md
- Electron — `nodeIntegrationInSubFrames`: https://raw.githubusercontent.com/electron/electron/v45.2.3/docs/api/structures/web-preferences.md
- Electron — `sendInputEvent` forwards to the main frame's widget (`rwh->ForwardMouseEvent`): https://raw.githubusercontent.com/electron/electron/v45.2.3/shell/browser/api/electron_api_web_contents.cc
- Chromium 156.0.8078.80 — no drag between cross-origin frames of one page: https://raw.githubusercontent.com/chromium/chromium/156.0.8078.80/third_party/blink/renderer/core/page/drag_controller.cc and https://raw.githubusercontent.com/chromium/chromium/156.0.8078.80/content/browser/web_contents/web_drag_dest_mac.mm
- Chromium 156.0.8078.80 — the DevTools protocol picks the frame for an injected mouse event by itself: https://raw.githubusercontent.com/chromium/chromium/156.0.8078.80/content/browser/devtools/protocol/input_handler.cc
