<!-- Raw material returned by a research subagent on 2026-11-09. Quotes were relayed by a fetch tool and must be checked against the page before being cited. -->

# Desktop-shell spike — documentation research (Electron 45.2.3 vs Electrobun 2.0.6), fetched 2026-11-09

## Read first: how reliable the quotes are
- All pages were read through WebFetch, whose extraction model relays the text. Quotes are as it returned them; a few had backticks/bold stripped or were cut mid-sentence (marked "[cut]"). **Verify each quote before citing.**
- Only the two Microsoft Learn pages came back as raw text; those quotes I selected myself.
- Electrobun docs were read from the raw MDX in the official repo (`main` branch, so they can be slightly ahead of 2.0.6; an "Unreleased" changelog exists). Rendered equivalents live under `https://docs.electrobun.dev/electrobun/...` (sitemap confirmed).
- No files were created or modified; nothing was built.

## Source keys (exact URLs fetched)
Electrobun — `RAW` = `https://raw.githubusercontent.com/blackboardsh/electrobun/main`
- EB-README: RAW/README.md
- EB-XPLAT: RAW/docs/src/content/docs/electrobun/guides/cross-platform-development.mdx
- EB-COMPAT: RAW/docs/src/content/docs/electrobun/guides/compatability.mdx
- EB-CEF: RAW/docs/src/content/docs/electrobun/apis/bundling-cef.mdx
- EB-CEFMD: RAW/CEF.md
- EB-CEFVER: RAW/package/src/shared/cef-version.ts
- EB-UPDAPI: RAW/docs/src/content/docs/electrobun/apis/updater.mdx
- EB-UPDGUIDE: RAW/docs/src/content/docs/electrobun/guides/updates.mdx
- EB-DIST: RAW/docs/src/content/docs/electrobun/guides/bundling-and-distribution.mdx
- EB-SIGN: RAW/docs/src/content/docs/electrobun/guides/code-signing.mdx
- EB-WHAT: RAW/docs/src/content/docs/electrobun/guides/what-is-electrobun.mdx
- EB-TAG: RAW/docs/src/content/docs/electrobun/apis/browser/electrobun-webview-tag.mdx
- EB-TAGARCH: RAW/docs/src/content/docs/electrobun/guides/architecture/webview-tag.mdx
- EB-ARCH: RAW/docs/src/content/docs/electrobun/guides/architecture/overview.mdx
- EB-BV: RAW/docs/src/content/docs/electrobun/apis/browser-view.mdx
- EB-BW: RAW/docs/src/content/docs/electrobun/apis/browser-window.mdx
- EB-GLOBALS: RAW/docs/src/content/docs/electrobun/apis/browser/global-properties.mdx
- EB-MIG: RAW/docs/src/content/docs/electrobun/guides/migrating-to-v2.mdx
- EB-CL2X / EB-CL202 / EB-CL204 / EB-CL205 / EB-CL206 / EB-CLUNREL: RAW/docs/src/content/docs/electrobun/guides/changelog/{v2-x,v2-0-2,v2-0-4,v2-0-5,v2-0-6,unreleased}.mdx
- EB-DOCSHOME: https://docs.electrobun.dev/electrobun/
- EB-SITE: https://electrobun.dev/electrobun/ ; EB-HOME: https://electrobun.dev
- EB-BLOG20: https://electrobun.dev/blog/electrobun-2-0/ ; EB-BSDIFF: https://electrobun.dev/blog/introducing-zig-bsdiff/
- EB-ISSUE-n: https://github.com/blackboardsh/electrobun/issues/n

Electron
- EL-REL: https://releases.electronjs.org/release/v45.2.3
- EL-WHY: https://www.electronjs.org/docs/latest/why-electron
- EL-TIME: https://www.electronjs.org/docs/latest/tutorial/electron-timelines
- EL-README: https://github.com/electron/electron/blob/main/README.md
- EL-BREAK: https://www.electronjs.org/docs/latest/breaking-changes
- EL-BW: https://www.electronjs.org/docs/latest/api/browser-window
- EL-WAYLAND: https://www.electronjs.org/blog/tech-talk-wayland
- EL-AU: https://www.electronjs.org/docs/latest/api/auto-updater
- EL-UPD: https://www.electronjs.org/docs/latest/tutorial/updates
- EL-UEO: https://github.com/electron/update.electronjs.org
- EL-UEA: https://github.com/electron/update-electron-app
- EL-SIGN: https://www.electronjs.org/docs/latest/tutorial/code-signing
- EL-EMBED: https://www.electronjs.org/docs/latest/tutorial/web-embeds
- EL-CTX: https://www.electronjs.org/docs/latest/tutorial/context-isolation
- EL-WEBPREF: https://www.electronjs.org/docs/latest/api/structures/web-preferences
- EL-WVTAG: https://www.electronjs.org/docs/latest/api/webview-tag
- EL-WCV: https://www.electronjs.org/docs/latest/api/web-contents-view
- EL-BVIEW: https://www.electronjs.org/docs/latest/api/browser-view
- EL-WC: https://www.electronjs.org/docs/latest/api/web-contents
- EBLD-AU26: https://www.electron.build/v26/docs/features/auto-update (current stable)
- EBLD-AU27: https://www.electron.build/docs/features/auto-update/ (unreleased v27)
- EBLD-PUB26: https://www.electron.build/v26/docs/publish
- EBLD-NSIS26: https://www.electron.build/v26/docs/nsis
- EBLD-UPDAPI: https://www.electron.build/docs/api/electron-updater/ (v27 docs)
- EBLD-V27: https://www.electron.build/docs/migration/v27-breaking-changes/
- FORGE-AU: https://www.electronforge.io/advanced/auto-update
- FORGE-S3: https://www.electronforge.io/config/publishers/s3

Web stack and webviews
- TW: https://tailwindcss.com/docs/compatibility
- DAISY-V5: https://daisyui.com/docs/v5/ ; DAISY-CL: https://daisyui.com/docs/changelog/ ; DAISY-BLOG: https://daisyui.com/blog/daisyui-5-upcoming-changes/
- HTMX-ANN: https://four.htmx.org/announcements/2026-08-28-htmx-4.0.0-is-released
- HTMX-MIG: https://four.htmx.org/migration-guide-htmx-4/
- HTMX-PKG: https://raw.githubusercontent.com/bigskysoftware/htmx/four/package.json
- UBU: https://packages.ubuntu.com/search?keywords=libwebkit2gtk-4.1-0&searchon=names&suite=all&section=all
- DEB: https://tracker.debian.org/pkg/webkit2gtk
- FED: https://packages.fedoraproject.org/pkgs/webkitgtk/webkit2gtk4.1/
- WKG-HOME: https://webkitgtk.org/
- WKG-250 / WKG-252 / WKG-254: https://webkitgtk.org/2025/11/26/webkitgtk-2.50.html , https://webkitgtk.org/2026/03/18/webkitgtk-2.52-highlights.html , https://webkitgtk.org/2026/09/16/webkitgtk-2.54-highlights.html
- WKG-2520: https://webkitgtk.org/2026/03/18/webkitgtk2.52.0-released.html
- WKG-230: https://webkitgtk.org/2020/09/11/webkitgtk2.30.0-released.html
- WKG-UA: https://raw.githubusercontent.com/WebKit/WebKit/webkitgtk-2.52.6/Source/WebCore/platform/glib/UserAgentGLib.cpp (same text at tags webkitgtk-2.50.4 and webkitgtk-2.54.2)
- WK-BUG: https://bugs.webkit.org/show_bug.cgi?id=303811
- MS-DIST: https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution
- MS-EVG: https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/evergreen-vs-fixed-version
- CANIUSE-ANCHOR: https://raw.githubusercontent.com/Fyrd/caniuse/main/features-json/css-anchor-positioning.json
- BCD-SS: https://raw.githubusercontent.com/mdn/browser-compat-data/main/css/at-rules/starting-style.json
- TAURI-VER: https://v2.tauri.app/reference/webview-versions/ ; TAURI-GFX: https://v2.tauri.app/develop/debug/linux-graphics/

---

## Part A — rendering engine

### A1. Electron
1. **Bundled Chromium.** Electron ships its own Chromium, V8 and Node with the app. Quote: "by bundling the latest version of Chromium, V8, and Node.js directly with the application binary." — EL-WHY — PRIMARY
2. **Versions in 45.2.3.** Released Nov 4, 2026; Chromium "156.0.8078.80", Node.js "24.22.2", V8 "15.6.75.27". — EL-REL — PRIMARY
3. **Same engine version on all three OSes: not found as an explicit sentence.** The release page lists one Chromium version for the release with no per-OS split. Closest wording: "Chromium is currently the best cross-platform rendering stack available." — EL-WHY — PRIMARY
4. **Cadence.** "Electron targets Chromium even-number versions, releasing every 8 weeks in concert with Chromium's 4-week release schedule." / "The latest three _stable_ major versions are supported by the Electron team." — EL-TIME — PRIMARY
5. **Size cost.** "Zipped Electron apps are usually around 80 to 100 Megabytes." — EL-WHY — PRIMARY
6. **Supported OS.** "macOS (Ventura and up)"; "Windows (Windows 10 and up): Electron provides `x64` (`amd64`) and `arm64` binaries for Windows."; "Electron supports major Linux distributions (e.g., Ubuntu, Fedora, Debian)" (no distro version numbers). — EL-README — PRIMARY. Also "macOS 13 (Ventura) or later will be required to run Electron v44.0.0 and higher." and "Electron v44.0.0 and higher will only be published for 64-bit platforms." — EL-BREAK — PRIMARY
7. **Wayland is the Linux default since 38.** "Electron now defaults to running as a native Wayland app when launched in a Wayland session" (38.0). — EL-BREAK — PRIMARY. "Wayland is supported out of the box in Electron 38.2 and newer." — EL-WAYLAND (2026-03-17) — PRIMARY
8. **Wayland limits.** "it is generally not possible to programmatically resize windows after creation"; "If your app needs these capabilities, run it in Xwayland by appending the flag `--ozone-platform=x11`."; "On Wayland, "minimized" is not currently a supported state." — EL-BW — PRIMARY. "Electron 41 supports CSD on Wayland in all window configurations" — EL-WAYLAND — PRIMARY
9. **Other Linux window differences.** "Frameless windows default to rounded corners on Linux if the desktop environment supports client-side decorations." (43.0); heading "Changed: GTK 4 is default when running GNOME" (36.0, heading only). — EL-BREAK — PRIMARY
10. **GPU.** `app.disableHardwareAcceleration()`: "Disables hardware acceleration for current app."; `app.getGPUFeatureStatus()`: "The Graphics Feature Status from `chrome://gpu/`." — https://www.electronjs.org/docs/latest/api/app — PRIMARY
11. **Not found in Electron docs:** any statement on cross-OS differences in fonts, text antialiasing, scrollbars, native form controls or emoji, and any GPU/driver blocklist. Pages checked: EL-WHY, command-line-switches, environment-variables, app, browser-window, breaking-changes (chars 0–200000 of 204542). The command-line-switches and environment-variables pages mention neither Wayland/ozone nor `--ignore-gpu-blocklist`.

### A2. Electrobun 2.x
**Default engines**
12. System webview is the default: "System webviews render your UI by default — WKWebView on macOS, WebView2 on Windows, WebKitGTK on Linux." — EB-WHAT — PRIMARY
13. Target table rows: "macOS 14+ | x64 (Intel) | WKWebView | CEF"; "Windows | x64 | WebView2 | CEF"; "Linux | x64 | WebKitGTK 4.1 | CEF" (arm64 rows likewise). — EB-COMPAT — PRIMARY
14. Docs warn the engines differ: "System webviews are different browser engines and versions." — EB-XPLAT — PRIMARY
15. Linux runtime dependencies stay even with CEF: "Linux requires GTK 3, WebKitGTK 4.1, Ayatana AppIndicator, and librsvg runtime packages even when CEF is bundled." — EB-COMPAT — PRIMARY. Debian/Ubuntu command: "sudo apt install libgtk-3-0 libwebkit2gtk-4.1-0 libayatana-appindicator3-1 librsvg2-2" — EB-XPLAT — PRIMARY

**Bundling CEF**
16. Option names are per platform: `build.mac.bundleCEF`, `build.win.bundleCEF`, `build.linux.bundleCEF`, plus `defaultRenderer: "cef"`. "Enable CEF independently for each target platform." / "`defaultRenderer` controls the renderer used when a window or view does not set one explicitly." — EB-CEF — PRIMARY
17. Per-window/view choice: `renderer: "cef" | "native"` on `BrowserWindow`, and `renderer="cef"` on `<electrobun-webview>` ("Embedded views accept the same renderer choice:"). "A CEF renderer is unavailable when `bundleCEF` is false." — EB-CEF — PRIMARY
18. Mixing renderers works on macOS and Windows only: "On macOS and Windows, a bundled application can mix native and CEF views." / "A Linux process uses either its CEF wrapper or GTK WebKit wrapper, so do not depend on mixed renderers there." — EB-CEF, EB-XPLAT — PRIMARY
19. **Size cost: no number in the docs.** Only: "CEF materially increases the application download and installed size." — EB-CEF — PRIMARY. User-reported figure (no maintainer reply, open): "Windows CEF builds ship 13 Chromium files twice (341 MB of an 836 MB install)"; "The setup zip was 290 MB for a one-window app." — EB-ISSUE-586 (2026-10-19) — PRIMARY (bug tracker, unconfirmed)
20. Pinned CEF version: `CEF_VERSION = 156.0.7+g47dbc1d`, `CHROMIUM_VERSION = 156.0.8078.17`; "All platforms use the same version." — EB-CEFVER — PRIMARY. Confirmed by "Updated bundled CEF to `156.0.7+g47dbc1d` / Chromium `156.0.8078.17` across all six targets" — EB-CL205 — PRIMARY. **Contradiction:** EB-CEFMD still states `147.0.10+gd58e84d` / Chromium `147.0.7727.118`.
21. No per-project CEF version: "Hutch does not currently expose a per-project CEF version override." — EB-COMPAT — PRIMARY
22. Known CEF caveat: "CEF's permanent certificate blocklist fix will follow in a separate update" — EB-CL205 — PRIMARY

**Maturity of Windows and Linux**
23. README support table: "macOS 14+ (Apple Silicon and Intel x64) | Official"; "Windows 11+ x64 | Official"; "Windows 11+ ARM64 | Beta"; "Ubuntu 24.04+ | Official"; "Other Linux distros (gtk3, webkit2gtk-4.1) | Community". — EB-README — PRIMARY
24. **Docs vs README:** EB-COMPAT lists "Windows" and "Linux" with no OS version and never uses "beta". **Windows 10: not found anywhere** in README or docs.
25. Ubuntu 22.04 fails in practice: `libNativeWrapper.so` needs "version `GLIBC_2.38' not found" (reporter on 22.04.5, glibc 2.35). Open; maintainer replied only with a README screenshot. — EB-ISSUE-240 — PRIMARY (bug tracker)
26. 2.0 fix list shows the areas that needed work: "Linux WebKit and CEF lifecycle fixes, wheel scrolling, GTK grow and shrink behavior"; "Windows wide-character paths and UI text, including WebView2 and CEF data directories under non-ASCII user profiles". — EB-CL2X — PRIMARY
27. Author's own framing: asks users to "open GitHub issues when you run into issues so we can stabilize 2.0 in the wild as soon as possible." — EB-BLOG20 (2026-08-21) — PRIMARY
28. Issue tracker: 136 open issues. **No `windows` or `linux` labels exist** (labels are bug, documentation, duplicate, enhancement, good first issue, help wanted, idea, invalid, question, wip, wontfix). Text search: 58 open matching "windows", 37 open matching "linux". — https://github.com/blackboardsh/electrobun/issues and https://github.com/blackboardsh/electrobun/labels — PRIMARY

**Features documented as missing or different**
29. `<electrobun-webview>` layering: "The native webview is a separate layer above the host page." / "so ordinary `z-index` cannot place host DOM over it." Masks are the workaround: "Masks use bounding rectangles; rounded corners and partial alpha do not alter the rectangular cutout." — EB-TAG — PRIMARY
30. Windows: masks and passthrough need CEF. "WebView2 does not honor these overlay operations"; "`<electrobun-webview>` masks and input passthrough require CEF on Windows." — EB-TAG, EB-CEF — PRIMARY
31. Linux: "passthrough and mask punch-through are unavailable for embedded views inside transparent" [cut — refers to transparent BrowserWindows]; "Use a non-transparent parent for those overlays." — EB-TAG — PRIMARY
32. Process model not guaranteed: "Electrobun does not promise one operating-system process per tag." — EB-TAGARCH — PRIMARY
33. Spell check is macOS-native only: "Native WKWebView on macOS is currently supported." — EB-TAG — PRIMARY
34. **Wayland: docs silent** (EB-XPLAT, EB-COMPAT, EB-BW, EB-TAG, EB-TAGARCH). Open issue "Linux: native Wayland support (GDK_BACKEND=x11 is still forced in 2.0)": "2.0 has shipped, and `main` still forces X11 (checked 2026-10-02)." No maintainer reply. — EB-ISSUE-568 — PRIMARY (bug tracker). Only README mention: "Wayland screen-region capture additionally requires a working desktop portal, PipeWire, and the" [cut]. — EB-README — PRIMARY
35. **Drag and drop: docs silent.** Issue "Native drag and drop" open since 2025-05-01 (closed not-planned 2025-11-01, reopened 2025-11-08); "this is about dragging files OUT of the application". — EB-ISSUE-63 — PRIMARY
36. **Screenshots: see C7.**
37. Sandbox is an RPC switch, not an OS sandbox claim: "Disables Electrobun RPC in the child while retaining events and navigation controls." — EB-TAG. "Sandbox mode is one layer of the security model, not a blanket guarantee." — EB-TAGARCH — PRIMARY
38. Linux WebKitGTK sandbox gap (open, no maintainer reply): a view's context "doesn't inherit the sandbox setting an app puts on WebKitGTK's default context"; on Ubuntu 26.04 the web process ran "as a direct child of `bun`, with no `bwrap` above it." — EB-ISSUE-595 (2026-10-25) — PRIMARY (bug tracker)
39. Windows WebView2 browser shortcuts (open): "pressing Ctrl+N inside a `BrowserWindow` opens a new, empty WebView2 popup window." — EB-ISSUE-569 — PRIMARY (bug tracker)
40. Windows code signing absent: "Windows release signing is not currently part of Hutch's packaging pipeline." — EB-SIGN — PRIMARY
41. Other open Windows/Linux issues by title (not read in full): #601 Windows CEF webviews never close their browser; #510 Linux CEF nested webview bounds not scaled on HiDPI; #484 Windows white bands during live resize; #374 Linux tray icon click events; #554 Linux launcher drops application arguments. — issue list pages — PRIMARY
42. GitHub Releases carry no notes: v2.0.6 published "04 Nov"; body is only a "Full Changelog" link. The changelog lives in the docs (EB-CL*). v2.0.7-beta.8 dated 08 Nov. — https://github.com/blackboardsh/electrobun/releases — PRIMARY

### A3. Minimum browser versions, WebKitGTK per distro, WebView2
**Tailwind CSS 4** (page shows v4.3)
43. Core depends on "Chrome 111 (released March 2023)", "Safari 16.4 (released March 2023)", "Firefox 128 (released July 2024)"; framed as "specifically depends on these browser versions". — TW — PRIMARY
44. Newer utilities are opt-in: "Tailwind also includes support for many bleeding-edge platform features like `field-sizing: content`, `@starting-style`, and `text-wrap: balance` that have limited browser support." — TW — PRIMARY

**daisyUI 5** (latest 5.7.50, 2026-10-13)
45. **Minimum browser versions: not found** (checked DAISY-V5, DAISY-CL, /docs/install/, /docs/faq/). Closest: "daisyUI 5 will be compatible with Tailwind CSS 4 and all modern browsers." — DAISY-BLOG — PRIMARY
46. Features it relies on: "CSS nesting is now supported on all browsers."; "it uses CSS `color-mix()` to control the opacity."; dropdown uses "Popover API, Anchor Positioning, new dropdown-center modifier". — DAISY-V5 — PRIMARY
47. Engine-specific notes in the 5.0.0 dropdown entry: "Currently only works on Chromium-based browsers."; "Uses CSS @starting-style now." Also 5.1.0: "works in Chromium, other browsers use the old OS style" (which component: not captured). — DAISY-CL — PRIMARY
48. Reference data: anchor positioning is partial in Safari from 26.0 and full from 27, partial in Chrome from 125, partial in Firefox from 147; caniuse has no WebKitGTK/Epiphany key. — CANIUSE-ANCHOR — PRIMARY (data). `@starting-style`: Chrome 117, Firefox 129, Safari 17.5; no WebKitGTK entry. — BCD-SS — PRIMARY (data)

**htmx 4** (4.0.0 released 2026-08-28; docs reference 4.0.1)
49. **Minimum browser versions: not found** (checked four.htmx.org home, llms-full.txt chars 0–100000, HTMX-MIG, the-fetchening essay, HTMX-ANN, HTMX-PKG, README on branch `four`). package.json has no `browserslist`; tests run with "web-test-runner --browsers chromium firefox webkit". — HTMX-PKG — PRIMARY
50. Browser APIs it uses: "All requests use the native fetch() API. This cannot be reverted."; "Indicator CSS now uses Constructable Stylesheets, so no nonce is needed."; "View Transitions API support is available but disabled by default." — HTMX-MIG — PRIMARY
51. npm tag: "2.x will remain `latest` and the 4.0 line will remain `next` until some point in early 2027." — HTMX-ANN — PRIMARY

**WebKitGTK shipped by distros** (package `libwebkit2gtk-4.1-0` / `webkit2gtk` / `webkit2gtk4.1`)
52. Ubuntu 22.04 jammy: release 2.36.0-2ubuntu1; security/updates **2.50.4-0ubuntu0.22.04.1**. — UBU — PRIMARY
53. Ubuntu 24.04 noble: release 2.44.0-2; security/updates **2.52.6-0ubuntu0.24.04.1**. — UBU — PRIMARY
54. Ubuntu 26.04 resolute: release 2.52.0-1; security/updates **2.52.6-0ubuntu0.26.04.1**. — UBU — PRIMARY
55. Debian 12 (now oldstable): **2.50.6-1~deb12u2** (security 2.50.6-1~deb12u1). Debian 13 (stable): **2.52.3-2~deb13u1**, stable-security **2.54.0-1~deb13u3**. Testing 2.52.6-1, unstable 2.54.2-2. Codenames inferred from the `~deb12`/`~deb13` suffixes. — DEB — PRIMARY
56. Fedora 43, 44, 45 and Rawhide: **2.54.2-1**. — FED — PRIMARY
57. Upstream latest stable: "WebKitGTK 2.54.2 released!" (2026-10-23). — WKG-HOME — PRIMARY
58. **Mapping to a Safari feature level: not found in any primary source.** WebKitGTK's user agent is deliberately not a real Safari version: `uaString.append("Version/60.5 "_s);` with the comment "so we need to pick a higher version number than real Safari." — WKG-UA — PRIMARY
59. Only mapping found is outdated and stops at 2.36: row "Debian 11 (with update), Ubuntu 20.04 (with update), Ubuntu 22.04 | 2.36 | 614.1.6 | TP 140 (16.0)"; the page calls the list "very incomplete". — TAURI-VER — SECONDARY
60. Features upstream says each series enabled: 2.50 "CSS text-wrap-style: pretty is enabled by default."; 2.52 "CSS field-sizing is now available."; 2.54 "The scrollbar-color CSS property is now supported." and "Customizable select elements (appearance: base-select) are now supported." Anchor positioning, `@starting-style`, popover and view transitions are not mentioned in any of the three highlights posts. — WKG-250, WKG-252, WKG-254 — PRIMARY

**WebView2**
61. Evergreen and self-updating: "The WebView2 Runtime updates automatically without requiring any action from you." — MS-DIST — PRIMARY
62. Preinstalled on Windows 11, pushed to Windows 10: "The Evergreen Runtime is preinstalled onto all Windows 11 devices as a part of the Windows 11 operating system."; "Microsoft installed the WebView2 Runtime to all eligible Windows 10 devices" — MS-EVG — PRIMARY
63. Gap on Windows 10: "A small number of Windows 10 devices don't have the WebView2 Runtime installed." — MS-DIST — PRIMARY
64. Machine without the runtime — the app must handle it: "the app should check whether the WebView2 Runtime is present ... and install the Runtime if it is missing." (ellipsis mine). Tools: "*WebView2 Runtime Bootstrapper* is a tiny (approximately 2 MB) installer." — MS-DIST — PRIMARY
65. Updates can be blocked: "Updates to the WebView2 Runtime might not occur if an IT Admin disables updating, or if the client is offline." — MS-DIST — PRIMARY
66. Pinned alternative: "The Fixed Version binaries are over 250 MB and will make your app package larger by that amount." — MS-DIST — PRIMARY
67. **What Electrobun does when the WebView2 runtime is missing: not found** in its docs, README or issues.

### A4. Differences a Tailwind/daisyUI page could hit (WebKitGTK vs WKWebView vs Chromium)
68. Form controls are drawn by WebKit, not the GTK theme, since 2.30: "Stop using GTK theming to render form controls and add API to disable using GTK to render scrollbars too." — WKG-230 — PRIMARY
69. Text blending changed in 2.52: "Make text look like in other browsers by blending in linear color space." So jammy/bookworm (2.50.x) and noble/trixie (2.52+) differ here. — WKG-2520 — PRIMARY
70. Compositor rewritten in 2.54: "the web process compositor now uses the Skia API instead of the venerable TextureMapper."; "CSS blend modes, which TextureMapper never implemented, now work in composited layers". Implies composited-layer blend modes did not work before 2.54. — WKG-254 — PRIMARY
71. 2.54 also: "the option to use Cairo for 2D rendering has been removed"; GTK3: "hardware acceleration is now always used". — WKG-254 — PRIMARY
72. NVIDIA blank webview, open WebKit bug (status NEW, reported 2025-12-08 against 2.50.3): "WebKitGTK WebView renders blank on NVIDIA RTX 5070 Laptop GPU (Blackwell architecture)." With the DMABUF renderer disabled, backdrop-filter breaks: "The element appears but the blur effect is absent"; maintainer: "Pretty sure blur (and other 3D transforms) is not expected to work with dmabuf renderer disabled." — WK-BUG — PRIMARY
73. Same problem as described for Tauri apps: "On some setups, most often NVIDIA GPUs, WebKitGTK and the graphics driver disagree."; "Most of these come from the WebKitGTK DMABUF renderer requesting buffer formats the NVIDIA driver does not provide."; `WEBKIT_DISABLE_COMPOSITING_MODE` is "Last resort for the silent crash on resize." — TAURI-GFX — SECONDARY
74. macOS WKWebView tracks the OS: "It is considered a core component and is therefore updated with the regular OS updates." — TAURI-VER — SECONDARY
75. daisyUI's anchor-positioned dropdown is the one stack-specific item with an explicit engine caveat (fact 47); whether the WebKitGTK versions above support anchor positioning: **not found**.
76. Fractional-scaling blur on Wayland with Electrobun appears only as a user comment on EB-ISSUE-568 (2026-10-29), not a documented fact.
77. Checked and not useful: https://trac.webkit.org/wiki/Common%20pixel%20differences%20between%20ports (last modified 2012, compares old Chromium-Mac ports). The WebKitGTK statement that scrollbars follow Adwaita applies to the GTK4 `webkitgtk-6.0` API, not the GTK3 `webkit2gtk-4.1` API Electrobun links.
78. **Not found in primary sources:** WebKitGTK-vs-Apple-WebKit differences for system fonts, emoji font, text antialiasing, or scrollbar appearance on GTK3.

---

## Part B — auto-update

### B5. Electron
**Built-in `autoUpdater`**
79. Platforms: "Currently, only macOS and Windows are supported." / "There is no built-in support for auto-updater on Linux," — recommended instead: "to use the distribution's package manager to update your app." — EL-AU — PRIMARY
80. macOS: "the `autoUpdater` module is built upon Squirrel.Mac"; "Your application must be signed for automatic updates on macOS." / "This is a requirement of `Squirrel.Mac`." — EL-AU — PRIMARY
81. Windows: "automatically selects the appropriate update mechanism based on how your app is packaged."; installer apps: "the module uses Squirrel.Windows for updates"; MSIX: "the module uses the MSIX updater, which supports direct MSIX file links and JSON update feeds." — EL-AU — PRIMARY
82. Server formats: macOS `serverType` "Can be `json` or `default`"; no update → "the server should return a `204 No Content`"; Windows reads "the RELEASES file generated during the build process", which "details the `.nupkg` delta package to update to". — EL-AU, EL-UPD — PRIMARY
83. Methods: `setFeedURL`, `getFeedURL`, `checkForUpdates`, `quitAndInstall`. Events: `error`, `checking-for-update`, `update-available`, `update-not-available`, `update-downloaded`, `before-quit-for-update`. — EL-AU — PRIMARY

**update.electronjs.org**
84. Requirements (docs): "App runs on macOS or Windows"; "App has a public GitHub repository"; "Builds are published to GitHub Releases"; "Builds are code-signed" "(macOS only)". — EL-UPD — PRIMARY
85. **Wording differs in the service README:** "Your builds are code signed" "(macOS and MSIX only)". Linux is not mentioned. — EL-UEO — PRIMARY
86. Assets: macOS "Asset must be a `.zip` file."; Windows Squirrel "Asset must be a `.zip` or `.exe` file."; MSIX "Asset must be a `.msix` file." (Electron 41+). Architectures: Windows `x64`, `ia32`, `arm64`; macOS `x64`, `arm64`, `universal`. — EL-UEO — PRIMARY
87. `update-electron-app`: "Your app will check for updates at startup, then every ten minutes."; sources are the public service or "Static file storage E.g. S3, Google Cloud Storage, etc." — EL-UEA — PRIMARY

**electron-updater (electron-builder; v26 is current stable, the default docs URL is unreleased v27)**
88. Targets: "macOS: DMG." / "Linux: AppImage, DEB, Pacman and RPM." / "Windows: NSIS." — EBLD-AU26 — PRIMARY. **Inconsistency:** the API page says "Linux (AppImage, rpm, deb)." (no Pacman in that list, though `PacmanUpdater` is in the class list). — EBLD-UPDAPI — PRIMARY
89. Differences from built-in: "Linux is supported (not only macOS and Windows)."; "Code signature validation not only on macOS, but also on Windows."; "Download progress and staged rollouts supported on all platforms." — EBLD-AU26 — PRIMARY
90. macOS: "macOS application must be signed in order for auto updating to work."; "`zip` target for macOS is **required** for Squirrel.Mac, otherwise `latest-mac.yml` cannot be created." — EBLD-AU26 — PRIMARY
91. Windows: "Squirrel.Windows is not supported." **Whether an unsigned Windows build can auto-update: not found.** — EBLD-AU26 — PRIMARY
92. Providers (v26): GitHub Releases, Amazon S3, DigitalOcean Spaces, Keygen, generic HTTP(s) server (publish page also lists Bitbucket, GitLab, Snap Store). v27 docs add Cloudflare R2. "Auto update relies only on the first provider in the list (you can specify several publishers)." — EBLD-AU26, EBLD-PUB26 — PRIMARY
93. GitHub provider: "The type of release. By default `draft` release will be created."; private repos: "Private GitHub provider only for very special cases". — EBLD-PUB26, EBLD-AU26 — PRIMARY
94. Generic server: "Note that when using a generic server, you have to upload the built application and metadata files yourself." — EBLD-PUB26 — PRIMARY
95. Metadata: `latest.yml` / `latest-mac.yml` / `latest-linux.yml` — "will be generated and uploaded for all providers except `bintray`". — EBLD-AU26 — PRIMARY
96. Differential downloads: the v26 auto-update page does not mention them. v26 NSIS page: "The differential updater diffs the compressed package with a content-defined blockmap". v27 (unreleased): "downloads only the byte ranges that changed, using HTTP `Range` requests"; "One `<artifact>.blockmap` is published per artifact." — EBLD-NSIS26, EBLD-AU27 — PRIMARY
97. Linux package formats (v27, unreleased): "package managers always elevate (pkexec/sudo)"; "call `installPendingUpdateIfAvailable()` explicitly at a moment your app controls". — EBLD-AU27 — PRIMARY
98. v27 (unreleased): "Windows update signature verification fails closed". — EBLD-V27 — PRIMARY

**Electron Forge**
99. "Open source apps hosted on GitHub can use a free auto update service from the Electron team." / "To use this module with Forge, set up the GitHub Publisher." / "Note that having a signed application is a pre-requisite for using auto updates on macOS." — FORGE-AU — PRIMARY
100. Static storage: macOS "supports static file auto-updates from the ZIP artifacts"; Windows via "the Squirrel.Windows maker (Windows)"; `remoteReleases` is needed "in order to generate delta updates."; "If you want to distribute a DMG that supports static file auto-updates, make sure to also make a ZIP target." Linux not mentioned. — FORGE-S3 — PRIMARY
101. Signing context: "Both Windows and macOS prevent users from running unsigned applications."; "Squirrel.Mac requires the app to be signed for automatic updates to work at all." — EL-SIGN — PRIMARY

### B6. Electrobun 2.x
**Updater API**
102. Methods: `Updater.getLocalInfo()`, `checkForUpdate()`, `downloadUpdate()`, `updateInfo()`, `applyUpdate()`, `localInfo`, `channelBucketUrl()`, `appDataFolder()`, `onStatusChange(cb | null)`, `getStatusHistory()`, `clearStatusHistory()`. No named events; status arrives via `onStatusChange`. — EB-UPDAPI — PRIMARY
103. Runtime limit: "The Updater API is available in the Cottontail and Bun runtimes only." — EB-UPDAPI — PRIMARY
104. `dev` builds: "The `dev` channel never reports an available update." — EB-UPDAPI — PRIMARY

**Hosting**
105. Static files on any host: "Anything that serves files over HTTPS works as the host: R2, S3, GitHub Releases, or a plain static server." — EB-UPDGUIDE — PRIMARY
106. GitHub caveat: "GitHub excludes prereleases from `/releases/latest`, so that URL cannot track canary builds." — EB-UPDGUIDE — PRIMARY
107. Config: "Point `release.baseUrl` at the directory where every target's artifacts will be uploaded."; "New builds require an HTTPS `release.baseUrl`, except for loopback HTTP in local development"; "Remote and LAN HTTP hosts are not supported by the 2.0.6 preparation helper." — EB-UPDGUIDE, EB-MIG — PRIMARY
108. Manifest names: `<channel>-<os>-<arch>-update.json` plus `<channel>-<os>-<arch>-<hash>-checksum.json`; e.g. "A stable macOS ARM64 build checks `stable-macos-arm64-update.json`;". — EB-UPDAPI, EB-UPDGUIDE — PRIMARY

**Patches**
109. Mechanism: "When a previous release is available, Hutch also creates a delta patch."; applied in chains; fallback: "A missing or failed edge discards the attempted chain and downloads the latest full archive instead." Generated only when `release.generatePatch` is true and `release.baseUrl` is set. — EB-UPDAPI, EB-UPDGUIDE, EB-DIST — PRIMARY
110. 2.0.6 change: "Replaced the retained original update tar with a small archive recipe."; "Archive recipes and streamed update preparation are available in Electrobun 2.0.6 on macOS, Windows, and Linux." — EB-CL206, EB-UPDGUIDE — PRIMARY
111. **The docs never name bsdiff and quote no patch size.** bsdiff is named in the README ("a Zig-optimized BSDIFF implementation that can produce kilobyte-scale updates") and on the site ("Batteries-included zig-bsdiff powers updates as small as 4 KB."). — EB-README, EB-SITE — PRIMARY
112. **Size claims disagree across official pages:** "updates as small as 4 KB" (EB-SITE); "✓ signed ↑ 14 KB update" (EB-HOME); "even tinier updates as small as 2KB" (EB-BLOG20); "diffs two 350MB tar files in 30 seconds generating an average patch size of 28KB" (EB-BSDIFF, 2025-11-22). — PRIMARY (vendor marketing/blog)

**Integrity and signing**
113. Integrity is a SHA-256 checksum, not a signature: "The checksum sidecar contains only `tarSha256` and `tarSize`:"; the bundle hash "is not a signature of the release metadata." — EB-UPDGUIDE — PRIMARY. Compare the docs home: "Verified updates served from static storage, with transactional replacement and rollback across Windows, macOS, and Linux." — EB-DOCSHOME — PRIMARY
114. Authenticity is left to OS signing: "sign distributed applications with the platform's normal code-signing system" [cut]. — EB-UPDGUIDE — PRIMARY
115. **Whether macOS updates require a signed/notarised build: not stated.** Related: "Original signed file bytes are preserved without re-signing the app." (EB-UPDAPI); "Hutch can sign, notarize, and staple macOS canary and stable builds."; "Dev builds skip Hutch's signing and notarization steps even when `build.mac.codesign` is enabled." (EB-SIGN) — PRIMARY

**Channels and artifacts**
116. Channels: `dev`, `canary`, `stable`. "the two channels are independent, so testers can run prerelease builds alongside the stable app."; "a canary artifact is never promoted into stable." — EB-DIST, EB-UPDGUIDE — PRIMARY
117. macOS: "Hutch emits a DMG by default and an `.app.tar.zst` update archive." Example `macos-arm64-MyCoolApp.dmg`. — EB-DIST — PRIMARY
118. Windows: "Hutch emits a zip containing a setup executable and adjacent hidden payload." Example `win-x64-MyCoolApp-Setup.zip`, plus a `.tar.zst` update archive. No MSI/MSIX. — EB-DIST — PRIMARY
119. Linux: "Hutch emits a `.tar.gz` installer containing a self-extracting setup and a `.tar.zst` update archive." Example `linux-x64-MyCoolApp-Setup.tar.gz`. No AppImage/deb/rpm; "Optional Flatpak configuration emits a separate expanded payload and `flatpak-builder` manifest; Hutch does not run `flatpak-builder`." — EB-DIST — PRIMARY
120. No cross-compilation: "Hutch builds for the current host platform." — EB-DIST — PRIMARY

**Windows and Linux update behaviour**
121. Windows: "The helper waits for the running app to exit before swapping its files, including on Windows."; "Windows uses Task Scheduler only to run the helper after locked processes exit." — EB-UPDAPI, EB-ARCH — PRIMARY
122. Linux: "Linux builds use USTAR for compatibility with installed update extractors;" — EB-UPDGUIDE — PRIMARY
123. Rollback: "it attempts to restore the previous app."; and launch is not verified: "confirms that launch was requested, not that the application completed startup". — EB-UPDAPI — PRIMARY
124. Open update bugs (no maintainer replies):
 - #535 (2026-08-25) "Windows: schtasks silently truncates the update task action, so unattended updates never apply" — "The app announces the update, quits, and never comes back." The 2.0.4 changelog has "Fixed Windows updater relaunch by registering scheduled-task actions with" [cut]; whether that fixes #535 is not established.
 - #605 (2026-11-09) "2.0.6 update helper hangs at 100% CPU in archive_recipe.reconstruct" — "The 2.0.5 → 2.0.6 update itself is fine; the next update from the 2.0.6 app hangs."; "It's still present in v2.0.7-beta.8 and on main."; seen on macOS arm64; PR #606 open.
 — EB-ISSUE-535, EB-ISSUE-605, EB-CL204 — PRIMARY (bug tracker)

---

## Part C

### C7. Electrobun — isolated JavaScript world, and capturing a webview
125. **No 2.x doc page documents an isolated world.** No mention of isolated world, content world or context isolation in EB-BV, EB-BW, EB-TAG, EB-TAGARCH, EB-ARCH, EB-GLOBALS, creating-ui, electroview-class, EB-MIG.
126. What the docs say about preloads: `preload` attribute — "Code evaluated before the embedded page's scripts."; option type "Inline JavaScript or a bundled `views://` script URL."; "Electrobun injects these values before application scripts run." (the `window.__electrobun*` globals); "Native bridge access and custom preloads are now restricted to the main frame;" (2.0.6). — EB-TAG, EB-BV, EB-GLOBALS, EB-CL206 — PRIMARY
127. **The maintainer's own open issue says preloads use the page world.** "Add isolated world support for preload scripts" (YoavCodes, opened 2026-02-07, still open, no linked PR) proposes `isolated: true` that "runs preload scripts in an isolated JavaScript context, separate from the page's world."; on macOS: "The hooks already exist. Lines 2529 and 5215 in nativeWrapper.mm reference WKContentWorld but currently use pageWorld."; goal: "Page scripts cannot access window.__electrobun* globals."; WebView2 is listed there as unsupported for this. — EB-ISSUE-140 — PRIMARY (bug tracker)
128. Script injection returns nothing: "`executeJavascript()` does not return the evaluated value." — EB-BV — PRIMARY
129. **Capturing a webview as an image: nothing documented in 2.x.** No screenshot/capture/snapshot API in EB-TAG, EB-BV, EB-BW, utils or main API pages, nor on the rendered webview-tag page. The only capture text is the README's Wayland screen-region prerequisite (fact 34), which describes no API.
130. A 1.x-era `syncScreenshot` method on the webview tag appeared in a search-engine snippet for https://electrobun.dev/docs/apis/browser/Electrobun%20Webview%20Tag; that URL now returns 404 and the method is absent from the 2.x page. — SECONDARY (search snippet only, unverified)

### C8. Electron — embedding and contextIsolation
131. `<webview>` is discouraged: "We do not recommend you to use WebViews"; "WebViews are based on Chromium's WebViews and are not explicitly supported by Electron."; "Consider switching to alternatives, like iframe and Electron's WebContentsView" — EL-EMBED — PRIMARY. Also "By default the webview tag is disabled in Electron >= 5." — EL-WVTAG — PRIMARY
132. `WebContentsView`: "are not a part of the DOM—instead, they are created, controlled, positioned, and sized by your Main process."; "WebContentsViews offer the greatest control over their contents" — EL-EMBED — PRIMARY. API: "A View that displays a WebContents." — EL-WCV — PRIMARY
133. `BrowserView`: "The BrowserView class is deprecated, and replaced by the new WebContentsView class." — EL-BVIEW — PRIMARY
134. iframes: "Iframes in Electron behave like iframes in regular browsers."; "it is recommended to use the sandbox attribute." [cut]. The page names no single overall recommended option. — EL-EMBED — PRIMARY
135. `contextIsolation`: "Whether to run Electron APIs and the specified `preload` script in a separate JavaScript context." "Defaults to `true`." — EL-WEBPREF — PRIMARY. "Context isolation has been enabled by default since Electron 12" — EL-CTX — PRIMARY
136. `sandbox`: "Default is `true` since Electron 20." — EL-WEBPREF — PRIMARY. Electron 45: "Child windows default to sandboxed, so a child opened from an unsandboxed window is now isolated" — EL-BREAK — PRIMARY
137. Related APIs: `contents.capturePage([rect, opts])` — "Captures a snapshot of the page within `rect`. Omitting `rect` will capture the whole visible page."; `executeJavaScriptInIsolatedWorld` — "Works like `executeJavaScript` but evaluates `scripts` in an isolated context." — EL-WC — PRIMARY

---

## Pages that errored or redirected
- https://blackboard.sh/electrobun/docs/ → 301 to https://docs.electrobun.dev/
- https://electrobun.dev/docs/apis/browser/Electrobun%20Webview%20Tag → 404 (old 1.x docs)
- https://www.electron.build/auto-update, /auto-update.html, /v26/auto-update → 404 (correct path: /v26/docs/features/auto-update)
- https://four.htmx.org/docs/get-started/migration and `.md` → 404 (used /migration-guide-htmx-4/)
- https://webkitgtk.org/faq.html → 404
- GitHub issue filters `label:windows` and `label:linux` → 0 results (labels do not exist); text search used instead
- Electrobun GitHub Releases → no body text
- https://www.electronjs.org/docs/latest/tutorial/electron-timelines → no per-version table for 43–46
- Partially read (size cap): Electron breaking-changes (last 4,542 chars), browser-window (last ~14k), app (last ~12k), web-contents (last ~34k), daisyUI changelog (last ~8.7k), htmx llms-full.txt (last ~2k)

## Questions left unanswered ("not found")
1. An explicit Electron statement that the Chromium version is identical on macOS, Windows and Linux.
2. Electron-documented cross-OS differences for fonts, antialiasing, scrollbars, form controls, emoji; any GPU/driver blocklist documentation.
3. Electrobun: a quoted MB cost for bundling CEF in the docs.
4. Electrobun: any Windows 10 support statement; behaviour when the WebView2 runtime is missing.
5. Electrobun: any Wayland statement in the docs (only an open issue and one README prerequisite).
6. Electrobun: documented drag-and-drop behaviour; documented webview-to-image capture in 2.x.
7. Electrobun: documented isolated world for preloads (only the maintainer's open feature request).
8. Electrobun: whether updates require a signed/notarised macOS build; any update signature scheme beyond the SHA-256 sidecar; patch sizes in the docs.
9. daisyUI 5 minimum browser versions; htmx 4 minimum browser versions.
10. A primary-source mapping from WebKitGTK 2.50/2.52/2.54 to a Safari version; whether those versions support CSS anchor positioning, `@starting-style`, popover.
11. Primary-source statements on WebKitGTK-vs-Apple-WebKit font, emoji and GTK3 scrollbar rendering differences.
12. electron-updater: whether an unsigned Windows build can auto-update.
13. Maintainer replies on Electrobun issues #568, #595, #586, #535, #605, #569 (none visible).