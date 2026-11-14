# Pi extensions and packages that matter for Upstart

Researched 2026-11-14 against Pi 1.5.2 (`@earendil-works/pi-coding-agent`, `pi-ai`, `pi-agent-core`, published 2026-11-10). This complements [pi.md](pi.md), which covers Pi's core.

**Method.** I used `npm search keywords:pi-package` (250 results) plus topic searches. I also read the [pi.dev package gallery](https://pi.dev/packages) (5,355 packages), [BubblePtr/awesome-pi](https://github.com/BubblePtr/awesome-pi), the docs and examples shipped in the installed package (`node_modules/@earendil-works/pi-coding-agent/docs`, `examples/`), and `npm view` metadata. Download counts come from `api.npmjs.org/downloads/point/last-week`. For the sign-in packages, I downloaded the tarballs with `npm pack` into the session scratchpad and searched their source; nothing was installed or run. With thousands of packages, coverage is a sample, not exhaustive. "Earendil" means published by the `mitsuhiko`/`badlogic`/`rwachtler` npm accounts or the `earendil-works` GitHub org. Everything else is community.

## Most useful for Upstart

1. **Subscription sign-in.** **Sign in with ChatGPT**, built in, is the only subscription login in the Pi ecosystem that uses an official flow for a third-party app. Every other Pi route to a ChatGPT/Codex, Claude, Gemini/Antigravity, Copilot, Cursor or Grok subscription does one of two things. It either reuses the first-party product's OAuth client ID and user agent (impersonation), or it wraps the vendor's own binary. Pi's built-in `anthropic`, `github-copilot` and `openai-codex` logins are in the impersonation group, and `xai` very likely is too. For Claude the clean path stays the Claude Agent SDK, which Upstart already uses. `pi-claude-bridge` runs that same SDK inside Pi, but it adds nothing for Upstart. For Gemini, no subscription route is allowed: only an API key or Vertex.
2. **Restricting what loads is possible and simple.** Use `pi --mode rpc -ne -e <upstart-ext> -e builtin:mcp --no-skills --no-context-files --no-prompt-templates --no-themes --no-approve --offline` with a private `PI_CODING_AGENT_DIR` and `PI_TELEMETRY=0`. In the SDK, use `DefaultResourceLoader({ noExtensions: true, extensionFactories: [...] })` or a custom `ResourceLoader`. Upstart should bundle the few extensions it uses as local files or inline factories. It should not use `-e npm:…`, which runs `npm install` at startup.
3. **Live preview (area 5).** No package does it, but Pi exposes enough for Upstart to build it itself. An extension's `message_update` handler receives the partial `AssistantMessage`, including the parsed partial `write` arguments. This also works inside an RPC child process. So an Upstart extension loaded with `-e` can stream `write.content` to Upstart, or into a shadow file the preview watches. This avoids the delta-only RPC stream. Alternative edit formats in the ecosystem (apply_patch, hashline, unified edit) stream diffs, not file content, so they make live preview harder, not easier. Not verified by running.
4. **Confinement.** Pi has no maintained, official replacement for the removed `sandbox/` example. Earendil points to the [Gondolin](https://github.com/earendil-works/gondolin) micro-VM example (needs QEMU) and containers. Community sandboxes exist: `pi-sandbox` by carderne, `@erichll/pi-sandbox` on Anthropic's `sandbox-runtime`, and `@yandy0725/pi-sandbox` with bwrap/landlock/Seatbelt/Windows ACL. All of them wrap tools inside the Pi process, and most rely on interactive permission prompts. Upstart's own process-level Seatbelt profile around the RPC child remains the better design. `@anthropic-ai/sandbox-runtime` is the library worth reusing.
5. **Ask-user tool.** [`@thinkrail/pi-ask-user-question`](https://www.npmjs.com/package/@thinkrail/pi-ask-user-question) (JetBrains, Apache-2.0) has the closest schema to Claude's AskUserQuestion. It also has a host hook, `createAskUserQuestionExtension({ ask })`. Pi's own `ctx.ui.select` over RPC carries only plain option strings, so rich choices need Upstart's own channel. Upstart's MCP server is the simplest place for that tool, as long as it sends progress notifications to beat Pi's 60-second MCP timeout.
6. **Web search.** `pi-web-search` uses the current model's own search (OpenAI Responses `web_search`, Anthropic web search, Gemini grounding), with no extra key. `pi-web-access` is the most popular (285k/week), but by default it sends queries to Exa's public MCP. Either can be bundled, or Upstart keeps its own tool.

---

## 0. How Pi extensions are installed and loaded, and how to restrict them

Sources: [extensions.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md), [packages.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md), [cli.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/cli.md), [settings.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/settings.md), [sdk.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md), all read from the installed 1.5.2 package.

**What an extension is.** A TypeScript or JavaScript module whose default export receives `pi: ExtensionAPI`. It is loaded through jiti. It "runs inside the Pi process with the same operating-system permissions" and can see prompts, tool calls, files, credentials and history. There is no isolation between extensions.

**Where Pi finds them:**

- **Auto-discovered (global):** `<agent-dir>/extensions/*.ts|js`, `*/index.ts`, or `*/package.json` with `pi.extensions`. The agent dir is `~/.pi/agent` by default.
- **Auto-discovered (project):** `.pi/extensions/…`, loaded only after project trust.
- **Configured:** `settings.json` → `"extensions": [paths]` and `"packages": ["npm:@x/y@1.2.3", "git:github.com/u/r@v1", "./local"]`. Project `.pi/settings.json` is trust-gated.
- **Built-in extensions:** `builtin:mcp`, `builtin:codemode`, `builtin:tool-search` and `builtin:llama.cpp`. They load by default in the CLI. `-builtin:<name>` in `extensions` disables one, and `-e builtin:<name>` loads one explicitly. SDK sessions do not load them; add `createMcpExtension()` and the others yourself.

**Pi packages.** A package bundles extensions, skills, prompts and themes, through conventional folders or a `pi` manifest in `package.json`. The keyword `pi-package` lists it in the gallery.

- `pi install npm:… | git:… | ./path` writes to the global settings; `-l` writes to the project.
- Commands: `pi list`, `pi remove`, `pi update --extensions`, and `pi config` (a TUI to enable or disable resources and built-ins).
- Settings can narrow what a package loads: `{ "source": "npm:…", "extensions": ["extensions/*.ts", "!legacy.ts"], "skills": [] }`.
- Host-provided packages (`pi-ai`, `pi-agent-core`, `pi-coding-agent`, `pi-tui`, `typebox`) must be peer dependencies. Each installed package gets its own module root.

**`-e` / `--extension`** loads a file, directory, package source or built-in for one run.

- For `npm:` and `git:` sources it installs into `<agent-dir>/tmp/extensions/`.
- It re-checks the registry on every start unless the version is pinned exactly.
- If the install fails it warns and continues without that package.

**Restricting to a chosen list (CLI or RPC).**

- `-ne`/`--no-extensions` "disables discovered, configured, and built-in extensions. Explicit `-e` paths still load, so `pi -ne -e builtin:mcp` keeps only the built-in MCP support."
- Equivalent flags exist for the other resources: `--no-skills` with `--skill <path>`, `--no-prompt-templates`, `--no-themes`, `--no-context-files`, `--no-approve` (ignore trust-gated project files) and `--no-mcp`.
- `--offline` / `PI_OFFLINE=1` turns off the catalog refresh and other network activity.
- `PI_CODING_AGENT_DIR` keeps `settings.json`, `auth.json`, `mcp.json` and `extensions/` private to Upstart.
- `--tools` / `--no-builtin-tools` choose the tools declared to the model. They do not stop extension code from running.

**Restricting to a chosen list (SDK).** `DefaultResourceLoader` options include:

- `noExtensions`, `extensionFactories` (inline extensions), `additionalExtensionPaths` and `disabledBuiltinExtensions`.
- `extensionsOverride(base)`, to filter the loaded set.
- The same `no*` switches for skills, prompts, themes and context files.

With `noExtensions: true`, only explicit paths and inline factories load (`dist/core/resource-loader.js`, around line 424). A custom `ResourceLoader` whose `getExtensions()` returns exactly Upstart's list gives full control (see the [full-control example](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/sdk/12-full-control.ts)).

**`session.bindExtensions(bindings)`** binds the extension runtime to the host. `ExtensionBindings` has the fields `uiContext`, `mode`, `commandContextActions`, `abortHandler`, `shutdownHandler` and `onError`. An in-process host supplies `uiContext` to answer `ctx.ui.select/confirm/input` with its own dialogs. MCP servers connect on `session_start`, so this call is required.

**For Upstart:**

- Vendor each chosen extension as reviewed local code (or an inline factory), pin it, and load it with `-ne -e <path>`.
- Never let a maker's `~/.pi/agent` or a project's `.pi/` contribute code.
- `-e npm:` is a supply-chain and network dependency at every start. Avoid it.

---

## 1. Provider sign-in with a subscription

### 1a. What Pi 1.5.2 has built in (pi-ai, Earendil)

All rows below are read from `node_modules/@earendil-works/pi-ai/dist/auth/oauth/*.js`.

| Login | How it authenticates | Third-party use allowed? |
|---|---|---|
| **`openai` → Sign in with ChatGPT** | OpenAI's official dynamic agent client registration. `LoginOptions.agentName` names the host app. | **Yes, for open-source and locally hosted apps.** OpenAI's [token-sharing docs](https://developers.openai.com/siwc/token-sharing-open-source) cover "open-source and locally hosted apps"; paid or remotely hosted apps go through an interest form. The app must persist an `ext_agent_host_id` and validate the ID token and scopes. Upstart runs locally; whether it will be open source, or paid, is not settled. If it is open source, it appears to fit; the docs give no explicit confirmation. |
| `openai-codex` (labeled legacy) | Codex CLI's client ID `app_EMoamEEZ73f0CkXaXp7hrann` with a `codex_cli_simplified_flow`. | **Impersonates Codex CLI.** Superseded by Sign in with ChatGPT. Do not use. |
| `github-copilot` | VS Code Copilot Chat's OAuth client ID `Iv1.b507a08c87ecfe98`, stored base64-encoded in the source. Sends `User-Agent: GitHubCopilotChat/0.35.0`, `Editor-Version: vscode/1.107.0` and `Copilot-Integration-Id: vscode-chat`, then exchanges the token at the internal `copilot_internal/v2/token` endpoint. | **Impersonates VS Code Copilot Chat.** No GitHub policy allowing it was found (**not confirmed** either way). GitHub's sanctioned routes are in 1e. |
| `anthropic` (Claude Pro/Max) | Claude Code's OAuth client and scopes; requests carry `user-agent: claude-cli/<version>` and `x-app: cli` (`api/anthropic-messages.js` ~L994). | **Impersonates Claude Code. Forbidden** (see 1c). Pi itself warns that it draws paid extra usage (setting `warnings.anthropicExtraUsage`). |
| `xai` (SuperGrok / X Premium) | Device flow with client ID `b1a00492-…` and scope `grok-cli:access`. `pi-xai-supergrok`'s README calls the same ID "the public Grok-CLI OAuth `client_id`". | **Likely impersonates Grok CLI** (based on the scope name and a third-party README). xAI terms on third-party use: **not confirmed**. |
| `kimi-coding` (Kimi Code plan) | RFC 8628 device flow against `auth.kimi.com` with a fixed client ID `17e5f671-…`. | Whose client ID this is: **not confirmed**. Moonshot's terms: **not confirmed**. |
| `openrouter` | OpenRouter's documented OAuth PKCE flow, which mints a user API key. | Yes: that is OpenRouter's published third-party flow. Not a subscription. |
| `radius` | Earendil's own gateway (client `pi-gateway`). | Earendil's product, not relevant. |

Coding plans that issue API keys (`opencode-go`, `zai`/`zai-coding-cn`, `qwen-token-plan*`, `xiaomi-token-plan-*`, `minimax`, `moonshotai`) are plain API-key providers. Those keys come from the vendor's console and are meant for third-party tools.

### 1b. ChatGPT / Codex: community packages

| Package | Version / date | License | Downloads/week | Maintainer | What it does | Risk |
|---|---|---|---|---|---|---|
| [`@cortexkit/pi-openai-auth`](https://github.com/cortexkit/openai-auth) | 1.17.2 / 2026-11-13 | MIT | 4,179 | ismeth (community) | Overrides `openai-codex`: several ChatGPT accounts, sticky routing, a credential vault | Codex-client impersonation plus account pooling. Its README warns this "may be against OpenAI's terms". Avoid. |
| [`pi-multi-account`](https://github.com/Sarrius/pi-multi-account) | 1.28.1 / 2026-11-02 | MIT | 1,352 | sars267 | Rotates and fails over across several Anthropic, ChatGPT, Codex, Kimi, Cursor, Qwen and Ollama accounts | Quota circumvention. Avoid. |
| [`@nredd/pi-subscription-router`](https://github.com/nredd/pi-harness) | 0.6.0 / 2026-11-10 | MIT | 2,146 | nredd | Virtual models that route across Anthropic and Codex subscription quotas | Same. Avoid. |
| [`pi-openai-codex-compat`](https://github.com/2h2d-co/pi-openai-codex-compat) | 0.0.32 / 2026-11-11 | MIT | 1,247 | kaanozdokmeci | Codex features: native compaction, fast mode. Not an auth package. | Has native dependencies (`node-pty`, tree-sitter). Not needed. |

**Verdict:** use only the built-in Sign in with ChatGPT.

### 1c. Anthropic Claude Pro/Max

**Anthropic's rules.** The [legal and compliance page](https://code.claude.com/docs/en/legal-and-compliance) says:

- "Anthropic does not permit third-party developers to offer Claude.ai login into their own applications, or to route requests through Free, Pro, Max, or Ultra plan credentials on behalf of their users."
- "developers may not collect, store, or intermediate Claude.ai credentials or session tokens — sign-in to a Claude account must complete through Anthropic's own flow."
- The same page also says this does not "prevent an end user from signing in to the unmodified Claude Code binary with their own Claude subscription".
- The [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview.md) adds: "Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK."

**Billing.** Anthropic's [support article](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan) says the "Agent SDK credit" change was paused on 2026-06-15. The Agent SDK, `claude -p` and "third-party app usage still draw from your subscription limits".

| Package | Version / date | License | Downloads/week | Maintainer | How it authenticates | Verdict |
|---|---|---|---|---|---|---|
| Built-in `anthropic` | 1.5.2 | MIT | — | Earendil | Claude Code client ID plus `claude-cli` user agent | **Impersonation; forbidden.** |
| [`@gotgenes/pi-anthropic-auth`](https://github.com/gotgenes/pi-anthropic-auth) | 3.5.0 / 2026-11-13 | MIT | 9,085 | gotgenes | Layers on the built-in login and "shapes" OAuth requests: it adds Claude Code's billing header and `cc_version`, and replaces Pi's preamble "to avoid prompt fingerprinting" (`src/constants.ts`) | **Impersonation, deliberately disguised. Forbidden.** |
| [`@cortexkit/pi-anthropic-auth`](https://github.com/cortexkit/anthropic-auth) | 2.12.0 / 2026-11-14 | none in npm metadata (README says MIT) | 3,857 | ismeth | Its own OAuth sign-in, multi-account pool, request rewriting, an optional Cloudflare relay | **Impersonation plus pooling.** Its README: it "may violate Anthropic's terms". |
| [`pi-claude-bridge`](https://github.com/elidickinson/pi-claude-bridge) | 0.12.0 / 2026-11-10 | MIT | 31,983 | elidickinson | Runs the official Claude Code through `@anthropic-ai/claude-agent-sdk`. The user signs in with `claude auth login`, not Pi. "Claude Code builds and sends every request itself, unmodified," with Pi's prompt sections appended; Pi's tools are bridged in. | No impersonation. This is the same position as Upstart's current Agent SDK integration, and subject to the same "previously approved" note. Whether it streams partial tool input to Pi: **not confirmed**. |
| [`pi-claude-agent-sdk`](https://github.com/pi-pod/pi-claude-agent-sdk) | 0.12.1 / 2026-11-10 | MIT | 1,216 | edverma2 | Fork of the bridge | Same. |
| [earendil-works/pi-claude-code](https://github.com/earendil-works/pi-claude-code) (GitHub only, `pi install https://github.com/earendil-works/pi-claude-code`) | no releases; 389 stars | MIT | — | **Earendil** | Runs `claude -p` per turn and points it, through `ANTHROPIC_BASE_URL`, at a loopback relay. The relay rebuilds user messages from Pi's history, strips Claude Code's reminders, adjusts cache markers and normalizes tools; authenticated headers pass through. The README says "The future of this extension is uncertain." | Uses the real binary and login, but rewrites requests on the wire. That arguably "intermediates" session tokens (my reading; Anthropic has not ruled). `pi-claude-bridge`'s README calls this "less clearly within the TOS". **Avoid.** |

Note: the npm package named `pi-claude-code` is an unrelated Claude-Code-style UI theme by another author.

**Verdict for Upstart.** Claude-subscription makers stay on the Claude Agent SDK directly. Wrapping it inside Pi through the bridge adds a layer without changing the terms question. Pi-native Claude stays limited to `ANTHROPIC_API_KEY`.

### 1d. Google Gemini, Google AI Pro/Ultra, Antigravity, Gemini CLI

What Upstart's earlier notes ([gemini.md](gemini.md), [antigravity.md](antigravity.md)) already established:

- Gemini CLI stopped serving personal and Google AI Pro/Ultra accounts on 2026-06-18.
- Its [terms](https://geminicli.com/docs/resources/tos-privacy/) forbid using Gemini CLI OAuth from third-party software.
- The Antigravity [FAQ](https://antigravity.google/docs/faq) and [Additional Terms §6](https://antigravity.google/terms) forbid wrapping `agy` on consumer plans. A Google collaborator applied that even to spawning the unmodified `agy acp` or `agy -p` ([#1493](https://github.com/google-antigravity/antigravity-cli/issues/1493)).
- A Google AI forum reply of 2026-10-19 says "there is no officially supported way for a third-party VS Code extension" to use a consumer Google AI subscription or Antigravity login ([thread](https://discuss.ai.google.dev/t/supported-gemini-subscription-access-for-a-third-party-vs-code-extension/189889/2)). The fetched page shows no staff badge.

Pi itself removed its Gemini CLI and Antigravity OAuth in pi-ai 0.71.0.

| Package | Version / date | License | Downloads/week | Maintainer | How it authenticates | Verdict |
|---|---|---|---|---|---|---|
| [`pi-antigravity`](https://github.com/Rahularya01/pi-antigravity) | 0.12.0 / 2026-11-06 | MIT | 5,045 | rahularya01 | Google's "public Antigravity desktop client" ID and secret, base64-obfuscated in `src/auth/oauth.ts`. User agent `antigravity/cli/1.4.0 (aidev_client; …; auth_method=consumer)`, described in the source as "matching pure Antigravity CLI wire fingerprint". | **Impersonates Antigravity CLI; forbidden.** |
| [`@cortexkit/pi-antigravity-auth`](https://github.com/cortexkit/antigravity-auth) (+ `@cortexkit/antigravity-auth-core`) | 3.1.0 / 2026-11-13 | MIT | 3,635 (core 4,820) | ismeth | Antigravity OAuth; the core's description lists "transport, fingerprint, request transforms, accounts, quota" | README: "Using this extension violates Google's Terms of Service." **Forbidden.** |
| `@justjoshn/pi-antigravity-oauth`, `@heyhuynhgiabuu/pi-oauth-antigravity`, `pi-antigravity-multi-account`, `@dapidev/pi-antigravity-pure` | 2026-09 to 2026-11 | MIT | 86 to 189 | community | Same family (Cloud Code Assist plus Google OAuth); source not inspected | Assume the same. |
| [`pi-geminicli-oauth`](https://github.com/Heelc/pi-geminicli-oauth) | 0.1.6 / 2026-10-20 | MIT | 463 | heelc | Gemini CLI's public client `681255809395-oo8ft2…apps.googleusercontent.com` plus a Gemini CLI user agent (`src/constants.ts`, `src/user-agent`) | **Impersonates Gemini CLI;** only enterprise Code Assist is still served. Forbidden. |
| [`pi-gemini-oauth-apikey`](https://github.com/vforvaick/pi-gemini-oauth-apikey) | 0.1.0 / 2026-06-27 | MIT | 86 | vforvaick | A rotation pool of Cloud Code Assist OAuth accounts | Forbidden, and pools accounts. |
| [`@3d24rd0/pi-antigravity-bridge`](https://github.com/3d24rd0/antigravity-bridge), [`@estebanforge/pi-antigravity-bridge`](https://github.com/EstebanForge/pi-extensions), [`pi-antigravity-acp-provider`](https://github.com/zacbemis/pi-antigravity-acp-provider) | 1.3.1 / 2026-11-05; 1.10.6 / 2026-11-13; 0.1.19 / 2026-11-05 | MIT | 279; 2,759; 573 | community | Drive Google's own `agy` CLI or ACP server (about 1.5 GB download), with Google's own sign-in: "no impersonated client" | No impersonation, but this is exactly the case Google's collaborator called a §6 breach. EstebanForge's own README calls it a "grey area". **Not allowed.** |
| [`@skdev-ai/pi-gemini-cli-provider`](https://github.com/skdev-ai/pi-gemini-cli-provider) | 0.1.2 / 2026-03-31 | MIT | 134 | skdev-ai | Gemini CLI over A2A | Stale; personal accounts no longer served. |

**Verdict.** No Google subscription route is usable. Gemini in Pi means a Gemini API key (AI Studio, billed separately) or Vertex.

### 1e. GitHub Copilot

| Package / route | Version / date | License | Downloads/week | Maintainer | How it authenticates | Verdict |
|---|---|---|---|---|---|---|
| Built-in `github-copilot` | 1.5.2 | MIT | — | Earendil | VS Code Copilot Chat impersonation (see 1a) | **Impersonation;** GitHub's position **not confirmed.** |
| [`@milespossing/pi-copilot-discovery`](https://github.com/milespossing/pi-copilot-discovery) | 0.4.1 / 2026-08-01 | MIT | 17 | community | Uses the built-in token to list a tenant's live models | Same basis. |
| [`pi-copilot-web`](https://github.com/wassname/pi-copilot-web) | 0.1.1 / 2026-10-19 | MIT | 31 | community | Copilot `web_search` using the built-in token and VS Code headers | Same basis. |
| [`pi-acp-provider`](https://github.com/R-Dson/pi-acp-provider) | 1.2.1 / 2026-10-18 | MIT | 153 | community | Drives `copilot --acp` (the official Copilot CLI) or `gemini` as the agent. "Pi's own tools are bypassed." | No impersonation, but this is not Pi acting as the harness. Not useful to Upstart. |

GitHub's sanctioned third-party routes:

- **The OpenCode partnership** of 2026-01-16 ([changelog](https://github.blog/changelog/2026-01-16-github-copilot-now-supports-opencode/)) covers OpenCode only.
- **The [Copilot SDK](https://docs.github.com/en/copilot/how-tos/copilot-sdk/auth/authenticate)** (public preview since 2026-04) lets an app use its own GitHub OAuth App "on behalf of users who authorize your app", with their Copilot subscription. It drives Copilot CLI's agent, though. No Pi provider built on it was found on npm (**not found**).

### 1f. Others

| Package | Version / date | License | Downloads/week | How it authenticates | Verdict |
|---|---|---|---|---|---|
| [`pi-cursor-sdk`](https://github.com/fitchmultz/pi-cursor-sdk) | 0.5.39 / 2026-11-13 | MIT | 8,316 | Official `@cursor/sdk` with a user API key from the Cursor dashboard ("Cursor Desktop and Agent CLI login do not supply the SDK key"). The Cursor agent runs its own tools. | Official SDK, but the model is Cursor's agent rather than Pi's loop. Whether usage bills against the Cursor plan: **not confirmed**. |
| [`@caph42/pi-cursor-provider`](https://github.com/Caph-dev/pi-cursor-provider) (and `pi-cursor-provider`, `@offbynan/…`) | 0.8.0 / 2026-11-11 | MIT | 732 | Cursor's own OAuth client ID (`src/auth.ts`) and the private `AgentService/Run` protocol | **Impersonation.** |
| [`pi-xai-supergrok`](https://github.com/preinpost/pi-xai-supergrok) | 0.2.1 / 2026-07-11 | MIT | 12 | "Reuses the public Grok-CLI OAuth client_id" | **Impersonation.** |
| [`pi-cliproxyapi-provider`](https://github.com/0xRichardH/pi-cliproxyapi-provider) | 0.16.13 / 2026-11-14 | MIT | 3,236 | Points Pi at a [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) server, which serves Codex, Gemini CLI and Claude OAuth credentials as an OpenAI-compatible API | **Impersonation by proxy.** |
| [`pi-ollama-cloud`](https://www.npmjs.com/package/pi-ollama-cloud) | 0.13.1 / 2026-10-21 | — | — | Ollama Cloud key or `/login ollama-cloud` | Not examined. |

---

## 2. Confinement and sandboxing

**Official status.** The 1.5.0 changelog says: "Removed the native OS `sandbox/` extension example and its dependency. Use the [Gondolin example](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions/gondolin) or the [containerization guide](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/containerization.md)." There is no maintained Earendil OS sandbox.

- **[`@earendil-works/gondolin`](https://github.com/earendil-works/gondolin)** — 0.14.0, 2026-10-22, Apache-2.0, 51,726/week, Earendil. Alpine Linux micro-VMs with a programmable network stack and virtual filesystem; secrets reach the guest only as placeholders.
  - It requires QEMU (`brew install qemu`) or a self-built `krun` runner, and runs on macOS and Linux only.
  - The `gondolin/` example routes Pi's built-in tools and `!` commands into the VM.
  - Too heavy for a non-technical maker's machine.
- **Codemode** (`@earendil-works/pi-codemode`, built in) runs model-written JavaScript in QuickJS, where the only capability is calling tools. It is not a file-system sandbox.

Community packages (all wrap Pi's tools from inside the Pi process):

| Package | Version / date | License | Downloads/week | Maintainer | Mechanism | Notes for Upstart |
|---|---|---|---|---|---|---|
| [`pi-sandbox`](https://github.com/carderne/pi-sandbox) | 0.8.2 / 2026-11-13 | MIT | 3,577 | carderne | `bash` runs under `@carderne/sandbox-runtime` (a fork of Anthropic's sandbox-runtime: Seatbelt on macOS, bubblewrap on Linux). `read`/`write`/`edit` are checked against allow/deny lists. Blocked calls prompt for permission. | Closest successor to the removed example. Needs `ripgrep` on `PATH`. Its prompt-driven design does not fit Upstart, which has no permission UI. Forks: `pi-claude-sandbox`, `@xzzpig/pi-sandbox`, `pi-sandbox-minimal`. |
| [`@erichll/pi-sandbox`](https://github.com/erichll/pi-packages) | 0.29.2 / 2026-11-03 | Apache-2.0 | 319 | erichll | Official `@anthropic-ai/sandbox-runtime` (bubblewrap/Seatbelt): a "fail-closed static filesystem policy" plus per-connection network approval | Uses upstream ASRT rather than a fork. |
| [`@yandy0725/pi-sandbox`](https://github.com/yandy/pi-packages) | 1.8.2 / 2026-11-13 | MIT | 311 | yandy0725 | `bash` wrapped by bwrap, then landlock, then `sandbox-exec`, then a Windows restricted-token ACL. In-process write fence on `write`/`edit`; `read` unrestricted; fail-closed. Ported from DeepSeek Harness. | The only one with a real Windows backend. Native addon (`koffi`). README in Chinese. |
| [`@yuru7/pi-sandbox`](https://github.com/yuru7/my-pi-extensions) | 0.5.0 / 2026-11-08 | MIT | 249 | yuru7 | Same backends plus "denial-first AI auto-review escalation" | — |
| [`@nqbao/pi-sandbox`](https://github.com/nqbao/pi-sandbox), [`pi-seatbelt-sandbox`](https://github.com/thaodangspace/pi-seatbelt-sandbox), [`@igormaka/pi-sandbox`](https://www.npmjs.com/package/@igormaka/pi-sandbox), [`@sysid/pi-sandbox`](https://github.com/sysid/pi-extensions), [`pi-perm`](https://github.com/DCRcoder/pi-perm) | 2026-03 to 2026-10 | MIT (igormaka: none) | 13 to 57 | community | Seatbelt/bwrap variants | Small; not reviewed. |
| [`pi-permission-modes`](https://github.com/wynainfo/pi-permission-modes) | 2.7.2 / 2026-10-25 | MIT | 339 | wynainfo | Switchable modes, each pairing an OS sandbox (bwrap, sandbox-exec, native Windows) with an allow/ask/deny policy per tool | — |
| [`pi-landstrip`](https://github.com/landstrip/landstrip) | 0.20.28 / 2026-11-12 | Apache-2.0 | 1,917 | jarkkojs | Sandboxed `bash` and process-backed agents | Not reviewed in depth. |
| [`pi-deltabox`](https://www.npmjs.com/package/pi-deltabox) | 0.1.6 / 2026-11-11 | Apache-2.0 | 88,288 (unusually high) | xeonliu | A deltabox-lite session in-process: every change can be reviewed, committed or aborted. Isolation is opt-in; the default mode is `none`. | Interesting as a review layer, not as confinement. |
| [`@howaboua/pi-sandbox`](https://github.com/IgorWarzocha/howaboua-pi-stuff) | 0.1.6 / 2026-11-11 | MIT | 271 | howaboua | Persistent Gondolin environments plus "managed app previews" | Needs QEMU. |
| [`@gotgenes/pi-permission-system`](https://github.com/gotgenes/pi-packages), [`pi-seatbelt`](https://github.com/mikesposito/pi-seatbelt) (despite its name), [`@aliou/pi-guardrails`](https://github.com/aliou/pi-guardrails), [`cc-safety-net`](https://github.com/kenryu42/cc-safety-net) | v42.0.0 / 2026-10-28; 0.5.0; 0.23.0; 2.7.12 | MIT | 10,292; 168; 2,101; — | community | Policy layers: allow/deny/ask rules and command parsing. **No OS boundary.** | `@gotgenes/pi-permission-system` reaching v42 shows high churn. |
| [`@anthropic-ai/sandbox-runtime`](https://github.com/anthropics/sandbox-runtime) (library, not a Pi package) | 0.0.83 / 2026-11-13 | Apache-2.0 | 739,533 | Anthropic | Seatbelt/bubblewrap wrapper with filesystem and network policy | The building block most of the above use. Still 0.0.x. |

**Assessment.**

- None of these packages confines the Pi process itself. Extensions, MCP clients, the provider HTTP calls and `read` all stay unconfined.
- Most of them prompt the user, through `ctx.ui`. In RPC mode those prompts become `extension_ui_request` dialogs. Whether each package fails closed when the host does not answer: **not confirmed**.
- For Upstart, the recommended design in [pi.md](pi.md) section 4 still holds: spawn the RPC child under Upstart's own Seatbelt profile, plus a `tool_call` policy hook. `@yandy0725/pi-sandbox` is the most useful reference for the future Windows and Linux backends.

---

## 3. Web search and web fetch

Pi has no built-in web search. Packages:

| Package | Version / date | License | Downloads/week | Maintainer | What it does | Relevance and risk |
|---|---|---|---|---|---|---|
| [`pi-web-access`](https://github.com/nicobailon/pi-web-access) | 0.47.0 / 2026-11-05 | MIT | 285,156 | nicobailon (community, prolific) | `web_search`, `fetch_content`, GitHub clone, PDF, YouTube and local-video analysis; about 30 search backends | Default "zero config" search goes through **Exa's public MCP**, which sends maker queries to a third party. It reuses a ChatGPT (Sign in with ChatGPT or Codex) login for OpenAI web search. Large surface (video, cloning, a "curator" browser page). Use only if trimmed by configuration. |
| [`pi-web-search`](https://github.com/ttttmr/pi-web-search) | 1.7.0 / 2026-10-08 | MIT | 17,139 | ttttmr | Provider-native `web_search` through the *current* model's provider: OpenAI/Azure/Codex Responses `web_search`, Anthropic Messages web search, Gemini grounding plus `url_context`, xAI, DeepSeek, Ollama Cloud, OpenCode, Copilot | Best fit: no extra key, and queries go only to the model provider the maker already uses. It errors rather than falls back when the model cannot search. Whether ChatGPT-plan "eligible Responses API requests" include hosted `web_search`: **not confirmed**. |
| [`@juicesharp/rpiv-web-tools`](https://github.com/juicesharp/rpiv-mono) | 2.15.0 / 2026-10-24 | MIT | 1,399 | juicesharp | Search and fetch with pluggable keyed providers (Brave, Tavily, Serper, Exa, Jina, Firecrawl, Perplexity, SearXNG, Ollama) | Needs a key. |
| [`@ollama/pi-web-search`](https://www.npmjs.com/package/@ollama/pi-web-search) | 0.0.5 / 2026-03-28 | MIT | 3,273 | **Ollama (vendor)** | Ollama's web search and fetch APIs | Needs an Ollama account key. |
| [`@keenable/pi-search`](https://github.com/keenableai/keenable-integrations) | 0.1.2 / 2026-06-23 | MIT | 106 | Keenable (vendor) | Search plus fetch, "keyless by default" (rate-limited) | Third-party endpoint. |
| [`pi-better-web-search`](https://github.com/zhexusun10/pi-better-web-search) | 0.1.11 / 2026-11-10 | MIT | 426 | community | Provider-native search with fallback across logged-in providers | — |
| [`@agntn/web`](https://github.com/agntn/web) | 0.9.1 / 2026-10-29 | MIT | 6,294 | oritwoen | Unified search and read for agents and the CLI | — |
| `pi-copilot-web`, [`@bermudi/pi-codex`](https://github.com/bermudi/manaflow-pi-codex) | — | MIT | 31; 113 | community | Search through Copilot or Codex tokens | Rely on impersonated logins. Avoid. |

---

## 4. Asking the user a question with choices

**Pi primitives.**

- Extensions call `ctx.ui.select(title, options: string[], { timeout, signal })`, `confirm`, `input` and `editor`.
- In RPC mode these become `extension_ui_request` records on stdout, and the host answers with `extension_ui_response` on stdin ([rpc-extension-ui.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc-extension-ui.md)). `ctx.ui.custom()` returns `undefined` in RPC mode.
- In the SDK the host supplies `uiContext` through `bindExtensions`.
- `select` carries plain strings only: no descriptions, previews or multi-select.

**Official examples.**

- [`question.ts`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/question.ts) is one question with options and an "Other" field; [`questionnaire.ts`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/questionnaire.ts) uses tabs for several questions.
- **Both are TUI-only.** They return "UI not available" when `ctx.mode !== "tui"`.
- Other examples: `rpc-demo.ts` with `examples/rpc-extension-ui.ts` (a host-side client), and `timed-confirm.ts` (`AbortSignal` and timeouts).

| Package | Version / date | License | Downloads/week | Maintainer | What it does | Relevance |
|---|---|---|---|---|---|---|
| [`@thinkrail/pi-ask-user-question`](https://github.com/JetBrains/thinkrail) (folder `pi-extensions/ask-user-question`) | 0.2.0 / 2026-11-03 | Apache-2.0 | 69 | JetBrains (ThinkRail) | `ask_user_question`. Each question has a `header` and 2 to 4 options (`label`, `description`, optional markdown `preview`, `recommendedReason`), plus `multiSelect`. Works as a TUI questionnaire and as RPC host dialogs. **Embedding hook:** `createAskUserQuestionExtension({ ask, announce, guidance })`, where `ask` resolves `answered`, `deferred` or `abandoned`; `/core` exports the result types and validation. | **Best fit.** Near Claude's AskUserQuestion schema, built for hosts with their own UI. New and small. |
| [`@juicesharp/rpiv-ask-user-question`](https://github.com/juicesharp/rpiv-mono) | 2.15.0 / 2026-10-24 | MIT | 40,210 | juicesharp | Typed-option questionnaire; in RPC or ACP hosts it "walks through the host's native dialogs" (notes are terminal-only). Not registered in non-interactive runs. | Popular; RPC degrades to `select`. |
| [`pi-ask-user`](https://github.com/edlsh/pi-ask-user) | 0.17.2 / 2026-11-01 | MIT | 3,179 | edlsh | Split-pane searchable UI, multi-select, free text; RPC fallback asks one dialog at a time | Many forks exist (`@yandy0725`, `@hheei`, `@d3ara1n`, …). |
| [`pi-interview`](https://github.com/nicobailon/pi-interview-tool) | 0.14.1 / 2026-10-31 | MIT | 3,684 | nicobailon | Starts a local server and opens a form in a [Glimpse](https://github.com/hazat/glimpse) WKWebView window (`glimpseui`, 41,770/week) or in a browser, with images | Pattern only; Upstart has its own window. |
| [`@agimon-ai/po-user-feedback`](https://github.com/AgiFlow/po) | 0.0.0-alpha.157 | **BUSL-1.1** | 7,658 | agiflow-ai | Structured questions plus voice handoff | The license excludes it. |
| [`pi-intercom`](https://pi.dev/packages/pi-intercom) | 0.18.1 / 2026-10-22 | — | — | nicobailon | Lets subagents ask the parent session | Not needed. |

**For Upstart.**

- Simplest: put `ask_user` in Upstart's existing MCP server, next to `look_at_preview`. It then works with any harness.
- Pi's MCP client has a **60-second default request timeout**, which progress notifications reset ([mcp.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/mcp.md)). So either send progress pings while the maker thinks, or raise `timeout` for that server.
- Alternative: vendor ThinkRail's extension and implement `ask` over a side channel to the Electron main process.

---

## 5. Streaming file content, live preview, and edit formats

**What Pi itself offers** (from the installed docs and types; not run):

- **Tool shapes.** Built-in `write` is `{ path, content }` and `edit` is `{ path, edits: [{ oldText, newText }] }`. `path` comes first, so a partial parse knows the file before its content arrives.
- **pi-ai events.** pi-ai emits `toolcall_start`, `toolcall_delta` and `toolcall_end`. Anthropic, OpenAI Responses (including Sign in with ChatGPT), Chat Completions, Bedrock and Mistral stream the arguments. Gemini sends each call whole.
- **Extension-level `message_update`.** Handlers get `{ message: AgentMessage, assistantMessageEvent }` ([extensions.md#message_start--message_update--message_end](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md); `MessageUpdateEvent` in `dist/core/extensions/types.d.ts`).
  - `message` is the partial assistant message with incrementally parsed arguments.
  - This runs **in the Pi process, in every mode**.
  - So an Upstart extension loaded with `-e` into the RPC child can read `message.content[i].arguments.content` of a streaming `write`. It can then forward it (its own socket or IPC, or a fire-and-forget `ctx.ui.setStatus` / `setWidget` request) or write a shadow file the preview watches.
  - This sidesteps the RPC stream's delta-only `message_update`, which forces an RPC client to rebuild and partial-parse the JSON itself.
- **Renderer flag.** Tool renderers receive `args` with `argsComplete: false` while streaming. Pi's own TUI uses this for `write` (`dist/core/tools/renderers/write.js`). It is TUI-only.
- **`provider_stream_event`.** Raw parsed provider events, notification-only, awaited in order (slow handlers delay the stream).
- **Overriding `write`.** `pi.registerTool({ name: "write", … })` replaces the built-in (see `tool-override.ts`). Upstart could keep the schema and add preview hooks in `execute`.
- **Not confirmed:** whether `message_update` is throttled or coalesced, and its granularity per provider.

**Packages that turn tool-call arguments into partial file content, or that write files from text blocks in the reply: none found.** The awesome-pi list has no such category either. Closest: `pi-claude-code` (UI theme) and `pi-tidy` (diff rendering) are display-only.

**Alternative edit formats in the ecosystem** (all community):

| Package | Version / date | License | Downloads/week | Format |
|---|---|---|---|---|
| [`pi-codex-tools`](https://github.com/jvm/pi-mono) | 0.4.2 / 2026-11-12 | Apache-2.0 | 314 | Codex `apply_patch` (V4A) for grammar-capable OpenAI models |
| [`@howaboua/pi-codex-conversion`](https://github.com/IgorWarzocha/howaboua-pi-stuff) | 5.0.0 / 2026-11-13 | MIT | 6,614 | Codex-style tools and prompt adapter |
| [`@maxiaochao/pi-codex-edit`](https://github.com/chaochaoxiaochao/pi-toolkit) | 0.2.1 / 2026-10-23 | none | 62 | `apply_patch` with model-aware fallback |
| [`pi-hashline-edit-pro`](https://github.com/YuGiMob/pi-hashline-edit-pro) | 7.1.1 / 2026-10-27 | MIT | 1,359 | Hash-anchored line edits (5-character anchors) |
| [`mitsupi`](https://github.com/mitsuhiko/agent-stuff) `unified-edit.ts` | 1.6.0 / 2026-04-17 | Apache-2.0 (repo) | 1,554 | Armin Ronacher's single-payload edit, validated before applying (personal package, not Pi core) |

**Implications for Upstart.**

- Full-content `write` is the format that gives a live preview directly.
- Patch, hashline and `edit` formats stream *changes*, so the preview would have to apply a partial edit to the old file. That works, but it is harder.
- GPT models are trained on `apply_patch`, so an OpenAI-only setup might prefer it for edits while keeping `write` for new files.
- Keep `codemode` off for file writes. The content would sit inside JavaScript source.

---

## 6. Subagents, todo and plan tools, images, and continue/block hooks

**Subagents.**

- Official example [`subagent/`](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions/subagent): separate `pi` processes, with streaming and parallel runs.
- [`pi-subagents`](https://github.com/nicobailon/pi-subagents): 0.88.1, 2026-11-13, MIT, 221,680/week. Delegation, chains, background runs.
- [`@tintinweb/pi-subagents`](https://github.com/tintinweb/pi-subagents): 0.25.0, MIT, 23,544/week. Claude-Code-style, with cross-extension RPC over `pi.events`.
- [`@gotgenes/pi-subagents`](https://github.com/gotgenes/pi-packages): 25.0.5, MIT, 5,118/week. In-process, with a typed API.
- Upstart does not use subagents today; nothing needed.

**Todo and plan.**

- Official `todo.ts` (a tool, state kept in result `details`) and `plan-mode/`.
- [`@juicesharp/rpiv-todo`](https://github.com/juicesharp/rpiv-mono): 2.15.0, MIT, 16,251/week.
- [`@nredd/pi-todo`](https://github.com/nredd/pi-harness): 2.15.0, 2,439/week.
- [`@dumbmice/pi-todo-loop`](https://github.com/DumbMice/pi-todo-loop): 0.3.2, MIT, 485/week. "Keep pi working while a todo list still has open tasks, and stop when the agent asks for a person": the continue-the-agent pattern.
- [`@narumitw/pi-plan-mode`](https://github.com/narumiruna/pi-extensions): 0.60.1, MIT, 12,243/week.
- [`@plannotator/pi-extension`](https://github.com/backnotprop/plannotator): 0.28.64, 22,108/week.
- Their UI is TUI widgets, so for Upstart they are reference code only.

**Images and screenshots.**

- Pi's built-in `read` returns image blocks for image files.
- Custom tools and MCP tools can return image content.
- So Upstart's `look_at_preview` returning a PNG works with any vision model.
- [`@getpipher/vision`](https://github.com/getpipher/vision) (0.5.3, 2026-09-02, MIT, 19,110/week) hands images to a vision model only when the active model is text-only. Useful if Upstart ever offers a text-only model.
- Browser-automation packages drive Chrome or Playwright: [`pi-agent-browser-native`](https://github.com/fitchmultz/pi-agent-browser-native) (11,442/week), [`pi-browser-harness`](https://github.com/amankumarsingh77/pi-browser-harness) (6,961/week, CDP to real Chrome), and `@onkernel/browser-loop`. Not needed: Upstart owns the preview.
- [`@m64/pi-screenshot-tools`](https://github.com/M64GitHub/pi-screenshot-tools) is negligible (5/week).

**Hooks that block or continue.** These are core features:

- `tool_call` returns `{ block, reason }` or mutates the input.
- `tool_result` rewrites a result.
- `agent_before_settle` returns `continue: true`, which is the Stop-hook equivalent.

Community "goal" and "loop" extensions build on them: [`@narumitw/pi-goal`](https://github.com/narumiruna/pi-extensions) (10,607/week), `mitsupi` `goal.ts`, and [`pi-until-loop`](https://github.com/until-dev/plugins) (3,406/week). Nothing to adopt; Upstart's own Stop logic maps directly onto `agent_before_settle`.

---

## 7. Embedding Pi in another app

**Earendil, official:**

- **RPC client.** `RpcClient` is exported from `@earendil-works/pi-coding-agent`, with [`examples/rpc-client.ts`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/rpc-client.ts) and [`examples/rpc-extension-ui.ts`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/rpc-extension-ui.ts). The package exports `./rpc-entry` (the bundled RPC child) for spawning with Electron's Node.
- **SDK.** `createAgentSession`, `DefaultResourceLoader`, `SessionManager.inMemory()`, `SettingsManager.inMemory()`, `ModelRuntime.create({ authPath, modelsPath })` and `setRuntimeApiKey()`. See [examples/sdk/](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/sdk).
- **`@earendil-works/pi-client`, `pi-protocol`, `pi-server`.** Version 1.1.0, 2026-10-07, MIT; about 768k, 799k and 69k downloads a week. "Transport-neutral client for the experimental Pi service protocol" over framed CBOR, typed through `@earendil-works/chord` services. The server package is labeled "experimental". A possible future replacement for JSONL RPC; too early.
- **`@earendil-works/pi-durable`.** 1.5.2, MIT, 1.4M/week. "Experimental. The API changes without notice." A durable harness that resumes after a crash mid-turn. Used by community web and mobile clients.
- **`@earendil-works/pi-mcp`.** 1.5.2, MIT, 4.0M/week. A standalone MCP client.
- **`@earendil-works/pi-telemetry`.** 1.5.2, MIT. Telemetry contracts only, with no exporter.
- **`@earendil-works/pi-web-ui`.** 0.75.3, 2026-05-18. Stale; it predates 1.0.

**Telemetry off.** Set `PI_TELEMETRY=0` (or the setting `enableInstallTelemetry: false`), which also drops the "selected provider attribution headers". Also set `PI_SKIP_VERSION_CHECK=1`, and `PI_OFFLINE=1` / `--offline` to stop catalog refreshes from pi.dev. `enableAnalytics` defaults to `false`.

**Model catalogs.** pi-ai ships a generated catalog (`models.generated.js`), refreshed from pi.dev at startup in interactive mode and on `pi update --models`; the last list is used offline and in RPC mode. Custom endpoints go in `models.json`. `pi.registerProvider()` and `registerVirtualModel()` are available to extensions.

**Community:**

| Package / project | Version / date | License | Downloads/week | What it is | Relevance |
|---|---|---|---|---|---|
| [`@ai-sdk/harness-pi`](https://github.com/vercel/ai) | 1.0.187 / 2026-11-13 | Apache-2.0 | 161,749 | Vercel AI SDK `HarnessV1` adapter: "Pi runs in the host Node.js process and uses the sandbox as a remote filesystem + shell". Experimental. | Shows the `*Operations` seam used at scale. Not needed. |
| [Pace](https://github.com/bubbleptr/pace) (not on npm) | — | Apache-2.0 | — | Electron/React GUI for Pi. Backend in an Electron `utilityProcess`, "each root session runs Pi in its own process". Shares `~/.pi/agent`. | The nearest Electron reference. It shares the user's agent dir; Upstart should not. |
| [`pi-acp`](https://github.com/svkozak/pi-acp) | 0.0.34 / 2026-09-24 | MIT | 526,685 | ACP adapter (Zed and others). In-process variants: [`@automatalabs/pi-acp`](https://github.com/agentprism/agentprism-workflows) and [`@openma/pi-acp`](https://github.com/openma-ai/pi-acp). | Only if Upstart ever speaks ACP. |
| [`pi-coding-agent-test`](https://github.com/alexshpunt/pi-coding-agent-test) | 0.1.7 / 2026-11-09 | MIT | 12,670 | Deterministic end-to-end tests for Pi extensions, tools, sessions and TUI | **Useful** for testing Upstart's extension without a live model. |
| [`@langchain/langsmith-pi-extension`](https://github.com/langchain-ai/langsmith-pi-extension), [`@braintrust/pi-extension`](https://github.com/braintrustdata/braintrust-coding-agent-plugins), [`@langfuse/pi-observability-plugin`](https://github.com/langfuse/pi-observability-plugin), [`pi-otel`](https://github.com/nikiforovall/pi-otel) | 0.2.1; 2.2.4; 0.1.2; 0.3.0 | MIT ×3, Apache-2.0 | 38,091; 9,071; 3,115; 6,572 | Vendor-official tracing exporters (LangChain, Braintrust, Langfuse) plus OpenTelemetry | For development only, never on by default. |
| [`pi-cache-optimizer`](https://github.com/jiangge/pi-cache-optimizer) | 2.10.6 / 2026-11-13 | MIT | 3,431 | Stable prompts and cache keys, cache statistics | Possibly useful for speed and cost; not reviewed. |
| `pi-agent-python-sdk`, `pitago` (Go TUI) | — | — | — | Other RPC clients | Confirm that the RPC protocol is usable from outside Node. |
| [`@oh-my-pi/*`](https://github.com/can1357/oh-my-pi) (fork) | 18.20.0 / 2026-11-12 | MIT | 277,546 | A separate fork with its own version line, tools and catalog | Not compatible with `@earendil-works`. Ignore. |

---

## Not confirmed

- Whether OpenAI's Sign in with ChatGPT terms cover Upstart without the interest form. The docs cover "open-source and locally hosted apps", which seems to include Upstart, but there is no explicit statement.
- Whether ChatGPT-plan requests may use the hosted `web_search` tool.
- GitHub's position on third-party clients that reuse VS Code Copilot Chat's client ID and headers.
- xAI's position on reusing the Grok-CLI client ID, and Moonshot's on Kimi Code OAuth (whose client ID Pi uses).
- Anthropic's position on Earendil's `pi-claude-code` relay, and on `pi-claude-bridge`, beyond the general Agent SDK note.
- Whether `pi-claude-bridge` forwards Claude's partial tool input to Pi.
- How the community sandboxes behave in RPC mode when nobody answers their permission prompts.
- `message_update` granularity and throttling, and the extension-side partial-write approach: read from docs and types, not run.
- The Cursor SDK's billing against a Cursor plan.
- Licenses that npm metadata leaves empty: `@cortexkit/pi-anthropic-auth`, `@igormaka/pi-sandbox`, `@maxiaochao/pi-codex-edit`, and `mitsupi` (its repository says Apache-2.0).
