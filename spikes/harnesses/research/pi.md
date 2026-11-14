# Pi as Upstart's agent harness

Researched 2026-11-14. Repository read at commit [`8a21980`](https://github.com/earendil-works/pi/commit/8a21980ec39cf020a2e2c97ad673580846305606) (main, 2026-11-14). npm versions: `@earendil-works/pi-coding-agent`, `pi-ai` and `pi-agent-core` 1.5.2, published 2026-11-10.

## Verdict for Upstart

Pi fits Upstart's most important requirement, the live preview. Its events stream a tool call's arguments as it is generated (`toolcall_delta`), and the SDK also keeps a parsed partial-arguments snapshot. It can be embedded in-process or run as an RPC subprocess with its own agent folder. It also has everything else Upstart plugs in: built-in MCP, custom tools, Agent Skills, system-prompt replacement, a `tool_call` hook that can block a call, and an `agent_before_settle` hook that can make the agent continue (the equivalent of the Stop hook).

Two things count against it:

1. **It has no confinement of its own.** It has no permissions and no sandbox. Its old Seatbelt example was removed in 1.5.0, so Upstart would have to write and maintain the macOS (and later Windows/Linux) sandbox itself.
2. **Its Claude subscription login cannot be used.** Pi signs in to a Claude subscription by impersonating Claude Code: it uses Claude Code's OAuth client ID and sends a `claude-cli` user agent. That breaks Upstart's hard rule. Anthropic's terms also forbid it, and since 2026-04-04 Anthropic bills it as paid extra usage.

So Pi is viable as a **second, non-Claude harness**: an API key for any provider, or OpenAI's official "Sign in with ChatGPT" token sharing. It does not replace the Claude Agent SDK for makers who sign in with a Claude subscription.

**Identity note.** `badlogic/pi-mono` now redirects to **[earendil-works/pi](https://github.com/earendil-works/pi)**. Pi moved into Earendil (Armin Ronacher's company) on 2026-04-08 ([Armin's post](https://lucumr.pocoo.org/2026/4/8/mario-and-earendil/)). The `@mariozechner/*` packages are deprecated at 0.73.1 (2026-05-07); `npm view` reports "please use @earendil-works/pi-coding-agent instead". Pi 1.0 shipped on 2026-10-01. The project has about 122k GitHub stars and is MIT licensed.

## 1. Providers and sign-in

**API keys.** About 35 providers take an environment variable or a key stored in `auth.json`. They include Anthropic, OpenAI, Google Gemini, Vertex, Bedrock, Azure, Mistral, Groq, Cerebras, xAI, OpenRouter, Vercel AI Gateway, DeepSeek, Fireworks, Together, Kimi, MiniMax, Qwen and Earendil's own Radius gateway. Local and OpenAI-compatible endpoints are added through `models.json`. Sources: [providers.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/providers.md), [pi-ai README](https://github.com/earendil-works/pi/blob/main/packages/ai/README.md#oauth-providers).

**Subscription logins (`/login`, or `models.login()` in pi-ai):**

| Login | How Pi does it | May a third-party app use it? |
|---|---|---|
| **Sign in with ChatGPT** (`openai` provider) | OpenAI's official dynamic agent-client flow (`dynamic_agent_client`; [source](https://github.com/earendil-works/pi/blob/main/packages/ai/src/auth/oauth/openai-chatgpt.ts)). It uses the ChatGPT plan with the Responses API. `LoginOptions.agentName` replaces "Pi" with the host app's name. | **Yes, in preview.** OpenAI's [token-sharing docs](https://developers.openai.com/siwc/token-sharing-open-source) cover open-source and locally hosted apps; paid or remotely hosted apps must fill in an interest form. Users cap each app's usage in ChatGPT Settings → Usage. Expanded at DevDay, 2026-09-29 ([The New Stack](https://thenewstack.io/sign-in-with-chatgpt/)). |
| OpenAI Codex (`openai-codex`) | Uses Codex CLI's client ID `app_EMoamEEZ73f0CkXaXp7hrann` ([source](https://github.com/earendil-works/pi/blob/main/packages/ai/src/auth/oauth/openai-codex.ts)). Pi documents it as "superseded by Sign in with ChatGPT". | Should not be used; this is not the sanctioned path. |
| GitHub Copilot | Uses VS Code Copilot Chat's client ID and sends `Editor-Version: vscode/…` and `Copilot-Integration-Id: vscode-chat` ([source](https://github.com/earendil-works/pi/blob/main/packages/ai/src/auth/oauth/github-copilot.ts)). | **Not confirmed.** It impersonates VS Code; I found no GitHub policy that allows this. |
| Anthropic Claude Pro/Max | Uses Claude Code's OAuth client ID and scopes (`user:sessions:claude_code`) and sends a `claude-cli/<version>` user agent with `x-app: cli` ([oauth source](https://github.com/earendil-works/pi/blob/main/packages/ai/src/auth/oauth/anthropic.ts), [request headers](https://github.com/earendil-works/pi/blob/main/packages/ai/src/api/anthropic-messages.ts)). | **No.** Anthropic's [legal and compliance page](https://code.claude.com/docs/en/legal-and-compliance) reserves subscription OAuth for Claude Code and claude.ai ([The Register, 2026-02-20](https://www.theregister.com/2026/02/20/anthropic_clarifies_ban_third_party_claude_access)). Since 2026-04-04, third-party harness use is billed as extra usage ([TechCrunch](https://techcrunch.com/?p=3109429)). Pi's own TUI warns: "Third-party harness usage draws from extra usage and is billed per token". **This violates Upstart's hard rule.** |
| OpenRouter, xAI, Kimi, Radius | OAuth flows that mint or hold keys. | Not examined in depth. |
| Gemini CLI / Google Antigravity | **Removed** from pi-ai in 0.71.0 (2026-04-30) ([changelog](https://github.com/earendil-works/pi/blob/main/packages/ai/CHANGELOG.md)). | Not applicable. |

**Where credentials live.** `<agent-dir>/auth.json`, which holds API keys and OAuth tokens. The default agent dir is `~/.pi/agent`. Two ways to isolate it:

- **CLI:** set `PI_CODING_AGENT_DIR`, and optionally `PI_CODING_AGENT_SESSION_DIR` or `--session-dir` ([environment-variables.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/environment-variables.md), [configuration.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/configuration.md#agent-directory)).
- **SDK:** pass the `agentDir` option, and `ModelRuntime.create({ authPath, modelsPath })` or `setRuntimeApiKey()` for credentials that are never written to disk.

The agent dir also holds `settings.json`, `mcp.json`, `models.json`, `trust.json`, `SYSTEM.md`, `AGENTS.md`, `extensions/` and `skills/`.

**Isolation leaks outside the agent dir:**

- Skills are also read from `~/.agents/skills/` and from `.agents/skills/` in the project and its ancestors ([skills.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md)).
- `AGENTS.md` and `CLAUDE.md` are read from the working directory and every parent directory.

Use `--no-skills --skill <path>` and `--no-context-files`, or the SDK's `noSkills` and `noContextFiles`.

**Sign-in and Upstart's token rule.** In pi-ai, the host app drives login through `prompt`/`notify` callbacks: it receives the auth URL or device code and shows it. Pi stores and refreshes the token. For an RPC subprocess, the host would rely on the subprocess's own `auth.json`; Upstart would not handle tokens itself.

## 2. Driving it from an app

There are three ways ([cli-integration.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/cli-integration.md)):

- **RPC mode**, `pi --mode rpc` ([rpc.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc.md), [rpc-commands.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc-commands.md)):
  - Long-lived child process. Strict JSONL on stdin/stdout: commands, `response` records correlated by `id`, and session events. Split records on LF only; Node's `readline` is unsafe because it also splits on U+2028/U+2029.
  - Commands: `prompt` (with images), `steer`, `follow_up`, `abort`, `clear_queue`, `new_session`, `get_state`, `get_messages`, `set_model`, `set_thinking_level`, `compact`, `switch_session`, `fork`, `clone`, `get_session_stats`, `bash`, and more.
  - Shutdown: close stdin or send SIGTERM. A typed `RpcClient` is exported, and the package exports `./rpc-entry` (`dist/bundle/rpc-entry.js`).
- **JSON mode**, `pi --mode json "…"`: one-shot. It writes a session header followed by the same event stream, then exits ([json.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/json.md)).
- **SDK**, `createAgentSession()` in process ([sdk.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md)):
  - `session.prompt()`, `steer()`, `followUp()`, `abort()`, `waitForIdle()`, `subscribe()` and `dispose()`.
  - Every boundary can be injected: `modelRuntime`, `settingsManager` (including in-memory), `sessionManager` (`SessionManager.inMemory()` or JSONL files), `resourceLoader`, `tools`, `customTools`.
  - See the [full-control example](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/sdk/12-full-control.ts).

**Run lifecycle.** `agent_end` ends one low-level run. `agent_settled` means nothing else will follow: no retry, compaction or queued message.

**Steering and follow-ups.** A steering message is delivered after the current turn's tool calls and before the next model call. A follow-up is delivered after the run finishes. Pi rejects a prompt sent during a run unless it says which of the two it is.

**Sessions.** Stored as JSONL trees that support branching, forking and resuming ([session-format.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/session-format.md)).

## 3. Live preview: streamed tool-call arguments

**Yes, Pi streams them.**

- pi-ai's `AssistantMessageEvent` includes `toolcall_start`, `toolcall_delta` (`delta: string`, raw JSON fragment) and `toolcall_end` (`toolCall: ToolCall`) ([types.ts L815–848](https://github.com/earendil-works/pi/blob/main/packages/ai/src/types.ts#L815-L848)).
- pi-agent-core wraps them as `{ type: "message_update"; message; assistantMessageEvent }` ([agent/src/types.ts L527–549](https://github.com/earendil-works/pi/blob/main/packages/agent/src/types.ts#L527-L549)).
- `tool_execution_start` comes only after the call is complete.

**Provider support.**

- Anthropic forwards each `input_json_delta` as a `toolcall_delta`. It appends the fragment to an incremental argument parser, so `partial.content[i].arguments` is a repaired, parsed object while the call is still streaming ([anthropic-messages.ts ~L1042](https://github.com/earendil-works/pi/blob/main/packages/ai/src/api/anthropic-messages.ts)).
- OpenAI Responses (and so Sign in with ChatGPT), Chat Completions, Bedrock and Mistral also emit deltas.
- **Gemini (google-generative-ai, Vertex) emits the whole call as a single delta**, because the provider sends it whole. Gemini would therefore not give a live preview.

**Format differences between modes.**

- **SDK:** `event.assistantMessageEvent.partial` (`AssistantMessage`) holds the parsed partial arguments, for example `content` for `write`. Reading the file content before the call completes is direct.
- **RPC and JSON:** `message_update` records are **delta-only**. They omit `message` and `partial` so the stream stays linear ([json.md, "Reconstruct streaming messages"](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/json.md#reconstruct-streaming-messages)). An RPC client must concatenate the `delta`s for each `contentIndex` and partial-parse the JSON itself, which Upstart already does for Claude's `input_json_delta`.

**Supporting evidence.** Pi's own TUI renders a `write` call's content while it is still streaming ([renderers/write.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/tools/renderers/write.ts): "a call whose content is still streaming").

**Not verified by running.** My offline check with pi-ai's `faux` provider through the SDK was refused by this session's permission classifier. The streaming claims above come from source and docs only. Pi's agent docs also do not say whether `toolcall_delta` is throttled.

## 4. Confinement

Pi deliberately has no sandbox and no permission prompts. Its [security.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/security.md) says Pi "does not ask for approval before every tool call", and that a missing built-in sandbox is outside its security boundary. Its answer is containers or VMs ([containerization.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/containerization.md): Docker, Docker Sandboxes, OpenShell, Gondolin). The native OS `sandbox/` extension example, which used `@anthropic-ai/sandbox-runtime`, was **removed in 1.5.0** (2026-11-02) ([changelog](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/CHANGELOG.md)).

Ways an embedding app could confine it, with no permission UI anywhere (nothing asks the maker):

- **Run the whole process under Upstart's own Seatbelt profile.** Spawn `rpc-entry.js` with Electron's Node under `sandbox-exec` (or the sandbox-runtime library), allowing writes only to the project folder and the agent dir. This is the strongest option and works the same way as ADR 0007's confinement today. Windows and Linux need their own equivalents. Network egress must still reach the provider, the MCP server and web search.
- **`tool_call` extension hook.** It sees every call, including MCP calls, before execution. It can rewrite `event.input` or return `{ block: true, reason }`, which is the programmatic "deny" ([extensions.md#tool_call](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md#tool_call)). This is a policy layer, not a boundary.
- **Replace or narrow the tools.**
  - `--tools read,write,edit` or `--no-builtin-tools` drops `bash`.
  - `pi.registerTool()` under a built-in name overrides that tool.
  - `createBashTool(cwd, { spawnHook })` wraps each command, for example in `sandbox-exec`.
  - The `*Operations` interfaces let `read`/`write`/`edit` go through Upstart-controlled code ([Remote Execution](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md#remote-execution)).
- **Project trust.** In RPC and JSON modes, `.pi/` resources in the project are skipped unless trust is granted. Pass `--no-approve` to make that explicit.

## 5. Extending

- **MCP: now built in.** The old "Pi has no MCP" stance has changed. Since 1.x, `codemode`, `tool_search` and MCP are built-in extensions, using Pi's own client [`@earendil-works/pi-mcp`](https://github.com/earendil-works/pi/tree/main/packages/mcp) ([mcp.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/mcp.md)).
  - Transports: stdio and streamable HTTP (not SSE), with OAuth.
  - Configuration: `<agent-dir>/mcp.json`, `.pi/mcp.json` (trusted projects only), or `pi.registerMcpServer()`. Tools are named `mcp__<server>__<tool>`.
  - Exposure per server is `direct`, `codemode` or `deferred`. **For Upstart, set `direct`** so `look_at_preview` and similar tools are declared normally.
  - **SDK sessions do not load these automatically:** add `createMcpExtension()` and call `session.bindExtensions()`.
  - Community alternatives: `pi-mcp-adapter` 7.0.1 and `pi-mcp-extension`.
- **Custom tools.** `pi.registerTool()` or the SDK's `customTools`, with TypeBox schemas, streaming partial results (`onUpdate`) and image results. Upstart's five tools could be native tools instead of MCP.
- **Hooks** ([extensions.md#events](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md#events)):

  | Hook | What it does | Claude Code equivalent |
  |---|---|---|
  | `tool_call` | Can block a call or mutate its input | PreToolUse |
  | `tool_result` | Can rewrite a result | PostToolUse |
  | `turn_end`, `agent_end` | Notification | — |
  | `agent_before_settle` | Can append entries and return `continue: true` | **Stop hook that continues the agent** |
  | `agent_settled` | Notification-only | — |

  Other hooks: `before_agent_start`, `context` (rewrite the messages sent to the model), `before_provider_request`, and `input`. `pi.sendUserMessage()` and `pi.sendMessage(…, { deliverAs: "followUp", triggerTurn: true })` also inject work.
- **Agent Skills.** Implements the [agentskills.io](https://agentskills.io/specification) spec: progressive disclosure, `SKILL.md` folders, and `/skill:name` ([skills.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md)).
- **System prompt.** Replace it with `--system-prompt <text|path>`, `<agent-dir>/SYSTEM.md` or the SDK's `systemPrompt`, or add to it with `--append-system-prompt` or `APPEND_SYSTEM.md`. `AGENTS.md` and `CLAUDE.md` are loaded as context files, which `--no-context-files` turns off.
- **Web search: not built in, unconfirmed beyond that.** I found no web search in core or in pi-ai's Anthropic adapter (no `web_search` server tool). Options:
  - Community extensions on npm: `pi-web-access` 0.47.0 (2026-11-05) and `pi-web-search` 1.7.0, which uses provider-native search for Gemini, xAI and OpenAI Responses.
  - An MCP search server.
  - Upstart's own tool.

## 6. Speed, cost, models

**Small default prompt.** The default system prompt is a one-line preamble, short tool snippets, a few rules, and a pointer to Pi's docs ([system-prompt.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/system-prompt.ts)). By reading the source I estimate about 1k tokens with the four default tools; I did not measure it. Upstart would replace it anyway.

**Small tool set.** Only `read`, `bash`, `edit` and `write`, so fixed overhead per request is far below Claude Code's. That helps time to first token and cost under an API key.

**Prompt caching.** On where the provider supports it; `PI_CACHE_RETENTION=long` extends it. System-prompt and tool changes are sent as diffs to keep the cache (pi-ai README).

**Models.** The catalog is refreshed from pi.dev at runtime; `PI_OFFLINE=1` turns that off. There are per-model cost and usage events (`usage` on each `message_update`) and virtual or router models.

**Telemetry.** Install and update telemetry and "provider attribution headers" are **on by default**. Turn them off with `PI_TELEMETRY=0`, and turn off the version check with `PI_SKIP_VERSION_CHECK=1` ([settings.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/settings.md)).

## 7. Shipping

| Item | Detail |
|---|---|
| Licence | MIT, for all packages |
| Node | Requires ≥ 22.19. Upstart's Electron 45.2.3 embeds Node 24.22.2 (checked with `ELECTRON_RUN_AS_NODE`). |
| Size (npm view) | `@earendil-works/pi-coding-agent` 1.5.2: 24.4 MB unpacked, 1,324 files. `pi-ai`: 4.5 MB. `pi-agent-core`: 0.27 MB. |
| Size (local install, scratchpad, `--ignore-scripts`) | 153 MB of `node_modules`, 123 packages. Largest: `openai` 27 MB, `@anthropic-ai/sdk` 14 MB, `@google/genai` 11 MB, plus AWS and Smithy. |
| Bundled CLI | The CLI ships as a 9.4 MB bundle (`dist/bundle/cli.js`, `rpc-entry.js`) that imports only `typebox` and Node built-ins. Bundling it inside Electron looks straightforward. |
| Native dependencies | None required (`@silvia-odwyer/photon-node` is WASM, `quickjs-wasi` is WASM). Code-signing and notarization of the bundle are not checked. |

**Electron options.**

- **Option a:** spawn `rpc-entry.js` with `ELECTRON_RUN_AS_NODE=1`, so it can sit inside a Seatbelt profile. This is the recommended route.
- **Option b:** import the SDK in the main process (or a utility process), which cannot be sandboxed separately.

## 8. Blockers and complications for Upstart

1. **Claude subscription sign-in is excluded.** Pi's Anthropic OAuth impersonates Claude Code, so Upstart must disable it: remove the `anthropic` OAuth method and allow only `ANTHROPIC_API_KEY`. Claude-subscription makers stay on the Claude Agent SDK, so Pi can only be a second harness.
2. **Upstart must own confinement end to end**, including Windows and Linux, now that Pi's OS sandbox example is gone. A `tool_call` deny is policy, not a boundary.
3. **RPC events carry deltas only.** Upstart must reassemble and partial-parse tool arguments. The SDK gives parsed partials, but running in process gives up the process-level sandbox.
4. **Gemini does not stream tool arguments**, so there is no live preview on Gemini models. Live preview works on Anthropic API keys and OpenAI, including Sign in with ChatGPT.
5. **Sign in with ChatGPT is in preview.** It is documented for open-source and locally hosted apps, and a paid app must apply through OpenAI's interest form; Upstart's eligibility is not confirmed. Copilot and Codex OAuth impersonate first-party clients and should be avoided.
6. **Isolation needs flags.** `--no-skills`, `--no-context-files`, `--no-approve`, `PI_OFFLINE`, `PI_TELEMETRY=0` and a private `PI_CODING_AGENT_DIR` are needed, or the maker's `~/.agents/skills` and parent `AGENTS.md`/`CLAUDE.md` leak in.
7. **No built-in web search.** Add an extension, an MCP server or Upstart's own tool.
8. **Fast-moving project.** It went from 0.73 to 1.5.2 in six months, under a new scope and owner (Earendil). Expect breaking changes; pin exact versions.

**Not confirmed:**

- Live streaming, measured end to end. My faux-provider run was not permitted.
- GitHub's stance on Copilot OAuth in third-party apps.
- Whether a closed-source desktop app qualifies for Sign in with ChatGPT without the interest form.
- Whether `toolcall_delta` granularity is the provider's raw chunks or throttled.
- Seatbelt behaviour of Pi's bundle under Electron's Node.
