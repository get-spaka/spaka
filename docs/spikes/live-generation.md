# Spike 1: live generation

Ran on 2026-11-09; Matt chose on the recordings on 2026-11-10.

## What we learned

- Following what the agent writes while it streams (approach A) keeps the page moving from the start: a first visible change after a median of 1.9 s (within 3 s in 15 runs of 15), a complete home page after a median of 21.4 s, and never more than 2.1 s with nothing moving.
- The agent writes all its files in one response (29 of the 30 agent runs), so the files reach the disk only when that response ends, 16.2 to 39.4 s after the request. Reloading when a file is complete (approach C) shows a blank page for 16.4 to 39.6 s, then everything at once.
- Having the agent show the page by instructions, then write the files (approach B), costs about 1.7 times the output tokens, leaves 14.5 to 33 s with nothing moving while the files are written, and in 4 runs of 15 the page rendered from the files was not quite the page that had been shown.
- An unfinished Liquid file can be cut at its last complete point, closed, rendered and morphed on every chunk: 4,661 renders needed a cut or closers, none failed, and 1,353 of 1,353 elements could be traced back to their source file.
- With a cheat sheet in its instructions and the compatibility extension off, the agent writes valid htmx 4: 135 attributes of 135, and 20 forms of 20 work.
- Pointing daisyUI's variables at the theme's restyles daisyUI components and Tailwind utilities alike, and `@tailwindcss/browser` in the page keeps up: no unstyled frame in 8,236 checked.
- The agent's confinement (ADR 0007) holds on macOS and did not get in the way of the 30 builds; auto mode adds about 1 s per shell command and nothing for file writes inside the project; tools installed under the home folder, `git` included, are out of reach.
- Unless told otherwise, the agent inherits the maker's claude.ai connectors (215,000 tokens of tool definitions on a second request) and Claude Code auto-memory, and thinking before the first write is what breaks the 3 s target.

Decided: approach A ([ADR 0009](../adr/0009-the-preview-follows-what-the-agent-is-writing.md)); Liquid, htmx 4 without the compatibility extension and the theme's aliasing confirmed ([ADR 0003](../adr/0003-portable-declarative-runtime.md), [ADR 0004](../adr/0004-projects-are-written-for-htmx-4.md), [ADR 0006](../adr/0006-tailwind-and-daisyui-themed-through-css-variables.md)); [ADR 0007](../adr/0007-agent-has-a-shell-in-auto-mode-inside-the-os-sandbox.md) confirmed on macOS; the isolation findings led to [ADR 0010](../adr/0010-skills-and-connectors-extend-the-agent.md).

## How it ran

2026-11-09. Framing: [README.md](README.md). Machine: Matt's Mac, macOS 27.0.1. Agent: `@anthropic-ai/claude-agent-sdk` 0.3.321 and its bundled binary 2.1.321, signed in with the Claude subscription already on the machine (`apiKeySource: "none"`), model `claude-sonnet-5-5`, adaptive thinking (Matt's choice for the matrix).

## The answer

**Yes: a maker can watch a page being built, fast and alive, while the agent writes Liquid, htmx 4, Tailwind and daisyUI into plain files. The mechanism that does it is approach A, files plus live stream.**

| | A. Files plus live stream | B. Instructions | C. Files then reload |
|---|---|---|---|
| First visible change within 3 s | 15 of 15 runs | 10 of 15 | 0 of 15 |
| First real section started within 10 s | 15 of 15 | 11 of 15 | 0 of 15 |
| First real section complete within 10 s | 6 of 15 | 11 of 15 | 0 of 15 |
| Complete home page within 60 s | 15 of 15 | 15 of 15 shown, 14 of 15 real | 15 of 15 |
| Median time to a complete home page | 21.4 s | 17.3 s shown, 45.2 s real | 27.4 s |
| Longest stretch with nothing moving, median | 1.9 s | 1.7 s, then 25.1 s while the files are written | 27.4 s |
| Output tokens per run, median | 4,762 | 8,423 | 4,762 |

- **A** shows the theme at 1.9 s, the first text at 5.7 s, and never stands still for more than 2.1 s. Its home page is complete at 21.4 s (median).
- **B** looks like A while the agent shows the page, then nothing moves for 14.5 to 33 s while the agent writes the same page again as files. It costs about 1.7 times the tokens, and in 4 runs of 15 the page rendered from the files was not quite the page that had been shown.
- **C** shows nothing for 16 to 40 s and then the whole page at once, because the agent writes all its files in one response and the files reach the disk when that response ends.

**Judged by eye.** Matt watched the first A recording on 2026-11-09 and said to go on. After the matrix he watched the three approaches side by side (a launch page, a three-page site and a small app, each with A, B and C next to each other, all starting when the request is sent) and on 2026-11-10 chose A, files plus live stream, as it is.

## What was built

No desktop shell. A script drives one run: it starts the preview server on the run's own project folder, opens the preview in a headless Chromium that records a video, sends the request to the agent through the Agent SDK, and feeds the agent's stream to the approach under test. A pill at the bottom left of every recording shows the time since the request was sent, what the agent is doing, and the three delays as they are reached. After the build each recording scrolls through the result and then fills and submits the page's form, if it has one.

- **The stand-in runtime**: LiquidJS over the project's files, with the conventions the spike needed (a `theme.css`, pages whose address follows from their file, shared parts, datasources in `data/<name>.json`, a generated `POST /data/<name>` that validates and answers with a fragment). Files that are still being written live in an overlay that wins over the disk.
- **The preview server**: serves pages through the runtime to an ordinary browser, adds htmx 4, daisyUI's stylesheet, `@tailwindcss/browser` and the theme bridge, and pushes updates over server-sent events.
- **The page's own script**: morphs the page with idiomorph, follows what is being written, and logs its own timestamps.
- **The agent's instructions**: the project conventions, how to work so that the build is pleasant to watch (theme first, then the home page, then what it uses; one `Write` per file), the styling vocabulary, and the htmx 4 cheat sheet.

The three approaches as implemented:

- **A, files plus live stream.** The input of every `Write` and `Edit` call is read while it streams. The unfinished file goes into the overlay, is repaired, rendered by the runtime and morphed into the page, at most every 60 ms. The preview follows the agent from page to page. A shared part written before any page exists is shown on its own.
- **B, instructions.** The agent has two extra tools, `theme` and `section`, and is told to show the home page with them first (plain HTML, no Liquid), then to write the project's files. The tools' input is read while it streams, through the same morphing as A. The files are not shown while they are written; when the turn ends the preview switches to the page the files render.
- **C, files then reload.** Nothing is read from the stream. When files reach the disk the page reloads, once for files that land together.

The requests, worded as a maker's first message:

- launch: "A launch page for Lumen, a pocket-sized reading light for people who read at night. It launches next month and I want visitors to join the waitlist."
- business: "A website for Chez Margot, a neighbourhood bakery in Lyon. Three pages: a home page, a page presenting our breads and pastries with their prices, and a contact page with the address and opening hours. Same header and footer on every page."
- app: "A small app for my book club: it lists the books we have read (title, author, who suggested it, rating out of 5) and has a form to add a new one."

## Measurements

How to read them:

- Times are in seconds since the request was sent, cold: the agent process is spawned at that moment.
- **First visible change** is the first change of the page itself. In A and B it is the theme arriving: the page takes its background color. **First text** is the first text on the page.
- **First section started** is the first top-level block with a heading, 60 characters of text and 120 px of height; **complete** is when the stream has moved on to the next block.
- **Home complete**: the last character of the home page is on screen and nothing it needs is missing (shared parts, datasources). For B, "shown" is the end of the instructions and "from files" is the moment the page is rendered from the project's files.
- **Longest stretch still** runs from the request to the complete home page and includes the wait before the first change. It is measured from DOM mutations, not from pixels: a mutation that changes nothing visible counts as movement, scrolling does not.
- The delays are targets (3 s, 10 s, 60 s), not pass conditions.

### Medians (min–max), seconds

| Approach | Request | Runs | First visible change (3 s) | First text | First section started (10 s) | First section complete | Home complete (60 s) | Agent done | Longest stretch still, request to home complete | Output tokens |
|---|---|---|---|---|---|---|---|---|---|---|
| A | launch | 5 | 1.9 (1.7–2.1) | 5.9 (5.6–6.3) | 6.9 (6.7–8) | 11.2 (9.1–11.5) | 23.6 (21.8–27) | 29.3 (26.6–31.9) | 1.9 (1.7–2.1) | 4762 (4294–5165) |
| A | business | 5 | 1.9 (1.8–2) | 5.1 (4.9–5.6) | 8.8 (8.5–9.5) | 10.8 (10.1–10.9) | 21.4 (19.6–21.8) | 38.3 (35.8–41.2) | 1.9 (1.8–2) | 6510 (6227–7129) |
| A | app | 5 | 1.8 (1.7–2) | 5.7 (5.5–5.9) | 6.2 (6.1–9.1) | 6.9 (6.6–11.4) | 15 (14.7–15.6) | 18.3 (17.6–19.1) | 1.8 (1.7–2) | 3112 (2993–3233) |
| A | all | 15 | 1.9 (1.7–2.1) | 5.7 (4.9–6.3) | 7.6 (6.1–9.5) | 10.2 (6.6–11.5) | 21.4 (14.7–27) | 29.3 (17.6–41.2) | 1.9 (1.7–2.1) | 4762 (2993–7129) |
| B | launch | 5 | 8.1 (1.7–10) | 10.6 (4.1–12.6) | 12.6 (5.9–14.3) | 16.6 (8.9–17.2) | 31.1 (23.3–34.9) | 56.2 (47.5–64.2) | 8.1 (1.7–10) | 10208 (8955–11766) |
| B | business | 5 | 1.7 (1.5–2) | 4.3 (3.8–4.8) | 6.2 (5.4–6.8) | 7.9 (6.9–8.9) | 17.3 (16.4–20.4) | 45.2 (43.5–53.4) | 1.7 (1.5–2) | 8423 (8197–9809) |
| B | app | 5 | 1.6 (1.4–3.2) | 4.1 (4–6.1) | 5.2 (4.7–7.5) | 5.9 (5.3–8.8) | 12.2 (8–15.6) | 27.4 (22.5–32.3) | 1.6 (1.4–3.2) | 5142 (4220–5980) |
| B | all | 15 | 1.7 (1.4–10) | 4.4 (3.8–12.6) | 6.2 (4.7–14.3) | 8 (5.3–17.2) | 17.3 (8–34.9) | 45.2 (22.5–64.2) | 1.7 (1.4–10) | 8423 (4220–11766) |
| C | launch | 5 | 27.4 (25–30.3) | 27.4 (25–30.3) | 27.4 (25–30.3) | 27.4 (25–30.3) | 27.4 (25–30.3) | 29.3 (26.6–31.9) | 27.4 (25–30.3) | 4762 (4294–5165) |
| C | business | 5 | 36.6 (34.3–39.6) | 36.6 (34.3–39.6) | 36.6 (34.3–39.6) | 36.6 (34.3–39.6) | 36.6 (34.3–39.6) | 38.3 (35.9–41.2) | 36.6 (34.3–39.6) | 6510 (6227–7129) |
| C | app | 5 | 17 (16.4–17.7) | 17 (16.4–17.7) | 17 (16.5–17.7) | 17 (16.5–17.7) | 17 (16.5–17.7) | 18.3 (17.6–19.1) | 17 (16.4–17.7) | 3112 (2993–3233) |
| C | all | 15 | 27.4 (16.4–39.6) | 27.4 (16.4–39.6) | 27.4 (16.5–39.6) | 27.4 (16.5–39.6) | 27.4 (16.5–39.6) | 29.3 (17.6–41.2) | 27.4 (16.4–39.6) | 4762 (2993–7129) |

### Within the targets

| Approach | Runs | First change ≤ 3 s | First section started ≤ 10 s | First section complete ≤ 10 s | Home complete ≤ 60 s |
|---|---|---|---|---|---|
| A | 15 | 15 of 15 | 15 of 15 | 6 of 15 | 15 of 15 |
| B | 15 | 10 of 15 | 11 of 15 | 11 of 15 | 15 of 15 |
| C | 15 | 0 of 15 | 0 of 15 | 0 of 15 | 15 of 15 |

### Approach A: every run

| Request | Run | Thinking tokens | First token | First visible change | First text | First section (started / complete) | Home complete | Agent done | Longest stretch still, request to home complete | Output tokens |
|---|---|---|---|---|---|---|---|---|---|---|
| launch | 1 | 0 | 1.1 | 2 | 6.1 | 7.6 / 11.2 | 21.8 | 27 | 2 | 4561 |
| launch | 2 | 0 | 0.9 | 1.7 | 5.6 | 6.9 / 9.3 | 23.6 | 29.3 | 1.7 | 4762 |
| launch | 3 | 0 | 1 | 1.9 | 5.9 | 6.9 / 11.5 | 25.1 | 30.9 | 1.9 | 5018 |
| launch | 4 | 0 | 0.9 | 1.9 | 5.7 | 6.7 / 9.1 | 21.8 | 26.6 | 1.9 | 4294 |
| launch | 5 | 0 | 1.2 | 2.1 | 6.3 | 8 / 11.5 | 27 | 31.9 | 2.1 | 5165 |
| business | 1 | 0 | 1.2 | 2 | 5.1 | 8.8 / 10.8 | 21.6 | 41.2 | 2 | 7129 |
| business | 2 | 0 | 1 | 1.9 | 5.1 | 9 / 10.8 | 21.8 | 39.2 | 1.9 | 6889 |
| business | 3 | 0 | 1 | 1.8 | 5 | 8.7 / 10.2 | 21.4 | 37.7 | 1.8 | 6372 |
| business | 4 | 0 | 1 | 1.8 | 4.9 | 8.5 / 10.1 | 19.6 | 35.8 | 1.8 | 6227 |
| business | 5 | 0 | 1 | 2 | 5.6 | 9.5 / 10.9 | 21.3 | 38.3 | 2 | 6510 |
| app | 1 | 0 | 1.1 | 2 | 5.9 | 6.3 / 6.9 | 15 | 18.3 | 2 | 3112 |
| app | 2 | 0 | 1 | 1.8 | 5.7 | 6.1 / 6.8 | 15 | 18.3 | 1.8 | 3137 |
| app | 3 | 0 | 1.2 | 1.9 | 5.8 | 6.1 / 6.6 | 14.7 | 18.3 | 1.9 | 3052 |
| app | 4 | 0 | 1 | 1.8 | 5.7 | 6.2 / 7.3 | 15.6 | 19.1 | 1.8 | 3233 |
| app | 5 | 0 | 0.9 | 1.7 | 5.5 | 9.1 / 11.4 | 14.7 | 17.6 | 1.7 | 2993 |

### Approach B: every run

| Request | Run | Thinking tokens | First token | First visible change | First text | First section (started / complete) | Home complete (shown / from files) | Agent done | Longest stretch still, request to home complete | Output tokens |
|---|---|---|---|---|---|---|---|---|---|---|
| launch | 1 | 881 | 1.2 | 10 | 12.6 | 14.3 / 17.2 | 31.1 / 56.1 | 56 | 10 | 9670 |
| launch | 2 | 0 | 1 | 1.7 | 4.1 | 5.9 / 8.9 | 23.3 / 47.5 | 47.5 | 1.7 | 8955 |
| launch | 3 | 735 | 0.9 | 8.1 | 10.6 | 12.6 / 16.6 | 31.1 / 56.2 | 56.2 | 8.1 | 10208 |
| launch | 4 | 584 | 0.9 | 6.7 | 9.6 | 11.7 / 14 | 34.9 / 64.2 | 64.2 | 6.7 | 11766 |
| launch | 5 | 831 | 1 | 9.3 | 11.8 | 13.8 / 17.1 | 33.2 / 59.9 | 59.8 | 9.3 | 10877 |
| business | 1 | 0 | 1 | 1.7 | 4.6 | 6.2 / 7.9 | 16.4 / 43.6 | 43.5 | 1.7 | 8197 |
| business | 2 | 0 | 0.8 | 1.5 | 3.8 | 5.4 / 6.9 | 16.9 / 44.2 | 44.2 | 1.5 | 8359 |
| business | 3 | 0 | 1.3 | 2 | 4.8 | 6.8 / 8.9 | 20.4 / 53.4 | 53.4 | 2 | 9809 |
| business | 4 | 0 | 1 | 1.7 | 4.3 | 6.2 / 8 | 17.9 / 47.3 | 47.3 | 1.7 | 8650 |
| business | 5 | 0 | 1.1 | 1.7 | 4.2 | 6 / 7.8 | 17.3 / 45.2 | 45.2 | 1.7 | 8423 |
| app | 1 | 0 | 0.9 | 1.6 | 4 | 4.7 / 5.3 | 8 / 22.5 | 22.5 | 1.6 | 4220 |
| app | 2 | 0 | 0.9 | 1.5 | 4 | 5.2 / 5.9 | 11.8 / 27 | 27 | 1.5 | 5142 |
| app | 3 | 214 | 0.9 | 3.2 | 6.1 | 7.5 / 8.8 | 15.6 / 32.3 | 32.3 | 3.2 | 5980 |
| app | 4 | 0 | 1 | 1.7 | 4.4 | 5.5 / 6.2 | 12.2 / 27.5 | 27.4 | 1.7 | 5127 |
| app | 5 | 0 | 1 | 1.4 | 4.1 | 5.2 / 5.8 | 12.4 / 28.1 | 28.1 | 1.4 | 5396 |

### Approach B: shown by instructions, then rendered from the files

| Request | Run | Sections shown | Characters of instructions | Page shown | Files ready | Nothing moves in between | Same text after the switch | Elements (shown → files) | Page height (shown → files) |
|---|---|---|---|---|---|---|---|---|---|
| launch | 1 | 8 | 7670 | 31.1 | 56.1 | 25 | yes | 109 → 113 | 2852 → 2844 |
| launch | 2 | 8 | 7919 | 23.3 | 47.5 | 24.2 | yes | 107 → 108 | 3068 → 3072 |
| launch | 3 | 7 | 8996 | 31.1 | 56.2 | 25.1 | yes | 104 → 104 | 2777 → 2777 |
| launch | 4 | 8 | 10751 | 34.9 | 64.2 | 29.3 | yes | 162 → 163 | 3563 → 3563 |
| launch | 5 | 7 | 9506 | 33.2 | 59.9 | 26.7 | yes | 119 → 119 | 2877 → 2877 |
| business | 1 | 7 | 5081 | 16.4 | 43.6 | 27.2 | yes | 70 → 70 | 2000 → 2000 |
| business | 2 | 7 | 5365 | 16.9 | 44.2 | 27.3 | no (623 of 1265 characters in common at the start) | 85 → 85 | 2073 → 2073 |
| business | 3 | 7 | 6226 | 20.4 | 53.4 | 33 | no (631 of 1402 characters in common at the start) | 96 → 97 | 2171 → 2191 |
| business | 4 | 7 | 5363 | 17.9 | 47.3 | 29.4 | yes | 80 → 81 | 2012 → 2012 |
| business | 5 | 7 | 5447 | 17.3 | 45.2 | 27.9 | no (596 of 1094 characters in common at the start) | 90 → 91 | 1963 → 1963 |
| app | 1 | 1 | 2511 | 8 | 22.5 | 14.5 | no (243 of 307 characters in common at the start) | 30 → 54 | 800 → 970 |
| app | 2 | 5 | 3932 | 11.8 | 27 | 15.2 | yes | 58 → 59 | 1682 → 1690 |
| app | 3 | 5 | 4756 | 15.6 | 32.3 | 16.7 | yes | 75 → 76 | 1872 → 1880 |
| app | 4 | 5 | 3890 | 12.2 | 27.5 | 15.3 | yes | 57 → 58 | 1266 → 1282 |
| app | 5 | 5 | 4296 | 12.4 | 28.1 | 15.7 | yes | 64 → 65 | 1418 → 1426 |

### Approach C: every run

| Request | Run | Thinking tokens | First token | First visible change | First text | First section (started / complete) | Home complete | Agent done | Longest stretch still, request to home complete | Output tokens |
|---|---|---|---|---|---|---|---|---|---|---|
| launch | 1 | 0 | 1.1 | 25.3 | 25.3 | 25.3 / 25.3 | 25.3 | 27 | 25.3 | 4561 |
| launch | 2 | 0 | 0.9 | 27.4 | 27.4 | 27.4 / 27.4 | 27.4 | 29.3 | 27.4 | 4762 |
| launch | 3 | 0 | 1 | 28.5 | 28.5 | 28.5 / 28.5 | 28.5 | 30.9 | 28.5 | 5018 |
| launch | 4 | 0 | 0.9 | 25 | 25 | 25 / 25 | 25 | 26.6 | 25 | 4294 |
| launch | 5 | 0 | 1.2 | 30.3 | 30.3 | 30.3 / 30.3 | 30.3 | 31.9 | 30.3 | 5165 |
| business | 1 | 0 | 1.2 | 39.6 | 39.6 | 39.6 / 39.6 | 39.6 | 41.2 | 39.6 | 7129 |
| business | 2 | 0 | 1 | 37.3 | 37.3 | 37.3 / 37.3 | 37.3 | 39.2 | 37.3 | 6889 |
| business | 3 | 0 | 1 | 35.7 | 35.7 | 35.7 / 35.7 | 35.7 | 37.7 | 35.7 | 6372 |
| business | 4 | 0 | 1 | 34.3 | 34.3 | 34.3 / 34.3 | 34.3 | 35.9 | 34.3 | 6227 |
| business | 5 | 0 | 1 | 36.6 | 36.6 | 36.6 / 36.6 | 36.6 | 38.3 | 36.6 | 6510 |
| app | 1 | 0 | 1.1 | 17 | 17 | 17 / 17 | 17 | 18.3 | 17 | 3112 |
| app | 2 | 0 | 1 | 17 | 17 | 17 / 17 | 17 | 18.3 | 17 | 3137 |
| app | 3 | 0 | 1.2 | 16.6 | 16.6 | 16.6 / 16.6 | 16.6 | 18.3 | 16.6 | 3052 |
| app | 4 | 0 | 1 | 17.7 | 17.7 | 17.7 / 17.7 | 17.7 | 19.1 | 17.7 | 3233 |
| app | 5 | 0 | 0.9 | 16.4 | 16.4 | 16.5 / 16.5 | 16.5 | 17.6 | 16.4 | 2993 |

The C runs are the fifteen A runs replayed: same events, same instants, delivered by reload (see "Departures from the framing").

### Why the three differ

- **The agent writes all its files in one response.** In 29 of the 30 agent runs every `Write` call sat in a single response, one after the other with no round trip between files (the thirtieth used two). The tool results all arrive when that response ends, which is also when the files reach the disk: 16.2 to 39.4 s after the request in the A runs. A does not care, since it reads the stream. C has nothing to show before that moment.
- **With adaptive thinking the model decides whether to think first.** In the 15 A runs it never did. In 5 of the 15 B runs it did (214 to 881 thinking tokens), which put 3.2 to 10 s before the first change. Before the matrix, with earlier and looser instructions, one A run thought for 6.2 s.
- **Speed of the stream**: file content arrived at 347 to 381 characters per second in the A runs (Sonnet 5.5). A home page of 3 to 9 KB therefore takes 8 to 25 s to write, whatever the approach.

## What the build looks like

Seen on the recordings and their frame sheets. Matt's eye decides; these are the things to look for.

**A**

- From 1.9 s to about 5.7 s only the background color has changed: `theme.css` takes about 2.4 s to write and the page's `<head>` about 1 s more.
- Then the page grows where the agent writes: text appears a few characters at a time, new elements fade in, and the view scrolls to follow.
- No frame was painted before its styles were ready (0 of 4,730 checked), no flash of unstyled content, no console error.
- A loop over a datasource that does not exist yet shows three stand-in rows; when the data file starts to arrive the list is empty for a moment, then the real records appear one by one. That empty moment is a jump (small-app recordings, around 13 s). Keeping the stand-ins until the first record is complete would remove it.
- When the agent moves on to the next page of a site the preview goes with it: the shared header stays, the rest is replaced at once, and the new page starts nearly empty (three-page recordings, around 22 s and 33 s).
- In the three-page site the header is shown on its own while it is written, before the home page exists.

**B**

- While the agent shows the page it looks like A, with the first text 1 to 1.5 s earlier (no `<head>` to write) when the model does not think first.
- Then the page looks finished and nothing moves for 14.5 to 33 s (median 25.1 s) while the files are written.
- When the files take over, the text of the page was identical in 11 runs of 15. In the other 4 it changed where the page lists records, because the data written to the files was not what had been shown: in 3 business runs prices lost a digit (4.20 € became 4.2 €), descriptions were reworded or products came in another order; in 1 app run the agent had shown the whole app as a single block with two books, and the files listed more (30 elements became 54, the page grew from 800 to 970 px).
- Only the home page is ever seen being built; the other pages of a site exist only as files.
- Nothing shown by instructions can be traced back to a file or a record until the files exist.

**C**

- A blank page for 16.4 to 39.6 s, then everything at once.

## Claude: the token-by-token stream of file content

- **Confirmed under subscription sign-in.** With `includePartialMessages: true` the SDK emits `stream_event` messages; `content_block_delta` events of type `input_json_delta` carry `partial_json`, the tool input as it is generated. For `Write` the JSON is `{"file_path": "...", "content": "...`, path first, so the file is known before its first character. It can be decoded as it grows.
- Granularity: 12 to 15 characters per delta, one delta every 21 to 55 ms on average, longest gap inside a file 90 to 455 ms.
- Speed of file content on the same 60-line page, one sample per model: `claude-haiku-5-5` 596 characters/s, `claude-sonnet-5-5` 423, `claude-fable-5-2` 262, `claude-opus-5-5` 259.
- Start-up: init message 0.4 s after `query()`, first token at 0.9 to 1.2 s, first character of a file at about 1.7 s when the model does not think first.
- **Under an API key: unanswered.** No `ANTHROPIC_API_KEY` was in the environment.

## Liquid while it is being written

Mechanism: on every chunk the unfinished file is cut at the last complete point (half a `{{ }}` or `{% %}`, half an HTML tag, a half entity, an unfinished `<script>` or `<style>` are held back), then what is still open is closed (HTML elements opened inside an open Liquid block first, then the block), LiquidJS renders it, and idiomorph morphs the page. A unit test renders every prefix, character by character, of a template that mixes loops, conditions, includes, comments, raw blocks and scripts: none fails.

Counted over the 15 runs of approach A:

| Case | Outcome | Seen in the matrix |
|---|---|---|
| An unfinished tag | **Works.** | 4,661 renders needed a cut or closers, 119 of them for an unfinished Liquid tag or output. No render error. |
| A loop over a datasource that has no record yet | **Works**, with one jump to remove. A datasource that does not exist yet gets three stand-in records so the layout appears; an existing but empty one renders the page's own empty state; a data file still being written shows its complete records. | 489 renders with stand-in records, 337 renders of a data file still being written. |
| A shared part included before it exists | **Works**: it renders as nothing and appears when it is written. | 948 renders. |
| Tracing an element back to its page, shared part or record | **Works.** Before Liquid renders, every HTML start tag gets `data-spaka-src="file:line"`. Inside a loop it also gets `data-spaka-rec="datasource/id"`, and the record is handed down to shared parts and to fragments. | 1,353 of 1,353 elements carry their source, 273 their record. An element that arrives through an htmx swap keeps both: in a probe, the 20 elements of a row added by the form say `parts/book-row.liquid` and `books/6`. |

Rendering one chunk takes at most 13 ms on the server and 0.3 to 0.5 ms to morph in the page.

## htmx 4

Cheat sheet in the agent's instructions (drawn from the guidance shipped inside `htmx.org@4.0.1`), compatibility extension off, htmx 4.0.1.

| Approach | Request | htmx attributes valid | Forms that work | Elements traced to a source | Elements traced to a record | Unstyled frames | Console errors | Shell commands | Refused / asked |
|---|---|---|---|---|---|---|---|---|---|
| A | launch | 48 of 48 | 5 of 5 | 486 of 486 | 0 | 0 of 1666 | 0 | 0 | 0 / 0 |
| A | business | 0 of 0 | 0 of 0 | 472 of 472 | 50 | 0 of 2243 | 0 | 0 | 0 / 0 |
| A | app | 30 of 30 | 5 of 5 | 395 of 395 | 223 | 0 of 821 | 0 | 0 | 0 / 0 |
| A | all | 78 of 78 | 10 of 10 | 1353 of 1353 | 273 | 0 of 4730 | 0 | 0 | 0 / 0 |
| B | launch | 28 of 28 | 5 of 5 | 607 of 607 | 8 | 0 of 1748 | 0 | 0 | 0 / 0 |
| B | business | 0 of 0 | 0 of 0 | 410 of 410 | 127 | 0 of 1113 | 0 | 0 | 0 / 0 |
| B | app | 29 of 29 | 5 of 5 | 312 of 312 | 143 | 0 of 645 | 0 | 0 | 0 / 0 |
| B | all | 57 of 57 | 10 of 10 | 1329 of 1329 | 278 | 0 of 3506 | 0 | 0 | 0 / 0 |
| C | launch | 48 of 48 | 5 of 5 | 486 of 486 | 0 | 0 of 0 | 0 | 0 | 0 / 0 |
| C | business | 0 of 0 | 0 of 0 | 472 of 472 | 50 | 0 of 0 | 0 | 0 | 0 / 0 |
| C | app | 30 of 30 | 5 of 5 | 395 of 395 | 223 | 0 of 0 | 0 | 0 | 0 / 0 |
| C | all | 78 of 78 | 10 of 10 | 1353 of 1353 | 273 | 0 of 0 | 0 | 0 | 0 / 0 |

(The C rows are the A projects again, since C replays the A runs.)

- **Share of generated htmx attributes valid in htmx 4: 135 of 135** in the 30 agent runs (78 in A, 57 in B), checked against htmx 4's own attribute list, swap styles, trigger modifiers, event names, and the explicit-inheritance rule. The checker is tested against htmx 2 markup, which it flags.
- The agent wrote the htmx 4 forms the cheat sheet teaches, for instance in the small app: `hx-post="/data/books" hx-target="#book-list" hx-swap="afterbegin" hx-status:422="target:#form-errors" hx-disable="find button" hx-on::after:request="if (ctx.response.status < 400) { this.reset() … }"`.
- **Behavior: 20 forms of 20 work.** Each was filled and submitted in the recorded browser: the request went through htmx, the runtime answered 201 with the fragment, the record was added and the page updated without navigating.
- The three-page site carried no htmx: the agent wrote no form there. Attributes used overall: `hx-post`, `hx-target`, `hx-swap`, `hx-status`, `hx-disable`, `hx-on`. Nothing here exercised `hx-get`, triggers, boosting or inheritance.

## Theme and stylesheet

- **daisyUI's variables pointed at the theme's: works.** The theme file defines 15 `--theme-*` values; one small stylesheet points daisyUI's variables at them (`--color-primary: var(--theme-color-primary)`, `--radius-box: var(--theme-radius)` and so on), and the same names are given to Tailwind in an `@theme inline` block. Changing three values in `theme.css` changed all 13 probed properties: daisyUI button, badge, input and progress colors; Tailwind `bg-primary`, `text-primary`, `border-primary/50`, `from-primary`; the radii of daisyUI's card and button and of Tailwind's `rounded-box` and `rounded-field`; the heading font. The page restyled 24 ms after the file was written, without a reload.
- **How the preview gets its stylesheet:** daisyUI's prebuilt `daisyui.css` (1.14 MB, served locally in 18 ms) plus `@tailwindcss/browser` in the page, which rebuilds when the DOM changes. Cold load: the first Tailwind build starts 34 ms after navigation and takes 13.6 ms; first paint at 88 ms. During a build a rebuild takes 0.14 to 0.16 ms on average (at most 9.7 ms) and runs before the next frame: no unstyled frame in 8,236 checked (A and B).
- Not tried: a server-side Tailwind compile pushed with each chunk. The browser build left nothing to fix.

## Agent permissions (ADR 0007)

Configuration used: `permissionMode: "auto"`; `permissions.blockWritesOutsideWorkingDirectories` and `blockReadsOutsideWorkingDirectories`; the system temporary folder as an additional working directory; `sandbox` enabled with `failIfUnavailable`, `allowUnsandboxedCommands: false`, `filesystem.allowWrite` the temporary folder, `denyRead` `/Users` and `/Volumes`, `allowRead` the project, `network.allowedDomains: ["*"]`; `permissions.denyInsteadOfPrompting: true`. The file-tool limits need binary 2.1.314 or later: the SDK's own binary (2.1.321) has them, the `claude` on this machine's PATH (2.1.282) does not.

**Does the confinement hold, and does it get in the way?**

- It holds: a `Write` outside the project is refused in 10 ms, a `Read` outside in 6 ms, both without asking; a shell command writing or reading outside gets "Operation not permitted" from the sandbox; writes to the temporary folder work from both; the network is open (`curl https://example.com` answers 200).
- It did not get in the way of the 30 builds: none used a shell command, none was refused anything.
- Shell work with system tools works: `curl`, `python3`, `sed`, `tar`, `sips`, loops over files.
- **It gets in the way of tools installed under the home folder**, which cannot be read. Here `npm` (an asdf shim) fails with "Operation not permitted" and `node` is not found by `which`. `git` fails on `~/.gitconfig`; with `GIT_CONFIG_GLOBAL=/dev/null` it starts, but `git init` still fails because the sandbox always write-protects `.git/hooks`.

**The time auto mode adds per judged action.** Same six shell commands, same sandbox, with and without auto mode:

| | Mean per shell command | Range |
|---|---|---|
| Auto mode (the ADR's configuration) | 1,085 ms | 685 to 1,565 ms |
| No classifier (`dontAsk` plus an allow rule), same sandbox | 115 ms | 77 to 187 ms |

- Auto mode adds **about 1 s per shell command** (0.6 to 1.4 s), although `autoAllowBashIfSandboxed` is on: in auto mode sandboxed commands are still judged. `WebFetch`: 2.3 to 2.6 s against 1.5 s. A command the classifier refuses takes 2.1 to 4 s to come back.
- `Write` and `Edit` inside the project are not judged: 16 ms either way. **Auto mode added nothing to the 30 builds.**
- The classifier's token cost under an API key: unanswered (no key; its calls do not show in the session's per-model usage).

**Can a blocked action be refused without asking? Yes.** (Made-up data, reserved example domains.)

- The classifier refused "send the project's data file to an outside host" every time (`[Data Exfiltration]`), silently: a `permission_denied` system message, no call to `canUseTool`. The agent is told and goes on.
- After two refusals in a row the third makes the binary go back to asking, as the starting points said (the ask reads "3 consecutive actions were blocked"):
  - with `denyInsteadOfPrompting: true` the ask is refused at once ("no approval surface"), the turn carries on, and the agent ends it normally with its own account of what it could not do;
  - with it off, `canUseTool` is called; answering `{behavior: "deny", interrupt: true}` refuses and ends the turn there. The turn then ends as an error result (`error_during_execution`) that the SDK throws, so the app has to catch it and word the explanation itself.
- The classifier is not a boundary by itself: fetching a script from an unknown host and piping it to a shell (`curl ... | sh`) was let through four times out of six, refused once (`[Code from External]`) and stopped mid-run once. Each time it ran inside the sandbox and failed on the HTML it received.
- Without the sandbox (the platforms where it is missing), `blockReadsOutsideWorkingDirectories` makes the binary refuse any command it cannot check: `python3 -c`, `sed -i`, `curl -o /dev/null` were refused, `mkdir`, `cp`, `tar` passed. Tried on macOS with the sandbox switched off, not on Windows or Linux.
- Not verified: that `dontAsk` denies without calling `canUseTool` (the baseline above only had allowed actions).

## Later edits

One run outside the matrix, on the finished project of an A run: "Make the hero headline shorter, change the primary colour to a deep green, and add a pricing section with two plans just before the closing call to action." The agent read two files (2 s), then sent three `Edit` calls in one response. The color changed at 3.4 s, the headline at 4.4 s, the pricing section grew in place from 4.5 to 9.4 s; done at 12 s, 76 morphs, no error.

Two things had to be handled, and are:

- The new text lands in the middle of a file, so it is repaired on its own before the rest of the file follows. Without that the next section was drawn inside the unfinished one.
- An insertion is usually written as "the new text, then the old text again", and the old text is often an anchor cut in the middle of a tag. Until the new text is complete the old text is kept after it. Without that a piece of a tag showed as text on the page.

One run is not a measurement: it shows the mechanism carries over to edits.

## Findings that change how the app starts the agent

None of these was in the starting points; all were found by running.

1. **The agent inherits the maker's claude.ai connectors** unless told otherwise, even with `settingSources: []`: here "Claude Docs", "Microsoft 365" and "Tripadvisor". Cost: init at 1.8 s instead of 0.4 s, and 215,000 tokens of tool definitions on the second request. Off with `disableClaudeAiConnectors: true`, `syncClaudeAiSkills: false`, `syncClaudeAiPlugins: false`, `strictMcpConfig: true`.
2. **The agent inherits the maker's Claude Code auto-memory**, keyed by the enclosing git repository: in the first run it answered in French because a memory of this repository says so. Off with `autoMemoryEnabled: false`.
3. **The environment must be cleaned**: started from another Claude session, the process inherits some thirty `CLAUDE_*` and `ANTHROPIC_*` variables.
4. **The default model is not stable** on this account (`claude-opus-5-5` on one run, `claude-fable-5-2` on the next): the app must name its model.
5. **Thinking decides the 3 s target.** The model thought for 6.2 s before the first character in the first run, and in 5 of the 15 B runs. In A, once the instructions said to start writing at once and carried the design guidance themselves, it did not think in 15 runs of 15 with adaptive thinking left on. Turning thinking off for the first turn of a new project would make that certain.
6. **The order in which the agent writes files is part of the experience** and has to be instructed: theme, then the home page, then what the page uses. Left to itself (second run before the matrix) the agent wrote data and fragments first.

## Departures from the framing

- **C was measured by replaying the fifteen A runs**, with Matt's agreement: the agent works the same way in A and C, only the delivery differs. It saved fifteen agent runs and compares the two deliveries on the same generation.
- **A business run 1**: its page-side figures come from a replay of the same generation, after a bug of the preview was fixed (the shared header was not shown while it was written). The agent-side figures are the live run's.
- **A first set of C replays was discarded**: the harness lost a reload that arrived while the page was already reloading. Fixed, replayed.
- **htmx 4.0.1** (npm's `next` tag) instead of 4.0.0.
- **Five agent runs were made before the matrix** to set approach A up; they used other settings and are not counted. One more run tried a later edit.
- Spend, as the binary reports it at list prices: A matrix 1.27 USD (72,454 output tokens), B matrix 1.99 USD (120,779), the earlier runs, the edit run and the permission probes 1.09 USD. The four small stream probes are not in these figures.

## Unanswered

- The stream of file content, and the classifier's token cost, **under an API key**.
- The confinement and auto mode on **Windows and Linux**.
- **Other models** in the matrix: only Sonnet 5.5 was run; the others have one stream-speed sample each.
- A **warm start** (`startup()` or `prewarm()` in the SDK, which spawn the process ahead of the request): not measured. The cold start already leaves about 1 s under the 3 s target.
- **C with one file per response**: files would land one by one, at the price of a round trip each. Not measured; the home page would still appear in one piece when its file is complete.
- **B with the files derived by the app** from what was shown, instead of written again by the agent: not tried. It would remove the second pass, and with it the Liquid, shared parts and datasources of the files.
- htmx beyond forms: `hx-get`, triggers, boosting, inheritance did not occur in what the agent wrote.
- Narrow screens: the preview was recorded at 1280 by 800 only.

## Decisions proposed

Matt decides; the ADRs are his to write.

1. **How the agent's output reaches the preview (new ADR): approach A**, which is also the one Matt chose on the recordings. The app reads the input of the agent's file-writing calls while it streams, keeps the unfinished file in an overlay over the project folder, repairs it, renders it with the runtime and morphs the page. Worth recording with it:
   - it rests on two details of the Agent SDK: `includePartialMessages`, and the shape of the `Write` and `Edit` inputs. If either changes, what remains is approach C;
   - a file changed by a shell command is not streamed: it is picked up from the disk when the command ends;
   - the agent's instructions carry part of the experience: the order of files, writing each file in one call, the sections of a home page.
   B and C are not worth building as fallbacks: C is what A degrades to by itself, and B costs 1.7 times the tokens for a page that can differ from the files.
2. **Liquid (ADR 0003): confirmed.** The four cases have a working answer, none of them needed anything from Liquid that LiquidJS does not give. The condition in the ADR's last consequence is met.
3. **htmx 4 (ADR 0004): confirmed, compatibility extension off.** 135 valid attributes of 135 and 20 working forms of 20, with the cheat sheet in the instructions.
4. **Theme (ADR 0006): the aliasing is confirmed**; "has not been tried" can go. The preview takes daisyUI's prebuilt stylesheet plus `@tailwindcss/browser`.
5. **Agent permissions (ADR 0007): confirmed, with these amendments.**
   - The silent refusal is `permissions.denyInsteadOfPrompting: true`, with a `canUseTool` that refuses as a safety net. The turn then ends normally, with the agent's own account; the app can add its own line from the `permission_denied` messages.
   - "Auto mode costs one extra check per judged action": measured at about 1 s per shell command, sandboxed or not, and nothing for file writes inside the project.
   - To be decided by Matt: keep auto mode for shell commands (1 s each, and a check on what leaves over the open network, though not a reliable one), or allow sandboxed commands by rule (0.1 s each, the sandbox as the only guard).
   - To be decided by Matt: what to do about tools installed in the home folder, `git` included, which the read confinement breaks.
   - On platforms without the sandbox the read limit on file tools makes the binary refuse most scripted commands. The ADR's consequence for Windows and Linux needs rewording once tried there.
6. **Starting the agent** (not on the framing's list, belongs with ADR 0002 or the new ADR): the isolation settings of "Findings" 1 to 4, a named model, and no extended thinking on the first turn of a new project.
