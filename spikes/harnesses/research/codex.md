# OpenAI Codex as Upstart's agent harness

Researched 2026-11-14 from OpenAI's docs (now served from learn.chatgpt.com; developers.openai.com/codex/* redirects there) and the source of [openai/codex](https://github.com/openai/codex). I read `main` at `b1573f1` (2026-11-14) and checked every cited file at tag [`rust-v0.169.0`](https://github.com/openai/codex/releases/tag/rust-v0.169.0) (published 2026-11-13). npm: `@openai/codex` **0.169.0** and `@openai/codex-sdk` **0.169.0**, both Apache-2.0. Already in `spikes/harnesses/package.json`. I ran only `codex --version`, `codex features list` and `--help`, with a throwaway `CODEX_HOME`. Nothing was signed in to, and nothing was measured.

Source links below use `S/` for `https://github.com/openai/codex/blob/rust-v0.169.0/`.

## Verdict for Upstart

**Technically the best fit of the non-Claude candidates, but the sign-in is a blocker for a commercial app.** `codex app-server` (JSON-RPC over stdio) covers almost everything Upstart relies on:
- an isolated home (`CODEX_HOME`)
- Seatbelt / bubblewrap / Windows sandboxing
- approvals answered programmatically
- app-provided tools ("dynamic tools", which can return images), MCP and Agent Skills
- Stop and PostToolUse hooks
- steer, interrupt and resume
- a fully typed protocol

**Live preview works, with caveats.** Behind a feature flag, `item/fileChange/patchUpdated` streams an `apply_patch` while the model writes it: the whole file so far for a new file, the hunks so far for an edit. The caveats:
- The flag `apply_patch_streaming_events` has been **"under development"** and off by default since April 2026.
- It sends updates **line by line, throttled to one notification per 500 ms**, not token by token.
- It **covers only `apply_patch`**. The TS SDK and `codex exec --json` carry no file content at all.

**The blocker.** OpenAI's app-server docs state: "App-server authentication has never been permitted for commercial or hosted services." A paid or closed-source Upstart therefore cannot start Codex on the maker's ChatGPT plan through Codex's own login. The sanctioned route, Sign in with ChatGPT, has two problems:
- For paid or hosted apps it sits behind a partner waitlist.
- It makes the app hold the OAuth token and pass it to Codex, against Upstart's rule of never handling tokens.

**API key use is unrestricted.**

**Recommendation:** spike it with an API key, and ask OpenAI about plan sign-in before building on it.

## 1. Sign-in

**Two modes** ([Auth docs](https://learn.chatgpt.com/docs/auth)):
- **ChatGPT sign-in** uses the plan's included usage.
- **API key**: "Codex uses standard API pricing instead of included ChatGPT plan credits".

The app-server exposes `account/login/start` with these types ([App Server, Auth endpoints](https://learn.chatgpt.com/docs/app-server#auth-endpoints); `S/codex-rs/app-server-protocol/src/protocol/v2/account.rs`):
- `apiKey`
- `chatgpt`, a browser flow
- `chatgptDeviceCode`
- `chatgptAuthTokens`, experimental: the host app supplies the tokens and must refresh them when asked

**May a third-party app use the maker's ChatGPT sign-in?** For a commercial app, no. The [App Server docs](https://learn.chatgpt.com/docs/app-server#auth-endpoints) say:
- "If you've built a local or open-source application using Codex app-server authentication, you can continue using it, though we recommend migrating to Sign in with ChatGPT…"
- "App-server authentication has never been permitted for commercial or hosted services." They point to a [partner waitlist](https://openai.com/form/sign-in-with-chatgpt-interest/).

**Sign in with ChatGPT (SIWC)** is the sanctioned route ([overview](https://developers.openai.com/siwc/token-sharing-open-source), [Codex app-server page](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server), [cookbook](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt)):
- Open to "open-source projects, personal projects that run locally, and selected private apps".
- "If you're building a paid or remotely hosted app, join the waitlist".
- Plus and Pro users only.
- **The app runs the OAuth (PKCE, 127.0.0.1 callback) and stores the tokens.** It then starts `codex app-server` with `ACCESS_TOKEN` in the environment and a custom provider pointing at `https://api.openai.com/v1`.
- That conflicts with Upstart never reading or relaying tokens (ADR 0010).
- I could not confirm whether a closed-source free desktop app counts as "selected private apps".

**Where auth lives** ([Auth docs](https://learn.chatgpt.com/docs/auth)):
- `cli_auth_credentials_store` takes `file`, `keyring`, `auto` or `ephemeral`.
- `file` writes `auth.json` under `CODEX_HOME` (default `~/.codex`).
- The keyring entry key is a hash of the `CODEX_HOME` path (`S/codex-rs/login/src/auth/storage.rs`, service "Codex Auth", key `cli|<hash>`).
- So **setting `CODEX_HOME` to an Upstart folder isolates both auth and config** from the user's own Codex. `initialize` returns the `codexHome` in use.
- Two leaks remain outside `CODEX_HOME`:
  - `$HOME/.agents/skills` and `/etc/codex/skills` are scanned for skills (see §5).
  - `/etc/codex` admin config also applies.

**Browser loopback:** yes. The browser flow returns to `http://127.0.0.1:1455/auth/callback`, a fixed default port (`S/codex-rs/login/src/server.rs`, `DEFAULT_PORT = 1455`). The app-server "hosts the local callback" and returns an `authUrl` for the app to open. Device code login avoids the loopback but must be enabled in the user's ChatGPT security settings.

## 2. Driving it from an app

There are three surfaces.

**`codex exec --json`** ([Non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode); `S/codex-rs/exec/src/exec_events.rs`):
- JSONL events: `thread.started`, `turn.started`, `turn.completed` (with usage), `turn.failed`, `item.started`, `item.updated` (only for the todo list), `item.completed`, `error`.
- Item types: `agent_message`, `reasoning`, `command_execution`, `file_change` (path and kind only), `mcp_tool_call`, `collab_tool_call`, `web_search`, `todo_list`, `error`.
- **No deltas of any kind.**
- Resume with `codex exec resume <id>`. No follow-up message mid-turn; interrupt means killing the process.

**TypeScript SDK `@openai/codex-sdk`** ([Codex SDK docs](https://learn.chatgpt.com/docs/codex-sdk); `S/sdk/typescript/src/exec.ts`):
- It spawns `codex exec --experimental-json` and yields the same events.
- Options: `codexPathOverride`, `apiKey` (sets `CODEX_API_KEY`), `env`, `config` overrides; per thread `sandboxMode`, `approvalPolicy`, `networkAccessEnabled`, `webSearchMode`, `workingDirectory`, `additionalDirectories`.
- `resumeThread(id)` resumes. `AbortSignal` cancels (it kills the process). No steering.
- OpenAI positions it for CI and automation.

**`codex app-server`**, the surface for Upstart ([App Server docs](https://learn.chatgpt.com/docs/app-server); [OpenAI blog](https://openai.com/index/unlocking-the-codex-harness/)):
- "Use it when you want a deep integration inside your own product: authentication, conversation history, approvals, and streamed agent events."
- Transport: JSON-RPC 2.0 over stdio JSONL by default. WebSocket is "experimental and unsupported".
- `codex app-server --help` labels the subcommand itself `[experimental]`. Experimental fields need `initialize.capabilities.experimentalApi = true`.
- TypeScript types and a JSON schema come from `codex app-server generate-ts` and `generate-json-schema`, and match the binary's version exactly.
- Requests used: `initialize`, `thread/start`, `thread/resume`, `thread/fork`, `turn/start`, `turn/interrupt`, `turn/steer`, `thread/read`, `model/list`, `skills/list`, `config/batchWrite`, and others (full list in `S/codex-rs/app-server-protocol/src/protocol/common.rs`).
- Notifications:
  - lifecycle: `turn/started`, `turn/completed` (`completed | interrupted | failed`), `item/started`, `item/completed`
  - text deltas: `item/agentMessage/delta`, `item/reasoning/summaryTextDelta`, `item/reasoning/textDelta`, `item/plan/delta`
  - command output: `item/commandExecution/outputDelta`
  - file and turn changes: `item/fileChange/patchUpdated`, `turn/diff/updated`, `turn/plan/updated`
  - other: `hook/started`, `hook/completed`, `thread/tokenUsage/updated`, `account/rateLimits/updated`, `error`
- **Resume:** `thread/resume` reopens a stored thread (rollouts live under `CODEX_HOME`). `ephemeral: true` skips persisting it.
- **Interrupt:** `turn/interrupt {threadId, turnId}`; the turn ends with `status: "interrupted"`.
- **Follow-up mid-turn:** `turn/steer {threadId, input, expectedTurnId}` appends user input to the active turn. There is also a `thread/queue/*` API.

## 3. Live preview

**Only the app-server, with an under-development feature flag, streams a file edit's content while it is generated.**

**`item/fileChange/patchUpdated`** (`S/codex-rs/app-server-protocol/src/protocol/common.rs`, line ~2114):
- Params: `{threadId, turnId, itemId, changes: FileUpdateChange[]}`, each change `{path, kind, diff}` (`S/codex-rs/app-server-protocol/src/protocol/v2/item.rs`, `FileChangePatchUpdatedNotification`).
- `itemId` is the `apply_patch` call id, which later becomes the `fileChange` item's id (`S/codex-rs/app-server-protocol/src/protocol/item_builders.rs`).
- It is not mentioned in the public app-server docs.

**How it is produced** (`S/codex-rs/core/src/tools/handlers/apply_patch.rs`):
1. The Responses API streams `response.custom_tool_call_input.delta` for the freeform `apply_patch` tool (`S/codex-rs/codex-api/src/sse/responses.rs`).
2. `run_sampling_request` feeds each delta to the tool's `ToolArgumentDiffConsumer` (`S/codex-rs/core/src/session/turn.rs`, `ResponseEvent::ToolCallInputDelta`).
3. A `StreamingPatchParser` (`S/codex-rs/apply-patch/src/streaming_parser.rs`) parses **complete lines only** and returns all hunks so far.
4. Each event carries the **accumulated** state: for `*** Add File` the full content so far, for `*** Update File` the `-`/`+` chunks so far, not the resulting file.
5. **Events are throttled:** `APPLY_PATCH_ARGUMENT_DIFF_BUFFER_INTERVAL = 500 ms`. A pending update is flushed when the call completes.

**Gated by `features.apply_patch_streaming_events`** (`S/codex-rs/features/src/lib.rs`):
- `Stage::UnderDevelopment`, which the source describes as "not ready for external use". `default_enabled: false`. `codex features list` on 0.169.0 shows `under development false`.
- Enable it with `--enable apply_patch_streaming_events` or `-c features.apply_patch_streaming_events=true`. That prints an unstable-feature warning, which `suppress_unstable_features_warning` silences.
- History:
  - [PR #17862](https://github.com/openai/codex/pull/17862), merged 2026-04-17: "to enable clients to show progress during file writes".
  - [PR #18289](https://github.com/openai/codex/pull/18289), merged 2026-04-20: "The eventual goal is to use this to display better progress indicators in the codex app".
  - A stateful parser followed on 2026-04-30.

**Scope:**
- Works only for the freeform (custom-tool) `apply_patch`. Every model in the bundled catalog uses `freeform` (`S/codex-rs/models-manager/models.json`): gpt-6-astra, gpt-6.1-sol, gpt-6.1-terra, gpt-6-sol, gpt-6-luna, gpt-5.6-*.
- **Not** for function-call tools: MCP tools, dynamic tools and shell commands get no argument streaming. So an Upstart-provided `write_file` tool would not stream, and a file written with `cat > file <<EOF` from the shell would appear only once complete.
- No Write/Edit split: new files and edits both go through `apply_patch`.

**Everything else arrives complete:**
- `item/started` for a `fileChange` already holds the finished `changes` (it is emitted when the tool runs, after generation).
- `turn/diff/updated` sends the aggregated unified diff after each applied patch.
- `item/fileChange/outputDelta` is deprecated and "Current app-server versions no longer emit it" ([App Server, Item deltas](https://learn.chatgpt.com/docs/app-server#item-deltas)).
- `codex exec --json` and the TS SDK carry `file_change` items with only `{path, kind}`, no content (`S/codex-rs/exec/src/exec_events.rs`, `S/sdk/typescript/src/items.ts`).

**What the preview would show:**
- A new page growing in roughly 500 ms, line-aligned steps, like Claude's stream but coarser.
- An edit to an existing file has to be rebuilt by Upstart: apply the partial `-`/`+` hunks to the file on disk.
- **Not verified at runtime.**

## 4. Confinement

**Sandbox modes and approval policies** ([Sandbox](https://learn.chatgpt.com/docs/sandboxing), [Agent approvals & security](https://learn.chatgpt.com/docs/agent-approvals-security)):
- Sandbox modes: `read-only`, `workspace-write`, `danger-full-access`.
- Approval policies: `on-request`, `never`, and `granular = {…}` (auto-reject some categories, ask for others). `untrusted` is retired.
- `approvals_reviewer` is `user` or `auto_review`.
- `workspace-write` defaults to no network for commands; turn it on with `sandbox_workspace_write.network_access = true`.
- The sandbox applies to **spawned commands** (and `apply_patch` writes are checked against writable roots). The Codex process itself is not sandboxed.
- Codex has no built-in read-file tool: the model reads through sandboxed shell commands and `view_image` (`S/codex-rs/core/src/tools/handlers/`).

**Platform enforcement:**
- macOS: Seatbelt (`sandbox-exec -p <profile>`), no setup needed.
- Linux and WSL2: bubblewrap. It needs `bwrap` on PATH, or falls back to a bundled helper that needs unprivileged user namespaces; Ubuntu 24.04 needs an AppArmor profile.
- Windows: native sandbox ([Windows sandbox](https://learn.chatgpt.com/docs/windows/windows-sandbox)). `mxc` is recommended and needs no admin; the `elevated` legacy fallback needs admin-approved setup; `unelevated` has no deny-read.

**Limiting reads: yes.**
- app-server `sandboxPolicy`: `readOnlyAccess: {type: "restricted", includePlatformDefaults, readableRoots}` on `workspaceWrite` ([App Server, Sandbox read access](https://learn.chatgpt.com/docs/app-server#sandbox-read-access-readonlyaccess)).
- Or [permission profiles](https://learn.chatgpt.com/docs/permissions), in beta: `read`, `write` and `deny` per path or glob, plus domain allow/deny through a network proxy.

**Answering approvals programmatically** ([App Server, Approvals](https://learn.chatgpt.com/docs/app-server#approvals)):
- Server-to-client JSON-RPC requests: `item/commandExecution/requestApproval`, `item/fileChange/requestApproval`, `item/permissions/requestApproval`, `mcpServer/elicitation/request`, `item/tool/requestUserInput`.
- The app answers `decline` or `cancel` (or `accept` / `acceptForSession`).
- **Upstart's equivalent of "auto mode, deny the rest":** `workspace-write` plus `on-request`, with every request answered `decline` by code. Or `approval_policy = "never"`, where anything outside the sandbox simply fails back to the model.

## 5. Extending

**MCP** ([MCP docs](https://learn.chatgpt.com/docs/extend/mcp)):
- STDIO servers (`command`, `args`, `env`) and Streamable HTTP servers (`url`, `bearer_token_env_var`), declared under `[mcp_servers.<name>]`.
- An app can inject them with `-c` or `config` on `thread/start`.
- Knobs: `enabled_tools`, `disabled_tools`, `tool_timeout_sec` (default 60), and approval modes per tool.
- No in-process SDK MCP server. Upstart would run a localhost HTTP MCP server or a stdio child.

**App-provided tools without MCP:** `dynamicTools` on `thread/start`, experimental ([App Server, Dynamic tool calls](https://learn.chatgpt.com/docs/app-server#dynamic-tool-calls-experimental)):
- Codex sends `item/tool/call {callId, tool, arguments}` to the client.
- The client returns `{contentItems: [inputText | inputImage{imageUrl} | inputAudio], success}` (`S/codex-rs/app-server-protocol/src/protocol/v2/item.rs`).
- This is the closest match to Upstart's in-process MCP server, `look_at_preview` included (it can return an image).

**Agent Skills (SKILL.md):** yes ([Build skills](https://learn.chatgpt.com/docs/build-skills)).
- Roots: `.agents/skills` from the cwd up to the repo root, `$CODEX_HOME/skills`, **`$HOME/.agents/skills`** (outside `CODEX_HOME`, see `S/codex-rs/ext/skills/src/host_roots.rs`), `/etc/codex/skills`, and the bundled system skills.
- Extra roots come from `skills/extraRoots/set` or `perCwdExtraUserRoots`. Disable skills with `[[skills.config]]`; `skills.bundled.enabled = false` turns off the built-in ones.
- Explicit invocation: a `skill` input item.

**Instructions:**
- `AGENTS.md` is read from `CODEX_HOME` (or `AGENTS.override.md`) and from the project root down to the cwd ([AGENTS.md docs](https://learn.chatgpt.com/docs/agent-configuration/agents-md)).
- `thread/start` takes `baseInstructions` (replaces the base prompt) and `developerInstructions`. `model_instructions_file` exists in config.

**Hooks** ([Hooks](https://learn.chatgpt.com/docs/hooks)): stable and on by default.
- Events: PreToolUse, PermissionRequest, PostToolUse, PreCompact, PostCompact, SessionStart, SessionEnd, UserPromptSubmit, SubagentStart, SubagentStop, Stop, Interrupt, and PreModelRequest / PostModelRequest.
- **Stop** with `{"decision":"block","reason":…}` makes Codex continue, with the reason as a new prompt.
- **PostToolUse** covers `apply_patch` (matched as `apply_patch`, `Edit` or `Write`), shell, MCP and local function tools. It can add `additionalContext`, or block and replace the tool result. Hosted WebSearch is not covered.
- Handlers: `command`, or `mcp_tool`, which calls a tool on a configured MCP server (so Upstart's own server could answer hooks).
- Non-managed hooks must be **trusted** by hash before they run. An app can bypass that per thread with `config: {"bypass_hook_trust": true}` (`S/codex-rs/app-server/src/config_manager.rs`, as `codex exec --dangerously-bypass-hook-trust` does).
- With app-server the host also sees `turn/completed`, so it can simply start the next turn itself instead of using a Stop hook.

**Web search:**
- Built-in hosted `web_search`, `cached` by default (an OpenAI index) or `live`, or `disabled` ([Web search](https://learn.chatgpt.com/docs/web-search)).
- Its actions include `search`, `openPage` and `findInPage`, so it can also read a page. There is no separate WebFetch tool.
- I could not confirm the API-key billing for search calls.

## 6. Models, speed, cost

**Models** ([Models](https://learn.chatgpt.com/docs/models)):

| Model | Positioned for |
| --- | --- |
| GPT-6 Astra | Most capable |
| GPT-6.1 Sol | "Near-Astra performance… at a lower cost" |
| GPT-6.1 Terra | "fast, efficient", writing and visual understanding; needs CLI ≥ 0.159.0 |
| GPT-6 Luna | Cheapest |
| GPT-6 Sol, gpt-5.6-* | Still in the catalog |

GPT-5.5 retired from ChatGPT sign-in on 2026-10-14. Reasoning efforts run from minimal to max/ultra.

**Speed** ([Speed](https://learn.chatgpt.com/docs/agent-configuration/speed)):
- **Fast mode** works with ChatGPT sign-in only and costs 2.5× the included usage.
- **Ultrafast** is for Astra and 6.1 Sol: up to 8× faster for Astra, on Pro $500 and Enterprise, at 8× the usage.
- No first-hand latency numbers yet; that is the spike's job.

**ChatGPT plans** ([Pricing](https://learn.chatgpt.com/docs/pricing)):
- Plus $20 and Pro $100 / $200 / $500.
- Per 5 h on Plus: Sol 6.1 roughly 15–160 local messages, Terra 35–285, Astra 5–45; weekly limits may also apply.
- Pro has no 5-hour limit.
- Free and Go list only GPT-6 Luna "in the desktop app". Whether they get CLI or app-server access is unconfirmed.

**API, per 1M tokens, standard short context** ([API pricing](https://developers.openai.com/api/docs/pricing)):

| Model | Input | Output | Cached input |
| --- | --- | --- | --- |
| gpt-6.1-sol | $2 | $10 | $0.10 |
| gpt-6.1-terra | $1 | $5 | $0.05 |
| gpt-6-astra | $10 | $50 | |
| gpt-6-luna | $0.10 | $0.50 | |

## 7. Shipping

**Licence:** Apache-2.0 (repo `LICENSE`/`NOTICE`, npm metadata), so bundling is allowed with the NOTICE kept. "Codex" is OpenAI's trademark.

**Binaries:**
- npm `@openai/codex@0.169.0` pulls one platform package via `optionalDependencies`: darwin-arm64/x64, linux-arm64/x64, win32-arm64/x64.
- darwin-arm64 unpacks to **377 MB**: `bin/codex` is **281 MB**, plus `codex-code-mode-host` 70 MB, `rg` 4 MB, and voice libraries.
- GitHub releases also ship a standalone **`codex-app-server-<target>`**: about 88 MB `.tar.gz` / 62 MB `.zst` compressed for aarch64-apple-darwin, and 250 MB uncompressed for the Windows arm64 `.exe` ([release rust-v0.169.0](https://github.com/openai/codex/releases/tag/rust-v0.169.0)).
- Shipping options: inside the app, or downloaded on first use; the standalone app-server binary is the smaller choice.
- Codesigning and notarization of the macOS binaries: not checked.

**Cadence:** releases are near-daily (0.169.0 on 2026-11-13). The protocol schema is tied to each version, so Upstart should pin a version.

## 8. What would block or complicate it

1. **Plan sign-in for a commercial app.** OpenAI forbids app-server ChatGPT auth "for commercial or hosted services". SIWC needs the waitlist for paid or hosted apps and makes Upstart hold tokens. Only API keys are clean today. **Biggest risk; ask OpenAI.**
2. **Live preview depends on an "under development" flag.** It has been off by default for 7 months, is undocumented in the public protocol docs, is coarse (500 ms, line-level), covers only `apply_patch` (shell-written files get no preview), and edits come as hunks to apply. Could change or vanish without notice.
3. **app-server is labelled experimental** in `--help`, and dynamic tools, `chatgptAuthTokens` and `experimentalApi` fields are experimental. Expect breaking changes; pin versions.
4. **Isolation leaks:** skills from `$HOME/.agents/skills` and `/etc/codex/skills`, and admin config from `/etc/codex`. Running with a scoped `HOME`, or disabling skills by config, would be needed. Not verified.
5. **Size:** about 280 MB per platform for the full CLI binary, versus about 90 MB compressed for the standalone app-server.
6. **Linux** needs bubblewrap and user namespaces. **Windows** sandbox setup may need admin outside `mxc`.
7. **No in-process MCP:** Upstart's tools become dynamic tools (experimental) or a localhost MCP server.
