# Spike 4: agents over ACP

Ran on 2026-11-26, on Matt's question after reading why Spaka does not use the ACP registry: is it true that ACP does not carry a file while the model writes it, and how would an ACP agent work inside Spaka?

## What we learned

- **ACP carries a file while it is written.** A call's `rawInput` sent again as it grows, while the call is `pending`, reaches Spaka's preview as Pi's own stream does. Spike 3 and ADR 0012 said otherwise; they are corrected. What streams depends on each agent and its adapter.
- **Pi over ACP matches Pi in Spaka's own harness**, once two things are set: every file grows in the preview (227 to 948 pieces a file), the page starting at 15.8 s against 16.5 s. As published, though, `pi-acp` 0.0.35 shows each file only once written: it reads a snapshot that pi 1.6 no longer sends. A short patch to the adapter fixes it. With Pi's defaults, Pi also used its `codemode`, writing several files from one script, which streams none of them; with Spaka's tools declared to the model directly and `codemode` left out of its tools, every file streams.
- **Codex and Antigravity never stream a file.** Codex writes through its shell (`python3 -c …`) and patches, as spike 3 found of its code mode; Antigravity sends each write whole, through Spaka's own file system (`fs/write_text_file`). Their pages appear section by section, each section at once.
- **Claude over ACP would lose its live preview.** `claude-agent-acp` sends a call's input again only as each field completes, so a file's path comes early and its content whole, once written: its code calls content built from a partial input "misleading". Spaka's Agent SDK adapter gives the preview every token (ADR 0009). Not measured yet: the checks' Claude sign-in was gone after the move to `~/dev/spaka`.
- **Spaka's tools reach every agent over MCP**, served by Spaka over HTTP on 127.0.0.1: the three that ran called the gallery, the images and the look at the page. Instructions, the model, the agent's home folder and Spaka's tools for Pi go through each agent's own settings or `_meta`, not the protocol: four agents, four ways.
- **The registry installs, Spaka pins.** Each entry is a version, an archive with its sha256 or an npm package; installed in 2.6 to 5 s. Spaka would copy the entries into a release rather than read the hourly index. The npm entries need npm, which a packaged Spaka does not have. Two of the four are listed with a "proprietary" licence (Claude's adapter, Antigravity).
- **The agents the maker already has can be found and used** (Matt's idea during the spike): Codex ran on Matt's own `codex` 0.169.0, under the adapter that expects ^0.171.0. It needs the sandbox to open that install's folder, and its version is no longer Spaka's.
- **Spaka's sandbox holds each agent's whole process.** It refused `pi-acp`'s write into `~/.pi`, and Codex's own sandbox has to be off inside it, macOS refusing a sandbox within a sandbox. Electron run as Node needs to read folders' metadata outside the project, or it dies at start (SIGTRAP).
- **Permissions:** Pi and Codex ask for none; Antigravity asked 34 times in a build, once per write and once per new tool, and Spaka answered each itself. No agent asked for anything outside the project.

Not decided: whether Spaka builds an ACP adapter. ADR 0012 keeps that door open ("an ACP adapter can be added later if a vendor's agent brings what Pi does not").

## The question

Spike 3 ([report](harnesses.md)) said of ACP: "The protocol has no field for it", the "it" being a tool call's input while it is generated, and ADR 0012 wrote that "the Gemini API and ACP carry a tool call only whole". Read again on 2026-11-26, the protocol says otherwise:

- a tool call's `pending` status means "the input is either streaming or awaiting approval";
- `tool_call_update` may send `rawInput` again, as many times as the agent likes, each replacing the last.

So an agent may stream a file's content to its client; whether it does is the adapter's choice. Spike 3 tried only Gemini CLI and Antigravity, both on the Gemini API, which sends a tool call whole whatever the protocol: Pi on the same API gave the page at once too (34.9 s). It measured the Gemini API, not ACP.

Framed with Matt the same day:

- **An adapter inside the app** (Q485), on a branch of its own that is not merged: an `AcpSession` beside `PiSession`, behind the same `AgentRunner` interface, its updates turned into the events the live preview and the conversation already follow.
- **Four agents** (Q486): Claude through `claude-agent-acp`, Pi through `pi-acp`, Codex through `codex-acp`, and, on Matt's word during the spike, Antigravity for the Gemini models.
- **Two questions beside** (Q487): installing each agent from the registry, and the permissions and the sandbox.
- **The agents the maker already has** (Q488, Matt during the spike): found on the PATH and used instead of the registry's.

## What was built

On the branch `spike/acp-adapter`, in `apps/desktop/src/main/agent/acp/`:

- **`registry-pins.json`**: the four entries of the registry as it was on 2026-11-26 at 10:06 UTC, copied into the app: id, version, licence, and the archive with its sha256 or the npm package at its version. Spaka never reads the live index; a release of Spaka would fix these entries as it fixes its other dependencies.
- **`registry.ts`**: installs an entry once per version in the app's data. A binary is downloaded with its sha256 checked, then unpacked; an npm package is installed with npm at its pinned version. With `SPAKA_ACP_DETECT=1` it first looks on the PATH for the maker's own `claude`, `codex`, `pi` or `agy`, and runs the adapter on it.
- **`mcp-http.ts`**: Spaka's own tools (look at the page, the gallery's blocks, images) as an MCP server over HTTP on 127.0.0.1 with a bearer token, since the agent runs in a process of its own.
- **`agents.ts`**: what each agent needs that the protocol does not carry: its home folder, how it gets Spaka's instructions, its model, how it learns of Spaka's tools, and a patch to `pi-acp` (below).
- **`session.ts`**: the `AcpSession`. It starts the agent under a sandbox profile of Spaka's, speaks ACP with the official TypeScript library (`@agentclientprotocol/sdk` 2.12.0), answers permissions and file requests itself, and turns each `tool_call` and `tool_call_update` into Spaka's events: `Write`, `Edit` and `Bash` with `file_path`, `content`, `old_string`, `new_string`, whatever each agent calls them.

`SPAKA_ACP_AGENT=<id>` makes every project's agent that ACP agent. The check `e2e/agent-acp.e2e.ts` builds a new website ("A website for Fleur de Loire, a florist in Nantes.", spike 1's first request), then asks for a change to its home page. As `measure.e2e.ts` does for Claude, it samples what the preview shows every 50 ms, films it every 250 ms, and logs what the agent streamed with its time. `SPAKA_ACP_RUN=direct-claude` and `direct-pi` run the same request through today's two adapters, for comparison.

Left out, as the spike framed it: questions and plans, the model and effort chosen in the interface, the maker's connectors and skills, memory between launches.

## The measurements

On Matt's Mac, the app built and launched in the background, 2026-11-26. One build each: a model's own pace varies from run to run by tens of seconds, so the times show the preview's shape more than which is faster. "First text": the preview first shows text. "Settled": it last changes. "Longest still": the longest stretch between those during which it shows nothing new; most of it is the model working between two files, not the stream.

| Run | Model | First text | Settled | Longest still | Turn | Files that grow in the preview |
|---|---|---|---|---|---|---|
| Pi in Spaka's harness (today) | GPT-6.2 Sol, medium | 16.5 s | 139.1 s | 47.3 s | 170.6 s | all 8 (20 to 624 pieces) |
| Pi over ACP, `pi-acp` patched, no codemode | GPT-6.2 Sol, medium | 15.8 s | 112.5 s | 29.7 s | 121.3 s | all 7 (227 to 948 pieces) |
| Pi over ACP, `pi-acp` patched, codemode on | GPT-6.2 Sol, medium | 26.1 s | 109.0 s | 29.4 s | 111.8 s | 2 of 7 (the theme, the hero) |
| Pi over ACP, `pi-acp` 0.0.35 as published | GPT-6.2 Sol, medium | 33.6 s | 160.3 s | 38.6 s | 163.3 s | none |
| Codex over ACP, `codex-acp` 2.12.0 and its own Codex | GPT-6.2 Sol, medium | 37.8 s | 103.8 s | 26.2 s | 116.7 s | none |
| Codex over ACP, on Matt's `codex` 0.169.0 | GPT-6.2 Sol, medium | 26.5 s | 113.9 s | 33.2 s | 155.7 s | none |
| Antigravity over ACP, `agy-acp-server` 1.5.2 | Gemini 3.8 Flash, low | 16.0 s | 234.5 s | 52.3 s | 254.2 s | none |
| Claude over ACP, `claude-agent-acp` 0.112.0 | Sonnet 5.5, medium | not run: no sign-in (below) | | | | |

The change asked next ("Add a short line « Same-day delivery in Nantes » right under the main title") took 4 to 14 s with every agent. Pi in Spaka's harness streamed its Edit in 69 pieces; over ACP, Pi's edit puts its old and new text in an array (`edits: [{oldText, newText}]`), which the spike's adapter reads only once complete.

Every run's figures, what the agent streamed, its permissions and file requests were kept in `e2e/.runs/acp-*/` (not committed), with a film of the preview.

## Agent by agent

### Pi, through `pi-acp`

- **Installed** from the registry with npm: `pi-acp@0.0.35` (MIT) and, beside it, pi itself (`@earendil-works/pi-coding-agent@1.6.1`), which the adapter starts in RPC mode.
- **Its settings are Pi's own**, in a home folder of Spaka's: `PI_CODING_AGENT_DIR` with `settings.json` (model, thinking), `SYSTEM.md` (Spaka's instructions in place of Pi's), and `mcp.json` (Spaka's tools). `pi-acp` declares no MCP over HTTP and does not pass on ACP's MCP servers, so Spaka's tools go through Pi's settings. The adapter also keeps files in `~/.pi/pi-acp` whatever `PI_CODING_AGENT_DIR` says, so it needs `HOME` pointed at its folder.
- **The stream:** pi 1.6 sends tool call deltas only (`toolcall_delta`, without the `partial` snapshot), and `pi-acp` looks for the call in the snapshot: as published, each file arrives once written. Patched to keep the deltas by the call's place in the reply, it sends `rawInput` again with each delta, and the file grows as in Spaka's harness.
- **Codemode:** with Pi's defaults (MCP tools reached from `codemode` scripts), Pi wrote five of its seven files from one script. With Spaka's tools declared `direct` and `codemode` left out of `defaultTools`, every file went through `write` and streamed.

### Codex, through `codex-acp`

- **Installed** from the registry with npm: `@agentclientprotocol/codex-acp@2.12.0` (Apache-2.0), which brings its own Codex. Its home is `CODEX_HOME`; Spaka signs it in with the maker's OpenAI key in `authenticate`'s `_meta` (`api-key`), its other way being ChatGPT.
- **Settings in `config.toml`:** Spaka's instructions as `developer_instructions`, `approval_policy = "never"`, and `sandbox_mode = "danger-full-access"`, Spaka's sandbox around it standing in for its own. The model is set through the session's config options.
- **Writes:** a few through its patch tool, most through its shell. Neither streams: the preview shows a file once the command has run.
- **Noise:** each action is reviewed by Codex's "Guardian Review", sent as a tool call of its own: 25 in a build, which Spaka would leave out of the conversation.

### Antigravity, through `agy-acp-server`

- **Installed** from the registry: a Google binary (`dl.google.com`, sha256 checked), "proprietary", licensed by its terms. On a Gemini API key it may be driven by an app; on a Google sign-in it may not (spike 3).
- **Signing in:** four methods (`oauth-personal`, `oauth-business`, `gemini-api-key`, `agent-platform` for Vertex AI). The key goes in `authenticate`'s `_meta` (`api-key`), `GEMINI_API_KEY` being its fallback.
- **Its extensions:** Spaka's instructions appended to its own (`_meta.antigravity.systemPrompt.append`), Spaka's tools declared at once (`eagerMcpServers`). On a key, it offers Gemini 3.5 to 3.8 Flash and 3.1 Pro, no Gemini 4.
- **Writes:** through Spaka's file system (`fs/write_text_file`), after a permission request, each file whole.

### Claude, through `claude-agent-acp`

- **Installed** from the registry: the adapter's own binary for macOS arm64 (sha256 checked), which carries the Agent SDK 0.3.331 and its Claude binary. The registry lists it as "proprietary"; its repository says Apache-2.0, the Claude binary inside being Anthropic's.
- **Its extension** `_meta.claudeCode.options` takes the Agent SDK's options when the session opens: Spaka's instructions as the system prompt, the model, the effort, no settings of the maker's. Almost all Spaka gives Claude today would pass, through this adapter's own `_meta` rather than the protocol.
- **Signing in** is the Claude binary's own, in its configuration folder (`CLAUDE_CONFIG_DIR`), as today (ADR 0002). It declared no sign-in method to Spaka, which offers no terminal.
- **The stream**, from its code (`sdk-to-acp.ts`): it reads the Agent SDK's `input_json_delta` and sends `rawInput` again each time a top-level field completes. A Write's `file_path` arrives early, its `content` whole once written; an Edit's `old_string` and then `new_string` likewise. Spaka's preview would get each Claude file at once, where today it follows every token. A patch like `pi-acp`'s would change that, on an adapter of Anthropic's, Zed's and JetBrains'.
- **Not measured:** it started under Spaka's sandbox and opened its session, then answered "Authentication required". The checks' Claude sign-in (`.cache/agent-config`) did not come along when the repository moved to `~/dev/spaka` that morning.

## The registry

- **What an entry gives:** an id, a version, a licence, and either an archive per platform (with its sha256, as all four had) or an npm package at its version. The index is rebuilt every hour from the agents' releases.
- **What Spaka would do:** copy the entries of the agents it offers into each release (`registry-pins.json`), install one on first use into the app's data, and check its sha256. Never the live index: the version would otherwise change under the maker between two of Spaka's releases.
- **Installing:** 2.6 to 5 s per agent on this connection. Antigravity's archive weighs 96 MB, 295 MB unpacked; the npm entries need npm, which a packaged Spaka does not ship: it would need npm's tarballs fetched and unpacked by Spaka itself, or the adapters bundled at build time.
- **Signing in:** the registry requires an agent to sign in by itself (Agent Auth, Terminal Auth). Spaka rather gives each agent the maker's key from its Accounts: through `authenticate`'s `_meta` for Codex and Antigravity, through the environment for Pi, and through Claude's own configuration folder for Claude.

## The agents the maker already has

With `SPAKA_ACP_DETECT=1`, Spaka first looks on the PATH for the agent's own program: `claude` (`CLAUDE_CODE_EXECUTABLE` for its adapter), `codex` (`CODEX_PATH`), `pi`, or `agy`, which speaks ACP itself.

- **Found on Matt's Mac:** `codex` 0.169.0 and `claude` 2.1.330. Neither `pi` nor `agy`: those fell back to the registry.
- **Codex on Matt's own `codex`** built the site as the registry's did. The adapter expects Codex ^0.171.0 and ran with 0.169.0: nothing checks it, and it may break at any update of either.
- **What it costs:** the sandbox must let the agent read where the maker installed it (`~/.codex/packages/standalone/releases/0.169.0-…`), and the version is the maker's, updated by itself. The sign-in can stay Spaka's (`CODEX_HOME` in Spaka's data, as here) or be the maker's own, which would mean reading their `~/.codex`.

## Permissions and the sandbox

- **The whole agent process** runs under a sandbox profile of Spaka's, like the Pi harness's shell (Q278): it writes in the project, the temporary folders and its own home; it reads the project, the system, its install, Spaka's Node; it does not read the maker's other files. The network is open.
- **What it caught or needed:**
  - `pi-acp` writing its session map into `~/.pi` (refused; its `HOME` moved);
  - Codex's own sandbox, which cannot start inside another on macOS (turned off, Spaka's standing in);
  - Electron run as Node (Spaka's `node` for the npm adapters), which dies at start unless it can read the metadata of the folders above it: `(allow file-read-metadata)`.
- **Permissions:** Spaka answers each request itself, never asking the maker (ADR 0007): allowed within the project, refused outside. Pi and Codex asked none, Antigravity 34 in a build (28 once, 6 always). None named a place outside the project.
- **Files through Spaka:** only Antigravity used `fs/read_text_file` and `fs/write_text_file` (12 reads, 26 writes), all within the project.

## What an ACP adapter in Spaka would need

Beyond this spike's code:

- each agent's tool names and fields read into Spaka's (Write, Edit, Bash; `path`, `target_file`, `code_content`…), and nested inputs (Pi's `edits`) read while they stream;
- per agent, the way in for instructions, model, effort and tools: none of these is in the protocol today (a `client-system-prompt` proposal exists);
- the questions and plans (Q283, Q286), which ACP could carry as elicitation (`elicitation/create`), as `codex-acp` does for Codex's own questions;
- an adapter kept up with its agent: `pi-acp` and pi 1.6 had already parted;
- the agents' own noise left out of the conversation (Codex's Guardian Review).

## Not tried, or not settled

- **Antigravity on Vertex AI** (`agent-platform`), which streams a call's arguments to the API: whether Antigravity would then stream a write over ACP.
- **opencode and Gemini CLI** over ACP in Spaka, both in the registry and both on Matt's Mac.
- **Several runs per agent**, for times that compare.
- **Windows and Linux**, where Spaka's sandbox is not this one.
- **A packaged Spaka** installing an npm entry without npm.
