# opencode as Upstart's agent harness

Researched 2026-11-14 from the docs and source of [anomalyco/opencode](https://github.com/anomalyco/opencode) (formerly sst/opencode, which redirects there). I read `dev` at commit `024a146` (2026-11-14) and tag `v1.19.5`, plus npm. Nothing was installed or signed in to, and nothing was measured at runtime.

## Verdict for Upstart

**Not a drop-in replacement today. The live preview fails.** opencode deliberately stopped publishing a tool call's input while it streams. In V2, `write`/`edit` content shows up all at once, in `session.tool.input.ended`, after the model has finished generating it. A one-line fix is open but not merged ([PR #58416](https://github.com/anomalyco/opencode/pull/58416), for [#58415](https://github.com/anomalyco/opencode/issues/58415)).

Two more gaps:
- opencode has **no OS sandbox**. Its shell runs with the user's full authority.
- Its **"Claude Agent" provider** runs the official `claude` binary through the Agent SDK. That fits Upstart's hard rule. But the provider is new (merged 2026-10-30), its docs page is hidden (`noindex`), and it drops tool-input deltas too.

Apart from those gaps, opencode fits well:
- An HTTP server that is easy to drive, with a typed client and an SSE stream
- Per-tool allow/deny rules, and a programmatic permission reply
- MCP, Agent Skills, plugins with tool hooks, custom agents and system prompts
- ChatGPT and Copilot subscriptions
- MIT licence

It is worth a spike only if Upstart accepts carrying a small patch, or waits for #58416 and the equivalent change in the Claude Agent stream converter.

**Version churn:** opencode 2 shipped in Oct–Nov 2026 under new npm names. Plugins and the server API both broke between V1 and V2.

## Versions (as of 2026-11-14)

| Line | npm | Latest | Notes |
| --- | --- | --- | --- |
| V2 (current) | [`@opencode/cli`](https://www.npmjs.com/package/@opencode/cli), `@opencode/client`, `@opencode/sdk`, `@opencode/plugin` | **2.3.0** ([release](https://github.com/anomalyco/opencode/releases/tag/v2.3.0), 2026-11-13) | New server API, plugin API and config shape ([Migrate from V1](https://github.com/anomalyco/opencode/blob/dev/services/site/src/docs/content/migrate-v1.mdx)) |
| V1 (legacy) | [`opencode-ai`](https://www.npmjs.com/package/opencode-ai), `@opencode-ai/sdk`, `@opencode-ai/plugin` | **1.19.5** (2026-10-28) | Still `latest` on those names. GitHub's "latest release" also still points to v1.19.5 |

Docs are in the repo under `services/site/src/docs/content` (V2) and `.../docs/v1/content` (V1), and served at opencode.ai/docs.

## 1. Providers and sign-in

- **Catalog:** the provider and model list comes from [models.dev](https://models.dev). opencode uses the AI SDK and its own packages, and lets you add custom OpenAI- or Anthropic-compatible endpoints. Built-in connections include Azure, Bedrock, Vertex, Ollama/LM Studio/vLLM and gateways ([providers.mdx](https://github.com/anomalyco/opencode/blob/dev/services/site/src/docs/content/providers.mdx)).
- **ChatGPT Plus/Pro:** "Sign in with ChatGPT", or legacy Codex sign-in. Usage counts against the plan, and context is capped to Codex defaults (272K, or 500K on GPT-6.1 Sol and newer) unless `-opencode.provider.openai-context-caps` is set ([providers.mdx#chatgpt](https://github.com/anomalyco/opencode/blob/dev/services/site/src/docs/content/providers.mdx)).
  - Codex OAuth arrived in opencode v1.1.11 in January 2026 ([devgenius](https://blog.devgenius.io/jump-ship-in-minutes-codex-oauth-now-works-in-opencode-d2708c32f571)).
  - Secondary coverage calls OpenAI's backing an official partnership ([sovereignmagazine](https://www.sovereignmagazine.com/article/openai-codex-plugins-ai-coding-tools)), and lists opencode among the "Sign in with ChatGPT" tools ([thenewstack](https://thenewstack.io/sign-in-with-chatgpt/)).
  - **Not confirmed:** I found no primary OpenAI page on the terms.
- **GitHub Copilot:** device OAuth for GitHub.com or Enterprise. Needs Copilot Chat access (Free works).
- **Google:** Gemini through an API key or Vertex. I found **no Google consumer-subscription (Gemini plan) sign-in** in V2's docs.
- **OpenCode Console** (the pay-as-you-go service formerly called "Zen"): an `oc_sk_` key and per-token prices. Examples: Claude Sonnet 5.5 at $2/$10 per million tokens, Opus 5.5 at $4/$20, GPT 6.1 Sol at $2/$10. Some models are free for a limited time, and some of those retain or train on data ([console/models.mdx](https://github.com/anomalyco/opencode/blob/dev/services/site/src/docs/content/console/models.mdx)).
- **OpenCode Go:** a subscription for open models (plus Claude Haiku 5.5, GPT 6 Luna and Gemini 4 Argon). Plans are $10/month, Go Plus $40, Teams $20/member, with monthly dollar limits and a 5-hour window of 20% of the monthly limit ([console/go.mdx](https://github.com/anomalyco/opencode/blob/dev/services/site/src/docs/content/console/go.mdx)).
- **Anthropic, the history:**
  - Anthropic enforced server-side blocks on third-party use of subscription OAuth from January 2026, and spelled out the ban in its terms in February ([The Register](https://www.theregister.com/2026/02/20/anthropic_clarifies_ban_third_party_claude_access)).
  - opencode then merged [PR #18186 "anthropic legal requests"](https://github.com/anomalyco/opencode/pull/18186) on 2026-03-19. It removed the built-in `opencode-anthropic-auth` plugin, the Claude Code prompt file and the Pro/Max hints.
  - V1 docs say Pro/Max use "is not officially supported by Anthropic". Community plugins that restore it are workarounds; Upstart must not use them.
- **Anthropic API keys** still work as an ordinary provider.
- **Anthropic, now (V2): the "Claude Agent" provider** (`claude-agent`; [PR #58782](https://github.com/anomalyco/opencode/pull/58782), merged 2026-10-30; [claude-agent.mdx](https://github.com/anomalyco/opencode/blob/dev/services/site/src/docs/content/claude-agent.mdx), page marked `noindex`; [spec](https://github.com/anomalyco/opencode/blob/dev/specs/v2/claude-agent-provider.md)).
  - It runs the user's own `claude` (2.1.248 or later, found on `PATH` or through `OPENCODE_CLAUDE_PATH`) via `@anthropic-ai/claude-agent-sdk` 0.3.301. It never reads Claude Code's login, and the maker signs in with `claude auth login`.
  - Claude Code's own tools, settings, hooks, CLAUDE.md, skills and MCP servers are turned off (`tools: []`, `settingSources: []`, `permissionMode: "dontAsk"`). opencode's tools are exposed as an in-process MCP server, `mcp__opencode__*` ([query-options.ts](https://github.com/anomalyco/opencode/blob/dev/packages/core/src/plugin/provider/claude-agent/claude/query-options.ts)).
  - The spec's open questions include "Do we need to discuss anything here with anthropic or any kind of approval?"
  - Anthropic's Agent SDK page still says: "Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK" ([Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview)).
  - That restriction applies to Upstart whichever harness wraps the binary.
- **Where credentials live:** in V2, credentials sit in the SQLite database `$XDG_DATA_HOME/opencode/opencode.db`, not in the keychain. `OPENCODE_DB` overrides the path. On first start, V2 imports the legacy V1 `auth.json` from the same data directory ([troubleshooting.mdx](https://github.com/anomalyco/opencode/blob/dev/services/site/src/docs/content/troubleshooting.mdx)).
- **Isolation:**
  - Paths: global paths come from `XDG_DATA_HOME`, `XDG_CONFIG_HOME`, `XDG_CACHE_HOME` and `XDG_STATE_HOME` ([global-roots.ts](https://github.com/anomalyco/opencode/blob/dev/packages/util/src/global-roots.ts)). `OPENCODE_CONFIG_DIR`, `OPENCODE_CONFIG` and `OPENCODE_CONFIG_CONTENT` (inline JSON) set the config.
  - Leaks to switch off:
    - `OPENCODE_DISABLE_CLAUDE_CODE=1` stops `~/.claude/skills` being read. `~/.agents/skills` is still searched.
    - `OPENCODE_DISABLE_PROJECT_CONFIG=1` skips project config and ambient `AGENTS.md`.
    - `OPENCODE_DISABLE_MODELS_FETCH=1`, with `OPENCODE_MODELS_PATH`, stops the models.dev fetch and uses a local copy instead ([server-process.ts](https://github.com/anomalyco/opencode/blob/dev/packages/cli/src/server-process.ts)).
  - What can't be overridden: the system files `/Library/Application Support/opencode/opencode.json` and macOS managed preferences `ai.opencode.managed.plist`. They always apply.
  - The shared service: by default V2 starts **one shared background service per user**. Upstart must use `opencode serve` (standalone) or `--standalone`, never that service.

## 2. Driving it from an app

- **Server:** `opencode serve --hostname 127.0.0.1 --port N` serves HTTP with Basic auth. The user is always `opencode`; the password comes from `OPENCODE_PASSWORD` ([cli/web.mdx](https://github.com/anomalyco/opencode/blob/dev/services/site/src/docs/content/cli/web.mdx), [migrate-v1.mdx](https://github.com/anomalyco/opencode/blob/dev/services/site/src/docs/content/migrate-v1.mdx#server-authentication)).
- **Routes** (from `packages/protocol`/`server`):
  - Sessions: `/api/session`, `/api/session/:id/prompt`, `/interrupt`, `/fork`, `/compact`, `/message`
  - Permissions: `/api/session/:id/permission/:requestID/reply`
  - Events: `/api/event` (SSE)
  - Sign-in: `/api/integration/:id/connect/{oauth,key,command}`
  - Also `/api/mcp`, `/api/agent` and `/api/config`
- **Client:** [`@opencode/client`](https://github.com/anomalyco/opencode/blob/dev/services/site/src/docs/content/build/client/index.mdx) 2.3.0, generated from the API contract.
  - Calls: `client.session.create({location:{directory}})` and `client.session.prompt({sessionID, text})`.
  - Events: `client.event.subscribe({types})` returns an AsyncIterable. It is live-only, with no replay or auto-reconnect; on `server.connected`, resync.
- **Embedded:** [`@opencode/sdk`](https://github.com/anomalyco/opencode/blob/dev/services/site/src/docs/content/build/sdk/index.mdx) `OpenCode.create()` runs the whole server inside the host process. That would put the agent's shell inside Upstart's Electron process, so it is not wanted for confinement.
- **Event types** (V2, from [session-event.ts](https://github.com/anomalyco/opencode/blob/dev/packages/schema/src/session-event.ts)):
  - Execution: `session.execution.{started,succeeded,failed,interrupted}`, `session.step.{started,streamed,ended,failed}`
  - Text and reasoning: `session.text.{started,delta,ended}`, `session.reasoning.{…}`
  - Tools: `session.tool.input.{started,delta,ended}`, `session.tool.{called,progress,success,failed}`
  - Other: `session.inbox.*` (queued/steered follow-ups), `session.compaction.*`, `session.skill.activated`, `permission.asked` and `permission.replied`
  - Text and reasoning deltas are batched every 100 ms.
- **Abort:** `POST /api/session/:id/interrupt` (`{resume:false}`).
- **Follow-ups:** `prompt` again on the same session. The `delivery` field takes `"steer"` (the default: delivered at the next step boundary) or `"queue"`. Sessions persist in the database and can be forked.
- **One-shot CLI:** `opencode run --format json` writes NDJSON. Useful flags: `--session`, `--continue`, `--agent`, `--model`, `--standalone`, and `--auto` (approve everything not denied) ([cli/commands.mdx](https://github.com/anomalyco/opencode/blob/dev/services/site/src/docs/content/cli/commands.mdx)).
- **V1** used different contracts: `@opencode-ai/sdk`, `/event` with `message.part.updated` and `message.part.delta`. V1 integrations must be ported.

## 3. LIVE PREVIEW (the key requirement)

**Today the answer is no: tool input arrives only once it is complete.**

- **V2 (2.3.0 and `dev`):** the runner gets the provider's `tool-input-delta` chunks and accumulates them, but publishes only `session.tool.input.started` (the name) and `session.tool.input.ended` (the full text).
  - In [publish-llm-event.ts](https://github.com/anomalyco/opencode/blob/dev/packages/core/src/session/runner/publish-llm-event.ts), the tool-input fragments get only an `ended` callback, while text and reasoning also get a `delta` callback.
  - A unit test asserts this behaviour: "tool input deltas are accumulated without being published" (`packages/core/test/session-runner-tool-events.test.ts`).
  - The schema still defines an ephemeral `session.tool.input.delta`, and the TUI and `run --format json` still consume it.
  - The regression came from commit 4fee4d7 ("batch streamed session deltas"). It is reported in [#58415](https://github.com/anomalyco/opencode/issues/58415) (open since 2026-10-23). The fix, [#58416](https://github.com/anomalyco/opencode/pull/58416), would publish tool input in 100 ms batches; it is open and unmerged.
- **Claude Agent provider:** [convert-claude-stream.ts](https://github.com/anomalyco/opencode/blob/dev/packages/core/src/plugin/provider/claude-agent/language-model/convert-claude-stream.ts) handles only `text_delta` and `thinking_delta`. It ignores `input_json_delta` and builds the `tool-call` from the complete assistant message.
  - So even with #58416 merged, Claude through opencode would show no partial writes until this converter also maps `input_json_delta` to `tool-input-delta`.
  - It also runs tools one at a time.
- **V1 (1.19.5):** the default `processor.ts` creates a `pending` tool part with `raw: ""` on `tool-input-start`, but drops `tool-input-delta`. `raw` is never filled.
  - The request to emit `message.part.delta` for tool input ([#28800](https://github.com/anomalyco/opencode/issues/28800)) was auto-closed as not planned.
  - V1's experimental "next" runner did publish `session.next.tool.input.delta` for each chunk. **Not confirmed:** whether that runner was ever the default in 1.19.x.
- **Workaround:** patch opencode (MIT): merge #58416's change and add the Claude converter mapping. That is small code but a fork to maintain. Watching the file on disk doesn't help, because the file is written only after the call completes.

## 4. Confinement

- **Permissions** (V2) are an ordered `permissions` array of `{action, resource, effect}` rules. Effects are `allow`, `ask` or `deny`, and the last match wins ([permissions.mdx](https://github.com/anomalyco/opencode/blob/dev/services/site/src/docs/content/permissions.mdx)).
  - Actions: `read`, `edit` (covers write and patch), `glob`, `grep`, `shell` (command patterns, parsed by a scanner for bash/zsh/sh/PowerShell), `subagent`, `skill`, `question`, `webfetch`, `websearch`, `external_directory`, and MCP `<server>_<tool>`.
  - The **default policy is allow-all**, including `external_directory`. Only `.env` reads ask.
  - `policies` (system, managed or Console) can hard-deny on top of the rules.
- **No OS sandbox.** The docs warn that "`shell` runs with the host user's filesystem, process, and network authority". The repo contains no Seatbelt, bubblewrap or Landlock code.
  - The Claude Agent provider turns Claude Code's own tools off, so Claude Code's sandboxed Bash isn't available ([spec](https://github.com/anomalyco/opencode/blob/dev/specs/v2/claude-agent-provider.md)).
  - So Upstart would need to wrap the `opencode serve` process itself, for example with `sandbox-exec` on macOS, or deny `shell` outright.
- **Programmatic answers:**
  - **Avoid prompts:** write rules so nothing resolves to `ask`: deny `*`, then allow the needed actions inside the project.
  - **Hook:** a plugin `ctx.permission.hook("evaluate", e => { e.effect = "deny" })` can rewrite any `allow`/`ask`.
  - **API:** answer `permission.asked` with `POST /api/session/:id/permission/:requestID/reply` and `reject`, which rejects all of the session's pending requests. `once` and `always` are the other choices.
  - A plain reject ends the step; a reject with feedback, or a deny, gives the model a tool error and lets it continue ([plugins/server.mdx#permissions](https://github.com/anomalyco/opencode/blob/dev/services/site/src/docs/content/build/plugins/server.mdx)).

## 5. Extending

- **MCP:** local (stdio `command`) and remote (HTTP with OAuth) servers under `mcp.servers` ([mcp-servers.mdx](https://github.com/anomalyco/opencode/blob/dev/services/site/src/docs/content/mcp-servers.mdx)). Covers tools, resources, prompts and server instructions, with separate catalog and execution timeouts.
  - Upstart's tools would run as a stdio or localhost HTTP server; there is no in-process SDK MCP server as in the Agent SDK.
  - The Claude Agent provider re-exposes them to Claude.
- **Agent Skills:** `SKILL.md` folders, loaded on demand through the `skill` tool ([skills.mdx](https://github.com/anomalyco/opencode/blob/dev/services/site/src/docs/content/skills.mdx)).
  - Searched in `.opencode/skills`, `.claude/skills` and `.agents/skills` (global and project), plus extra paths or URLs in `skills: [...]`.
- **Custom tools:** registered by plugins, `ctx.tool.transform(editor => editor.add({...}))`, with JSON Schema input, `context.progress()` and `context.signal`. Freeform tool input is supported on compatible models.
- **Plugins (V2):** `Plugin.define({id, setup(ctx)})`, local in `.opencode/plugins/<name>/index.ts` or as an npm package ([plugins/server.mdx](https://github.com/anomalyco/opencode/blob/dev/services/site/src/docs/content/build/plugins/server.mdx)). V1 plugins don't run in V2.
  - Session hooks: `prompt` (admission), `context` (just before each model call), model-request and HTTP hooks, and retry policy.
  - Tool hooks: `execute.before` and `execute.after`, which can rewrite the result. This is the **PostToolUse equivalent**.
  - Other hooks: `permission.evaluate` and `shell.create.before`.
  - **No Stop hook that can veto the end of a turn.** The equivalent: a plugin subscribes to `session.execution.succeeded` and calls `ctx.session.prompt()` or `ctx.session.synthetic()` to start another turn.
- **Instructions:** discovered from `AGENTS.md` (global, and ambient from cwd up to home or the project root) and `instructions` in config ([instructions.mdx](https://github.com/anomalyco/opencode/blob/dev/services/site/src/docs/content/instructions.mdx)).
  - Custom agents go in `.opencode/agents/<id>.md` or `agents: {}` in config. Their `system` **replaces the provider base prompt**, and they carry their own `permissions`, `model` (`provider/model#variant`) and `steps` ([agents.mdx](https://github.com/anomalyco/opencode/blob/dev/services/site/src/docs/content/agents.mdx)).
  - With Claude Agent, Claude Code's system prompt is used, and the agent prompt is added to it.
  - Keyed per-session instruction entries are available through `instructions.entry.put` (experimental).
- **Web:** `webfetch` is built in.
  - `websearch` needs a search provider key: Exa, Firecrawl, Parallel, Tavily or TinyFish ([websearch.mdx](https://github.com/anomalyco/opencode/blob/dev/services/site/src/docs/content/websearch.mdx)). The Console also offers search.
  - With Claude Agent, Claude's own WebSearch is off, because built-in tools are off.

## 6. Speed notes and costs

- Not measured; I ran nothing.
- Text deltas are batched at 100 ms intervals (`deltaBatchInterval = 100`), which is fine for chat.
- The server is a compiled Bun binary started once per app run. Sessions persist in SQLite, and compaction is opencode's own (Claude Code's auto-compaction is disabled in the Claude Agent path).
- With Claude Agent, the Claude process restarts whenever the tool list changes, and tool calls run one at a time ([spec](https://github.com/anomalyco/opencode/blob/dev/specs/v2/claude-agent-provider.md)).
- The spec notes unverified reports that SDK use gets less subscription usage than interactive Claude Code.
- **Costs:** opencode itself is free.
  - Models are billed by the provider or plan: ChatGPT/Copilot plan quotas, API keys at provider prices, Console pay-as-you-go, or Go at $10/$40/month.
  - With Claude Agent, a subscription shows no cost and an API key shows Anthropic prices.

## 7. Shipping

- **Licence:** MIT ([LICENSE](https://github.com/anomalyco/opencode/blob/dev/LICENSE)).
- **Binaries:** one standalone native binary per platform, Bun-compiled (`packages/cli/script/build.ts`).
  - Platforms: darwin-arm64, darwin-x64 (plus a baseline build), linux x64/arm64 for glibc and musl, and windows x64/arm64.
  - Size: the v2.3.0 zip for darwin-arm64 is 103 MB, and the npm package `@opencode/cli-darwin-arm64` is 224 MB unpacked. The Linux and Windows archives are 112–118 MB ([release assets](https://github.com/anomalyco/opencode/releases/tag/v2.3.0)). V1 1.19.5's zips were 64–82 MB.
  - The macOS build is ad-hoc signed in `build-node.ts`. Upstart would re-sign and notarize it inside its app bundle.
- **Bundling:** turn auto-update off with `update: "disable"` in config. Ship a pinned binary, and pin `models.dev` data through `OPENCODE_MODELS_PATH` and `OPENCODE_DISABLE_MODELS_FETCH`.
  - The Claude Agent path additionally needs the `claude` binary, so Upstart would ship both.
  - The SDK is an optional peer dependency, which the opencode team calls "big (our second biggest)".
- **Release cadence:** very fast, several releases a week. Breaking-change risk is real (V1 to V2 a month ago).

## 8. Blockers and complications for Upstart

1. **Live preview is blocked:** no streamed tool input in V2 for any provider, and none in the Claude Agent converter. It needs #58416 plus a converter change, either upstream or patched.
2. **No OS sandbox:** Upstart would have to sandbox the opencode server process itself and keep `shell` denied or tightly allowlisted. The permissive defaults (allow-all, `external_directory` allowed) must be overridden.
3. **The Claude subscription question is unchanged:**
   - The Claude Agent provider does use the official binary, which satisfies the hard rule mechanically.
   - But Anthropic's note forbidding third-party claude.ai login without approval applies to Upstart either way.
   - opencode's own subscription OAuth was removed under legal pressure.
   - The provider is new and hidden, and adds layers: Upstart → opencode → Agent SDK → `claude`. **Not confirmed:** whether `CLAUDE_CONFIG_DIR` reaches `claude` this way. The code passes the server's environment through, so it probably does.
4. **Isolation needs care:** don't use the shared per-user service; set XDG dirs, `OPENCODE_CONFIG_DIR`/`OPENCODE_DB` and `OPENCODE_DISABLE_CLAUDE_CODE`. `~/.agents/skills` is still searched, and system and managed config can't be turned off.
5. **No in-process MCP:** Upstart's MCP server must become a stdio or localhost HTTP server, or an opencode plugin (TypeScript running inside the opencode process).
6. **No Stop hook:** "continue the agent" becomes event-driven re-prompting from a plugin.
7. **Churn:** the V2 API and plugin API are a month old, and the docs carry both V1 and V2.
8. **Upside:** the same harness can reach ChatGPT, Copilot, API-key providers and open models, which Claude Code alone cannot.

**Not confirmed:**
- Runtime behaviour, startup time, real token streaming cadence
- Whether `--port 0` picks a free port
- The exact terms of OpenAI's "Sign in with ChatGPT" for third-party apps like Upstart
- Whether a Google consumer-plan login exists
- Whether V1's "next" runner was ever on by default
