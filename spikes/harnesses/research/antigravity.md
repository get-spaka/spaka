# Antigravity CLI (`agy`) — research for the harness spike

Researched 2026-11-14. Nothing was installed or signed in to; every fact below comes from Google's docs, the `google-antigravity/antigravity-cli` repository (README, CHANGELOG, issues), Homebrew and PyPI metadata. "Not confirmed" means no source was found.

## Verdict for Upstart

**Not usable on the maker's Google subscription, and no live preview.**

1. **The terms forbid Upstart's case on consumer sign-in.** The FAQ says: "Wrapping `agy` inside third-party coding agents or applications ... is not supported under consumer plans" ([FAQ](https://antigravity.google/docs/faq)). The Additional Terms §6 call using third-party software to access the Service a breach, which can lead to suspension ([terms](https://antigravity.google/terms)). A Google collaborator on GitHub (manirajc, 2026-11-12) says plainly that spawning the unmodified `agy acp` or `agy -p` as a subprocess from a third-party harness breaches §6 under `oauth-personal`. It does so "regardless of whether the wrapper extracts the raw OAuth token or spawns agy acp / agy -p as a subprocess". The same answer also forbids "overriding Antigravity's system identity instructions" ([#1493](https://github.com/google-antigravity/antigravity-cli/issues/1493)). Only a human-driven interactive ACP client is allowed. Upstart adds its own system prompt, skills, a Stop hook that makes the agent continue, and its own tools, so it falls on the forbidden side. Google sends third-party apps to a **Gemini API key or Vertex**. With those, Antigravity is just a harness for a paid key, and Pi or opencode do that with an open licence.
2. **No live preview.** `stream-json` streams only the text of answers (`text_delta`). A tool step reaches the stream with complete `tool_info.parameters`. ACP sends diffs "for completed edits". The Python SDK's `tool_calls` stream yields complete "dispatches". Token-by-token file content is never documented, and no public report shows it.
3. **Weak isolation.** No variable moves the config folder ([#155](https://github.com/google-antigravity/antigravity-cli/issues/155), open). The login is kept in the macOS Keychain, so overriding `HOME` does not isolate it.
4. **Closed binary with no licence for redistribution.**

Gemini CLI is **not deprecated as a product**. It is still maintained (v0.68.0 on 2026-11-10, Apache-2.0, not marked deprecated on npm), but only for enterprise Code Assist and paid API / Vertex keys. What ended on 2026-06-18 is **consumer access**. The product owner is right about the direction (individuals and Gemini 4 go to Antigravity) and wrong about the word "deprecated".

## 0. Status

- **Gemini CLI.** On 2026-06-18 it "stopped serving requests for Google AI Pro, Google AI Ultra, and free tier individual accounts" ([Discussion #28017](https://github.com/google-gemini/gemini-cli/discussions/28017)). Google's post is titled "Transitioning", never uses "deprecated", and promises to "continue to support Gemini CLI" for enterprise and paid keys ([Developers Blog, 2026-05-19](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/)). The README now reads: "Enterprise Code Assist only", "Not optimized for Gemini 4+", and "maintained for enterprise Gemini Code Assist workflows" ([README](https://github.com/google-gemini/gemini-cli#readme)). The repository is active (push 2026-11-14), not archived, and npm `@google/gemini-cli` 0.68.0 carries no `deprecated` flag. In short: a consumer cut-off plus strategic decline, not a deprecation.
- **Antigravity CLI.** Available to everyone since 2026-05-19, written in Go (blog). No page labels it preview, beta or GA ([migration guide](https://antigravity.google/docs/cli/gcli-migration/)). It is released almost daily: **1.5.9 is the latest** (2026-11-14, [releases](https://github.com/google-antigravity/antigravity-cli/releases)). The repository holds only the README, CHANGELOG and examples, with no source.
- **Install on macOS.** Google documents only the installer script: `curl -fsSL https://antigravity.google/cli/install.sh | bash` ([quickstart](https://antigravity.google/docs/getting-started/)). It downloads from a Cloud Run updater, verifies a sha512, copies `agy` to `~/.local/bin` (`--dir` changes this), removes the quarantine flag, then runs `agy install`, which sets up the shell and aliases. A Homebrew cask also exists: `brew install --cask antigravity-cli` (cask at 1.5.3, `auto_updates`, macOS ≥ 12). GitHub releases ship tarballs, for example `agy_cli_mac_arm64.tar.gz` (84 MB). There is no npm package; the npm `antigravity-cli` package is a third-party placeholder.
- **Desktop app.** Antigravity 2.x (`brew install --cask antigravity`, 2.29.0) shares the same agent engine. It is a GUI and gives Upstart no more ways to drive it than the CLI does.

## 1. Sign-in

- **Methods** ([Authenticate](https://antigravity.google/docs/install/), [ACP auth](https://antigravity.google/docs/ide/extensions/acp)):
  - `oauth-personal`: Google account (Free, Plus, Pro, Ultra), browser sign-in.
  - `oauth-business`: Gemini Enterprise.
  - `gemini-api-key`: `GEMINI_API_KEY` with `"modelProvider": "gemini"` in settings. The CLI reads the variable only from the environment, never from `.env`.
  - `agent-platform`: Vertex / ADC, with `AGY_ADC_AUTH=true`, `GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_LOCATION`.
  - Plans page: BYOK "for additional rate limits" is not supported ([plans](https://antigravity.google/docs/plans/)).
- **Free personal accounts** are served ("any plan, including the free tier", FAQ), with a weekly quota.
- **May a third-party app start it with the user's Google sign-in? No.** See the verdict: FAQ, Terms §6, and the collaborator's answers in [#1411](https://github.com/google-antigravity/antigravity-cli/issues/1411) and [#1493](https://github.com/google-antigravity/antigravity-cli/issues/1493). An earlier forum reply saying "Yes, this is fully supported" came from a user without a staff badge, and a later post points out that it contradicts the FAQ ([forum](https://discuss.ai.google.dev/t/is-external-orchestration-of-antigravity-cli-headless-mode-supported-with-account-based-usage/183051)). Google also says unauthorized harness traffic on consumer OAuth "is subject to automated abuse enforcement". The question of whether a framework-injected system prompt is allowed is still open ([#1542](https://github.com/google-antigravity/antigravity-cli/issues/1542)).
- **Where auth is stored.** In the OS keyring (macOS Keychain). If a keychain write fails, the CLI falls back to its "file-based storage" or "private secrets file" (CHANGELOG 1.5.9 and 1.4.6). MCP OAuth tokens go in `~/.gemini/antigravity/mcp_oauth_tokens.json`. Settings live in `~/.gemini/antigravity-cli/settings.json` and `~/.gemini/config/` (MCP, hooks, skills, agents, `GEMINI.md`/`AGENTS.md`). Conversations and the "brain" live under `~/.gemini/antigravity-cli/`.
- **Isolation.** No `AGY_HOME` / `GEMINI_CLI_HOME` equivalent exists ([#155](https://github.com/google-antigravity/antigravity-cli/issues/155), open since May; [#669](https://github.com/google-antigravity/antigravity-cli/issues/669) asks for XDG). The only lever is setting `HOME` for the process. One integrator does so ([#1013](https://github.com/google-antigravity/antigravity-cli/issues/1013): "temporary private HOME", which revealed a panic under a restricted HOME). **Not confirmed:** whether the Keychain item is keyed per HOME. It probably is not, in which case an isolated-HOME `agy` would see the user's own `agy` login. An undocumented `--settings <file>` flag exists (CHANGELOG 1.5.8) but has no documented semantics.
- **Browser loopback.** The docs only say the browser "redirects back" to the CLI. Over SSH, or in `agy acp --login`, the CLI prints a URL and you paste back a code. Truly headless runs fail fast with "authentication required". The loopback address and port are not documented (a loopback with `[::1]` fallback is confirmed only for MCP and plugin OAuth, CHANGELOG 1.5.9).

## 2. Driving it from an app

Source: [Headless mode](https://antigravity.google/docs/cli/headless/), [CLI reference](https://antigravity.google/docs/cli/reference/).

- **Headless.** `agy -p "<prompt>"` with `--output-format text|json|stream-json`.
- **Long-lived session.** `--input-format stream-json --output-format stream-json` (no `-p`). The client sends `{"event":"user","message":{"content":"..."}}` on stdin, one line per turn. Text blocks only; no images. The process keeps one `conversation_id` and emits a `result` per turn. Closing stdin ends it with exit 0. `control_request`/`control_response` are rejected (exit 2), so there is **no control channel** (no permission answers, no interrupt message).
- **Events.**
  - `init`: `cwd`, `tools`, `permission_mode`, `model`.
  - `step_update`: `conversation_id`, `step_index`, `state` ACTIVE|DONE, `step_type` user_input|agent_response|tool|checkpoint, `tool_name`, `text_delta`, `tool_info{name, parameters, output, error}`, `subagent_info`, `usage`.
  - `result`: `status` SUCCESS|ERROR|CANCELED|INTERRUPTED|INVALID|WAITING|RUNNING, `response`, `usage` (input/output/thinking/cache_read), `finished_reason`.
- **Other flags.** `--model`, `--effort low..max`, `--agent`, `--mode accept-edits|auto|plan`, `--add-dir`, `--json-schema`, `--print-timeout` (0 = unlimited), `--disable-slash-commands`, `--log-file`.
- **Resume.** `-c`/`--continue` or `--conversation <id>`, one new process each time. Google says separate processes start with a cold cache and so cost more quota per turn ([#1411](https://github.com/google-antigravity/antigravity-cli/issues/1411)).
- **Interrupt.** SIGINT gives `INTERRUPTED`. Known bugs:
  - Commands the agent started keep running after an interrupt ([#1458](https://github.com/google-antigravity/antigravity-cli/issues/1458)).
  - `-p` never exits after the result on some long prompts and ignores SIGTERM, so only SIGKILL works ([#1313](https://github.com/google-antigravity/antigravity-cli/issues/1313), open, 1.4.4–1.4.11, macOS/Linux/Windows).
  - stream-json deadlocks when a command reads stdin ([#1456](https://github.com/google-antigravity/antigravity-cli/issues/1456)).
  - The colleague's "output dropped when not a terminal" bug ([#76](https://github.com/google-antigravity/antigravity-cli/issues/76)) is **closed, fixed in 1.1.1**. It was a swallowed server error, not a TTY problem.
- **ACP.** `agy acp` serves ACP v1 over stdio ([ACP page](https://antigravity.google/docs/ide/extensions/acp)). It supports session load, resume, list and close; cancel; steering by sending a prompt during a turn; modes default, accept-edits, plan and auto; elicitation; permission requests answered Allow/Deny by the client; and client-passed MCP servers (HTTP ones need `--process-per-session`). Flags: `--sandbox`, `--dangerously-skip-permissions`, `--agent`, `--add-dir`, `--login`, `--disable-telemetry`. Claude and GPT models are offered only to allow-listed clients (Zed, JetBrains, Android Studio, Xcode) ([#1318](https://github.com/google-antigravity/antigravity-cli/issues/1318)).
- **SDK.** Python only: `google-antigravity` 0.1.23 on PyPI, Apache-2.0 wrapper with 40 MB platform wheels that bundle a closed "compiled runtime binary" ([repo](https://github.com/Google-Antigravity/antigravity-sdk-python), [docs](https://antigravity.google/docs/sdk/overview/)). Auth is **API key or Vertex only**, with no Google-account sign-in. No TypeScript SDK.

## 3. Live preview

**No route carries a file write's content while it is being generated.**
- `stream-json`: only `agent_response` text streams (`ACTIVE` steps with `text_delta`, then `DONE`). Tool steps carry `tool_info` with complete `parameters`. The docs "do not document streaming of tool-call argument deltas", and the CHANGELOG (1.0.x to 1.5.9) never mentions argument deltas. The built-in file tools are `write_to_file`, `view_file` and others.
- ACP: edits "stream back as diffs", but the 1.5.9 CHANGELOG speaks of "the diffs sent for **completed** edits".
- SDK: `response.tool_calls` yields typed `ToolCall` events "as dispatches" (complete calls).
- **Not confirmed by observation.** No public log of a real `write_to_file` step was found. The only third-party consumer seen ([code-convoy PR #82](https://github.com/ChrisLauinger77/code-convoy/pull/82)) uses synthetic fixtures and says it never ran an authenticated `agy`. Whether an `ACTIVE` tool step appears before the call is complete would have to be checked on a real run.

## 4. Confinement

- **Sandbox.** On macOS: `sandbox-exec` with Seatbelt profiles. On Linux: namespaces. On Windows: AppContainer, Windows 11 24H2 or later ([sandbox](https://antigravity.google/docs/sandbox/)).
  - It confines **shell commands only**. The docs do not say that file tools run inside it; file tools are governed by permission rules and `allowNonWorkspaceAccess=false`.
  - The workspace is read-write; `~/.ssh`, `.env` and `~/Library/Application Support` are blocked; there is no network except domains allowed by `read_url` rules; `.git` is read-only.
- **Modes.**
  - `--mode auto`: edits inside the workspace are approved, commands run in the sandbox, and commands that would leave it are reviewed by a separate Flash model and asked about if risky.
  - `toolPermission`: `request-review` (default), `proceed-in-sandbox`, `always-proceed`, `strict`.
  - `--dangerously-skip-permissions`.
  - `permissions.allow/ask/deny` rules such as `command(git)`, `write_file(src/)`, `mcp(server/tool)`.
- **Programmatic answers.** In `-p` mode, approvals that cannot be obtained are **soft-denied**: the run goes on, stderr names the tool, and exit is 0. That fits "deny, never shown to the maker". A `PreToolUse` hook can also return `deny`, `allow` or `ask`. Over ACP the client answers `session/request_permission`.

## 5. Extending

- **MCP.** `~/.gemini/config/mcp_config.json` (global) or `<workspace>/.agents/mcp_config.json`, plus ACP-passed servers ([MCP](https://antigravity.google/docs/mcp/)). Supports stdio and Streamable HTTP. Tools are lazy by default: the agent calls them through `call_mcp_tool` after reading their schema from disk. `tools.eager: true` registers a tool directly as `mcp_<server>_<tool>`. `agy mcp add/remove/list` manage the file. No per-run flag.
- **Skills.** Agent Skills standard (SKILL.md). Found in `<workspace>/.agents/skills/`, `~/.gemini/config/skills/`, `~/.gemini/antigravity-cli/skills/` and `~/.gemini/skills/` ([skills](https://antigravity.google/docs/skills/)).
- **System prompt.**
  - No `GEMINI_SYSTEM_MD` equivalent.
  - Rules: `GEMINI.md`/`AGENTS.md`, workspace or `~/.gemini/`.
  - Custom agents: `.agents/agents/<name>.md`, where the body is the system prompt, selected with `--agent` ([subagents](https://antigravity.google/docs/subagents/)). Frontmatter `excludeDefaultComponents: true` drops the default prompt sections (CHANGELOG 1.2.x).
  - Google says overriding Antigravity's identity instructions is not allowed on consumer OAuth (#1493).
- **Hooks.** In `.agents/hooks.json` or `~/.gemini/config/hooks.json` ([hooks](https://antigravity.google/docs/hooks/)). Events: `SessionStart`, `PreToolUse`, `PostToolUse`, `PreInvocation`, `PostInvocation`, `Stop`. A **Stop hook can return `{"decision":"continue","reason":...}`** to resume the loop, with a cap on consecutive continuations and a `continuation_active` input. A `PostToolUse` hook receives `toolCall` (name, args).
- **Web.** Built-in tools `search_web` and `read_url_content`, plus a `/browser` subagent driving Chrome.

## 6. Models, limits, speed

- **Models** ([models](https://antigravity.google/docs/models/)):
  - Gemini 4 Carbon (Ultra, Enterprise).
  - Gemini 4 Argon (Pro or above).
  - Gemini 4 Hydrogen (all plans, including Free; efforts low to xhigh).
  - Gemini 3.8 Flash (all plans).
  - "Orchestrator" variants.
  - Claude Sonnet / Opus 5.5 (Pro non-trial, Ultra).
  - Claude 4.6 and GPT-OSS-120b, scheduled for removal on 2026-11-18.
  - Slugs come from `agy models`, for example `gemini-4-hydrogen-xhigh`.
- **Limits** ([plans](https://antigravity.google/docs/plans/)): no numbers are published.
  - Free: weekly quota.
  - Pro: quota refreshed every 5 h, up to a weekly cap.
  - Ultra: highest quota.
  - Overages use paid "AI credits".
  - `agy -p`, `agy acp` and interactive use share one quota pool (#1411).
- **Speed.** Not measured. The docs only label Flash as "Fast".

## 7. Shipping

- **Licence.** None. The repository has no LICENSE (`licenseInfo: null`) and no source. Use is governed by the Google Terms of Service plus the [Antigravity Additional Terms](https://antigravity.google/terms), which grant no redistribution right. Bundling `agy` inside Upstart is therefore not permitted as far as can be found. The user would have to install it. **Not confirmed:** an explicit clause either way.
- **Binary.** A single native build: 84 MB tarball on mac arm64, 90 MB on x64. It bundles its own Python (for `run_workflow` and the ACP server) and ripgrep. It updates itself (cask `auto_updates`); **not confirmed:** whether self-update can be turned off. It sends telemetry (`--disable-telemetry` exists on `acp`), and interaction data is used by default (README).

## 8. Blockers for Upstart

1. **Terms.** Consumer-account use from a third-party app is forbidden and enforced (FAQ, §6, the Google collaborator on #1493 and #1411). Only API key or Vertex is allowed, which removes the subscription advantage.
2. **No live preview.** Tool arguments are never streamed.
3. **No config-dir isolation**, and the login sits in the shared Keychain.
4. **No control channel in stream-json** (no interrupt or permission messages). Only ACP has cancel and permissions, and ACP's own policy is "human-driven only".
5. **Stability.** Daily releases, open hangs on exit (#1313) and orphaned child processes (#1458).
6. **Closed binary, no redistribution right**, self-updating.

## Exact steps to try it on this Mac

For a technical check only (stream format, whether tool steps carry partial parameters). Under the terms above, sign in with a **Gemini API key** rather than a Google account if this is meant to stand in for Upstart's use. Nothing below touches the shell profile or `~/.local/bin`.

```sh
# 1. Fetch the release binary into the spike folder (no installer, no `agy install`)
SPIKE=/Users/me/dev/upstart/spikes/harnesses/.agy
mkdir -p "$SPIKE/bin" "$SPIKE/home" "$SPIKE/work"
gh release download 1.5.9 -R google-antigravity/antigravity-cli -p 'agy_cli_mac_arm64.tar.gz' -D "$SPIKE"
tar -xzf "$SPIKE/agy_cli_mac_arm64.tar.gz" -C "$SPIKE/bin"   # binary name inside the tarball not confirmed; expect `agy`
xattr -d com.apple.quarantine "$SPIKE/bin/agy" 2>/dev/null
AGY="$SPIKE/bin/agy"; "$AGY" --version

# 2. Isolated home: the only lever (no AGY_HOME exists). The Keychain is NOT isolated by this.
export HOME="$SPIKE/home"

# 3a. Sign in with an API key (the route Google permits for third-party apps)
mkdir -p "$HOME/.gemini/antigravity-cli"
echo '{"modelProvider":"gemini"}' > "$HOME/.gemini/antigravity-cli/settings.json"
export GEMINI_API_KEY=...            # typed by Matt, never committed
# 3b. Or a Google account (interactive, opens the browser; consumer-terms caveat applies)
# cd "$SPIKE/work" && "$AGY"         # or: "$AGY" acp --login   (paste-code flow)

# 4. Headless run that streams JSON, auto mode inside the Seatbelt sandbox
cd "$SPIKE/work"
"$AGY" -p "Create index.html: a one-page site for a bakery, about 150 lines" \
  --output-format stream-json --mode auto --sandbox --disable-slash-commands \
  </dev/null | tee run.jsonl
# then check: do any step_update lines with step_type "tool" / tool_name "write_to_file"
# arrive in state ACTIVE with partial tool_info.parameters before the DONE line?
jq -c 'select(.event=="step_update" and .step_update.step_type=="tool") | {s:.step_update.state, t:.step_update.tool_name, len:(.step_update.tool_info.parameters|tostring|length)}' run.jsonl

# Multi-turn, one process:
# printf '%s\n' '{"event":"user","message":{"content":"..."}}' | "$AGY" --input-format stream-json --output-format stream-json --mode auto --sandbox
```

Afterwards: `/logout` inside that `agy` (or delete the Keychain item it created), and `rm -rf "$SPIKE"`.
