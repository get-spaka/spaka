# Gemini CLI as Upstart's agent: research

Researched 2026-11-14 against `@google/gemini-cli` **0.68.0** (latest stable, released 2026-11-10; preview 0.69.0-preview.0), its docs at [geminicli.com](https://geminicli.com/docs/) and its source on [google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli) `main`. Nothing was installed or signed in to: no claim below was tested by running the CLI.

## Verdict for Upstart

**No.** Two reasons, each enough on its own:

1. **No subscription path.** Since 2026-06-18, Gemini CLI no longer serves free personal Google accounts or Google AI Pro / Ultra subscribers. Those users were moved to a different, closed product, Antigravity CLI (`agy`). Gemini CLI now works only with Gemini Code Assist Standard / Enterprise licences (organisations), paid Gemini API keys and Vertex AI. The earlier note "Gemini is out: its command-line tool no longer serves consumer subscriptions" is **correct**. The product owner's belief is **not**: an AI Studio key is never paid for by the subscription. It is billed separately, through Cloud Billing, or is the free tier.
2. **No live preview.** Neither `stream-json` nor ACP carries a `write_file` / `replace` call's arguments while they are being generated. Every route delivers the tool call only once it is complete, with all its parameters. The Gemini API does have partial-argument streaming (`partialArgs` / `willContinue`), but Gemini CLI does not use it.

On top of that, Google says Gemini CLI is now maintained "for enterprise Gemini Code Assist workflows" and is "not optimized for Gemini 4+". Google's newest models (Gemini 4 Argon / Carbon) are aimed at Antigravity instead.

If Gemini models are wanted in Upstart, the realistic routes are:
- a model-agnostic harness (Pi, opencode) with the maker's **paid** Gemini API key;
- a separate study of Antigravity CLI, the only Google route to a Pro / Ultra subscription. It has a headless `agy -p --output-format stream-json`, but third-party orchestration is unclear: see section 8.

---

## 0. The subscription question, settled

| Route | What it gives today | Google's own source |
|---|---|---|
| **"Sign in with Google", free personal account** | **Nothing since 2026-06-18.** | Google Developers Blog, 2026-05-19: [Transitioning Gemini CLI to Antigravity CLI](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/). Maintainer announcement, 2026-06-18: [Discussion #28017](https://github.com/google-gemini/gemini-cli/discussions/28017), "Gemini CLI will stop serving requests for Google AI Pro, Google AI Ultra, and free tier individual accounts". |
| **Sign in with Google, Google AI Pro / Ultra (Google One)** | **Nothing since 2026-06-18.** These users go to Antigravity CLI, where AI Pro and Ultra raise the limits. | [README banner](https://github.com/google-gemini/gemini-cli#readme): "No free tier or Google AI plans: Free individual access and Google AI Pro / Ultra (Google One) moved to Antigravity CLI on June 18, 2026". [Google Cloud release notes](https://docs.cloud.google.com/gemini/docs/release-notes) say the same. |
| **Sign in with Google, Code Assist Standard / Enterprise, or Workspace AI Ultra (organisation)** | Unchanged: 1,500 / 2,000 requests per user per day. A Google Cloud project is required. Not a maker's case. | [Quota and pricing](https://geminicli.com/docs/resources/quota-and-pricing/) |
| **Gemini API key from Google AI Studio** | Still accepted. Google's blog promises only **paid** keys ("will remain accessible via paid Gemini … API keys"). The README says "legacy paid API / Vertex keys". The 2026-06-18 announcement says "API key authentication remain[s] completely unaffected". The quota page still lists a free (unpaid) key at 250 requests a day, Flash only. **Not confirmed:** whether a free key still works in Gemini CLI today. The source has no client-side block (the consumer cut-off is decided server-side, in `code_assist/setup.ts`), but Google promises nothing about free keys. | Blog and quota page above |
| **Is an AI Studio key tied to the AI Pro / Ultra subscription?** | **No.** The subscription raises limits **only inside the AI Studio web interface**. API-key usage is billed separately through Cloud Billing. Subscribers can get monthly Cloud credits from the Google Developer Program, which apply to the Gemini API: credit, not subscription quota. The product owner's belief probably comes from the April 2026 "vibe code in AI Studio with your Google AI subscription" announcement, which covers AI Studio's web UI only. | [Google AI plans](https://aistudio.google.com/docs/google-ai-plans): "Google bills and manages Gemini API usage (such as using API keys or external applications) separately"; benefits "apply only within the Google AI Studio web interface". [Blog post](https://blog.google/innovation-and-ai/technology/developers-tools/google-one-ai-studio/) |
| **Vertex AI** | Works: Application Default Credentials (ADC) via gcloud, a service-account JSON, or a Cloud API key. Express mode is free for 90 days, then billing is needed. Needs a Google Cloud project. Not a maker's case. | [Authentication](https://geminicli.com/docs/get-started/authentication/) |

**Terms for a third-party app.**
- Google forbids "directly accessing the services powering Gemini CLI (for example, the Gemini Code Assist service) using third-party software … (for example, using OpenClaw with Gemini CLI OAuth)" ([Terms and privacy](https://geminicli.com/docs/resources/tos-privacy/)).
- The [FAQ](https://github.com/google-gemini/gemini-cli/blob/main/docs/resources/faq.md) adds: "If you would like to use a third-party coding agent with Gemini, the supported and secure method is to use a Vertex AI or Google AI Studio API key."
- Spawning the unmodified `gemini` binary is not literally "harvesting OAuth". It does not matter, because personal sign-in is gone anyway.

**Gemini API terms that bite** ([Gemini API terms](https://aistudio.google.com/docs/terms), effective 2026-03-23):
- "You may use only Paid Services when making API Clients available to users in the European Economic Area, Switzerland, or the United Kingdom". So French makers need a **paid** key.
- Free-tier prompts may be read by human reviewers and used to improve Google's products.
- The API is "for developers building … for professional or business purposes, not for consumer use".
- Users must be 18 or older.

## 1. Sign-in, storage, isolation

- **Methods.** Sign in with Google (OAuth), `GEMINI_API_KEY`, or Vertex AI (`GOOGLE_CLOUD_PROJECT` + `GOOGLE_CLOUD_LOCATION`, plus ADC, `GOOGLE_APPLICATION_CREDENTIALS` or `GOOGLE_API_KEY`). Headless mode reuses a cached credential, or otherwise needs a key or Vertex AI configured in the environment ([authentication](https://geminicli.com/docs/get-started/authentication/)).
- **Browser loopback.** The OAuth client listens on `http://127.0.0.1:<port>/oauth2callback`; the host can be changed with `OAUTH_CALLBACK_HOST`. `NO_BROWSER=true` switches to a code typed back by the user, through `https://codeassist.google.com/authcode` ([oauth2.ts](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/code_assist/oauth2.ts)). This only matters for organisation accounts now.
- **Where credentials live.**
  - By default, a plain file `~/.gemini/oauth_creds.json` ([storage.ts](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/config/storage.ts)).
  - When the "force encrypted file" variable is set, it uses the OS keychain under the service name `gemini-cli-oauth`, or `~/.gemini/gemini-credentials.json` encrypted with a key derived from a fixed salt ([oauth-credential-storage.ts](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/code_assist/oauth-credential-storage.ts), [fileKeychain.ts](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/services/fileKeychain.ts)).
  - `GEMINI_FORCE_FILE_STORAGE=true` avoids the keychain.
  - The keychain service name is global: it is **not** isolated by the config folder.
- **Isolation.** `GEMINI_CLI_HOME=<dir>` replaces the home directory for all user-level state: `<dir>/.gemini/settings.json`, the credentials, sessions, `skills/`, `policies/`, `.env` ([paths.ts](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/utils/paths.ts), [configuration](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md)). Some locations sit outside it and still apply:
  - the system settings in `/Library/Application Support/GeminiCli/` (overridable with `GEMINI_CLI_SYSTEM_SETTINGS_PATH` / `GEMINI_CLI_SYSTEM_DEFAULTS_PATH`);
  - the project's own `.gemini/`, and any `.gemini/.env` found walking up from the current directory (can be turned off with `advanced.ignoreLocalEnv`).

## 2. Driving it from an app

- **Headless.** `gemini -p "<prompt>" --output-format stream-json` writes NDJSON with six event types ([headless](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/headless.md), [types.ts](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/output/types.ts)):
  - `init` (`session_id`, `model`)
  - `message` (`role`, `content`, `delta?`: text chunks)
  - `tool_use` (`tool_name`, `tool_id`, `parameters`: the **complete** arguments)
  - `tool_result` (`status`, `output` / `error`)
  - `error` (warning or error)
  - `result` (status and statistics, with token counts per model)

  Exit codes: 0 success, 1 error, 42 bad input, 53 turn limit reached.
- **Follow-up messages.** There is no streaming input (no `--input-format`): stdin is only prepended to `-p`. Each follow-up is a new process with `--resume <session-uuid|latest|index>`. `--session-id <uuid>` fixes the identifier up front; `--list-sessions` and `--delete-session` manage the history ([session management](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/session-management.md)).
- **Interrupting.** In headless mode, kill the process (SIGINT / SIGTERM).
- **ACP.** `gemini --acp` (`--experimental-acp` is deprecated) runs JSON-RPC 2.0 over stdio ([ACP mode](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/acp-mode.md)).
  - Methods: `initialize` (the client can register its own MCP servers), `authenticate`, `newSession`, `loadSession`, `prompt` (several per session), `cancel`, `setSessionMode` (approval level), `unstable_setSessionModel`.
  - Updates: `agent_message_chunk`, `agent_thought_chunk`, `tool_call`, `tool_call_update`, `usage_update`, and `session/request_permission`.
  - Optional file-system proxy: when the client declares `writeTextFile`, the agent's writes go through `fs/write_text_file` on the client ([acpFileSystemService.ts](https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/acp/acpFileSystemService.ts)).
  - ACP is the better long-lived channel: one process, real cancellation, follow-ups.
- **SDK.** `packages/sdk` (`GeminiCliAgent`, `sendStream`) exists in the repository at 0.70.0-nightly, but **`@google/gemini-cli-sdk` is not on npm** (404 on 2026-11-14). `@google/gemini-cli-core` 0.68.0 is published, but it is an internal library without a stable API.

## 3. Live preview: not possible

- **stream-json.** `tool_use` is sent once, with `parameters` as a complete object ([nonInteractiveCli.ts](https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/nonInteractiveCli.ts)). There is no delta event for tool arguments.
- **Core.** `geminiChat.ts` documents "The SDK provides fully assembled FunctionCall objects in chunk.functionCalls", and `turn.ts` raises a tool-call request per complete `FunctionCall` ([geminiChat.ts](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/core/geminiChat.ts), [turn.ts](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/core/turn.ts)). The source never mentions `partialArgs` or `streamFunctionCallArguments`.
- **ACP.** `tool_call` (status `pending`, with the diff content) is sent after the call is assembled, at permission time. `fs/write_text_file` gives the whole file once, at the end. The earliest point Upstart could see the content is therefore when the file is complete, not while it is being written.
- **The model API can stream arguments.** `FunctionCall.partialArgs` / `willContinue` exist in the GenAI SDK types ([js-genai FunctionCall](https://googleapis.github.io/js-genai/release_docs/interfaces/types.FunctionCall.html)), and the Interactions API streams function-call argument deltas ([streaming interactions](https://ai.google.dev/gemini-api/docs/interactions/streaming)). The SDK reference marks `partialArgs` as "not supported in Gemini API" (Vertex only). Using either would mean patching Gemini CLI, that is, shipping a fork.

## 4. Confinement

- **macOS Seatbelt.**
  - Enabled with `-s` / `GEMINI_SANDBOX=sandbox-exec` / `tools.sandbox`.
  - Profiles are chosen with `SEATBELT_PROFILE`: `permissive-open` (default: writes confined to the project, reads and network open), `permissive-proxied`, `restrictive-open|proxied`, `strict-open|proxied`.
  - A custom profile goes in `<project>/.gemini/sandbox-macos-<name>.sb`.
  - The sandbox also turns on by default with `--approval-mode=yolo`.

  ([sandbox](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/sandbox.md))
- **Other platforms.** Docker / Podman (image `ghcr.io/google/gemini-cli`, the project mounted at the same path, `SANDBOX_MOUNTS`, `SANDBOX_FLAGS`), a native Windows sandbox (`icacls` low integrity: the label stays on the files), gVisor `runsc` and LXC on Linux.
- **Per-tool sandboxing** (`security.toolSandboxing`). It shows a "Sandbox Expansion Request" dialog when a sandboxed command needs more access. In headless mode this needs checking (not confirmed).
- **Approval modes.** `--approval-mode default|auto_edit|yolo|plan`. `auto_edit` auto-approves `write_file` / `replace`.
- **Allow / deny lists.** `tools.core` (allow list of built-in tools), `tools.exclude`, `tools.allowed`, `tools.confirmationRequired`, MCP `includeTools` / `excludeTools`, `--allowed-mcp-server-names`.
- **Policy engine** ([policy engine](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/policy-engine.md)). TOML rules with `allow` / `deny` / `ask_user` and priorities, loaded with `--policy` or from `~/.gemini/policies`. **In headless mode `ask_user` counts as `deny`**, which is Upstart's "deny programmatically" behaviour. The workspace-level policy tier is "currently non-functional".
- **ACP confirmations.** `session/request_permission` is answered by the client, for example with `reject_once`.

## 5. Extending

- **MCP.** stdio / SSE / HTTP servers in `settings.json` under `mcpServers` (with `trust`, `includeTools`, `excludeTools`), or passed at ACP `initialize` ([MCP server](https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md)).
- **Agent Skills.** Supported (agentskills.io `SKILL.md`), loaded on demand through an `activate_skill` tool. Read from `~/.gemini/skills` or `~/.agents/skills` (under `GEMINI_CLI_HOME`), and from the workspace's `.gemini/skills` or `.agents/skills` ([skills](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/skills.md)).
- **System prompt.**
  - `GEMINI.md` files add context.
  - `GEMINI_SYSTEM_MD=<path>` **replaces** the built-in prompt entirely, with substitutions `${AgentSkills}`, `${SubAgents}`, `${AvailableTools}`, `${write_file_ToolName}` ([system prompt](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/system-prompt.md)).
- **Hooks** (command type only; JSON on stdin and stdout) ([hooks reference](https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md)):
  - `BeforeTool` / `AfterTool` (deny or replace the output): the counterpart of PostToolUse;
  - `AfterAgent`: `decision:"deny"` plus `reason` sends the reason back to the agent as a new prompt. This is the counterpart of Claude's Stop hook that keeps the agent going.
  - also `BeforeAgent`, `BeforeModel`, `AfterModel` (called for every streamed chunk), `BeforeToolSelection`, `SessionStart` / `SessionEnd`, `Notification`, `PreCompress`, `SubagentStop` (0.68).
- **Extensions.** `gemini-extension.json` bundles MCP servers, context, commands, skills and policies.
- **Web.** `google_web_search` (grounded, summarised by the Gemini API) and `web_fetch`. On paid API keys, grounding costs 5,000 free searches a month, then **$14 per 1,000** ([pricing](https://aistudio.google.com/docs/pricing)). It is not available on the free tier for 3.x / 4 text models.

## 6. Models, speed, cost

- **What Gemini CLI 0.68 knows** ([models.ts](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/config/models.ts)): `gemini-3-pro-preview`, `gemini-3.1-pro-preview(-customtools)`, `gemini-3-flash-preview`, `gemini-3.5-flash`, `gemini-3.8-flash`, `gemini-3.1-flash-lite`, `gemini-3.5-flash-lite`, `gemini-2.5-pro`, Gemma 4. The default alias `auto` routes between Pro and Flash.
- **Gemini 4 is absent from its model list.** The README says it is "not optimized for Gemini 4+".
- **Gemini API prices per 1M tokens, input / output** ([pricing](https://aistudio.google.com/docs/pricing)):

  | Model | Price | Notes |
  |---|---|---|
  | Gemini 4 Argon (GA 2026-10-13) and Carbon | $2 / $10 | Doubles to $4 / $20 on 2026-12-01; no free tier |
  | Gemini 4 Hydrogen | $1.50 / $7.50 | Free tier |
  | Gemini 3.1 Pro Preview | $2 / $12 | |
  | Gemini 3.8 / 3.6 Flash | $0.75 / $3.75 | Doubles 2027-01-01 |
  | Gemini 3.5 Flash-Lite | $0.30 / $2.50 | |

- **Speed.** Not measured, and no reliable published figures found for Gemini CLI on site-building work. It would need the same timed trial as Codex.

## 7. Shipping

- **Licence.** Apache-2.0: redistributable.
- **Package.** `@google/gemini-cli` 0.68.0 is a self-contained bundle (`bundle/gemini.js`): 449 files, **~99 MB unpacked**, Node ≥ 20, no required dependencies.
- **Native modules.** Optional native dependencies: `node-pty` / `@lydell/node-pty-*` (interactive shell) and `@github/keytar` (keychain). Both would need rebuilding for Electron, or can be left out. It could run on Electron's own Node (`ELECTRON_RUN_AS_NODE`) instead of a bundled Node.
- **Release pace.** Weekly stable releases (Tuesdays) and nightly builds. The project is in maintenance mode for enterprise customers ("model updates, bug fixes, and security fixes").

## 8. Blockers and complications for Upstart

1. **No consumer subscription.** A maker would need a paid Gemini API key with Cloud Billing, or a Google Cloud / Vertex project. That is a heavy setup for a non-technical maker, and in the EEA the free tier is not allowed for an app like Upstart.
2. **No live preview.** Tool arguments arrive complete, on every route. Getting them earlier would mean forking the core.
3. **Strategic decline.** Google steers individuals and new models (Gemini 4) to Antigravity CLI, a closed product. Gemini CLI is maintained for enterprise use.
4. **Isolation gaps.** `GEMINI_CLI_HOME` covers user state but not the system settings files, the project `.gemini/.env` walk, or the keychain service name. Upstart would have to set the system settings paths to its own empty files and pass `GEMINI_FORCE_FILE_STORAGE=true`.
5. **Headless follow-ups need a new process each time** (`--resume`). Use ACP for a long-lived session.
6. **No published SDK.** `@google/gemini-cli-sdk` is not on npm.
7. **Antigravity CLI is out of scope here but worth its own look** for the subscription question. It has a headless `agy -p --output-format stream-json` ([Antigravity headless docs](https://antigravity.google/docs/cli/headless)), but a known bug drops stdout when stdout is not a terminal ([antigravity-cli#76](https://github.com/google-antigravity/antigravity-cli/issues/76)). Whether third-party apps may orchestrate it with account sign-in is asked but unanswered on Google's forum ([thread](https://discuss.ai.google.dev/t/is-external-orchestration-of-antigravity-cli-headless-mode-supported-with-account-based-usage/183051)). Its licence was not found.

### Not confirmed

- Whether a **free** AI Studio key still works in Gemini CLI 0.68.
- How sandbox expansion requests behave in headless mode.
- Antigravity CLI's terms for third-party orchestration, and its stream format.
- Real speed on Upstart's tasks.
