# Spike 3: other agents and harnesses — report

2026-11-14. Framing: [docs/spikes.md](../../docs/spikes.md), "Spike 3". Machine: Matt's Mac, macOS 27.0.1.

**Tried:**
- Codex 0.169.0 (OpenAI), through `codex app-server`
- Pi 1.5.2 (`@earendil-works/pi-coding-agent`), in RPC mode
- opencode 2.3.0, through `opencode run --format json`

**Studied from their sources and docs only:** Gemini CLI 0.68.0 and Antigravity CLI 1.5.9 (Matt's choice).

**Accounts:**
- **The ChatGPT account signed in to Codex.** Codex reports it as a **free** plan (`planType: "free"`), so its models were GPT-6 Luna, GPT-5.6 Terra and GPT-5.6 Luna.
  - All the Codex runs used 2% of its 30-day allowance.
  - GPT-6.1 Sol was reached through OpenRouter instead.
- **A Gemini API key from AI Studio.** It is on a paid billing account: Gemini 4 Argon has no free tier and answered.
- **An OpenRouter key**, for GPT-6.1 Sol and Gemini 4 Hydrogen.

The research for each harness, with its sources, is in `research/` (codex, pi, opencode, gemini, antigravity, and pi-extensions for Pi's packages).

**A second round, the same day,** answered Matt's question after the first report: would Upstart do better with a harness of its own, built on Pi, with every subscription plugged in? It tried:
- Gemini writing its files in the reply's text instead of through a tool;
- Pi's thinking level set low, for Hydrogen and for Sol;
- Argon twice more;
- Pi Durable, Earendil's library for building an agent app on Pi, and Pi's extensions, from their packages and docs.

## The method

**The request.** Spike 1's launch page for Lumen, with spike 1's instructions. The only change to the instructions is that "Write" became "your file-writing tool".

**Each harness ran apart from Matt's own setup:**
- its own configuration folder under `homes/` (`CODEX_HOME`, `PI_CODING_AGENT_DIR`, opencode's `XDG_*` folders);
- a fresh project in a temporary folder outside any repository.

**Measured for each run, against the time the request was sent:**
- every piece of a file's content in the harness's stream;
- every file reaching the disk (polled every 50 ms).

**After each run:**
- `src/shoot.ts` renders the result with spike 1's preview;
- it photographs the pages, checks the htmx and fills and posts the form.

**Claude's figures** are spike 1's five live runs of the same request (Agent SDK, Sonnet 5.5, approach A). The 21.4 s that spike 1 quotes is its median across all three of its requests; on this request alone it is 23.6 s.

## The answer

**No ready-made harness can stand in for Claude in Upstart today. A harness of Upstart's own, built on Pi's libraries, could carry other models with the live preview.**

**The live preview, Upstart's defining moment:**

| Harness | Live preview | Why |
|---|---|---|
| Pi, with an OpenAI model | Yes | Pi streams a tool call's arguments as they arrive. OpenAI's API sends them a few characters at a time. |
| Upstart's own harness on Pi, files written in the reply's text | Yes, with any model | Every provider streams a reply's text as it is generated, Gemini included. See [Files in the reply's text](#files-in-the-replys-text-a-live-preview-for-any-model). |
| Codex | No | Its GPT-6 models write files from code run by an `exec` tool ("code mode"), and Codex does not pass that tool's input on to an app. |
| opencode 2 | No | It publishes a tool's input only once the call is complete (a fix is open, not merged). |
| Any ready-made harness with Gemini | No | The Gemini API sends a tool call whole (`partialArgs` is on Vertex only). Gemini CLI and Antigravity also send tool calls whole. |

**One combination matches Claude: Gemini 4 Hydrogen writing its files in the reply's text, with Pi's thinking set low.**
- Its page starts showing at 4.2 s and is complete at 22.5 s; Claude's at 5.9 s and 23.6 s.
- Once it starts, it never stands still longer than half a second.
- It costs $0.05 a page, against $0.085 for Claude at API prices.

**GPT-6.1 Sol, through OpenRouter, is twice as slow as Claude to a complete page:** 56 s with Pi's thinking at medium, 52.7 s at low, against 23.6 s. Its page starts showing as early (6 s) and never stands still longer (2.6 s at most). OpenAI's own API is not measured yet.

**Into a harness of Upstart's own, only one subscription can be plugged: ChatGPT's, and only if OpenAI accepts Upstart.**
- **Claude:** only through the official binary, so through the Agent SDK, as today. Pi's Claude sign-in impersonates Claude Code, which Anthropic's terms forbid (Pi itself warns that it draws paid extra usage).
- **ChatGPT Plus or Pro:** "Sign in with ChatGPT", OpenAI's program for apps, which Pi implements. It is open to open-source and local apps; paid apps go on a waitlist.
- **Google AI:** no route for apps. Google moved personal accounts and Google AI subscriptions off Gemini CLI to Antigravity, whose terms forbid wrapping it in an app.

So **besides Claude's subscription and, perhaps, ChatGPT's, a second agent means the maker's own API key.** See [Upstart's own harness on Pi](#upstarts-own-harness-on-pi).

**Every combination wrote an acceptable page.**
- Valid htmx 4 in all of them, and a working form in all but one run (GPT-6 Luna once wrote a form that sends nothing).
- GPT-6.1 Sol's pages are the most crafted, whichever harness drives it.
- The Gemini pages are dense and invent specifications, prices and named testimonials.

## The measurements

`node src/table.ts`. Medians, with min–max.
- **Starts showing:** the first piece of the home page's content in the stream.
- **Complete:** the home page's whole content in the stream, or on disk when the stream never carries it.

When a harness sends a file only once it is complete, the two are the same moment.

| Harness, model | Runs | Home page starts showing | Home page complete | Done | Longest still, until the home page is complete | Output tokens | Cost | Form works |
|---|---|---|---|---|---|---|---|---|
| Claude Agent SDK, Sonnet 5.5 (spike 1) | 5 | 5.9 s (5.6–6.3) | 23.6 s (21.8–27.0) | 30.3 s (27.6–32.8) | 1.7 s (1.7–1.9) | 4762 | $0.085 | 5/5 |
| Codex, GPT-6 Luna (ChatGPT sign-in) | 3 | 59.6 s (55.4–78.1) | 59.6 s (55.4–78.1) | 65.0 s (61.3–88.8) | 50.9 s (47.7–68.6) | 3293 | — | 2/3 |
| Codex, GPT-6.1 Sol (OpenRouter) | 2 | 51.9 s (47.3–56.5) | 51.9 s (47.3–56.5) | 62.7 s (57.8–67.7) | 46.8 s (42.1–51.4) | 4054 | — | 2/2 |
| opencode, GPT-6.1 Sol (OpenRouter) | 3 | 70.7 s (53.9–78.7) | 70.7 s (53.9–78.7) | 81.5 s (63.0–90.8) | 63.3 s (49.6–71.1) | 6652 | $0.107 | 3/3 |
| Pi, GPT-6.1 Sol (OpenRouter) | 3 | 6.3 s (5.7–6.4) | 56.0 s (53.0–62.0) | 66.9 s (63.1–72.7) | 2.2 s (2.0–2.6) | 5329 | $0.078 | 3/3 |
| Pi, GPT-6.1 Sol (OpenRouter), thinking low | 3 | 6.4 s (5.5–8.2) | 52.7 s (47.7–53.0) | 62.5 s (61.0–64.5) | 2.1 s (1.8–4.4) | 4147 | $0.063 | 3/3 |
| Pi, Gemini 4 Argon (Google API) | 3 | 132.8 s (116.4–134.7) | 132.8 s (116.4–134.7) | 191.2 s (172.1–249.8) | 122.0 s (106.7–124.0) | 11851 | $0.176 | 3/3 |
| Pi, Gemini 4 Argon (Google API), files in the text | 3 | 15.2 s (10.6–17.1) | 102.8 s (89.0–107.8) | 127.6 s (124.7–143.5) | 10.9 s (6.0–13.4) | 10880 | $0.116 | 3/3 |
| Pi, Gemini 4 Hydrogen (OpenRouter) | 1 | 51.9 s | 51.9 s | 54.2 s | 37.2 s | 8646 | $0.084 | 1/1 |
| Pi, Gemini 4 Hydrogen (Google API) | 3 | 34.9 s (32.3–35.6) | 34.9 s (32.3–35.6) | 49.0 s (38.3–53.9) | 26.8 s (23.4–27.3) | 8895 | $0.101 | 3/3 |
| Pi, Gemini 4 Hydrogen (Google API), files in the text | 3 | 11.7 s (9.3–13.1) | 30.9 s (29.1–38.4) | 33.3 s (32.6–41.8) | 10.6 s (8.1–11.9) | 8447 | $0.069 | 3/3 |
| **Pi, Gemini 4 Hydrogen (Google API), files in the text, thinking low** | 3 | **4.2 s (3.7–5.0)** | **22.5 s (21.1–23.3)** | **25.5 s (23.9–26.2)** | 2.9 s (2.3–3.9) | 6024 | **$0.051** | 3/3 |

"Thinking low" is Pi's `--thinking low`; the other Pi runs used Pi's default, medium. "Files in the text" is described [below](#files-in-the-replys-text-a-live-preview-for-any-model). Its "longest still" is the wait before the reply's first character: after it, nothing stands still for more than 0.7 s with Hydrogen.

**Reading it:**
- **Claude's cost is the API price of its tokens.** Spike 1 ran on Matt's Claude subscription.
- **Codex reports no cost.**
  - On the ChatGPT sign-in, the run comes out of the plan.
  - Through OpenRouter, it is billed there (the Sol runs elsewhere cost about $0.08).
- **Why Pi with Sol is slow to finish.** Its output is about the same size as Claude's (5,329 tokens against 4,762), and lowering its thinking only trims it (4,147 tokens, complete at 52.7 s). Sol through OpenRouter simply writes slowly:
  - about 80 tokens a second;
  - Claude about 200;
  - Hydrogen about 300.
  OpenAI's own API might be faster. Not tried yet: no OpenAI key was at hand.
- **Gemini 4 Hydrogen** came out on 2026-11-12, two days after Pi 1.5.2, so Pi did not know it. `homes/pi/models.json` declares it in Pi's own Google provider, priced as on OpenRouter ($1.50 / $7.50 per million tokens).
  - Through a tool, Hydrogen on Google's API is complete at 35 s, but nothing moves for 27 s before it.
  - Writing its files in the reply's text, with its thinking low, it matches Claude.
  - Argon, Google's larger model, took 117 to 135 s through a tool, and 89 to 108 s in the text.
- **Runs left out** (`runs/superseded/`), each for a fault of the spike's own driving:
  - the first opencode run, which worked in the spike's own folder rather than the project: opencode takes its folder from `PWD`, not from the process's folder;
  - a first Codex run, before it was told to use `apply_patch`; it wrote every file with `cat > file <<EOF`;
  - two Codex runs made before the app asked for its experimental events;
  - one Codex run with code mode turned off, which wrote nothing.
- **The sheet** `runs/sheet-launch.png` puts one page per combination next to Claude's (`runs/` is not in git).

## The live preview, harness by harness

### Codex

**What was expected.** Codex has a flag, `apply_patch_streaming_events`, "under development" since April. It sends an `apply_patch` while the model writes it (`item/fileChange/patchUpdated`), line by line, at most every 500 ms.

**What happened.**
1. **Left to choose, GPT-6 Luna wrote its files with shell commands** (`cat > file <<EOF`), which nothing can stream. Told to use `apply_patch`, it did.
2. **The app must ask for the events.** `patchUpdated` is only sent to a client that asks for experimental events at initialize (`experimentalApi: true`). Even then, none came.
3. **The cause is code mode.** Codex's debug log shows that the GPT-6 models never call `apply_patch` directly. They call an `exec` tool whose input is code, and that code calls `apply_patch`.
   - The model does stream that code: 4,153 `response.custom_tool_call_input.delta` events in one run through OpenRouter.
   - But Codex hands an app nothing of it, and its patch streaming only follows direct `apply_patch` calls.
   - Code mode cannot be turned off: with `--disable code_mode_host` the model wrote nothing.

**So the page reaches the app only when each file is written: 50 to 60 s after the request.** This could change in a later Codex: the content is in the stream, and Codex just does not pass it on.

### Pi

**Pi streams a tool call's arguments as they arrive** (`toolcall_delta`). How finely depends on the provider:
- **OpenAI-style APIs send a few characters at a time.** GPT-6.1 Sol through OpenRouter: the home page grows from 6 s, never still for more than 2.6 s, as with Claude.
- **The Gemini API sends the whole call in one piece**, and so does OpenRouter for Gemini models. The page appears at once, unless the model writes its files in the reply's text (below).
- **Anthropic's API streams too**, according to Pi's sources. Not tried: no Anthropic key, and Claude stays on the Agent SDK in any case.

### opencode 2

**opencode publishes a tool's input only when the call is complete** (`session.tool.input.ended`). Its own test asserts this, since a change in October.
- A fix is open ([PR #58416](https://github.com/anomalyco/opencode/pull/58416)), not merged.
- The first file reaches the disk early (the theme, at 4 to 8 s), then nothing until the home page, after 50 to 80 s.

### Gemini CLI and Antigravity (studied only)

**Neither carries a file's content while it is written.** Each sends a tool call with its complete arguments, on every route: stream-json, ACP, and Antigravity's Python SDK.

## Files in the reply's text: a live preview for any model

**The idea.** A harness of Upstart's own does not have to take a file from a tool call. The model can write each file in its reply instead, in a block of its own:

```
<file path="pages/index.liquid">
…the file's whole content…
</file>
```

**Every provider streams a reply's text as it is generated,** Gemini included. Upstart reads the blocks as they come:
- it sends each block to the preview while it grows;
- it writes the file when the block closes.

`node src/run.ts pi --text-files` does this on Pi's RPC stream:
- Pi's `write` tool is withdrawn (`--tools read,edit,bash`);
- the instructions ask for blocks (`TEXT_FILES` in `src/pi.ts`);
- `readBlocks()` reads them from the text deltas.

**What happened, in 12 runs of Hydrogen and Argon:**
- **Every run kept to the format:** no Markdown fence, no tool used at all, every page complete and its form working.
- **Hydrogen's page starts showing at 11.7 s,** instead of arriving whole at 35 s, and is complete sooner (30.9 s against 34.9 s).
- **The one pause left is the wait before the first character:** Gemini's thinking, 6 to 13 s. Once the reply starts, nothing stands still for more than 0.7 s with Hydrogen, 1.4 s with Argon.
- **With Pi's thinking set low** (`--thinking low`; Pi's default is medium), Hydrogen starts in 2.3 to 3.9 s:
  - the home page starts showing at 4.2 s and is complete at 22.5 s, Claude's pace (5.9 s and 23.6 s);
  - the longest pause, the wait at the start included, is 2.9 s;
  - it writes less (6,024 tokens against 8,447) and costs $0.05 a page;
  - the pages are as complete as with medium thinking (`runs/sheet-hydrogen-text.png`).
- **Argon writes more, and more slowly:** complete at 103 s, done at 128 s.

**What it costs:**
- **Upstart's instructions must teach the format,** and Upstart must take the blocks out of the reply it shows the maker.
- **A small change to an existing file still goes through the edit tool,** which Gemini sends whole. Such a change is short, so it lands quickly anyway.
- **It is Upstart's own convention, not a provider's feature.** Each model must be checked to keep to it, and a model may drift on long sessions; only one request was tried.
- **Claude keeps its write tool:** the Agent SDK streams it already.

## Signing in: what each account allows

### ChatGPT (OpenAI)

**Codex's own ChatGPT sign-in, started by an app.** OpenAI's app-server docs: "App-server authentication has never been permitted for commercial or hosted services."

**"Sign in with ChatGPT" (SIWC), the route OpenAI offers to apps.**
- **Who may use it:** open-source projects, personal apps running locally, and "selected private apps". Paid or hosted apps must join a waitlist.
- **Plans:** Plus and Pro only.
- **The tokens.**
  - With Codex, the app runs the OAuth and holds the tokens. That is against Upstart's rule of never handling a maker's tokens.
  - Pi implements SIWC itself (with the host app's name) and keeps the tokens in its own folder, so Upstart would not hold them.
- **Upstart's eligibility depends on facts not settled here.** Is Upstart open source? Is it paid? Not confirmed either way.

**With an API key**, Codex and Pi are unrestricted. Prices per million tokens:

| Model | Input | Output |
|---|---|---|
| GPT-6.1 Sol | $2 | $10 |
| GPT-6.1 Terra | $1 | $5 |
| GPT-6 Astra | $10 | $50 |
| GPT-6 Luna | $0.10 | $0.50 |

**What the plans give in Codex:**
- **Free and Go:** GPT-6 Luna only. On Matt's account, also two older GPT-5.6 models.
- **Plus ($20):** Sol, Terra and Astra, within a 5-hour allowance. On Sol, roughly 15 to 160 messages per 5 hours.
- **Pro ($100 to $500):** no 5-hour limit.

### Google (Gemini)

**Gemini CLI is not deprecated, but it no longer serves individuals.** Since 2026-06-18 it has stopped serving:
- free personal Google accounts;
- Google AI Pro and Ultra subscribers.

It still works with:
- paid Gemini API keys;
- Vertex (a Google Cloud project);
- organizations' Code Assist licences.

Google says it is "not optimized for Gemini 4+" and is kept "for enterprise Gemini Code Assist workflows".

**An AI Studio key is not covered by the Google AI subscription.**
- The subscription raises limits only inside AI Studio's web interface.
- The key's use is billed separately, through Cloud Billing, or is the free tier.
- Subscribers can get monthly Google Cloud credits through the Google Developer Program, and those credits do apply to the API. That is credit, not the subscription's own allowance, and is probably what Matt remembered.

**The Gemini API's terms bite for French makers.**
- Only paid services may be used when making an API client available to users in the EEA, Switzerland or the UK, so a French maker needs a **paid** key.
- Free-tier prompts may be read by Google's reviewers.

**Prices per million tokens:**

| Model | Input | Output | Notes |
|---|---|---|---|
| Hydrogen | $1.50 | $7.50 | Has a free tier |
| Argon and Carbon | $2 | $10 | Doubling on 2026-12-01; no free tier |

**Antigravity CLI is where Google sends individuals.** It takes every plan, free included. Hydrogen is open to all plans, Argon to Pro and above, and Claude Sonnet and Opus 5.5 to Pro.
- **Its terms forbid Upstart's use.** The FAQ says wrapping `agy` in a third-party app "is not supported under consumer plans". The Additional Terms (§6) make it a breach that can lead to suspension.
- **A Google collaborator spelled it out** on GitHub (2026-11-12): starting the unmodified `agy -p` or `agy acp` from a third-party app breaches §6 on a personal sign-in. So does replacing its identity instructions, which Upstart's own instructions would do.
- **Google sends apps to an API key or Vertex.** With those, Antigravity is one more closed harness for a paid key, where Pi does the same with an open licence.
- **Other problems:**
  - its sign-in sits in the macOS Keychain, with no way to keep it apart from the maker's own;
  - no folder variable keeps its configuration apart;
  - it is closed, with no right to redistribute;
  - it updates itself;
  - it has known hangs on exit.

### OpenRouter

**One key reaches every model above** (OpenAI, Google, and others), at about the providers' prices.
- Pi, opencode and Codex all accept it.
- For Gemini models it sends tool calls whole, as Google does.

### Claude through another harness

**Not an option.**
- **Pi's Claude subscription login** impersonates Claude Code (its OAuth client and user agent). Anthropic forbids that, and it breaks Upstart's own rule.
- **opencode's "Claude Agent" provider** does run the official `claude` binary through the Agent SDK. But it drops the tool-input stream too, and adds a layer for nothing.

## Confinement (ADR 0007)

**Codex has its own sandbox** (Seatbelt on macOS, bubblewrap on Linux, a native one on Windows).
- In `workspace-write` with approvals declined by the app, the runs wrote only in the project.
- It can also limit reading (`readOnlyAccess`).

**Pi and opencode have none.** The spike ran them under macOS's sandbox (`sandbox-exec`), with a profile that allows writing only in:
- the project;
- the harness's own folder;
- the temporary folders.

**The profile held.** In its misdirected first run, opencode tried to write `theme.css` into the spike's folder, and the sandbox refused it.

**But it let them read everywhere.** opencode listed the spike's folders, including the one that holds the keys file (it did not read the file itself). Upstart's profile for such a harness must:
- **also limit reading**, to the project, the harness's folder and the system;
- be written again for Windows and Linux. Pi dropped its own sandbox example in 1.5.0.

**Answering a refused action without asking the maker:**

| Harness | How |
|---|---|
| Codex | The app answers its approval requests `decline`. |
| Pi | A `tool_call` hook can block a call. |
| opencode | Rules that deny, or a reply `reject` through its API. |

## What Upstart gives the agent

From each harness's sources and docs; not tried in the spike.

| | Codex | Pi | opencode | Claude Agent SDK (today) |
|---|---|---|---|---|
| Upstart's own tools | Dynamic tools (experimental; can return an image), or an MCP server outside the app | Native tools in the process, or MCP | MCP outside the app, or an opencode plugin | In-process MCP server |
| Agent Skills (SKILL.md) | Yes | Yes | Yes | Yes |
| Instructions | `developerInstructions`, or the base prompt replaced | `--system-prompt` or `--append-system-prompt` | `AGENTS.md`, or a custom agent | System prompt |
| End-of-turn check that can keep the agent going | Stop hook | `agent_before_settle` | None: re-prompt from a plugin | Stop hook |
| Check after each tool | PostToolUse | `tool_result` | `execute.after` | PostToolUse |
| Web search | Built in (OpenAI's index) | None: an extension or Upstart's own tool | `webfetch`; search needs a search provider's key | Built in |
| Kept apart from the maker's own setup | `CODEX_HOME`, except skills from `~/.agents/skills` and `/etc/codex` | `PI_CODING_AGENT_DIR` and flags | `XDG_*` folders and flags, except `~/.agents/skills` and system settings | `CLAUDE_CONFIG_DIR` |

## Shipping

| | Licence | Size (macOS arm64) | Can Upstart bundle it | Release pace |
|---|---|---|---|---|
| Codex | Apache-2.0 | 281 MB binary; a standalone app-server of about 88 MB compressed | Yes | Near daily; protocol tied to each version |
| Pi | MIT | 24 MB package; 104 MB of Node packages here; runs on Electron's own Node | Yes | Fast: 0.73 to 1.5 in six months, under a new owner (Earendil) |
| opencode | MIT | 224 MB binary (Bun) | Yes, re-signed | Several a week; V1 to V2 broke its API a month ago |
| Gemini CLI | Apache-2.0 | 96 MB | Yes | Weekly; maintained for organizations |
| Antigravity CLI | None | 84 MB | No | Daily, self-updating |

## The pages

`node src/shoot.ts` for each run; `runs/sheet-launch.png` for the sheet.

| Combination | htmx attributes, all valid | Form posted |
|---|---|---|
| Claude | 5 to 11 | Every run |
| Codex and Luna | 0 to 5 | 2 of 3: one run wrote a form that goes to `#waitlist` and no data source |
| Codex and Sol | 6 | Both |
| opencode and Sol | 5 | Every run |
| Pi and Sol (thinking medium or low) | 5 or 6 | Every run |
| Pi and Hydrogen (through a tool, or in the text, thinking medium or low) | 6 to 9 | Every run |
| Pi and Argon (through a tool, or in the text) | 6 to 17 | Every run |

**By eye:**
- **GPT-6.1 Sol's pages are the most crafted**, whichever harness drives it: an editorial layout, and a drawn reading lamp over a book in SVG.
- **Claude's page is simpler and as clean.**
- **The Gemini pages are the longest and densest.** They invent specifications (lumens, battery, weight), founder prices and named testimonials ("Dr. Helena …"). On a page for a product not yet launched, that would need watching.

## What Upstart's agent layer would need to hold a second agent

Not built; what the spike showed it would take.

- **An adapter per harness** that turns its stream into the preview's events: a file's content as it grows, a file complete, a tool used, the turn's end. `src/codex.ts`, `src/pi.ts` and `src/opencode.ts` are throwaway versions.
- **Instructions per harness and per model.** Claude's instructions name its tools. Codex's model must be told to write with `apply_patch`.
- **Upstart's sandbox around harnesses that have none**, limiting reads as well as writes, on each system.
- **Upstart's tools and hooks, given through each harness's own mechanism:**
  - the preview tool, `find_blocks` and the rest;
  - the end-of-turn checks;
  - the checks after each tool.
- **A key per provider**, entered by the maker and kept by Upstart (or by the harness, in its own folder).
- **For a model that sends tool calls whole (Gemini), files in the reply's text.** Without that, only "files then reload", spike 1's approach C, which Matt turned down for Claude.

## Upstart's own harness on Pi

**Matt's question:** rather than another ready-made harness, would Upstart do better with a harness of its own, built on Pi, with every subscription plugged in?

### What it would be

**Not the `pi` program, but Pi's libraries in Upstart's main process,** as the Agent SDK is today. Electron 45's Node meets their requirement (22.19 or later).
- **`pi-ai` for the models:** about fifty providers, by API key or sign-in. It streams text, thinking and a tool call's arguments as events.
- **A loop around it:** `pi-agent-core`, the one Pi's own program uses, or `pi-durable` (below).
- **Upstart's tools as native tools,** and an adapter of Upstart's own from the events to the preview's.

The spike drove the `pi` program over RPC (`src/pi.ts`); the libraries themselves were not run.

### What blocks each subscription

| Account | Through Upstart's own harness | Why |
|---|---|---|
| Claude Pro or Max | **No** | Pi's Claude sign-in uses Claude Code's OAuth client and a `claude-cli` user agent. Anthropic does not permit third-party apps to offer Claude.ai login or to route requests through a plan's credentials, and Pi itself warns that the sign-in draws paid extra usage. It is also against Upstart's own rule. A Claude subscription stays on the Agent SDK, which runs the official binary. |
| ChatGPT Plus or Pro | **Yes, if OpenAI accepts Upstart** | Pi implements "Sign in with ChatGPT" (`openai-chatgpt.ts` in `pi-ai`): each sign-in registers a client under the app's name, and the token goes to OpenAI's own API, which streams a tool call's arguments. The program is open to open-source and locally run apps; a paid app applies through an interest form. |
| ChatGPT Free or Go | No | Sign in with ChatGPT is for Plus and Pro. Matt's free plan cannot try it. |
| Google AI Pro or Ultra | **No** | Google offers apps no route: Antigravity's terms forbid it, and Pi removed its Gemini CLI and Antigravity sign-ins in 0.71.0 (2026-04-30). |
| GitHub Copilot | No | Pi's sign-in passes itself off as VS Code's Copilot Chat. |
| API keys: OpenAI, Google, Anthropic, OpenRouter and others | Yes | A paid key for Gemini in the EEA. An Anthropic key reaches Claude through Pi without the subscription. |

**Pi's other ChatGPT sign-in, `openai-codex`, reuses Codex's own OAuth client.** Pi calls it superseded by Sign in with ChatGPT; Upstart would leave it out, as it would the Claude and Copilot sign-ins.

**So "every subscription" comes down to two agent layers:**
- the Agent SDK for a Claude subscription, as today;
- Upstart's own harness for everything else: ChatGPT Plus or Pro if OpenAI accepts Upstart, and the maker's API keys.

### What it settles, and what it leaves

**Settled:**
- **The live preview with every provider:** a tool call's arguments with OpenAI and Anthropic, files in the reply's text with Gemini. Hydrogen this way matches Claude's pace.
- **Upstart's tools, skills and checks** given natively, with Pi's hooks (`tool_call`, `tool_result`, `agent_before_settle`).
- **Confinement by construction.** In Pi's libraries the built-in tools reach files only through an environment the host provides. Upstart's could reach the project alone, and run a shell command only inside Upstart's sandbox, or offer none. The macOS-only sandbox profile around the whole program is then no longer needed for file tools.

**Left:**
- **Two agent layers to keep,** with instructions and checks per model family, and each model checked against Upstart's requests.
- **Pi's pace:** 0.73 to 1.5 in six months, under a new owner.
- **Web search**, which Pi does not have (see [Pi's extensions](#pis-extensions)).
- **The maker's keys,** kept by Upstart (in the system's keychain) or by Pi in its own folder.
- **Sign in with ChatGPT's terms:** whether a closed or paid Upstart is accepted, which only OpenAI can say.

### Pi Durable

**`@earendil-works/pi-durable` 1.5.2,** MIT, announced with Pi 1.0 ([post](https://earendil.com/posts/pi-durable/)). Its README opens with: "Experimental. The API changes without notice between releases."

**What it is: a library for agent apps, not a coding agent.**
- Conversations, model turns and tool calls are committed to storage (SQLite, or memory) before anything is shown.
- If the process dies mid-turn, reopening the storage picks the work up where it stopped.
- It also has forks, compaction in the background, extensions (prompt sections, tools, hooks, durable tasks) and a code mode.

**For the live preview, it carries a tool call's arguments as they arrive.** `watch()` delivers `docs["pi.live"].generation.message`, the reply in progress.
- It is committed at most every 100 ms (`settings.progress.partialIntervalMs`).
- Each tool call's arguments are fed by a streaming JSON parser from every `toolcall_delta` (`harness/partial-changes.d.ts`), so a `write` call's content grows there as text does.

**For confinement, every built-in tool goes through the host's `env`:**
- an execution environment built per conversation, from its folder;
- `NodeExecutionEnv` serves a folder;
- a custom one can serve a container or a virtual file system.

**For Upstart, the fit is partial:**
- Upstart already keeps its own record of a session and its snapshots, so Durable's storage would be a second record of the conversation.
- What it adds is resuming after a crash, and a stream already shaped for an interface.
- `pi-agent-core` is the lighter base. Durable is worth a closer look once its API settles.

### Pi's extensions

**Pi is easy to extend, and many people do:** its gallery lists 5,355 packages. The full review, with each package's version, licence, downloads and source, is in `research/pi-extensions.md`. Nothing was installed or run.

**An extension runs inside Pi's process with all its rights,** and sees prompts, files and credentials. So Upstart would:
- bundle the few it uses as reviewed code of its own;
- load nothing else (`--no-extensions` with `-e <path>`, or `noExtensions` in Pi's SDK);
- never install a package at start (`-e npm:…` does);
- never load anything from the maker's own Pi folder or a project's `.pi/`.

**No package opens a subscription that Pi's own sign-ins do not.**
- Every community route to Claude, ChatGPT through Codex, Gemini or Antigravity, Copilot, Cursor or Grok does one of two things:
  - reuses the vendor's own client and passes itself off as its program (some say in their README that this may break the vendor's terms);
  - drives the vendor's program, which Google calls a breach for Antigravity.
- Several pool accounts to get round quotas.
- `pi-claude-bridge` runs Claude through the official Agent SDK inside Pi: where Upstart already is, with one more layer.
- Sign in with ChatGPT, built into Pi, stays the only official route.

**No package gives the live preview, and none writes files from the reply's text.** That part would be Upstart's own:
- **Inside Pi:** an extension's `message_update` handler receives the reply in progress, with a `write` call's arguments already parsed as they grow. That is simpler than rebuilding them from the RPC stream's deltas, as `src/pi.ts` does. Read from Pi's docs, not run.
- **Other edit formats:** `apply_patch`, hash-anchored lines and Armin Ronacher's single-payload edit stream changes, not a file's content, which makes the preview harder.

**Confinement:**
- **Nothing official replaces the sandbox Pi dropped.** Earendil points to Gondolin, micro-VMs that need QEMU: too heavy for a maker's machine.
- **The community sandboxes wrap Pi's tools from inside its process,** and most ask the user before each refused action, which Upstart does not do. Most are built on Anthropic's `sandbox-runtime`. `@yandy0725/pi-sandbox` is the only one with a Windows backend: a reference for later.
- **Upstart's own boundary stays the design:** its execution environment, or its sandbox around the whole process.

**Worth taking or copying:**
- **Web search: `pi-web-search`.** It uses the current model's own search (OpenAI's `web_search`, Anthropic's web search, Gemini's grounding), so no other key is needed and queries go only to the maker's provider.
  - `pi-web-access` is the most used, but it sends queries to Exa by default.
  - Whether a ChatGPT plan's requests may use OpenAI's search is not confirmed.
- **Asking the maker a question: `@thinkrail/pi-ask-user-question`** (JetBrains, Apache-2.0). It is close to Claude's AskUserQuestion, with a hook for an app's own interface.
  - Alternatively, the tool lives in Upstart's own MCP server. Pi's MCP client gives up after 60 s unless the server sends progress.
- **Testing an extension without a model: `pi-coding-agent-test`.**
- **Embedding Pi in an Electron app: Pace,** a Pi interface in Electron (Apache-2.0). It is a reference, though it shares the user's Pi folder, which Upstart would not.

## Not tried, or not settled

- **GPT-6.1 Sol through OpenAI's own API** (no OpenAI key at hand). It decides whether Pi's 53 to 56 s is OpenRouter's or the model's.
- **Sign in with ChatGPT in Pi.** It needs a Plus or Pro plan; Matt's is free.
- **A paid ChatGPT plan (Plus or Pro) in Codex.** It would give Sol in Codex, but would not change the preview, which code mode decides.
- **Pi's libraries driven directly** (`pi-ai` with `pi-agent-core`, or Pi Durable) rather than the `pi` program over RPC.
- **Files in the reply's text over a whole session:** edits, several pages, other requests. Only spike 1's launch request was tried, and only with Gemini models.
- **Pi with an Anthropic API key**, which would show Pi's own overhead against the Agent SDK with the same model.
- **Antigravity with a Gemini API key**, the only use its terms allow an app. Its stream was studied, not run.
- **Upstart's tools, skills and hooks inside Pi or Codex.**
- **Windows and Linux.**
- **Whether Upstart qualifies for "Sign in with ChatGPT".** It depends on whether Upstart is open source or paid; ask OpenAI.

## Recommendation

1. **Keep Claude, through the Agent SDK, as Upstart's agent for a Claude subscription.** No other route to that subscription is allowed.
2. **For other models, build a harness of Upstart's own on Pi's libraries, not on a ready-made harness.**
   - Files written in the reply's text, so every model has the live preview.
   - Upstart's own execution environment, reaching the project alone.
   - First, Gemini 4 Hydrogen on the maker's Gemini key, thinking low: Claude's pace, at about 60% of its API price.
   - Then OpenAI: on the maker's key, and on ChatGPT Plus or Pro through Sign in with ChatGPT once OpenAI confirms Upstart may use it. Measure Sol through OpenAI's API first.
3. **When to build it (2.0 or after) is Matt's call (Q268).** It is a second agent layer to build and keep:
   - the adapter;
   - the instructions and checks per model family;
   - the execution environment;
   - the keys;
   - the file format, checked over whole sessions.
4. **Come back to Codex** if a later version passes on what code mode writes, and if OpenAI opens ChatGPT sign-in to an app like Upstart. Antigravity stays out on its terms.

## How to run it again

```bash
cd spikes/harnesses && npm install
# homes/keys.env: OPENROUTER_API_KEY=… and GEMINI_API_KEY=… (mode 600, not in git)
CODEX_HOME=$PWD/homes/codex ./node_modules/.bin/codex login
node src/run.ts pi --model openrouter/openai/gpt-6.1-sol --label sol
node src/run.ts pi --model google/gemini-4-hydrogen --label hydrogen-direct
node src/run.ts pi --text-files --thinking low --model google/gemini-4-hydrogen --label hydrogen-text-low
node src/run.ts pi --model openai/gpt-6.1-sol --label sol-openai   # needs OPENAI_API_KEY in keys.env
node src/run.ts codex --label luna
node src/run.ts codex --provider openrouter --model openai/gpt-6.1-sol --label sol-openrouter
node src/run.ts opencode --model openrouter/openai/gpt-6.1-sol --label sol
node src/shoot.ts && node src/table.ts
```
