# Spike 3: other agents and harnesses

Ran on 2026-11-14, in four rounds that day: the first runs; a second on a harness of Spaka's own on Pi and files written in the reply's text; a third on ChatGPT Plus and Google's agents over ACP; a fourth on Gemini writing through tools alone. Matt decided the same day (Q268, then Q271).

## What we learned

- No ready-made harness gives the live preview through its own tools. Codex passes on nothing of what its code mode writes, so the page reaches the app 50 to 60 s after the request; opencode 2 publishes a tool's input only once the call is complete; Gemini CLI and Antigravity over ACP send a write whole, the home page at 50 to 54 s and 31 to 34 s.
- Pi streams a tool call's arguments as the provider sends them. With GPT-6.1 Sol, the home page starts showing at 6.3 s and is never still for more than 2.6 s, as with Claude. The Gemini API sends a tool call whole, so through Pi's tool Gemini 4 Hydrogen's page arrives at once, at 34.9 s.
- OpenAI's models are about twice as slow as Claude: GPT-6.1 Sol's page is complete at 53 to 56 s through OpenRouter and 92 s on ChatGPT Plus, against 23.6 s for Claude. Sol through OpenRouter writes about 80 tokens a second, Claude about 200, Hydrogen about 300.
- A model writing each file in its reply's text gets the live preview with any provider, since every provider and ACP stream a reply's text. Gemini 4 Hydrogen this way, thinking low, matches Claude: in Pi, starts showing at 4.2 s and complete at 22.5 s for $0.051 a page; in Antigravity, 5.9 s and 20.1 s for $0.065. Matt turned the format down (Q271): files go through tools.
- Through tools alone, Gemini keeps the live preview by writing a long file in several calls, each arriving as soon as it is complete: at low thinking, with parts of 25 lines asked, the home page starts at 6.7 s and is complete at 21.9 s, with a longest still of 4.7 s between two parts. Streaming a call's arguments on Gemini is offered on Vertex AI only.
- Besides Claude's, only ChatGPT's subscription can be plugged in. A Claude subscription stays on the official binary (Pi's Claude sign-in impersonates Claude Code). Sign in with ChatGPT, OpenAI's program for apps, worked in Pi on Matt's Plus plan, and admits open-source apps. Google offers apps no route to a Google AI subscription: Gemini means the maker's AI Studio key, billed by Google Cloud, and a paid one in the EEA.
- Installing Antigravity or Codex on the maker's side would settle their license and nothing else: Antigravity's terms forbid driving it on a Google sign-in, it has no license and updates itself; Codex gives no live preview.
- Pi and opencode have no sandbox of their own. A macOS profile allowing writes only in the project held, but let them read everywhere: opencode listed the spike's folders. Spaka's confinement of such a harness must limit reads too, and be written for each system.
- Every combination wrote an acceptable page: valid htmx 4 in all, and a working form in all but one run. GPT-6.1 Sol's pages are the most crafted; the Gemini pages invent specifications, prices and named testimonials.

Decided: two adapters behind one interface, Claude through the Agent SDK and a harness of Spaka's own on Pi's libraries for other models, with files written through tools only ([ADR 0012](../adr/0012-a-second-agent-layer-of-spakas-own-on-pi.md); Q268 onward in [the v2.0 decisions](../v2.0-decisions.md)).

## The report

2026-11-14. Framing: [README.md](README.md), "Spike 3". Machine: Matt's Mac, macOS 27.0.1.

**Tried:**
- Codex 0.169.0 (OpenAI), through `codex app-server`
- Pi 1.5.2 (`@earendil-works/pi-coding-agent`), in RPC mode
- opencode 2.3.0, through `opencode run --format json`
- Gemini CLI 0.68.0, over ACP (`gemini --acp`), on the Gemini API key
- Antigravity CLI 1.5.9 (Google's release binary, signed by Google LLC), over ACP (`antigravity acp`), on the Gemini API key

**Accounts:**
- **The ChatGPT account signed in to Codex.** At first a **free** plan (`planType: "free"`), so Codex's models were GPT-6 Luna, GPT-5.6 Terra and GPT-5.6 Luna.
  - All the Codex runs used 2% of its 30-day allowance.
  - GPT-6.1 Sol was reached through OpenRouter instead.
- **ChatGPT Plus**, which Matt took on the same day. Pi signed in to it through Sign in with ChatGPT (in the browser, by Matt), for GPT-6.1 Sol and Terra on OpenAI's own API.
- **A Gemini API key from AI Studio.** It is on a paid billing account: Gemini 4 Argon has no free tier and answered.
- **An OpenRouter key**, for GPT-6.1 Sol and Gemini 4 Hydrogen.

The research for each harness, with its sources, is in [The harnesses studied](#the-harnesses-studied) (Codex, Pi, Pi's packages, opencode, Gemini CLI and Antigravity).

**A second and a third round, the same day,** answered Matt's questions after the first report. Would Spaka do better with a harness of its own, built on Pi, with every subscription plugged in? And how far do Google's own agents go on an AI Studio key, over ACP? They tried:
- Gemini writing its files in the reply's text instead of through a tool, in Pi and over ACP;
- Pi's thinking level set low, for Hydrogen and for Sol;
- Argon twice more;
- ChatGPT Plus through Sign in with ChatGPT;
- Gemini CLI and Antigravity over ACP;
- Pi Durable, Earendil's library for building an agent app on Pi, and Pi's extensions, from their packages and docs.

A fourth round tried Gemini writing through tools alone, after Matt's answer to Q271: see [Gemini through tools alone](#gemini-through-tools-alone-fourth-round).

## The method

**The request.** [Spike 1](live-generation.md)'s launch page for Lumen, with spike 1's instructions. The only change to the instructions is that "Write" became "your file-writing tool".

**Each harness ran apart from Matt's own setup:**
- its own configuration folder (`CODEX_HOME`, `PI_CODING_AGENT_DIR`, opencode's `XDG_*` folders, `GEMINI_CLI_HOME`, and `HOME` for Antigravity, which has no folder variable);
- a fresh project in a temporary folder outside any repository.

**Over ACP, the spike was the client**, as Spaka would be. It:
- wrote the files when the agent asked it to (`fs/write_text_file`);
- answered permission requests itself;
- read the reply's text as it came.

**Measured for each run, against the time the request was sent:**
- every piece of a file's content in the harness's stream;
- every file reaching the disk (polled every 50 ms).

**After each run,** the result was rendered with spike 1's preview, its pages photographed, its htmx checked, and its form filled and posted.

**Claude's figures** are spike 1's five live runs of the same request (Agent SDK, Sonnet 5.5, approach A). The 21.4 s that spike 1 quotes is its median across all three of its requests; on this request alone it is 23.6 s.

## The answer

**No harness stands in for Claude as it is driven today.** But one change on Spaka's side gives every model the live preview: the model writes each file in its reply's text, which every provider and every agent protocol streams. With that, Gemini 4 Hydrogen matches Claude's pace, both in a harness of Spaka's own on Pi and in Google's own Antigravity over ACP.

**The live preview, Spaka's defining moment:**

| Harness | Live preview | Why |
|---|---|---|
| Pi, with an OpenAI model | Yes | Pi streams a tool call's arguments as they arrive. OpenAI's API sends them a few characters at a time. |
| Any harness, files written in the reply's text | **Yes, with any model** | Every provider streams a reply's text as it is generated, Gemini included, and so does ACP (`agent_message_chunk`). Tried in Pi, Gemini CLI and Antigravity. See [Files in the reply's text](#files-in-the-replys-text-a-live-preview-for-any-model). |
| Codex, writing through its tools | No | Its GPT-6 models write files from code run by an `exec` tool ("code mode"), and Codex does not pass that tool's input on to an app. |
| opencode 2, writing through its tools | No | It publishes a tool's input only once the call is complete (a fix is open, not merged). |
| Gemini CLI and Antigravity, writing through their tools | No | Over ACP, a `write_file` call reaches the client whole, once the model has finished it. The Gemini API sends a tool call whole anyway (`partialArgs` is on Vertex only). |

**Two combinations match Claude, both Gemini 4 Hydrogen writing its files in the reply's text, with its thinking low:**

| | Starts showing | Complete | Cost a page |
|---|---|---|---|
| Claude, Agent SDK (spike 1) | 5.9 s | 23.6 s | $0.085 |
| Antigravity over ACP, Hydrogen low | 5.9 s | **20.1 s** | $0.065 |
| Pi, Hydrogen low | **4.2 s** | 22.5 s | **$0.051** |

Once they start, neither stands still longer than about half a second.

**OpenAI's models are about twice as slow as Claude, whichever route:**
- GPT-6.1 Sol: complete at 53 to 56 s through OpenRouter, and 92 s on ChatGPT Plus through Sign in with ChatGPT;
- GPT-6.1 Terra on ChatGPT Plus: 55 s.

Their pages start showing early (6 to 12 s), and the longest pause is 2 to 6 s.

**Subscriptions: only ChatGPT's can be plugged in besides Claude's, and only if OpenAI accepts Spaka.**
- **Claude:** only through the official binary, so through the Agent SDK, as today. Pi's Claude sign-in impersonates Claude Code, which Anthropic's terms forbid (Pi itself warns that it draws paid extra usage).
- **ChatGPT Plus or Pro:** "Sign in with ChatGPT", OpenAI's program for apps, which Pi implements. **It works:** Matt signed in with his new Plus plan, and Sol and Terra answered on OpenAI's own API. The program is open to open-source and local apps; paid apps go on a waitlist.
- **Google AI (Pro, Ultra):** no route for apps. Google moved personal accounts and Google AI subscriptions off Gemini CLI to Antigravity, whose terms forbid an app to drive it on a Google sign-in. **On an AI Studio key, both Google agents may be driven by an app, and both were, over ACP.** See [Gemini: the AI Studio key and ACP](#gemini-the-ai-studio-key-and-acp).

So **besides Claude's subscription and, perhaps, ChatGPT's, a second agent means the maker's own API key.** See [Spaka's own harness on Pi](#spakas-own-harness-on-pi).

**Every combination wrote an acceptable page.**
- Valid htmx 4 in all of them, and a working form in all but one run (GPT-6 Luna once wrote a form that sends nothing).
- GPT-6.1 Sol's pages are the most crafted, whichever harness drives it.
- The Gemini pages are dense and invent specifications, prices and named testimonials.

## The measurements

Medians, with min–max.
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
| Pi, GPT-6.1 Sol (OpenAI API, ChatGPT Plus through Sign in with ChatGPT) | 3 | 11.5 s (11.2–13.7) | 92.0 s (90.3–117.4) | 114.2 s (112.0–135.7) | 3.9 s (3.4–5.8) | 4745 | $0.074 | 3/3 |
| Pi, GPT-6.1 Terra (OpenAI API, ChatGPT Plus) | 3 | 9.9 s (9.6–10.4) | 55.4 s (55.2–58.4) | 68.7 s (68.4–72.3) | 2.9 s (2.8–3.4) | 3080 | $0.021 | 3/3 |
| Pi, Gemini 4 Argon (Google API) | 3 | 132.8 s (116.4–134.7) | 132.8 s (116.4–134.7) | 191.2 s (172.1–249.8) | 122.0 s (106.7–124.0) | 11851 | $0.176 | 3/3 |
| Pi, Gemini 4 Argon (Google API), files in the text | 3 | 15.2 s (10.6–17.1) | 102.8 s (89.0–107.8) | 127.6 s (124.7–143.5) | 10.9 s (6.0–13.4) | 10880 | $0.116 | 3/3 |
| Pi, Gemini 4 Hydrogen (OpenRouter) | 1 | 51.9 s | 51.9 s | 54.2 s | 37.2 s | 8646 | $0.084 | 1/1 |
| Pi, Gemini 4 Hydrogen (Google API) | 3 | 34.9 s (32.3–35.6) | 34.9 s (32.3–35.6) | 49.0 s (38.3–53.9) | 26.8 s (23.4–27.3) | 8895 | $0.101 | 3/3 |
| Pi, Gemini 4 Hydrogen (Google API), files in the text | 3 | 11.7 s (9.3–13.1) | 30.9 s (29.1–38.4) | 33.3 s (32.6–41.8) | 10.6 s (8.1–11.9) | 8447 | $0.069 | 3/3 |
| **Pi, Gemini 4 Hydrogen (Google API), files in the text, thinking low** | 3 | **4.2 s (3.7–5.0)** | **22.5 s (21.1–23.3)** | **25.5 s (23.9–26.2)** | 2.9 s (2.3–3.9) | 6024 | **$0.051** | 3/3 |
| Gemini CLI over ACP, Gemini 4 Hydrogen (Google API) | 3 | 53.6 s (50.4–54.0) | 53.6 s (50.4–54.0) | 67.8 s (65.2–76.0) | 35.1 s (31.3–38.0) | 8283 | $0.122 | 3/3 |
| Gemini CLI over ACP, Gemini 4 Hydrogen (Google API), files in the text | 3 | 18.1 s (13.6–21.0) | 41.7 s (34.6–45.1) | 45.0 s (37.5–49.0) | 16.5 s (12.3–19.9) | 7127 | $0.072 | 3/3 |
| Antigravity over ACP, Gemini 4 Hydrogen medium (Google API) | 3 | 32.4 s (31.4–34.4) | 32.4 s (31.4–34.4) | 35.7 s (34.5–46.9) | 31.4 s (27.1–32.4) | 8749 | $0.097 | 3/3 |
| Antigravity over ACP, Gemini 4 Hydrogen medium (Google API), files in the text | 3 | 11.3 s (9.5–12.1) | 34.4 s (33.2–36.6) | 38.2 s (35.9–41.9) | 10.0 s (8.1–10.4) | 8664 | $0.082 | 3/3 |
| **Antigravity over ACP, Gemini 4 Hydrogen low (Google API), files in the text** | 3 | **5.9 s (3.8–6.2)** | **20.1 s (18.5–24.6)** | **22.8 s (20.6–27.1)** | 4.8 s (2.5–4.9) | 6419 | **$0.065** | 3/3 |
| Antigravity over ACP, Gemini 4 Argon low (Google API), files in the text | 2 | 20.3 s (9.6–30.9) | 109.9 s (91.8–127.9) | 129.6 s (113.2–146.1) | 16.7 s (6.5–27.0) | 11262 | $0.136 | 2/2 |
| Antigravity over ACP, Gemini 4 Carbon low (Google API), files in the text | 2 | 10.0 s (9.9–10.2) | 86.3 s (80.4–92.3) | 99.4 s (98.5–100.3) | 6.7 s (6.6–6.9) | 9231 | $0.115 | 2/2 |

"Thinking low" is Pi's `--thinking low`; the other Pi runs used Pi's default, medium. Antigravity takes the effort in the model's name (`gemini-4-hydrogen-low`); Gemini CLI's thinking level was left as it was. "Files in the text" is described [below](#files-in-the-replys-text-a-live-preview-for-any-model). Its "longest still" is the wait before the reply's first character: after it, nothing stands still for more than 0.7 s with Hydrogen.

**Reading it:**
- **Claude's cost is the API price of its tokens.** Spike 1 ran on Matt's Claude subscription.
- **Codex reports no cost.**
  - On the ChatGPT sign-in, the run comes out of the plan.
  - Through OpenRouter, it is billed there (the Sol runs elsewhere cost about $0.08).
- **Why Pi with Sol is slow to finish.** Its output is about the same size as Claude's (5,329 tokens against 4,762), and lowering its thinking only trims it (4,147 tokens, complete at 52.7 s). Sol through OpenRouter simply writes slowly:
  - about 80 tokens a second;
  - Claude about 200;
  - Hydrogen about 300.
  OpenAI's own API was no faster on ChatGPT Plus: Sol's page is complete at 92 s through Sign in with ChatGPT, against 56 s through OpenRouter. A paid key was not tried.
- **Gemini 4 Hydrogen** came out on 2026-11-12, two days after Pi 1.5.2, so Pi did not know it. The spike declared it in Pi's own Google provider, priced as on OpenRouter ($1.50 / $7.50 per million tokens).
  - Through a tool, Hydrogen on Google's API is complete at 35 s, but nothing moves for 27 s before it.
  - Writing its files in the reply's text, with its thinking low, it matches Claude.
  - Argon, Google's larger model, took 117 to 135 s through a tool, and 89 to 108 s in the text; through Antigravity at effort low, 92 to 128 s.
  - Carbon, Google's top model, through Antigravity at effort low: complete at 80 to 92 s, for $0.12 a page. Its pages are the most crafted of the Gemini models.
- **Gemini CLI through its tool is the dearest Hydrogen route** ($0.12): it sends the whole context again at each of its 9 to 13 model turns.
- **Pi prices the ChatGPT Plus runs as on the API;** on the plan they come out of its allowance instead.
- **Runs left out**, each for a fault of the spike's own driving:
  - the first opencode run, which worked in the spike's own folder rather than the project: opencode takes its folder from `PWD`, not from the process's folder;
  - a first Codex run, before it was told to use `apply_patch`; it wrote every file with `cat > file <<EOF`;
  - two Codex runs made before the app asked for its experimental events;
  - one Codex run with code mode turned off, which wrote nothing.

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

### Gemini CLI and Antigravity, over ACP

**Writing through their tools, neither carries a file's content while it is written.**
- Over ACP, a `write_file` call reaches the client whole, once the model has finished it: Gemini CLI's home page at 50 to 54 s, Antigravity's at 31 to 34 s.
- Their docs say the same of their other routes: stream-json and Antigravity's Python SDK.

**Writing their files in the reply's text, both give the live preview,** since ACP streams the reply's text. See [Gemini: the AI Studio key and ACP](#gemini-the-ai-studio-key-and-acp).

## Files in the reply's text: a live preview for any model

**The idea.** A harness of Spaka's own does not have to take a file from a tool call. The model can write each file in its reply instead, in a block of its own:

```
<file path="pages/index.liquid">
…the file's whole content…
</file>
```

**Every provider streams a reply's text as it is generated,** Gemini included. Spaka reads the blocks as they come:
- it sends each block to the preview while it grows;
- it writes the file when the block closes.

The spike tried it this way:
- the instructions ask for blocks;
- the blocks are read from the reply's text as it grows;
- the harness's write tool is withdrawn:
  - Pi: `--tools read,edit,bash`;
  - Gemini CLI: `tools.exclude: ["write_file"]`;
  - Antigravity, which has no such setting: its permission request for a write would be refused. It never asked: in this mode neither Google agent called a tool at all.

**What happened in Pi, in 12 runs of Hydrogen and Argon:**
- **Every run kept to the format:** no Markdown fence, no tool used at all, every page complete and its form working.
- **Hydrogen's page starts showing at 11.7 s,** instead of arriving whole at 35 s, and is complete sooner (30.9 s against 34.9 s).
- **The one pause left is the wait before the first character:** Gemini's thinking, 6 to 13 s. Once the reply starts, nothing stands still for more than 0.7 s with Hydrogen, 1.4 s with Argon.
- **With Pi's thinking set low** (`--thinking low`; Pi's default is medium), Hydrogen starts in 2.3 to 3.9 s:
  - the home page starts showing at 4.2 s and is complete at 22.5 s, Claude's pace (5.9 s and 23.6 s);
  - the longest pause, the wait at the start included, is 2.9 s;
  - it writes less (6,024 tokens against 8,447) and costs $0.05 a page;
  - the pages are as complete as with medium thinking.
- **Argon writes more, and more slowly:** complete at 103 s, done at 128 s.

**Over ACP, with Google's own agents (9 runs of Hydrogen, 4 of Argon and Carbon):**
- **Every run kept to the format,** and every page is complete with its form working.
- **Antigravity, effort low:** the page starts at 5.9 s and is complete at 20.1 s, the fastest of the spike.
- **Antigravity, effort medium:** 11.3 s and 34.4 s.
- **Gemini CLI**, whose thinking level the spike did not set: 18.1 s and 41.7 s.
- **Argon and Carbon, effort low, through Antigravity:** complete at 110 s and 86 s.
- **Once the reply starts, the text comes in small, even pieces** (213 to 297 pieces for the home page), as in Pi.

**What it costs:**
- **Spaka's instructions must teach the format,** and Spaka must take the blocks out of the reply it shows the maker.
- **A small change to an existing file still goes through the edit tool,** which Gemini sends whole. Such a change is short, so it lands quickly anyway.
- **It is Spaka's own convention, not a provider's feature.** Each model must be checked to keep to it, and a model may drift on long sessions; only one request was tried.
- **Claude keeps its write tool:** the Agent SDK streams it already.

## Gemini: the AI Studio key and ACP

### The AI Studio key

**What it is.** A Gemini Developer API key, made in AI Studio for a Google Cloud project.
- With a billing account linked to the project, it is on the paid tier.
- Without one, it is on the free tier.
- The spike's key is paid.

**What it reaches: every Gemini model on the API, Gemini 4 included.** Antigravity's model list on the key gives:
- Gemini 4 Carbon, Hydrogen and Argon, each at several effort levels (low to high, xhigh for Hydrogen);
- Gemini 3.8, 3.7 and 3.6 Flash;
- Gemini 3.1 Pro.

Carbon, kept to Ultra on a Google AI subscription, is open to any paid key. Gemini CLI 0.68 does not list Gemini 4, but it took `--model gemini-4-hydrogen` and the model answered.

**What it costs, and who pays:**
- **Billed by Google Cloud, apart from any Google AI subscription.** The subscription raises limits only in AI Studio's web interface. Google Developer Program credits apply to the API.
- **Prices:** see [Google (Gemini)](#google-gemini). One launch page with Hydrogen cost $0.05 to $0.15, depending on the harness and the way it writes (table above).
- **Terms:**
  - in the EEA, Switzerland and the UK, an app's users must be on paid services, so a French maker needs a paid key;
  - free-tier prompts may be read by Google's reviewers;
  - the API is meant "for professional or business purposes, not for consumer use", by people 18 or older.

**Who may drive Google's agents with it: any app.** Google's own answer for a third-party agent is an AI Studio or Vertex key:
- Gemini CLI's FAQ;
- Antigravity's FAQ, which forbids only consumer plans;
- the Google collaborator's answers on GitHub.

**For a maker, it is a heavier start than a sign-in:** a Google Cloud billing account, a key, then the key pasted into Spaka.

### ACP, the Agent Client Protocol

**What it is.** An open protocol, started by Zed for editors: JSON-RPC 2.0 over the agent's standard input and output. The client (an editor, or Spaka) starts the agent, opens sessions and sends prompts. The agent streams updates back:
- the reply's text (`agent_message_chunk`) and thinking (`agent_thought_chunk`);
- tool calls and their progress (`tool_call`, `tool_call_update`, with the diff of an edit);
- usage.

It asks the client for permission (`session/request_permission`). If the client offers, it reads and writes files through it (`fs/read_text_file`, `fs/write_text_file`).

**Who speaks it:**

| Agent | How | Tried here |
|---|---|---|
| Gemini CLI | `gemini --acp` | Yes |
| Antigravity CLI | `antigravity acp` | Yes |
| opencode | `opencode acp` | No (the command exists) |
| Codex | Zed's adapter, `@zed-industries/codex-acp` (Apache-2.0) | No |
| Claude | `@agentclientprotocol/claude-agent-acp` (Apache-2.0), on the Agent SDK | No |
| Pi | `pi-acp` (MIT, community) | No |

**What it would give Spaka:**
- one client for several agents;
- sessions, cancel, and permissions answered by Spaka;
- Spaka's MCP servers passed when a session opens (Spaka's tools);
- the files written through Spaka when the agent agrees. Gemini CLI asked the client to write every file; Antigravity wrote them itself.

**What it lacks for the live preview: a tool call's input while it is generated.** Both Google agents send a call only once it is complete, as the Gemini API gives it to them, so with them the live preview needs files in the reply's text, which ACP does stream.

*Corrected on 2026-11-26 ([spike 4](acp.md)):* this paragraph first said that the protocol has no field for a call's input while it is generated. It has: a call's `pending` status means "the input is either streaming or awaiting approval", and `tool_call_update` may send `rawInput` again as it grows. Whether an agent does is its adapter's choice.

### Gemini CLI 0.68 over ACP

**How it ran:**
- `GEMINI_CLI_HOME` set to its own folder, with its own system settings files and file storage instead of the keychain;
- its settings on `gemini-api-key`;
- the instructions in the project's `GEMINI.md`;
- `--approval-mode auto_edit`, under the spike's sandbox profile.

**Through its `write_file` tool:**
- each file arrives whole; the home page at 53.6 s (50.4 to 54.0);
- it takes 9 to 13 model turns, sending the whole context again each time: 120,000 to 190,000 input tokens a page, so $0.12 to $0.15, the dearest Hydrogen route.

**Files in the text:**
- the page starts at 18.1 s and is complete at 41.7 s;
- $0.07, since one turn writes everything;
- the spike did not set Hydrogen's thinking level, which Gemini CLI takes from its settings rather than a flag.

**A bug in 0.68:**
- Answered "file not found" as the protocol says, a new file's write fails. Gemini CLI turns the error object into "[object Object]", so it never recognizes a missing file.
- The client must answer an empty file instead. The first run, before that workaround, lost 11 s making the files with the shell.

**Standing:**
- Google keeps it for organizations and paid keys, "not optimized for Gemini 4+".
- Apache-2.0, a 99 MB bundle that Spaka may ship.

### Antigravity CLI 1.5.9 over ACP

**How it ran:**
- the release binary from Google's GitHub (84 MB to download, 223 MB unpacked, signed "Developer ID Application: Google LLC");
- `HOME` set to its own folder, since it has no folder variable;
- its settings with `"modelProvider": "gemini"`, and the key in `GEMINI_API_KEY`;
- `antigravity acp --disable-telemetry`, under the spike's sandbox profile;
- the model chosen per session (`session/set_model`), with the effort in its name (`gemini-4-hydrogen-low`).

**Its ACP server offers more than Gemini CLI's:**
- sessions that load, resume, list and close;
- images in prompts;
- an addition to its system prompt (`_meta.antigravity.systemPrompt.append`), not used here.

**Through its `write_file` tool:**
- Hydrogen wrote all five files in one response: five complete calls at once, at 31 to 34 s;
- Antigravity wrote them itself, asking permission for each;
- about $0.10 a page.

**Files in the text:**
- effort low: the page starts at 5.9 s and is complete at 20.1 s, for $0.065;
- effort medium: 11.3 s and 34.4 s;
- Argon, effort low: 20.3 s and 109.9 s (2 runs), $0.14;
- Carbon, effort low: 10.0 s and 86.3 s (2 runs), $0.12; its pages are the most crafted of the Gemini models.

**Kept apart, on the key:**
- no Keychain item was made;
- everything went into its `HOME`: settings, conversations, its "brain", logs, 7.3 MB after 13 runs.

**Updating:**
- At each start it launches an update process in the background ("Already on the latest version" here).
- Under the spike's sandbox it could not replace its own binary. Spaka would have to make sure of that, since no documented switch turns it off.

**Its terms and license:**
- **On a key, an app may drive it;** on a Google sign-in, it may not.
- **It has no license:** Spaka may not ship it. The maker would install it, or Spaka would fetch it from Google at first use; whether that counts as redistribution is not settled.
- **Releases come almost daily,** with open bugs on hangs at exit and orphaned processes.

### Which harness for Gemini

| | Pi (Spaka's own harness) | Antigravity over ACP | Gemini CLI over ACP |
|---|---|---|---|
| Live preview | Files in the text | Files in the text | Files in the text |
| Hydrogen, fastest to a complete page | 22.5 s (thinking low) | **20.1 s** (effort low) | 41.7 s |
| Cost a page, that way | **$0.05** | $0.065 | $0.07 |
| Other providers | **All** (OpenAI, Anthropic key, OpenRouter…) | Gemini only on a key | Gemini only |
| License; can Spaka ship it | **MIT; yes** | None; no | Apache-2.0; yes |
| Kept apart from the maker's own | Its folder variable | `HOME` only | Its folder variable, plus settings paths |
| Spaka's tools, instructions, checks | In-process tools and hooks | MCP at session start, `GEMINI.md`, prompt addition, hooks | MCP at session start, `GEMINI.md`, hooks |
| Standing | Fast-moving, open, new owner | Google's current agent, daily releases, closed | Kept for organizations, not tuned for Gemini 4 |

**Antigravity is the fastest and Google's own,** but closed, unshippable, self-updating and Gemini-only. **Pi** reaches every provider with one harness Spaka can ship and confine. **Gemini CLI** brings nothing the other two do not.

## Signing in: what each account allows

### ChatGPT (OpenAI)

**Codex's own ChatGPT sign-in, started by an app.** OpenAI's app-server docs: "App-server authentication has never been permitted for commercial or hosted services."

**"Sign in with ChatGPT" (SIWC), the route OpenAI offers to apps.**
- **Who may use it:** open-source projects, personal apps running locally, and "selected private apps". Paid or hosted apps must join a waitlist.
- **Plans:** Plus and Pro only.
- **The tokens.**
  - With Codex, the app runs the OAuth and holds the tokens. That is against Spaka's rule of never handling a maker's tokens.
  - Pi implements SIWC itself (with the host app's name) and keeps the tokens in its own folder, so Spaka would not hold them.
- **Spaka is in the first category:** v2 is open source under MIT and free ([the v2.0 decisions](../v2.0-decisions.md), confirmed by Matt on 2026-11-14). Whether OpenAI admits it is seen at the first sign-in under Spaka's name.

**Tried with Matt's Plus plan, taken on 2026-11-14:**
- **Signing in:** Pi printed OpenAI's sign-in address. Matt signed in in his browser, and Pi kept the tokens in its own folder, in a file readable by Matt alone. The client was registered under the name Pi; Spaka's would carry its own.
- **Models:** Pi's catalog for OpenAI lists GPT-6.1 Sol and Terra, GPT-6 Astra, Sol and Luna, and older ones; Sol and Terra were tried, on OpenAI's own API.
- **The live preview works,** as with an API key: a tool call's arguments arrive a few characters at a time.
- **But it is slow.** Sol's home page is complete at 92 s, against 56 s through OpenRouter. Terra's is complete at 55 s.
- **Whether OpenAI serves a plan's requests more slowly than a paid key's is not known.** No OpenAI key was at hand to compare.
- **Pi prices each run as on the API** ($0.07 for Sol, $0.02 for Terra). On the plan, it comes out of the Plus allowance instead.

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
- organizations' Code Assist licenses.

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
- **Its terms forbid Spaka's use.** The FAQ says wrapping `agy` in a third-party app "is not supported under consumer plans". The Additional Terms (§6) make it a breach that can lead to suspension.
- **A Google collaborator spelled it out** on GitHub (2026-11-12): starting the unmodified `agy -p` or `agy acp` from a third-party app breaches §6 on a personal sign-in. So does replacing its identity instructions, which Spaka's own instructions would do.
- **Google sends apps to an API key or Vertex.** On a key, the spike drove Antigravity over ACP: see [Antigravity CLI 1.5.9 over ACP](#antigravity-cli-159-over-acp).
- **Other problems:**
  - on a Google sign-in, its login sits in the macOS Keychain, with no way to keep it apart from the maker's own (on a key, none is made);
  - no folder variable keeps its configuration apart: only `HOME`;
  - it is closed, with no right to redistribute;
  - it updates itself;
  - it has known hangs on exit.

### OpenRouter

**One key reaches every model above** (OpenAI, Google, and others), at about the providers' prices.
- Pi, opencode and Codex all accept it.
- For Gemini models it sends tool calls whole, as Google does.

### Claude through another harness

**Not an option.**
- **Pi's Claude subscription login** impersonates Claude Code (its OAuth client and user agent). Anthropic forbids that, and it breaks Spaka's own rule.
- **opencode's "Claude Agent" provider** does run the official `claude` binary through the Agent SDK. But it drops the tool-input stream too, and adds a layer for nothing.

## Confinement (ADR 0007)

**Codex has its own sandbox** (Seatbelt on macOS, bubblewrap on Linux, a native one on Windows).
- In `workspace-write` with approvals declined by the app, the runs wrote only in the project.
- It can also limit reading (`readOnlyAccess`).

**Gemini CLI and Antigravity have their own too**, from their docs; the spike used its own profile instead, as for Pi:
- Gemini CLI: Seatbelt profiles on macOS (the default lets it write in the project only, and read everywhere), Docker or Podman, gVisor or LXC on Linux, a native one on Windows.
- Antigravity: Seatbelt on macOS, namespaces on Linux, AppContainer on Windows 11 24H2 or later. Its `auto` mode has a second, smaller model review the commands that would leave the sandbox.

Over ACP, Spaka also answers every permission request itself, and may write the files itself (`fs/write_text_file`), which Gemini CLI asks it to.

**Pi and opencode have none.** The spike ran them under macOS's sandbox (`sandbox-exec`), with a profile that allows writing only in:
- the project;
- the harness's own folder;
- the temporary folders.

**The profile held.** In its misdirected first run, opencode tried to write `theme.css` into the spike's folder, and the sandbox refused it.

**But it let them read everywhere.** opencode listed the spike's folders, including the one that holds the API keys (it did not read them). Spaka's profile for such a harness must:
- **also limit reading**, to the project, the harness's folder and the system;
- be written again for Windows and Linux. Pi dropped its own sandbox example in 1.5.0.

**Answering a refused action without asking the maker:**

| Harness | How |
|---|---|
| Codex | The app answers its approval requests `decline`. |
| Pi | A `tool_call` hook can block a call. |
| opencode | Rules that deny, or a reply `reject` through its API. |

## What Spaka gives the agent

From each harness's sources and docs; not tried in the spike.

| | Codex | Pi | opencode | Claude Agent SDK (today) |
|---|---|---|---|---|
| Spaka's own tools | Dynamic tools (experimental; can return an image), or an MCP server outside the app | Native tools in the process, or MCP | MCP outside the app, or an opencode plugin | In-process MCP server |
| Agent Skills (SKILL.md) | Yes | Yes | Yes | Yes |
| Instructions | `developerInstructions`, or the base prompt replaced | `--system-prompt` or `--append-system-prompt` | `AGENTS.md`, or a custom agent | System prompt |
| End-of-turn check that can keep the agent going | Stop hook | `agent_before_settle` | None: re-prompt from a plugin | Stop hook |
| Check after each tool | PostToolUse | `tool_result` | `execute.after` | PostToolUse |
| Web search | Built in (OpenAI's index) | None: an extension or Spaka's own tool | `webfetch`; search needs a search provider's key | Built in |
| Kept apart from the maker's own setup | `CODEX_HOME`, except skills from `~/.agents/skills` and `/etc/codex` | `PI_CODING_AGENT_DIR` and flags | `XDG_*` folders and flags, except `~/.agents/skills` and system settings | `CLAUDE_CONFIG_DIR` |

## Shipping

| | License | Size (macOS arm64) | Can Spaka bundle it | Release pace |
|---|---|---|---|---|
| Codex | Apache-2.0 | 281 MB binary; a standalone app-server of about 88 MB compressed | Yes | Near daily; protocol tied to each version |
| Pi | MIT | 24 MB package; 104 MB of Node packages here; runs on Electron's own Node | Yes | Fast: 0.73 to 1.5 in six months, under a new owner (Earendil) |
| opencode | MIT | 224 MB binary (Bun) | Yes, re-signed | Several a week; V1 to V2 broke its API a month ago |
| Gemini CLI | Apache-2.0 | 96 MB | Yes | Weekly; maintained for organizations |
| Antigravity CLI | None | 84 MB | No | Daily, self-updating |

## The pages

| Combination | htmx attributes, all valid | Form posted |
|---|---|---|
| Claude | 5 to 11 | Every run |
| Codex and Luna | 0 to 5 | 2 of 3: one run wrote a form that goes to `#waitlist` and no data source |
| Codex and Sol | 6 | Both |
| opencode and Sol | 5 | Every run |
| Pi and Sol (thinking medium or low) | 5 or 6 | Every run |
| Pi and Hydrogen (through a tool, or in the text, thinking medium or low) | 6 to 9 | Every run |
| Pi and Argon (through a tool, or in the text) | 6 to 17 | Every run |
| Pi and Sol or Terra on ChatGPT Plus | 4 to 6 | Every run |
| Gemini CLI and Hydrogen, over ACP (through a tool, or in the text) | 5 to 10 | Every run |
| Antigravity and Hydrogen, over ACP (through a tool, or in the text, effort low or medium) | 6 to 8 | Every run |
| Antigravity and Argon or Carbon, over ACP, in the text, effort low | 8 to 17 | Every run |

**By eye:**
- **GPT-6.1 Sol's pages are the most crafted**, whichever harness drives it: an editorial layout, and a drawn reading lamp over a book in SVG.
- **Claude's page is simpler and as clean.**
- **The Gemini pages are the longest and densest.** They invent specifications (lumens, battery, weight), founder prices and named testimonials ("Dr. Helena …"). On a page for a product not yet launched, that would need watching.

## What Spaka's agent layer would need to hold a second agent

Not built; what the spike showed it would take.

- **An adapter per harness** that turns its stream into the preview's events: a file's content as it grows, a file complete, a tool used, the turn's end. The spike's were throwaway versions, for Codex, Pi and opencode.
- **Instructions per harness and per model.** Claude's instructions name its tools. Codex's model must be told to write with `apply_patch`.
- **Spaka's sandbox around harnesses that have none**, limiting reads as well as writes, on each system.
- **Spaka's tools and hooks, given through each harness's own mechanism:**
  - the preview tool, `find_blocks` and the rest;
  - the end-of-turn checks;
  - the checks after each tool.
- **A key per provider**, entered by the maker and kept by Spaka (or by the harness, in its own folder).
- **For a model that sends tool calls whole (Gemini), files in the reply's text.** Without that, only "files then reload", spike 1's approach C, which Matt turned down for Claude.

## Spaka's own harness on Pi

**Matt's question:** rather than another ready-made harness, would Spaka do better with a harness of its own, built on Pi, with every subscription plugged in?

### What it would be

**Not the `pi` program, but Pi's libraries in Spaka's main process,** as the Agent SDK is today. Electron 45's Node meets their requirement (22.19 or later).
- **`pi-ai` for the models:** about fifty providers, by API key or sign-in. It streams text, thinking and a tool call's arguments as events.
- **A loop around it:** `pi-agent-core`, the one Pi's own program uses, or `pi-durable` (below).
- **Spaka's tools as native tools,** and an adapter of Spaka's own from the events to the preview's.

The spike drove the `pi` program over RPC; the libraries themselves were not run.

### What blocks each subscription

| Account | Through Spaka's own harness | Why |
|---|---|---|
| Claude Pro or Max | **No** | Pi's Claude sign-in uses Claude Code's OAuth client and a `claude-cli` user agent. Anthropic does not permit third-party apps to offer Claude.ai login or to route requests through a plan's credentials, and Pi itself warns that the sign-in draws paid extra usage. It is also against Spaka's own rule. A Claude subscription stays on the Agent SDK, which runs the official binary. |
| ChatGPT Plus or Pro | **Yes, if OpenAI accepts Spaka** | Pi implements "Sign in with ChatGPT" in `pi-ai`: each sign-in registers a client under the app's name, and the token goes to OpenAI's own API, which streams a tool call's arguments. The program is open to open-source and locally run apps; a paid app applies through an interest form. |
| ChatGPT Free or Go | No | Sign in with ChatGPT is for Plus and Pro. Matt's free plan cannot try it. |
| Google AI Pro or Ultra | **No** | Google offers apps no route: Antigravity's terms forbid it, and Pi removed its Gemini CLI and Antigravity sign-ins in 0.71.0 (2026-04-30). |
| GitHub Copilot | No | Pi's sign-in passes itself off as VS Code's Copilot Chat. |
| API keys: OpenAI, Google, Anthropic, OpenRouter and others | Yes | A paid key for Gemini in the EEA. An Anthropic key reaches Claude through Pi without the subscription. |

**Pi's other ChatGPT sign-in, `openai-codex`, reuses Codex's own OAuth client.** Pi calls it superseded by Sign in with ChatGPT; Spaka would leave it out, as it would the Claude and Copilot sign-ins.

**So "every subscription" comes down to two agent layers:**
- the Agent SDK for a Claude subscription, as today;
- Spaka's own harness for everything else: ChatGPT Plus or Pro if OpenAI accepts Spaka, and the maker's API keys.

### What it settles, and what it leaves

**Settled:**
- **The live preview with every provider:** a tool call's arguments with OpenAI and Anthropic, files in the reply's text with Gemini. Hydrogen this way matches Claude's pace.
- **Spaka's tools, skills and checks** given natively, with Pi's hooks (`tool_call`, `tool_result`, `agent_before_settle`).
- **Confinement by construction.** In Pi's libraries the built-in tools reach files only through an environment the host provides. Spaka's could reach the project alone, and run a shell command only inside Spaka's sandbox, or offer none. The macOS-only sandbox profile around the whole program is then no longer needed for file tools.

**Left:**
- **Two agent layers to keep,** with instructions and checks per model family, and each model checked against Spaka's requests.
- **Pi's pace:** 0.73 to 1.5 in six months, under a new owner.
- **Web search**, which Pi does not have (see [Pi's extensions](#pis-extensions)).
- **The maker's keys,** kept by Spaka (in the system's keychain) or by Pi in its own folder.
- **Sign in with ChatGPT's terms:** whether a closed or paid Spaka is accepted, which only OpenAI can say.

### Pi Durable

**`@earendil-works/pi-durable` 1.5.2,** MIT, announced with Pi 1.0 ([post](https://earendil.com/posts/pi-durable/)). Its README opens with: "Experimental. The API changes without notice between releases."

**What it is: a library for agent apps, not a coding agent.**
- Conversations, model turns and tool calls are committed to storage (SQLite, or memory) before anything is shown.
- If the process dies mid-turn, reopening the storage picks the work up where it stopped.
- It also has forks, compaction in the background, extensions (prompt sections, tools, hooks, durable tasks) and a code mode.

**For the live preview, it carries a tool call's arguments as they arrive.** `watch()` delivers `docs["pi.live"].generation.message`, the reply in progress.
- It is committed at most every 100 ms (`settings.progress.partialIntervalMs`).
- Each tool call's arguments are fed by a streaming JSON parser from every `toolcall_delta`, so a `write` call's content grows there as text does.

**For confinement, every built-in tool goes through the host's `env`:**
- an execution environment built per conversation, from its folder;
- `NodeExecutionEnv` serves a folder;
- a custom one can serve a container or a virtual file system.

**For Spaka, the fit is partial:**
- Spaka already keeps its own record of a session and its snapshots, so Durable's storage would be a second record of the conversation.
- What it adds is resuming after a crash, and a stream already shaped for an interface.
- `pi-agent-core` is the lighter base. Durable is worth a closer look once its API settles.

### Pi's extensions

**Pi is easy to extend, and many people do:** its gallery lists 5,355 packages. The full review, with each package's version, license, downloads and source, is in [Pi's packages](#pis-packages). Nothing was installed or run.

**An extension runs inside Pi's process with all its rights,** and sees prompts, files and credentials. So Spaka would:
- bundle the few it uses as reviewed code of its own;
- load nothing else (`--no-extensions` with `-e <path>`, or `noExtensions` in Pi's SDK);
- never install a package at start (`-e npm:…` does);
- never load anything from the maker's own Pi folder or a project's `.pi/`.

**No package opens a subscription that Pi's own sign-ins do not.**
- Every community route to Claude, ChatGPT through Codex, Gemini or Antigravity, Copilot, Cursor or Grok does one of two things:
  - reuses the vendor's own client and passes itself off as its program (some say in their README that this may break the vendor's terms);
  - drives the vendor's program, which Google calls a breach for Antigravity.
- Several pool accounts to get round quotas.
- `pi-claude-bridge` runs Claude through the official Agent SDK inside Pi: where Spaka already is, with one more layer.
- Sign in with ChatGPT, built into Pi, stays the only official route.

**No package gives the live preview, and none writes files from the reply's text.** That part would be Spaka's own:
- **Inside Pi:** an extension's `message_update` handler receives the reply in progress, with a `write` call's arguments already parsed as they grow. That is simpler than rebuilding them from the RPC stream's deltas, as the spike did. Read from Pi's docs, not run.
- **Other edit formats:** `apply_patch`, hash-anchored lines and Armin Ronacher's single-payload edit stream changes, not a file's content, which makes the preview harder.

**Confinement:**
- **Nothing official replaces the sandbox Pi dropped.** Earendil points to Gondolin, micro-VMs that need QEMU: too heavy for a maker's machine.
- **The community sandboxes wrap Pi's tools from inside its process,** and most ask the user before each refused action, which Spaka does not do. Most are built on Anthropic's `sandbox-runtime`. `@yandy0725/pi-sandbox` is the only one with a Windows backend: a reference for later.
- **Spaka's own boundary stays the design:** its execution environment, or its sandbox around the whole process.

**Worth taking or copying:**
- **Web search: `pi-web-search`.** It uses the current model's own search (OpenAI's `web_search`, Anthropic's web search, Gemini's grounding), so no other key is needed and queries go only to the maker's provider.
  - `pi-web-access` is the most used, but it sends queries to Exa by default.
  - Whether a ChatGPT plan's requests may use OpenAI's search is not confirmed.
- **Asking the maker a question: `@thinkrail/pi-ask-user-question`** (JetBrains, Apache-2.0). It is close to Claude's AskUserQuestion, with a hook for an app's own interface.
  - Alternatively, the tool lives in Spaka's own MCP server. Pi's MCP client gives up after 60 s unless the server sends progress.
- **Testing an extension without a model: `pi-coding-agent-test`.**
- **Embedding Pi in an Electron app: Pace,** a Pi interface in Electron (Apache-2.0). It is a reference, though it shares the user's Pi folder, which Spaka would not.

## Not tried, or not settled

- **A paid OpenAI API key.** On ChatGPT Plus through Sign in with ChatGPT, Sol was slower than through OpenRouter (92 s against 56 s). A key would tell whether OpenAI serves a plan's requests more slowly.
- **Codex on the Plus plan.** It would give Sol in Codex, but would not change the preview, which code mode decides.
- **Pi's libraries driven directly** (`pi-ai` with `pi-agent-core`, or Pi Durable) rather than the `pi` program over RPC.
- **Files in the reply's text over a whole session:** edits, several pages, other requests. Only spike 1's launch request was tried, and only with Gemini models.
- **Pi with an Anthropic API key**, which would show Pi's own overhead against the Agent SDK with the same model.
- **The other agents over ACP:** opencode (`opencode acp`), Codex (`codex-acp`), Claude (`claude-agent-acp`) and Pi (`pi-acp`). Tried in [spike 4](acp.md), but for opencode: whether a file arrives while it is written depends on each adapter, not on ACP (this line first said ACP carries no call's input while it is generated).
- **Hydrogen's thinking level in Gemini CLI**, which it takes from its settings, not a flag.
- **What Antigravity offers an app beyond the run:** its addition to the system prompt, MCP servers passed at session start, its own sandbox and modes.
- **Spaka's tools, skills and hooks inside Pi, Codex or Google's agents.**
- **Windows and Linux.**
- **Sign in with ChatGPT under Spaka's own name.** Spaka is open source, the program's first category; the sign-in was tried under Pi's name.
- **Whether Spaka may fetch Antigravity from Google at first use**, since it may not ship it.

## If the maker installs the agent

Matt's question after the report: rather than shipping Antigravity or Codex, could Spaka ask the maker to install it, and drive it? That settles the license and nothing else.

| Installed by the maker | What it settles | What stays |
|---|---|---|
| Antigravity | The license: Spaka distributes nothing | A Google sign-in stays forbidden: starting the unmodified `agy acp` from a third-party app breaches §6 on it. On an AI Studio key it is allowed, but Pi does almost as well (22.5 s against 20.1 s, cheaper). It updates itself, so Spaka cannot hold its version or its ACP behavior. |
| Codex | Nothing: Apache-2.0, Spaka could ship it already | No live preview: Codex does not pass on what code mode writes. Its ChatGPT sign-in is not OpenAI's route for apps; Sign in with ChatGPT is, and Pi has it. |
| Claude Code | This is today's design: the official binary, driven by the Agent SDK | The message to Anthropic about the subscription ([ADR 0002](../adr/0002-claude-runs-through-the-unmodified-official-binary.md)). |

**Pi in front of the vendors' agents** (Claude Code, Codex, agy) would only relay: two nested agent loops, the preview still decided by the agent underneath, the subscription by its terms. `pi-claude-bridge` does it for Claude. The single point Spaka needs is its own agent layer, one interface with an adapter per agent; for vendors' agents, ACP is the standard protocol.

## Recommendation, and Matt's decision

**Decided (Q268, Matt, 2026-11-14): two adapters behind one interface.**
1. **Claude, through the Agent SDK** and the official binary, as today: a Claude subscription or an Anthropic key. No other route to that subscription is allowed.
2. **A harness of Spaka's own on Pi's libraries** for other models:
   - files written in the reply's text, so every model has the live preview;
   - Spaka's own execution environment, reaching the project alone;
   - ChatGPT Plus or Pro through Sign in with ChatGPT (Spaka is open source), the maker's Gemini key from AI Studio first (Hydrogen, thinking low: Claude's pace at about 60% of its API price), then other keys.
3. **Antigravity and Codex stay out,** even installed by the maker: they open no subscription Spaka may use, and Codex gives no live preview. An ACP adapter can come later if a vendor's agent brings what Pi does not.

Its design follows, from Q269, in [the v2.0 decisions](../v2.0-decisions.md). Point 2's files in the reply's text were then turned down (Q271): see the next section.

## Gemini through tools alone (fourth round)

Matt's answer to Q271: files go through tools, never in the reply's text, and Gemini needs a fix that keeps the live preview through tools. Tried on 2026-11-14 with Gemini 4 Hydrogen, one model turn of the launch request each, the tools not run.

**Streaming a call's arguments: Vertex AI only.**
- **The Gemini API's `streamGenerateContent`** refuses the option on the AI Studio key: "streamFunctionCallArguments parameter is only supported in Gemini Enterprise Agent Platform mode, not in Gemini Developer API mode".
- **Vertex AI** (`streamFunctionCallArguments`, `partialArgs`) refused the AI Studio key: the key is limited to the Gemini API (`API_KEY_SERVICE_BLOCKED`). Not measured: it needs a key or credentials for Vertex AI in a Google Cloud project.
- **The Interactions API**, on the AI Studio key, declares `arguments_delta` steps, but sends each call's arguments in one delta: the home page's 17,455 characters arrived at once at 28.1 s.
- **Gemini's OpenAI-compatible endpoint** does the same: one delta per call, the home page at 24.3 s.

**But each call arrives as soon as it is complete,** one after another (the theme at 4 to 7 s, the home page at 24 to 28 s, then the small files). So a long file written in several calls reaches the app part by part.

**A file written in several calls:** two tools, `write_file` and `append_file`, and an instruction to write a long file in parts of about N lines, all in the same response, cut between two elements.

| Thinking, parts asked | Runs | Home page starts showing | Home page complete | Calls for the home page | Longest still between two parts |
|---|---|---|---|---|---|
| Claude, Agent SDK (spike 1), for comparison | 5 | 5.9 s (5.6–6.3) | 23.6 s (21.8–27.0) | 1 | 1.7 s |
| One call, through a tool (Pi, Google API, thinking medium) | 3 | 34.9 s | 34.9 s | 1 | — |
| low, 40 lines | 3 | 10.4 s (9.9–11.3) | 22.7 s (20.4–23.9) | 3 to 6 | 5.6 s (3.8–5.9) |
| low, 25 lines | 3 | 6.7 s (6.0–7.8) | 21.9 s (20.5–24.8) | 5 to 6 | 4.7 s (4.3–4.9) |
| medium, 25 lines | 3 | 12.2 s (10.8–12.7) | 34.1 s (31.1–36.6) | 7 to 8 | 4.9 s (4.0–5.8) |

**Reading it:**
- **Asked for parts of 25 lines, Hydrogen wrote parts of 28 to 54;** asked for 40, it sometimes wrote three large parts. The parts' size is the model's, the instruction only steers it.
- **Every assembled page is well-formed:** each cut fell between two elements, no tag or Liquid tag left open.
- **The preview moves in steps, not character by character:** the longest still between two parts is 2 to 6 s, against 1.7 s for Claude.
- **At low thinking, Hydrogen keeps Claude's pace through tools alone:** the home page starts at 6.7 s and is complete at 21.9 s, against 5.9 s and 23.6 s.
- **At medium thinking, Spaka's default (Q272),** it starts at 12.2 s and is complete at 34.1 s: it thinks longer before the first part and writes a longer page (18,000 to 22,000 characters against 13,000 to 15,000).
- **Vertex AI would stream a call's arguments as OpenAI does,** but it is not measured: it needs a key for Vertex AI (its express mode gives one to a Google account), which a maker would make apart from the AI Studio key.

After the spike, Vertex AI was connected in the app (Q280 in [the v2.0 decisions](../v2.0-decisions.md)): on Matt's project the page's path reached the preview at 0.9 s and its text at 1.05 s, in 42 pieces.

## The harnesses studied

Each tool was also read from its docs and sources on 2026-11-14, mostly before it was run. What follows keeps what the runs above do not already say: what each can and cannot do, its limits, how it signs in, and where it bears on the decision. Where a run showed otherwise, the run stands, and it is said.

### Codex 0.169.0

**Sources.** OpenAI's docs, served from learn.chatgpt.com (developers.openai.com/codex redirects there), and the source of [openai/codex](https://github.com/openai/codex) at tag [`rust-v0.169.0`](https://github.com/openai/codex/releases/tag/rust-v0.169.0) (2026-11-13). `@openai/codex` and `@openai/codex-sdk` 0.169.0, both Apache-2.0.

**Read before the runs, it looked the best fit of the non-Claude candidates:** an isolated home, a sandbox on each system, approvals answered by code, tools from the app, MCP and skills, Stop and PostToolUse hooks, steer, interrupt and resume, and a fully typed protocol. The sign-in was the one blocker foreseen. The runs added the second: code mode.

**Three ways to drive it:**
- **`codex exec --json`:** JSONL events with no deltas of any kind; a `file_change` item carries only a path and a kind. A follow-up means a new process (`codex exec resume`); interrupting means killing it.
- **The TypeScript SDK, `@openai/codex-sdk`:** it spawns `codex exec` and yields the same events. No steering; OpenAI positions it for CI and automation ([Codex SDK](https://learn.chatgpt.com/docs/codex-sdk)).
- **`codex app-server`, the one for an app** ([App Server](https://learn.chatgpt.com/docs/app-server); [OpenAI's post](https://openai.com/index/unlocking-the-codex-harness/)): JSON-RPC 2.0 over stdio (WebSocket is "experimental and unsupported"). Its own help labels it experimental, and experimental fields need `experimentalApi` at initialize. Its TypeScript types and JSON schema are generated from the binary and match its version exactly. Threads resume and fork; `turn/interrupt` ends a turn as interrupted; `turn/steer` adds the maker's words to the turn in progress; `ephemeral` skips keeping the thread.

**The live preview, as read.** `item/fileChange/patchUpdated`, which the public docs do not mention, follows the `apply_patch` tool's input as the Responses API streams it:
- it parses complete lines only, and sends the state so far: the whole content for a new file, the `-`/`+` hunks for an edit, which Spaka would have to apply to the file on disk;
- it is throttled to one notification every 500 ms;
- it follows only the freeform `apply_patch`, which every model in the catalog uses. MCP tools, dynamic tools and shell commands get no argument streaming, so a `write_file` tool of Spaka's would not stream either;
- the flag has been "under development", off by default, since [PR #17862](https://github.com/openai/codex/pull/17862) and [PR #18289](https://github.com/openai/codex/pull/18289) (April 2026), which aim at progress shown during file writes in Codex's own app;
- everything else arrives complete: `item/started` for a file change, `turn/diff/updated`, and `item/fileChange/outputDelta`, which current versions no longer send.

The runs then showed that the GPT-6 models never call `apply_patch` directly (see [Codex](#codex) above).

**Signing in** ([Auth](https://learn.chatgpt.com/docs/auth)):
- **Two modes:** a ChatGPT sign-in, which uses the plan's included usage, or an API key at standard API prices.
- **The app-server's login types:** an API key; the ChatGPT browser flow, whose loopback returns to a fixed port, 1455; a device code, which the maker must first allow in ChatGPT's security settings; and, experimental, tokens supplied and refreshed by the host app.
- **For an app, OpenAI's docs say** local or open-source apps already on app-server sign-in may continue, though asked to move to Sign in with ChatGPT, and that it "has never been permitted for commercial or hosted services". Paid or hosted apps are sent to a [partner waitlist](https://openai.com/form/sign-in-with-chatgpt-interest/).
- **Sign in with ChatGPT with Codex** ([overview](https://developers.openai.com/siwc/token-sharing-open-source), [Codex app-server page](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server), [cookbook](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt)): the app runs the OAuth (PKCE, on a loopback address), stores the tokens and starts `codex app-server` with the access token in its environment. That is the part against Spaka's rule.
- **Where it keeps the sign-in:** a file under `CODEX_HOME`, or the keyring, whose entry is keyed by a hash of the `CODEX_HOME` path. So setting `CODEX_HOME` keeps both sign-in and settings apart from the maker's own Codex.

**Confinement** ([Sandbox](https://learn.chatgpt.com/docs/sandboxing), [Agent approvals & security](https://learn.chatgpt.com/docs/agent-approvals-security)):
- Modes `read-only`, `workspace-write` (no network for commands by default) and `danger-full-access`; approvals `on-request`, `never`, or granular.
- The sandbox applies to the commands Codex starts, and `apply_patch` writes are checked against the writable folders; the Codex process itself is not sandboxed. Codex has no file-reading tool: the model reads through sandboxed shell commands.
- Linux and WSL2 need bubblewrap and unprivileged user namespaces (Ubuntu 24.04 an AppArmor profile). On Windows ([Windows sandbox](https://learn.chatgpt.com/docs/windows/windows-sandbox)) the recommended `mxc` needs no admin, the older `elevated` one an admin-approved setup, and `unelevated` cannot deny reads.
- Reads can be limited by the app-server's `readOnlyAccess` ([Sandbox read access](https://learn.chatgpt.com/docs/app-server#sandbox-read-access-readonlyaccess)) or by [permission profiles](https://learn.chatgpt.com/docs/permissions), in beta, which also allow or deny network domains through a proxy.
- Spaka's "refuse the rest": `workspace-write` with every approval request answered `decline` by code, or `never`, where anything outside the sandbox simply fails back to the model.

**Extending:**
- **MCP** ([MCP](https://learn.chatgpt.com/docs/extend/mcp)): stdio and Streamable HTTP servers, which an app can pass per thread; a 60 s tool timeout by default. No in-process MCP server: Spaka's would run on localhost or as a child.
- **Dynamic tools** ([Dynamic tool calls](https://learn.chatgpt.com/docs/app-server#dynamic-tool-calls-experimental)), experimental: Codex asks the app to run a tool, and the app returns text, an image or audio. The closest match to Spaka's in-process server, `look_at_preview` included.
- **Skills** ([Build skills](https://learn.chatgpt.com/docs/build-skills)): read from the project, `CODEX_HOME`, and also `~/.agents/skills` and `/etc/codex/skills`, outside it; the built-in ones can be turned off. Admin settings in `/etc/codex` also apply.
- **Instructions:** `AGENTS.md` ([AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)), and per thread the base prompt replaced or developer instructions added.
- **Hooks** ([Hooks](https://learn.chatgpt.com/docs/hooks)), stable and on by default: a Stop hook that blocks makes Codex continue with the reason as a new prompt; PostToolUse covers `apply_patch`, shell, MCP and local tools, not the hosted web search. A hook can be a call to a tool on an MCP server, so Spaka's own server could answer hooks. Hooks must be trusted by hash, which an app can bypass per thread. The app also sees each turn's end, and can start the next turn itself.
- **Web search** ([Web search](https://learn.chatgpt.com/docs/web-search)): hosted, from OpenAI's cached index or live, and it can open a page and find in it; there is no separate fetch tool. Its billing on an API key was not confirmed.

**Models and plans** ([Models](https://learn.chatgpt.com/docs/models), [Speed](https://learn.chatgpt.com/docs/agent-configuration/speed), [Pricing](https://learn.chatgpt.com/docs/pricing), [API pricing](https://developers.openai.com/api/docs/pricing)):
- GPT-6 Astra the most capable; GPT-6.1 Sol near it at a lower cost; GPT-6.1 Terra "fast, efficient"; GPT-6 Luna the cheapest. GPT-5.5 left the ChatGPT sign-in on 2026-10-14.
- Fast mode works on a ChatGPT sign-in only, at 2.5 times the usage; Ultrafast, for Astra and 6.1 Sol, is up to 8 times faster for Astra, on Pro $500 and Enterprise, at 8 times the usage.
- On Plus, per 5 hours: Sol 6.1 roughly 15 to 160 local messages, Terra 35 to 285, Astra 5 to 45; weekly limits may apply too.
- Cached input on the API: $0.10 per million tokens for Sol, $0.05 for Terra.

**Shipping:** the npm package pulls one platform package. On macOS arm64 it unpacks to 377 MB: the 281 MB binary, a 70 MB code-mode host, ripgrep and voice libraries. The standalone app-server is about 88 MB as `.tar.gz` and 62 MB as `.zst`; the Windows arm64 one is 250 MB uncompressed. Apache-2.0 allows bundling with the NOTICE kept; "Codex" is OpenAI's trademark. Releases are near daily and the protocol follows each version, so Spaka would pin one. Signing and notarization of its macOS binaries were not checked.

### Pi 1.5.2

**Sources.** [earendil-works/pi](https://github.com/earendil-works/pi) at commit [`8a21980`](https://github.com/earendil-works/pi/commit/8a21980ec39cf020a2e2c97ad673580846305606) (2026-11-14); `@earendil-works/pi-coding-agent`, `pi-ai` and `pi-agent-core` 1.5.2 (2026-11-10).

**Who makes it.** `badlogic/pi-mono` now redirects to earendil-works/pi: Pi moved into Earendil, Armin Ronacher's company, on 2026-04-08 ([Armin's post](https://lucumr.pocoo.org/2026/4/8/mario-and-earendil/)). The `@mariozechner/*` packages are deprecated at 0.73.1 (2026-05-07). Pi 1.0 shipped on 2026-10-01. About 122k GitHub stars, MIT.

**Read before the runs, it fit the live preview,** with everything else Spaka plugs in: built-in MCP, custom tools, skills, a replaceable system prompt, a hook that can block a call, and one that can keep the agent going. Against it: no confinement of its own, and a Claude sign-in that cannot be used.

**Providers and sign-in:**
- **About 35 providers by API key** ([providers.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/providers.md), [pi-ai README](https://github.com/earendil-works/pi/blob/main/packages/ai/README.md#oauth-providers)), among them Anthropic, OpenAI, Google Gemini, Vertex, Bedrock, Azure, Mistral, Groq, xAI, OpenRouter and DeepSeek; local and OpenAI-compatible endpoints are declared by hand.
- **Sign in with ChatGPT** ([source](https://github.com/earendil-works/pi/blob/main/packages/ai/src/auth/oauth/openai-chatgpt.ts)) is OpenAI's dynamic agent-client flow; the host app names itself in place of Pi. OpenAI's [token-sharing docs](https://developers.openai.com/siwc/token-sharing-open-source) cover open-source and locally hosted apps; users cap each app's usage in their ChatGPT settings. The program was widened at OpenAI's DevDay, 2026-09-29 ([The New Stack](https://thenewstack.io/sign-in-with-chatgpt/)).
- **The impersonating sign-ins:**
  - `openai-codex` uses Codex CLI's client ID ([source](https://github.com/earendil-works/pi/blob/main/packages/ai/src/auth/oauth/openai-codex.ts));
  - GitHub Copilot uses VS Code Copilot Chat's client ID and editor headers ([source](https://github.com/earendil-works/pi/blob/main/packages/ai/src/auth/oauth/github-copilot.ts)); no GitHub policy allowing it was found;
  - Claude Pro or Max uses Claude Code's OAuth client and scopes, a `claude-cli` user agent and `x-app: cli` ([sign-in](https://github.com/earendil-works/pi/blob/main/packages/ai/src/auth/oauth/anthropic.ts), [request headers](https://github.com/earendil-works/pi/blob/main/packages/ai/src/api/anthropic-messages.ts)). Anthropic's [legal and compliance page](https://code.claude.com/docs/en/legal-and-compliance) keeps subscription sign-in to Claude Code and claude.ai ([The Register, 2026-02-20](https://www.theregister.com/2026/02/20/anthropic_clarifies_ban_third_party_claude_access)), and since 2026-04-04 bills third-party harness use as extra usage ([TechCrunch](https://techcrunch.com/?p=3109429)).
- **The Gemini CLI and Antigravity sign-ins were removed** in pi-ai 0.71.0 ([changelog](https://github.com/earendil-works/pi/blob/main/packages/ai/CHANGELOG.md)).
- **Where it keeps credentials:** `auth.json` in its agent folder, `~/.pi/agent` by default, moved with `PI_CODING_AGENT_DIR` ([environment-variables.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/environment-variables.md)). In the libraries, the host chooses the file, or hands over a key that is never written to disk. The host drives a sign-in through callbacks that show the address or device code; Pi stores and refreshes the token.
- **What leaks past the agent folder:** skills from `~/.agents/skills/` and from `.agents/skills/` in the project and its parents ([skills.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md)), and `AGENTS.md` and `CLAUDE.md` from the working folder and every parent. Flags and SDK options turn each off.

**Driving it** ([cli-integration.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/cli-integration.md)):
- **RPC mode** ([rpc.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc.md)): a long-lived child speaking strict JSONL, with commands to prompt (images included), steer, follow up, abort, compact, fork and switch models or thinking levels. Records must be split on line feeds only: Node's `readline` also splits on U+2028 and U+2029.
- **JSON mode** ([json.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/json.md)): one shot, the same events, then exit.
- **The SDK** ([sdk.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md), [full-control example](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/sdk/12-full-control.ts)): an agent session in the host's process, every boundary injectable (models, settings and sessions in memory, resources, tools).
- `agent_end` ends one run; `agent_settled` means nothing else follows (no retry, compaction or queued message). A steering message reaches the model after the current tool calls; a follow-up, after the run. Pi refuses a prompt during a run unless it says which it is. Sessions are JSONL trees that branch, fork and resume ([session-format.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/session-format.md)).

**The live preview, as read:**
- pi-ai's events include `toolcall_start`, `toolcall_delta` (a raw JSON fragment) and `toolcall_end` ([types.ts](https://github.com/earendil-works/pi/blob/main/packages/ai/src/types.ts#L815-L848)); the tool only runs once the call is complete.
- Anthropic's adapter feeds each fragment to an incremental parser, so the arguments are a repaired, parsed object while the call streams. OpenAI Responses (so Sign in with ChatGPT), Chat Completions, Bedrock and Mistral send fragments too; Gemini sends the call whole, which the runs confirmed.
- In the SDK the parsed partial arguments are at hand. Over RPC and JSON the records carry deltas only ([Reconstruct streaming messages](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/json.md#reconstruct-streaming-messages)): the client concatenates them and parses the partial JSON itself.
- Pi's own terminal interface draws a `write` call's content while it streams ([renderers/write.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/tools/renderers/write.ts)). Whether `toolcall_delta` is throttled, the docs do not say.

**Confinement.** Pi has no sandbox and no permission prompts, by design ([security.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/security.md)); its answer is containers or VMs ([containerization.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/containerization.md)). Its native sandbox example, built on Anthropic's `sandbox-runtime`, was removed in 1.5.0 (2026-11-02). Ways a host can confine it, with nothing asking the maker:
- the whole process under the host's own sandbox profile, as ADR 0007 does today; the network must still reach the provider, the MCP servers and web search;
- the `tool_call` hook, which sees every call, MCP ones included, and can rewrite or block it ([tool_call](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md#tool_call)): a policy, not a boundary;
- fewer or replaced tools: `bash` dropped, a built-in overridden under its own name, each shell command wrapped by a spawn hook, or `read`, `write` and `edit` routed through the host's code ([Remote Execution](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md#remote-execution)). That last seam is the "environment the host provides" of [What it settles](#what-it-settles-and-what-it-leaves);
- project trust: in RPC and JSON modes, a project's `.pi/` is skipped unless trusted.

**Extending:**
- **MCP is built in** since 1.x, through Pi's own client `@earendil-works/pi-mcp` ([mcp.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/mcp.md)): stdio and streamable HTTP (not SSE), with OAuth. Each server's tools are exposed directly, through code mode, or deferred; Spaka's would be direct. SDK sessions load it only when asked.
- **Custom tools** take TypeBox schemas, can stream partial results and return images, so Spaka's tools can be native rather than MCP.
- **Hooks** ([events](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md#events)): `tool_call` (PreToolUse), `tool_result` (PostToolUse), `agent_before_settle`, which can add entries and continue (the Stop hook that keeps the agent going), and others that rewrite the messages sent to the model or inject a message.
- **Skills** follow the [agentskills.io](https://agentskills.io/specification) specification. The system prompt can be replaced or added to.
- **No web search** in its core or in its Anthropic adapter: see [Pi's packages](#pis-packages).

**Speed and running costs:**
- The default system prompt is a one-line preamble, short tool notes and a few rules, about 1k tokens by a reading of the source, not measured ([system-prompt.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/system-prompt.ts)); four tools only (`read`, `bash`, `edit`, `write`). The fixed overhead per request is far below Claude Code's.
- Prompt caching where the provider has it, with changes to the prompt and tools sent as diffs to keep the cache.
- The model catalog is refreshed from pi.dev at run time unless offline. Install and update telemetry and "provider attribution headers" are on by default, and can be turned off ([settings.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/settings.md)).

**Shipping:** MIT for every package. It needs Node 22.19 or later; Electron 45.2.3 embeds Node 24.22.2. `pi-coding-agent` is 24.4 MB unpacked, `pi-ai` 4.5 MB, `pi-agent-core` 0.27 MB; a full install for the study came to 153 MB of Node packages (123 packages), the largest the OpenAI, Anthropic and Google SDKs. The CLI also ships as a 9.4 MB bundle that imports only `typebox` and Node's own modules, and nothing native is required (its image and JavaScript engines are WASM). Signing and notarization of the bundle were not checked.

### Pi's packages

**Sources.** The [pi.dev package gallery](https://pi.dev/packages) (5,355 packages), [awesome-pi](https://github.com/BubblePtr/awesome-pi), npm searches and metadata, and Pi 1.5.2's own docs and examples ([extensions.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md), [packages.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md), [cli.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/cli.md)). Downloads are npm's last-week counts. With thousands of packages, this is a sample. The sign-in packages' sources were searched; nothing was installed or run. "Earendil" means Pi's own maintainers; everything else is community.

**How extensions load, and how to restrict them:**
- An extension is a module loaded into Pi's process with the same rights as Pi; extensions are not isolated from each other.
- Pi finds them in its agent folder, in a trusted project's `.pi/`, in its settings (paths and `npm:` or `git:` packages), and among its built-ins (MCP, code mode, tool search, llama.cpp), which the CLI loads by default and the SDK does not.
- A package bundles extensions, skills, prompts and themes; Pi's own packages must be peer dependencies.
- An `npm:` or `git:` source given for one run is installed at start, checked against the registry at every start unless its version is pinned, and skipped with a warning if the install fails.
- Turning extensions off disables the discovered, configured and built-in ones, and explicit paths still load; the same switches exist for skills, prompts, themes, context files and MCP. Choosing the tools declared to the model does not stop an extension's code from running.
- In the SDK, a resource loader can be told to load only inline extensions, or replaced by one that returns exactly the host's list. Binding extensions to the host gives them the host's dialogs, and is required for MCP servers to connect.

**Subscription sign-in.** Sign in with ChatGPT is the only one in Pi's world that uses an official flow for a third-party app. OpenAI's docs also ask the app to keep a host ID and to check the ID token and scopes. The rest:
- **Pi's other built-ins:** `xai` (SuperGrok, X Premium) uses a device flow under a `grok-cli:access` scope, very likely Grok CLI's own client; `kimi-coding` uses a fixed client ID whose owner is not confirmed; OpenRouter's documented OAuth mints an API key, which is allowed and is not a subscription. Coding plans that hand out API keys from the vendor's console (OpenCode Go, Z.ai, Qwen, Xiaomi, MiniMax, Moonshot) are ordinary key providers.
- **ChatGPT through Codex:** [`@cortexkit/pi-openai-auth`](https://github.com/cortexkit/openai-auth) (4,179 a week) pools several ChatGPT accounts on Codex's client, and warns it may be against OpenAI's terms; [`pi-multi-account`](https://github.com/Sarrius/pi-multi-account) and [`@nredd/pi-subscription-router`](https://github.com/nredd/pi-harness) rotate accounts or route across subscription quotas.
- **Claude.** Anthropic's [legal and compliance page](https://code.claude.com/docs/en/legal-and-compliance) forbids third-party apps to offer Claude.ai sign-in or to route requests through plan credentials, and to hold Claude.ai credentials or session tokens; it does not stop a user signing in to the unmodified Claude Code binary. The [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview.md) keeps claude.ai sign-in for SDK-built agents to approved developers. Anthropic's [support article](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan) says the "Agent SDK credit" change was paused on 2026-06-15: the SDK and third-party apps still draw from the subscription's limits. Packages:
  - [`@gotgenes/pi-anthropic-auth`](https://github.com/gotgenes/pi-anthropic-auth) (9,085 a week) adds Claude Code's billing header and replaces Pi's preamble "to avoid prompt fingerprinting": deliberate impersonation;
  - [`@cortexkit/pi-anthropic-auth`](https://github.com/cortexkit/anthropic-auth) pools accounts, rewrites requests and offers a Cloudflare relay;
  - [`pi-claude-bridge`](https://github.com/elidickinson/pi-claude-bridge) (31,983 a week) runs the official Claude Code through the Agent SDK, signed in with Claude's own sign-in: Spaka's present position, under the same approval note. Whether it passes Claude's partial tool input to Pi is not confirmed. [`pi-claude-agent-sdk`](https://github.com/pi-pod/pi-claude-agent-sdk) is a fork;
  - Earendil's [pi-claude-code](https://github.com/earendil-works/pi-claude-code) runs `claude -p` per turn behind a loopback relay that rebuilds and rewrites the requests on the wire, its own README unsure of its future: arguably an intermediary for session tokens, to avoid.
- **Google:** every route is forbidden. [`pi-antigravity`](https://github.com/Rahularya01/pi-antigravity) (5,045 a week) uses the Antigravity desktop client's ID and a user agent matching Antigravity's "wire fingerprint"; [`@cortexkit/pi-antigravity-auth`](https://github.com/cortexkit/antigravity-auth) says in its README that using it violates Google's terms; [`pi-geminicli-oauth`](https://github.com/Heelc/pi-geminicli-oauth) uses Gemini CLI's client; [`pi-gemini-oauth-apikey`](https://github.com/vforvaick/pi-gemini-oauth-apikey) pools Code Assist accounts. Three bridges drive Google's own `agy` or its ACP server with Google's sign-in (about 1.5 GB to download), exactly the case Google's collaborator called a §6 breach. A Google AI forum reply of 2026-10-19 also says there is no supported way for a third-party extension to use a Google AI subscription ([thread](https://discuss.ai.google.dev/t/supported-gemini-subscription-access-for-a-third-party-vs-code-extension/189889/2)).
- **GitHub Copilot:** Pi's built-in sign-in impersonates VS Code, and so do the packages built on it. GitHub's sanctioned routes are its [OpenCode partnership](https://github.blog/changelog/2026-01-16-github-copilot-now-supports-opencode/) (2026-01-16), for OpenCode only, and the [Copilot SDK](https://docs.github.com/en/copilot/how-tos/copilot-sdk/auth/authenticate) (public preview since 2026-04), which uses the app's own GitHub OAuth app and the user's subscription but drives Copilot CLI's agent. No Pi provider built on it was found.
- **Others:** [`pi-cursor-sdk`](https://github.com/fitchmultz/pi-cursor-sdk) uses Cursor's official SDK with a key from Cursor's dashboard, but runs Cursor's agent rather than Pi's loop; the other Cursor providers, [`pi-xai-supergrok`](https://github.com/preinpost/pi-xai-supergrok) and [`pi-cliproxyapi-provider`](https://github.com/0xRichardH/pi-cliproxyapi-provider) (Codex, Gemini CLI and Claude sign-ins served as an OpenAI-style API) impersonate.

**Sandboxes:**
- Earendil's [Gondolin](https://github.com/earendil-works/gondolin) (0.14.0, Apache-2.0) runs Alpine Linux micro-VMs with a programmable network and a virtual file system, secrets reaching the guest only as placeholders. It needs QEMU or a self-built runner, on macOS and Linux only. Pi's built-in code mode runs model-written JavaScript in QuickJS; it is not a file-system sandbox.
- [`pi-sandbox`](https://github.com/carderne/pi-sandbox) (3,577 a week) runs `bash` under a fork of Anthropic's `sandbox-runtime` and checks file tools against lists; refused calls ask the user. [`@erichll/pi-sandbox`](https://github.com/erichll/pi-packages) uses the upstream library, fail-closed. [`@yandy0725/pi-sandbox`](https://github.com/yandy/pi-packages) chains bubblewrap, Landlock, Seatbelt and a Windows restricted-token ACL around `bash`, fences writes, leaves reads open, and needs a native addon. [`pi-permission-modes`](https://github.com/wynainfo/pi-permission-modes) pairs an OS sandbox with a policy per tool.
- Others are policies with no OS boundary ([`@gotgenes/pi-permission-system`](https://github.com/gotgenes/pi-packages), already at version 42), or a review layer where each change can be committed or aborted ([`pi-deltabox`](https://www.npmjs.com/package/pi-deltabox), its isolation off by default).
- [`@anthropic-ai/sandbox-runtime`](https://github.com/anthropics/sandbox-runtime) (0.0.83, Apache-2.0, 739,533 a week), Seatbelt and bubblewrap with file-system and network policy, is the building block most of them use, still at 0.0.x.
- None confines the Pi process itself: extensions, MCP clients, the provider's requests and `read` stay outside. In RPC mode their questions become host dialogs; whether each fails closed when nobody answers is not confirmed.

**Web search:**
- [`pi-web-search`](https://github.com/ttttmr/pi-web-search) (1.7.0, 17,139 a week): the current provider's own search (OpenAI, Azure, Anthropic, Gemini's grounding with URL context, xAI, DeepSeek and others), erring rather than falling back when the model cannot search.
- [`pi-web-access`](https://github.com/nicobailon/pi-web-access) (0.47.0, 285,156 a week): about 30 search backends, plus fetching, GitHub cloning, PDF and video analysis. By default it sends queries to Exa's public MCP, and it reuses a ChatGPT sign-in for OpenAI's search. Usable only trimmed by its settings.
- Others need a search provider's key ([`@juicesharp/rpiv-web-tools`](https://github.com/juicesharp/rpiv-mono), [`@ollama/pi-web-search`](https://www.npmjs.com/package/@ollama/pi-web-search)), use a third party's endpoint, or rely on impersonated Copilot or Codex sign-ins.

**Asking the maker a question:**
- Pi's own dialogs (select, confirm, input) become host requests over RPC ([rpc-extension-ui.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc-extension-ui.md)), but a choice carries a plain string only: no description, preview or multiple choice. Pi's question examples ([`question.ts`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/question.ts), [`questionnaire.ts`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/questionnaire.ts)) work in its terminal interface only.
- [`@thinkrail/pi-ask-user-question`](https://github.com/JetBrains/thinkrail) (0.2.0, 69 a week): each question has a header and 2 to 4 options with a description, an optional preview and a recommended reason, plus multiple choice. Its host hook resolves each question as answered, deferred or abandoned. New and small.
- [`@juicesharp/rpiv-ask-user-question`](https://github.com/juicesharp/rpiv-mono) (40,210 a week) falls back to plain choices over RPC; [`pi-ask-user`](https://github.com/edlsh/pi-ask-user) asks one dialog at a time there; [`pi-interview`](https://github.com/nicobailon/pi-interview-tool) opens a form in a window of its own; `@agimon-ai/po-user-feedback` is BUSL-1.1, which excludes it.
- Pi's MCP client's 60 s timeout is reset by progress notifications, or can be raised for one server.

**Streaming a file's content:**
- Pi's `write` is `{ path, content }`, path first, so a partial parse knows the file before its content arrives; `edit` is `{ path, edits: [{ oldText, newText }] }`.
- An extension's `message_update` handler gets the partial message with its arguments parsed as they grow, in every mode, so an extension inside the RPC child could forward a `write` call's content. Raw provider events are also offered, awaited in order, so a slow handler delays the stream. `write` can be replaced by a tool of the host's under the same name. Whether `message_update` is throttled was not confirmed.
- No package turns a call's arguments into partial file content or writes files from blocks in the reply's text.
- The other edit formats: Codex's `apply_patch` ([`pi-codex-tools`](https://github.com/jvm/pi-mono)), hash-anchored lines ([`pi-hashline-edit-pro`](https://github.com/YuGiMob/pi-hashline-edit-pro)), Armin Ronacher's single-payload edit ([`mitsupi`](https://github.com/mitsuhiko/agent-stuff)). GPT models are trained on `apply_patch`, so an OpenAI setup might prefer it for edits and keep `write` for new files. Code mode stays off for file writes: the content would sit inside JavaScript.

**Other parts of the ecosystem:**
- Subagents, to-do and plan tools exist (the most used, [`pi-subagents`](https://github.com/nicobailon/pi-subagents), at 221,680 a week), with terminal interfaces: reference code at most.
- Pi's `read` returns image blocks, and custom and MCP tools can return images, so a `look_at_preview` returning a picture works with any vision model.
- The continue and block hooks are Pi's own; Spaka's Stop logic maps onto `agent_before_settle`.
- **For embedding:** Pi exports an RPC client and the bundled RPC child. `@earendil-works/pi-client`, `pi-protocol` and `pi-server` (1.1.0) are an experimental CBOR protocol, too early. `pi-durable` (1.4M a week) and `pi-mcp` (4.0M a week, a standalone MCP client) are Earendil's; `pi-web-ui` (0.75.3) predates 1.0. Vercel's [`@ai-sdk/harness-pi`](https://github.com/vercel/ai) runs Pi in the host's process with a sandbox as its remote file system and shell: the host-environment seam, used at scale. [Pace](https://github.com/bubbleptr/pace) runs each root session in an Electron utility process. [`pi-acp`](https://github.com/svkozak/pi-acp) (526,685 a week) is the ACP adapter. Vendor tracing exporters (LangSmith, Braintrust, Langfuse, OpenTelemetry) are for development only. [`@oh-my-pi/*`](https://github.com/can1357/oh-my-pi) is an incompatible fork.

**Not confirmed:** whether ChatGPT-plan requests may use OpenAI's hosted search; GitHub's, xAI's and Moonshot's positions on the reused clients; Anthropic's on Earendil's relay and on `pi-claude-bridge`; licenses npm leaves empty (`@cortexkit/pi-anthropic-auth`, `@igormaka/pi-sandbox`, `@maxiaochao/pi-codex-edit`, `mitsupi`).

### opencode 2.3.0

**Sources.** The docs and source of [anomalyco/opencode](https://github.com/anomalyco/opencode) (formerly sst/opencode), branch `dev` at `024a146` and tag `v1.19.5`. Version 2 ships under new npm names (`@opencode/cli`, `@opencode/client`, `@opencode/sdk`, `@opencode/plugin`), 2.3.0 on 2026-11-13 ([release](https://github.com/anomalyco/opencode/releases/tag/v2.3.0)), with a new server API, plugin API and settings ([Migrate from V1](https://github.com/anomalyco/opencode/blob/dev/services/site/src/docs/content/migrate-v1.mdx)). Version 1, 1.19.5 under `opencode-ai`, is still `latest` on the old names and GitHub's latest release.

**Read before the runs:** an HTTP server that is easy to drive, with per-tool rules, MCP, skills, plugins, ChatGPT and Copilot subscriptions and an MIT license; but no live preview, no sandbox, and a new Claude provider that drops tool input too.

**Providers and sign-in:**
- Its model list comes from [models.dev](https://models.dev); custom OpenAI- or Anthropic-style endpoints can be added ([providers.mdx](https://github.com/anomalyco/opencode/blob/dev/services/site/src/docs/content/providers.mdx)).
- **ChatGPT Plus or Pro:** Sign in with ChatGPT, or the older Codex sign-in, on the plan's usage, with the context capped to Codex's (272K, or 500K on GPT-6.1 Sol and later). Secondary coverage calls it an OpenAI partnership ([The New Stack](https://thenewstack.io/sign-in-with-chatgpt/)); no OpenAI page on the terms was found.
- **GitHub Copilot:** a device sign-in, under GitHub's partnership with OpenCode.
- **Google:** a Gemini key or Vertex only, no Google AI subscription.
- **OpenCode's own services:** the Console (formerly Zen), pay as you go, for example Sonnet 5.5 at $2/$10 per million tokens ([console/models.mdx](https://github.com/anomalyco/opencode/blob/dev/services/site/src/docs/content/console/models.mdx)); and OpenCode Go, a subscription for open models at $10 or $40 a month, $20 a member for teams ([console/go.mdx](https://github.com/anomalyco/opencode/blob/dev/services/site/src/docs/content/console/go.mdx)).
- **Anthropic:** Anthropic blocked third-party use of subscription sign-in from January 2026 and wrote it into its terms in February ([The Register](https://www.theregister.com/2026/02/20/anthropic_clarifies_ban_third_party_claude_access)); opencode then removed its Claude subscription plugin ([PR #18186](https://github.com/anomalyco/opencode/pull/18186), 2026-03-19). Anthropic keys still work.
- **The "Claude Agent" provider** ([PR #58782](https://github.com/anomalyco/opencode/pull/58782), 2026-10-30; [docs](https://github.com/anomalyco/opencode/blob/dev/services/site/src/docs/content/claude-agent.mdx), unindexed; [spec](https://github.com/anomalyco/opencode/blob/dev/specs/v2/claude-agent-provider.md)): it runs the maker's own `claude` through the Agent SDK, never reads Claude Code's sign-in, turns off Claude Code's own tools, settings, hooks, memory, skills and MCP servers, and offers opencode's tools as an in-process MCP server. Its spec asks whether Anthropic's approval is needed, and Anthropic's note on claude.ai sign-in in SDK-built apps applies whoever wraps the binary. Its stream converter ignores tool-input deltas, it runs tools one at a time, and it restarts Claude whenever the tool list changes.
- **Where it keeps credentials:** in its SQLite database under the XDG data folder, not the keychain; version 2 imports version 1's file at first start.

**Kept apart from the maker's setup:** the four XDG folders and opencode's own settings variables move everything; Claude Code's skills and project settings can be turned off, and the models.dev list pinned to a local copy. Still read: `~/.agents/skills`, and system settings in `/Library/Application Support/opencode/` and macOS managed preferences, which always apply. By default version 2 starts one shared background service per user, which Spaka would avoid by running its own standalone server.

**Driving it:**
- `opencode serve` on a local port with Basic auth ([cli/web.mdx](https://github.com/anomalyco/opencode/blob/dev/services/site/src/docs/content/cli/web.mdx)): sessions, prompts, interrupt, fork, compaction, permission replies, sign-in and an SSE event stream. The typed client ([`@opencode/client`](https://github.com/anomalyco/opencode/blob/dev/services/site/src/docs/content/build/client/index.mdx)) is generated from the API contract; its event stream is live only, with no replay or reconnection.
- The embedded SDK runs the whole server inside the host's process, which would put the agent's shell inside Spaka's Electron process.
- Events cover runs, steps, text, reasoning, tool input and tool calls, queued follow-ups, compaction and permissions ([session-event.ts](https://github.com/anomalyco/opencode/blob/dev/packages/schema/src/session-event.ts)); text and reasoning deltas are batched every 100 ms. A follow-up is steered in at the next step or queued; sessions persist and fork.

**The live preview, as read.** Version 2 receives the provider's tool-input deltas and accumulates them, but publishes only the call's start and its whole input ([publish-llm-event.ts](https://github.com/anomalyco/opencode/blob/dev/packages/core/src/session/runner/publish-llm-event.ts)). The change came with a commit batching streamed deltas, is reported in [#58415](https://github.com/anomalyco/opencode/issues/58415) (open since 2026-10-23), and [#58416](https://github.com/anomalyco/opencode/pull/58416) would publish tool input in 100 ms batches. Version 1 dropped tool-input deltas too; the request to send them ([#28800](https://github.com/anomalyco/opencode/issues/28800)) was closed as not planned. Watching the disk does not help: the file is written after the call completes. The workaround is a small patch of opencode, plus the Claude converter, kept as a fork.

**Confinement:**
- Rules of `{action, resource, effect}`, the last match winning, over reads, edits, searches, shell commands (parsed for bash, zsh, sh and PowerShell), subagents, skills, web, folders outside the project and MCP tools ([permissions.mdx](https://github.com/anomalyco/opencode/blob/dev/services/site/src/docs/content/permissions.mdx)). The default allows everything, folders outside the project included; only `.env` reads ask.
- No OS sandbox: its docs warn that the shell runs with the user's full authority, and the repository has no Seatbelt, bubblewrap or Landlock code. The Claude Agent provider turns off Claude Code's sandboxed shell with the rest.
- Refusing without asking: rules that deny everything and allow what is needed in the project; a plugin hook that rewrites any decision; or a `reject` reply through the API, which rejects all the session's pending requests. A deny gives the model a tool error and lets it go on ([plugins/server.mdx](https://github.com/anomalyco/opencode/blob/dev/services/site/src/docs/content/build/plugins/server.mdx)).

**Extending:**
- MCP, local or remote with OAuth ([mcp-servers.mdx](https://github.com/anomalyco/opencode/blob/dev/services/site/src/docs/content/mcp-servers.mdx)); no in-process server.
- Skills from `.opencode/skills`, `.claude/skills` and `.agents/skills` ([skills.mdx](https://github.com/anomalyco/opencode/blob/dev/services/site/src/docs/content/skills.mdx)).
- Plugins add tools and hooks: before and after each tool (the PostToolUse equivalent), on permissions and shells. Version 1 plugins do not run in version 2. No hook can keep a turn from ending: a plugin starts another turn when the run succeeds.
- Instructions from `AGENTS.md` ([instructions.mdx](https://github.com/anomalyco/opencode/blob/dev/services/site/src/docs/content/instructions.mdx)); a custom agent's prompt replaces the provider's base prompt, with its own permissions and model ([agents.mdx](https://github.com/anomalyco/opencode/blob/dev/services/site/src/docs/content/agents.mdx)).
- `webfetch` is built in; search needs a key for Exa, Firecrawl, Parallel, Tavily or TinyFish ([websearch.mdx](https://github.com/anomalyco/opencode/blob/dev/services/site/src/docs/content/websearch.mdx)).

**Shipping:** one Bun-compiled binary per platform. For v2.3.0 the macOS arm64 zip is 103 MB and the npm package 224 MB unpacked; the Linux and Windows archives 112 to 118 MB; version 1's zips were 64 to 82 MB ([release assets](https://github.com/anomalyco/opencode/releases/tag/v2.3.0)). The macOS build is ad-hoc signed, so Spaka would re-sign and notarize it. Auto-update can be turned off. The Claude Agent path also needs the `claude` binary.

### Gemini CLI 0.68.0

**Sources.** `@google/gemini-cli` 0.68.0 (2026-11-10), its docs at [geminicli.com](https://geminicli.com/docs/) and its source on [google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli). Read before it was run; the runs are above.

**Read before the runs, it was out on two counts:** no route to a subscription, and no live preview. The runs confirmed both, and showed what an AI Studio key and files in the text change.

**Its standing.** Not deprecated: still maintained (Apache-2.0, active repository, no npm deprecation), but since 2026-06-18 no longer serving free personal accounts or Google AI Pro and Ultra subscribers, who were moved to Antigravity CLI ([Google Developers Blog, 2026-05-19](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/); [Discussion #28017](https://github.com/google-gemini/gemini-cli/discussions/28017); the [README](https://github.com/google-gemini/gemini-cli#readme); [Google Cloud release notes](https://docs.cloud.google.com/gemini/docs/release-notes)). Organizations' Code Assist Standard and Enterprise licenses keep 1,500 or 2,000 requests per user per day, with a Google Cloud project ([quota and pricing](https://geminicli.com/docs/resources/quota-and-pricing/)).

**Signing in:**
- Sign in with Google, a Gemini API key, or Vertex AI (Application Default Credentials, a service-account file or a Cloud API key; express mode free for 90 days) ([authentication](https://geminicli.com/docs/get-started/authentication/)).
- Google's blog promises only paid keys; its quota page still lists a free key at 250 requests a day, Flash only. Whether a free key still works was not confirmed.
- [Google AI plans](https://aistudio.google.com/docs/google-ai-plans) states that API use is billed apart and that the subscription's benefits apply only in AI Studio's web interface; the April 2026 announcement on building in AI Studio with a Google AI subscription covers that interface only ([blog](https://blog.google/innovation-and-ai/technology/developers-tools/google-one-ai-studio/)).
- Its [terms](https://geminicli.com/docs/resources/tos-privacy/) forbid reaching the services behind Gemini CLI from third-party software with its OAuth; its [FAQ](https://github.com/google-gemini/gemini-cli/blob/main/docs/resources/faq.md) names an AI Studio or Vertex key as the supported route for a third-party agent. The [Gemini API terms](https://aistudio.google.com/docs/terms) are in effect since 2026-03-23.
- Credentials sit in a plain file by default, or in the keychain under a service name that is the same whatever the settings folder; file storage can be forced. `GEMINI_CLI_HOME` moves settings, credentials, sessions, skills and policies; the system settings (`/Library/Application Support/GeminiCli/`, which can be pointed elsewhere) and a project's `.gemini/` and `.env` files found walking up still apply.

**Driving it:**
- Headless, `stream-json` writes six event types; a tool call's parameters arrive complete ([headless](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/headless.md)). There is no streaming input: each follow-up is a new process resuming the session ([session management](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/session-management.md)), and interrupting means killing it.
- ACP ([ACP mode](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/acp-mode.md)) keeps one process with real cancel and follow-ups; the client can register its MCP servers, set the approval mode and the model, and take the file writes.
- `@google/gemini-cli-sdk` exists in the repository but is not on npm; `@google/gemini-cli-core` is an internal library without a stable API.

**The live preview, as read.** Its core receives each function call assembled and raises one tool request per complete call; the source never mentions partial arguments. The GenAI SDK types have `partialArgs` and `willContinue` ([js-genai FunctionCall](https://googleapis.github.io/js-genai/release_docs/interfaces/types.FunctionCall.html)), marked "not supported in Gemini API", and the Interactions API documents argument deltas ([streaming interactions](https://ai.google.dev/gemini-api/docs/interactions/streaming)). Using either would mean a fork of Gemini CLI. The fourth round found both as read: Vertex only, and one delta per call.

**Confinement** ([sandbox](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/sandbox.md)):
- Seatbelt profiles on macOS, from permissive (the default, writing in the project only, reads and network open) to strict, or a custom one in the project; Docker or Podman; on Windows a low-integrity label that stays on the files; gVisor or LXC on Linux. A per-tool sandbox asks to widen its access when a command needs more; in headless mode, not confirmed.
- Approval modes, tool allow and deny lists, and a policy engine of TOML rules ([policy engine](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/policy-engine.md)) where, in headless mode, "ask the user" counts as deny: Spaka's refusal without asking. Its workspace tier is "currently non-functional".

**Extending:**
- MCP servers in its settings or passed over ACP ([MCP server](https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md)); skills loaded on demand ([skills](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/skills.md)).
- `GEMINI.md` adds context; `GEMINI_SYSTEM_MD` replaces the whole built-in prompt, with placeholders for skills, tools and the write tool's name ([system prompt](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/system-prompt.md)).
- Hooks run commands ([hooks reference](https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md)): before and after a tool (PostToolUse), and after the agent, where a deny with a reason sends the reason back as a new prompt (the Stop hook that keeps it going); also before the model and after each streamed chunk.
- Google web search, grounded and summarized by the API, and web fetch. On a paid key, grounding gives 5,000 free searches a month, then $14 per 1,000; it is not on the free tier for the 3.x and 4 text models ([pricing](https://aistudio.google.com/docs/pricing)).

**Models and prices.** It knows Gemini 3.x and 2.5 models and Gemma 4, routing between Pro and Flash by default ([models.ts](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/config/models.ts)); Gemini 4 is absent from its list. On the API, per million tokens: Gemini 3.1 Pro Preview $2/$12; 3.8 and 3.6 Flash $0.75/$3.75, doubling on 2027-01-01; 3.5 Flash-Lite $0.30/$2.50. Argon became generally available on 2026-10-13, and Argon and Carbon double to $4/$20 on 2026-12-01.

**Shipping:** a self-contained bundle of 449 files, about 99 MB unpacked, for Node 20 or later. Its optional native modules (a terminal and the keychain) would need rebuilding for Electron or leaving out; it could run on Electron's own Node. Weekly stable releases, nightly builds, maintenance for enterprise customers.

### Antigravity CLI 1.5.9

**Sources.** Google's docs, the [google-antigravity/antigravity-cli](https://github.com/google-antigravity/antigravity-cli) repository (a README, a changelog and examples, with no source) and its issues, Homebrew and PyPI. Read before it was run.

**Read before the runs, it was out:** forbidden on a Google sign-in, no live preview, weak isolation, a closed binary. The runs confirmed the preview on a key, and found it better kept apart than feared (no Keychain item on a key).

**What it is.** Available to everyone since 2026-05-19 and written in Go; no page calls it preview, beta or generally available ([migration guide](https://antigravity.google/docs/cli/gcli-migration/)). Google documents only an installer script ([quickstart](https://antigravity.google/docs/getting-started/)); a Homebrew cask that updates itself and GitHub release archives exist too; the npm package of that name is a third party's placeholder. The desktop app, Antigravity 2.x, shares the same engine and offers no more ways to drive it.

**Signing in** ([authenticate](https://antigravity.google/docs/install/), [ACP](https://antigravity.google/docs/ide/extensions/acp)):
- A Google account (Free to Ultra), a business account, a Gemini key (read from the environment only, never from a `.env` file), or Vertex with Application Default Credentials. Bringing a key "for additional rate limits" is not supported ([plans](https://antigravity.google/docs/plans/)).
- On a Google account, an app may not start it: the [FAQ](https://antigravity.google/docs/faq), the [Additional Terms](https://antigravity.google/terms) and the Google collaborator's answers ([#1411](https://github.com/google-antigravity/antigravity-cli/issues/1411), [#1493](https://github.com/google-antigravity/antigravity-cli/issues/1493)), which hold whether the wrapper takes the OAuth token or starts the program. Only a human-driven, interactive ACP client is allowed. An earlier forum reply saying it was supported came from a user without a staff badge ([forum](https://discuss.ai.google.dev/t/is-external-orchestration-of-antigravity-cli-headless-mode-supported-with-account-based-usage/183051)). Google says unauthorized harness traffic on a personal sign-in meets automated abuse enforcement. Whether a framework's own system prompt is allowed is still asked ([#1542](https://github.com/google-antigravity/antigravity-cli/issues/1542)).
- A Google sign-in is kept in the macOS Keychain, falling back to a file. Settings, MCP servers, hooks, skills, rules, conversations and its "brain" live under `~/.gemini/`. No variable moves them ([#155](https://github.com/google-antigravity/antigravity-cli/issues/155), open; [#669](https://github.com/google-antigravity/antigravity-cli/issues/669) asks for XDG): `HOME` is the only lever, and one integrator found a crash under a restricted `HOME` ([#1013](https://github.com/google-antigravity/antigravity-cli/issues/1013)).
- Its sign-in loopback is not documented; over SSH or for ACP it prints an address and takes a pasted code.

**Driving it** ([headless](https://antigravity.google/docs/cli/headless/), [CLI reference](https://antigravity.google/docs/cli/reference/)):
- Headless, with text, JSON or `stream-json` output; or a long-lived session taking one JSON line per turn on its input, text only. That stream has no control channel: no permission answers, no interrupt message.
- Its events give the step, its state, the tool's name and complete parameters, the reply's text deltas and usage. Flags choose the model, the effort (low to max), the mode, a custom agent and a time limit.
- A follow-up is a new process resuming the conversation; Google says separate processes start with a cold cache and cost more quota per turn (#1411).
- Known bugs: commands it started keep running after an interrupt ([#1458](https://github.com/google-antigravity/antigravity-cli/issues/1458)); on some long prompts headless mode never exits and ignores SIGTERM ([#1313](https://github.com/google-antigravity/antigravity-cli/issues/1313), open, 1.4.4 to 1.4.11); `stream-json` deadlocks when a command reads its input ([#1456](https://github.com/google-antigravity/antigravity-cli/issues/1456)). The bug that dropped its output outside a terminal ([#76](https://github.com/google-antigravity/antigravity-cli/issues/76)) was fixed in 1.1.1.
- Over ACP it also steers a turn with a prompt sent during it, and offers modes and elicitation; HTTP MCP servers passed by the client need a process per session. Claude and GPT models are offered over ACP only to allow-listed clients (Zed, JetBrains, Android Studio, Xcode; [#1318](https://github.com/google-antigravity/antigravity-cli/issues/1318)).
- A Python SDK only ([google-antigravity](https://github.com/Google-Antigravity/antigravity-sdk-python), 0.1.23, [docs](https://antigravity.google/docs/sdk/overview/)): an Apache-2.0 wrapper around a closed runtime in 40 MB wheels, on a key or Vertex only. No TypeScript SDK.

**The live preview, as read.** `stream-json` streams only the reply's text; a tool step carries complete parameters; ACP's changelog speaks of diffs "for completed edits"; the SDK yields complete calls. The runs confirmed it over ACP.

**Confinement** ([sandbox](https://antigravity.google/docs/sandbox/)):
- The sandbox confines shell commands only; file tools are governed by permission rules and by refusing access outside the workspace. Inside it the workspace is read-write, `~/.ssh`, `.env` files and `~/Library/Application Support` are blocked, `.git` is read-only, and the network is closed except to allowed domains.
- Modes: auto (a Flash model reviews commands that would leave the sandbox), and tool permissions from "request review" to strict, with allow, ask and deny rules per command, path or MCP tool.
- In headless mode, an approval that cannot be obtained is soft-denied: the run goes on, the tool is named on stderr, and the exit code is 0, which fits a refusal never shown to the maker. A PreToolUse hook can deny; over ACP the client answers.

**Extending:**
- MCP servers from its settings or passed over ACP, stdio or Streamable HTTP ([MCP](https://antigravity.google/docs/mcp/)). Their tools are lazy by default, called through a generic tool after reading their schema, unless marked eager. No per-run flag.
- Skills ([skills](https://antigravity.google/docs/skills/)). No way to replace the system prompt: rules files, and custom agents whose body is their prompt, able to drop the default sections ([subagents](https://antigravity.google/docs/subagents/)); Google forbids overriding its identity instructions on a personal sign-in.
- Hooks ([hooks](https://antigravity.google/docs/hooks/)) at session start, before and after a tool, before and after an invocation, and at stop, where a hook can continue the loop, with a cap on consecutive continuations.
- Web search and URL reading built in, and a browser subagent driving Chrome.

**Models and limits** ([models](https://antigravity.google/docs/models/), [plans](https://antigravity.google/docs/plans/)): Gemini 4 Carbon on Ultra and Enterprise, Gemini 3.8 Flash on all plans, "orchestrator" variants; Claude 4.6 and GPT-OSS-120b were to leave on 2026-11-18. No numbers are published: a weekly quota on Free, a 5-hour quota up to a weekly cap on Pro, the highest on Ultra, overages in paid "AI credits". Headless, ACP and interactive use share one pool.

**Shipping:** no license (none in the repository, no source), and the terms grant no right to redistribute; an explicit clause either way was not found. One native build, 84 MB on macOS arm64 and 90 MB on x64, bundling its own Python (for workflows and the ACP server) and ripgrep. It updates itself, sends telemetry (which ACP can turn off), and uses interaction data by default.
