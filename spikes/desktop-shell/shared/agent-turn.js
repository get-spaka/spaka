// One short agent turn through the Claude Agent SDK, shared by both shells.
// The SDK's `query` is passed in so that each app resolves the SDK (and the
// official binary it runs) from its own node_modules.
//
// Nothing here touches credentials: the binary uses whatever sign-in the
// machine already has.

/**
 * @param {object} args
 * @param {Function} args.query            `query` from @anthropic-ai/claude-agent-sdk
 * @param {string} args.prompt
 * @param {string} args.cwd                folder the agent works in
 * @param {string} [args.executablePath]   the official binary, when the SDK cannot find it itself
 * @param {(event: object) => void} [args.onEvent]
 */
export async function runAgentTurn({ query, prompt, cwd, executablePath, onEvent = () => {} }) {
  const started = Date.now();
  const stderr = [];
  const tools = [];
  let text = "";
  let init = null;
  let result = null;
  let firstTextAt = null;

  try {
    const stream = query({
      prompt,
      options: {
        cwd,
        ...(executablePath ? { pathToClaudeCodeExecutable: executablePath } : {}),
        permissionMode: "acceptEdits",
        allowedTools: ["Read", "Write", "Edit", "Bash(ls:*)"],
        settingSources: [],
        includePartialMessages: true,
        persistSession: false,
        maxTurns: 6,
        stderr: (data) => stderr.push(String(data)),
      },
    });

    for await (const message of stream) {
      if (message.type === "system" && message.subtype === "init") {
        init = {
          model: message.model,
          claudeCodeVersion: message.claude_code_version,
          apiKeySource: message.apiKeySource,
          permissionMode: message.permissionMode,
          cwd: message.cwd,
        };
        onEvent({ type: "init", ...init });
      } else if (message.type === "stream_event") {
        const event = message.event;
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          if (firstTextAt === null) firstTextAt = Date.now() - started;
          text += event.delta.text;
          onEvent({ type: "text", delta: event.delta.text });
        }
      } else if (message.type === "assistant") {
        for (const block of message.message.content ?? []) {
          if (block.type === "tool_use") {
            const tool = { name: block.name, input: block.input };
            tools.push(tool);
            onEvent({ type: "tool", ...tool });
          }
        }
      } else if (message.type === "result") {
        result = message;
      }
    }
  } catch (error) {
    return {
      ok: false,
      error: String(error?.stack ?? error),
      stderr: stderr.join("").slice(-2000),
      durationMs: Date.now() - started,
      init,
      tools,
      text,
    };
  }

  return {
    ok: result?.subtype === "success" && result?.is_error !== true,
    subtype: result?.subtype ?? null,
    text: result?.result ?? text,
    durationMs: Date.now() - started,
    firstTextMs: firstTextAt,
    apiDurationMs: result?.duration_api_ms ?? null,
    turns: result?.num_turns ?? null,
    init,
    tools,
    stderr: stderr.join("").slice(-2000),
  };
}

export const defaultAgentPrompt = (shell) =>
  `Create a file named hello.html in the current directory containing exactly <h1>Hello from ${shell}</h1>. ` +
  `Then run "ls -la" and reply with one short sentence saying what you did.`;
