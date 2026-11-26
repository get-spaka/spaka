# The spikes

Each spike was throwaway code, run apart from the app, that ended with a report giving the measurements against the criteria below and the decisions it settled, which were then written into the ADRs. A spike stopped as soon as its questions were answered; anything it could not answer is reported as unanswered. The code is gone (Q400-Q403); what each spike measured and what we learned from it is kept here, one page each:

- [Spike 1: live generation](live-generation.md)
- [Spike 2: desktop shell](desktop-shell.md)
- [Spike 3: other agents and harnesses](harnesses.md)
- [Spike 4: agents over ACP](acp.md), the code kept on a branch of its own
- [The agent's look at pages](looks.md), a probe of 2026-11-15
- [The agent's questions](questions.md), a probe for the agent asking the maker

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
- Agent permissions ([ADR 0007](../adr/0007-agent-has-a-shell-in-auto-mode-inside-the-os-sandbox.md)): the time auto mode adds per judged action; whether the app can refuse a blocked action without asking; whether the confinement gets in the way of normal work.
- Claude: the token-by-token stream of file content, under subscription sign-in and under an API key.

**Judged by eye.** Matt watches the recordings and decides whether the build looks fast and alive enough. The three delays are reported for every run but stay targets, not pass conditions.

**Left out.** Codex. It is measured later by a separate trial, before any decision to add it.

**Decides.** How the agent's output reaches the preview (new ADR); Liquid confirmed or reopened ([ADR 0003](../adr/0003-portable-declarative-runtime.md)); htmx 4 confirmed, or the compatibility extension kept on ([ADR 0004](../adr/0004-projects-are-written-for-htmx-4.md)); the status of ADR 0007.

**Outcome.** Decided on 2026-11-10 from the [report](live-generation.md).

- Matt chose approach A on the recordings ([ADR 0009](../adr/0009-the-preview-follows-what-the-agent-is-writing.md)). B and C are not built.
- Liquid is confirmed: the four cases work. htmx 4 is confirmed with the compatibility extension off (135 valid attributes of 135, 20 working forms of 20, form attributes only). The theme's variables restyle daisyUI components and Tailwind utilities alike ([ADR 0006](../adr/0006-tailwind-and-daisyui-themed-through-css-variables.md)).
- ADR 0007 is confirmed on macOS: the confinement holds, a blocked action is refused without asking, and auto mode adds about one second per shell command. It is kept. Tools under the maker's home folder are out of the agent's reach, so its shell gets the Node embedded in the app.
- The spike also showed that the agent inherits the maker's own Claude connectors and memory unless told otherwise, which led to the isolated agent, skills and connectors of [ADR 0010](../adr/0010-skills-and-connectors-extend-the-agent.md).
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

**Outcome.** Electron ([ADR 0008](../adr/0008-electron-is-the-desktop-shell.md)), decided on 2026-11-10 from the [report](desktop-shell.md). A follow-up the same day compared the preview as a native view and as an iframe, with a real pointer: the native view is kept, since a block cannot be dragged natively into an iframe of another origin.

## Spike 3: other agents and harnesses

Asked by Matt on 2026-11-14, after the templates; it reopens "Codex only after a speed trial" and "Gemini is out" (see [the decisions](../v2.0-decisions.md), Agent).

**Question.** Can a maker build a site in Spaka with another agent than Claude's, as well as with Claude: OpenAI's Codex, Google's Gemini CLI, or an open harness that drives many models (Pi, opencode)? And what must Spaka's agent layer become to hold several?

**For each, studied first, then tried on this Mac.**

- **Sign-in**: with the maker's own subscription (ChatGPT, Google, …) and with an API key (an AI Studio key for Gemini, Matt notes), whether a third-party app may start it that way, and where it keeps its sign-in (never in the maker's own folders, as for Claude: ADR 0010).
- **Driven by an app**: a headless mode, an SDK or a server; the events it streams.
- **The live preview** (ADR 0009): whether a file's content arrives while it is being written, token by token, or only once written; what the preview would show in each case.
- **Confinement** (ADR 0007): its own sandbox and auto mode, or Spaka's around it; a refused action answered without asking the maker.
- **What Spaka gives the agent**: its tools (an MCP server), skills (Agent Skills), instructions, hooks at the end of a turn and after a tool (the Stop and PostToolUse hooks Spaka uses).
- **Speed**: the launch page request of spike 1, run three times: time to the first file content, to the complete home page, and the longest stretch with nothing moving.
- **Quality**: the page it writes, judged against Claude's on the same request (Liquid, htmx 4, the theme), and the cost.
- **Shipping it**: its licence, whether its binary can be shipped inside the app or must be downloaded, its size.

**What gets built.** Throwaway code: each harness installed locally, a script that drives it on the same request in its own isolated configuration and records its stream with timestamps, and a probe per question above.

**Decides.** Which agents Spaka offers, in what order, and the shape of the agent layer (a new ADR, or ADR 0002 reopened).

**Outcome.** Run on 2026-11-14, see the [report](harnesses.md).
- **Ready-made harnesses:** only Pi with an OpenAI model on an API key keeps the live preview, at about twice Claude's time to a complete page. Codex (code mode), opencode 2 and every Gemini route send a file only once it is written.
- **A harness of Spaka's own on Pi's libraries** (second round, the same day, on Matt's question) gives every model the live preview when the model writes its files in its reply's text. Gemini 4 Hydrogen this way, with its thinking low, matches Claude's pace (complete at 22.5 s against 23.6 s) for $0.05 a page.
- **Google's own agents over ACP, on an AI Studio key** (third round, the same day): with files in the text, Antigravity at effort low completes the page at 20.1 s for $0.065, the fastest of the spike, and Gemini CLI at 41.7 s. Antigravity has no licence, so Spaka may not ship it, and it updates itself.
- **Subscriptions:** a Claude subscription stays on the Agent SDK. ChatGPT Plus works through Sign in with ChatGPT in Pi (tried with Matt's plan, but slow: Sol complete at 92 s), and an app like Spaka needs OpenAI's acceptance. Google offers apps no subscription route; an AI Studio key may drive both Google agents. Otherwise, the maker's API key.

Matt's decision (Q268): two adapters behind one interface, Claude through the Agent SDK and a harness of Spaka's own on Pi's libraries ([ADR 0012](../adr/0012-a-second-agent-layer-of-spakas-own-on-pi.md)).

## Spike 4: agents over ACP

Asked by Matt on 2026-11-26, after reading why Spaka does not use the ACP registry: spike 3 and ADR 0012 said that ACP carries a tool call only whole, which the protocol does not say.

**Question.** How would an agent of the ACP registry work inside Spaka: does the live preview follow it, how is it installed, signed in, confined, given Spaka's instructions and tools?

**What gets built** (Q485-Q488). An adapter inside the app, on the branch `spike/acp-adapter`, not merged: an `AcpSession` behind the same interface as Claude's and Pi's, with Claude, Pi, Codex and Antigravity installed from pinned registry entries or found on the maker's PATH, run under Spaka's sandbox, and measured on spike 1's first request as `measure.e2e.ts` measures Claude.

**Outcome.** Run on 2026-11-26, see the [report](acp.md). ACP carries a file while it is written when the agent's adapter sends it: Pi over ACP, its adapter patched, matches Pi in Spaka's own harness; Codex, Antigravity and Claude send each file whole, Claude's preview no longer following it as through Spaka's own adapter. ADR 0012 and spike 3's report are corrected. Matt then asked for the best way per provider, benchmarked the same day: Spaka's Agent SDK adapter for Claude, the Pi harness (or Pi over ACP, patched) for OpenAI, the Pi harness on Vertex AI for Gemini, the only way a Gemini call streams; Claude's ACP adapter and Codex can be patched to stream, Antigravity could not. Whether to build an ACP adapter stays open.

## What the spikes need from Matt

- Claude signed in on the machine (it is).
- His eye on the recordings of spike 1.
