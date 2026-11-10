# The two spikes that come before building

Both spikes are throwaway code under `spikes/`, run in parallel. Each ends with a report (`spikes/<name>/REPORT.md`) giving the measurements against the criteria below, short screen recordings, and the decisions it settles, which are then written into the ADRs. A spike stops as soon as its questions are answered. Anything it could not answer is reported as unanswered.

## Spike 1: live generation

**Question.** Can a maker watch a page being built, within the speed targets, while the agent writes Liquid, htmx 4, Tailwind and daisyUI into plain files?

**What gets built.** No desktop shell. A script drives the agent, a small local server renders the project's files and serves the preview to an ordinary browser, and a channel pushes updates to the open page.

**Three approaches, compared on the same requests.**

- **A. Files plus live stream** (the hypothesis). The app reads what the agent is writing into a file while it is still being written, repairs the unfinished template, renders it and morphs the page.
- **B. Instructions.** The agent emits instructions that build the page directly; the files are written afterwards.
- **C. Files then reload.** The page refreshes each time a file is complete.

**Requests.** Three fixed ones, each run five times per approach: a launch page for a product; a three-page site for a local business, with a shared header and footer; a small app that lists the records of a datasource and has a form that adds one.

**Measured.**

- Time to the first visible change, to the first real section and to the complete home page (targets: 3 s, 10 s, 60 s), and the longest stretch during which nothing moves on screen.
- What the build looks like: flashes, jumps and broken layouts, judged on the recordings.
- Liquid while it is being written, four cases: an unfinished tag; a loop over a datasource that has no record yet; a shared part included before it exists; tracing any previewed element back to its page, shared part or record.
- htmx 4: the share of generated htmx attributes that are valid in htmx 4, with the cheat sheet in the agent's instructions and the compatibility extension off.
- Theme: daisyUI's variables pointed at the theme's, so that changing one theme value restyles daisyUI components and Tailwind utilities alike; and how the preview gets its stylesheet fast enough.
- Agent permissions ([ADR 0007](adr/0007-agent-has-a-shell-in-auto-mode-inside-the-os-sandbox.md)): the time auto mode adds per judged action; whether the app can refuse a blocked action without asking; whether the confinement gets in the way of normal work.
- Claude: the token-by-token stream of file content, under subscription sign-in and under an API key.

**Judged by eye.** Matt watches the recordings and decides whether the build looks fast and alive enough. The three delays are reported for every run but stay targets, not pass conditions.

**Left out.** Codex. It is measured later by a separate trial, before any decision to add it.

**Decides.** How the agent's output reaches the preview (new ADR); Liquid confirmed or reopened ([ADR 0003](adr/0003-portable-declarative-runtime.md)); htmx 4 confirmed, or the compatibility extension kept on ([ADR 0004](adr/0004-projects-are-written-for-htmx-4.md)); the status of ADR 0007.

**Outcome.** Decided on 2026-11-10 from the [report](../spikes/live-generation/REPORT.md).

- Matt chose approach A on the recordings ([ADR 0009](adr/0009-the-preview-follows-what-the-agent-is-writing.md)). B and C are not built.
- Liquid is confirmed: the four cases work. htmx 4 is confirmed with the compatibility extension off (135 valid attributes of 135, 20 working forms of 20, form attributes only). The theme's variables restyle daisyUI components and Tailwind utilities alike ([ADR 0006](adr/0006-tailwind-and-daisyui-themed-through-css-variables.md)).
- ADR 0007 is confirmed on macOS: the confinement holds, a blocked action is refused without asking, and auto mode adds about one second per shell command. It is kept. Tools under the maker's home folder are out of the agent's reach, so its shell gets the Node embedded in the app.
- The spike also showed that the agent inherits the maker's own Claude connectors and memory unless told otherwise, which led to the isolated agent, skills and connectors of [ADR 0010](adr/0010-skills-and-connectors-extend-the-agent.md).
- Unanswered: the stream and the cost of auto mode under an API key (no key was available); the confinement on Windows and Linux.

## Spike 2: desktop shell

**Question.** Electron or Electrobun? Electron wins a tie.

**What gets built.** The same tiny app twice: a window in three columns whose preview shows a canned page, delivered piece by piece by a local server. The canned page stands in for spike 1's output, so the two spikes do not wait for each other.

**Seven criteria**, each scored pass, pass with a workaround, or fail.

1. The canned page appears progressively in the preview.
2. An editing script is injected into the preview, isolated from the page's own scripts: it highlights the element under the pointer, reports a click to the app and lets a text be edited in place.
3. A block dragged from the app's sidebar is dropped at a chosen place in the preview.
4. The preview is captured as an image.
5. The same page renders identically on macOS, Windows and Linux. Only macOS is tested for real; Windows and Linux are judged from documentation, and any doubt counts against Electrobun.
6. The agent completes a turn from inside the packaged app. Signing and notarisation are left out of the spike: whether the agent still works in a signed and notarised app is checked on the first signed build.
7. Auto-update, download size, memory at rest, start-up time, and comfort of development.

**Decides.** The desktop shell (new ADR).

**Outcome.** Electron ([ADR 0008](adr/0008-electron-is-the-desktop-shell.md)), decided on 2026-11-10 from the [report](../spikes/desktop-shell/REPORT.md). A follow-up the same day compared the preview as a native view and as an iframe, with a real pointer: the native view is kept, since a block cannot be dragged natively into an iframe of another origin.

## What the spikes need from Matt

- Claude signed in on the machine (it is).
- His eye on the recordings of spike 1.
