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

The research for each harness, with its sources, is in `research/` (codex, pi, opencode, gemini, antigravity).

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

**No other agent can stand in for Claude in Upstart today.**

**The live preview, Upstart's defining moment, fails everywhere except one case: Pi with an OpenAI model.**

| Harness | Live preview | Why |
|---|---|---|
| Pi, with an OpenAI model | Yes | Pi streams a tool call's arguments as they arrive. OpenAI's API sends them a few characters at a time. |
| Codex | No | Its GPT-6 models write files from code run by an `exec` tool ("code mode"), and Codex does not pass that tool's input on to an app. |
| opencode 2 | No | It publishes a tool's input only once the call is complete (a fix is open, not merged). |
| Any harness with Gemini | No | The Gemini API sends a tool call whole (`partialArgs` is on Vertex only). Gemini CLI and Antigravity also send tool calls whole. |

**Even Pi with GPT-6.1 Sol is twice as slow as Claude to a complete page:** 56 s against 23.6 s. Its page starts showing as early (6 s) and never stands still longer (2.6 s at most).

**No subscription other than Claude's may be used by an app like Upstart:**
- OpenAI forbids commercial apps from starting Codex on the maker's ChatGPT plan. "Sign in with ChatGPT" is open to open-source and local apps; paid apps go on a waitlist.
- Google moved personal accounts and Google AI subscriptions off Gemini CLI to Antigravity, whose terms forbid wrapping it in an app.

So **a second agent means the maker's own API key.**

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
| Pi, Gemini 4 Argon (Google API) | 1 | 132.8 s | 132.8 s | 191.2 s | 124.0 s | 11851 | $0.176 | 1/1 |
| Pi, Gemini 4 Hydrogen (OpenRouter) | 1 | 51.9 s | 51.9 s | 54.2 s | 37.2 s | 8646 | $0.084 | 1/1 |
| Pi, Gemini 4 Hydrogen (Google API) | 3 | 34.9 s (32.3–35.6) | 34.9 s (32.3–35.6) | 49.0 s (38.3–53.9) | 26.8 s (23.4–27.3) | 8895 | $0.101 | 3/3 |

**Reading it:**
- **Claude's cost is the API price of its tokens.** Spike 1 ran on Matt's Claude subscription.
- **Codex reports no cost.**
  - On the ChatGPT sign-in, the run comes out of the plan.
  - Through OpenRouter, it is billed there (the Sol runs elsewhere cost about $0.08).
- **Why Pi with Sol is slow to finish.** Its output is about the same size as Claude's (5,329 tokens against 4,762); Sol through OpenRouter simply writes more slowly. OpenAI's own API might be faster. Not tried: no OpenAI key was at hand.
- **Gemini 4 Hydrogen** came out on 2026-11-12, two days after Pi 1.5.2, so Pi did not know it. `homes/pi/models.json` declares it in Pi's own Google provider, priced as on OpenRouter ($1.50 / $7.50 per million tokens).
  - Hydrogen on Google's API is the fastest of all to a complete page (35 s), but nothing moves for 27 s before it.
  - Argon, Google's larger model, took 133 s.
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
- **The Gemini API sends the whole call in one piece**, and so does OpenRouter for Gemini models. The page appears at once.
- **Anthropic's API streams too**, according to Pi's sources. Not tried: no Anthropic key, and Claude stays on the Agent SDK in any case.

### opencode 2

**opencode publishes a tool's input only when the call is complete** (`session.tool.input.ended`). Its own test asserts this, since a change in October.
- A fix is open ([PR #58416](https://github.com/anomalyco/opencode/pull/58416)), not merged.
- The first file reaches the disk early (the theme, at 4 to 8 s), then nothing until the home page, after 50 to 80 s.

### Gemini CLI and Antigravity (studied only)

**Neither carries a file's content while it is written.** Each sends a tool call with its complete arguments, on every route: stream-json, ACP, and Antigravity's Python SDK.

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
| Pi and Sol | 5 or 6 | Every run |
| Pi and Hydrogen | 6 to 9 | Every run |
| Pi and Argon | 6 | Yes |

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
- **Another preview for combinations that stream nothing:** "files then reload", spike 1's approach C, which Matt turned down for Claude.

## Not tried, or not settled

- **GPT-6.1 Sol through OpenAI's own API** (no OpenAI key at hand). It decides whether Pi's 56 s is OpenRouter's or the model's.
- **A paid ChatGPT plan (Plus or Pro) in Codex.** It would give Sol in Codex, but would not change the preview, which code mode decides.
- **Pi with an Anthropic API key**, which would show Pi's own overhead against the Agent SDK with the same model.
- **Antigravity with a Gemini API key**, the only use its terms allow an app. Its stream was studied, not run.
- **Upstart's tools, skills and hooks inside Pi or Codex.**
- **Windows and Linux.**
- **Whether Upstart qualifies for "Sign in with ChatGPT".** It depends on whether Upstart is open source or paid; ask OpenAI.

## Recommendation

1. **Keep Claude, through the Agent SDK, as Upstart's only agent for 2.0.**
2. **If a second agent is wanted after 2.0, make it Pi**, on the maker's own API key (OpenAI or OpenRouter), inside Upstart's own sandbox. Measure Sol through OpenAI's API first.
3. **Come back to Codex** if a later version passes on what code mode writes, and if OpenAI opens ChatGPT sign-in to an app like Upstart.
4. **Leave Gemini out of the live preview** until the Gemini API streams a tool call's arguments. Antigravity stays out on its terms.

## How to run it again

```bash
cd spikes/harnesses && npm install
# homes/keys.env: OPENROUTER_API_KEY=… and GEMINI_API_KEY=… (mode 600, not in git)
CODEX_HOME=$PWD/homes/codex ./node_modules/.bin/codex login
node src/run.ts pi --model openrouter/openai/gpt-6.1-sol --label sol
node src/run.ts pi --model google/gemini-4-hydrogen --label hydrogen-direct
node src/run.ts codex --label luna
node src/run.ts codex --provider openrouter --model openai/gpt-6.1-sol --label sol-openrouter
node src/run.ts opencode --model openrouter/openai/gpt-6.1-sol --label sol
node src/shoot.ts && node src/table.ts
```
