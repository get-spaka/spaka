// Upstart's tools and turn checks as the Agent SDK takes them (Claude's
// layer, ADR 0012): the tools through an in-process server, the checks as the
// SDK's hooks.
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { grantedInSandbox } from "./confinement";
import type { AgentKit } from "./runner";
import { UPSTART_SERVER, type UpstartTools, upstartToolName, upstartTools } from "./upstart-tools";

export {
  blocksAnswer,
  FIND_BLOCKS_TOOL,
  FIND_IMAGES_TOOL,
  LOOK_TOOL,
  UPSTART_SERVER,
  USE_BLOCK_TOOL,
  USE_IMAGE_TOOL,
} from "./upstart-tools";

/** A new in-process server for one agent process. */
export function upstartServer(tools: UpstartTools) {
  const defs = upstartTools(tools);
  const server = createSdkMcpServer({
    name: UPSTART_SERVER,
    version: "1.0.0",
    tools: defs.map((def) =>
      tool(
        def.name,
        def.description,
        def.shape,
        async (input, extra) => ({
          content: await def.run(input, (extra as { signal?: AbortSignal } | undefined)?.signal),
        }),
        def.readOnly || def.openWorld
          ? {
              annotations: {
                ...(def.readOnly ? { readOnlyHint: true } : {}),
                ...(def.openWorld ? { openWorldHint: true } : {}),
              },
            }
          : undefined,
      ),
    ),
  });
  // A recording played back runs the card of pages as the server would (replay.ts): it waits for the maker.
  return Object.assign(server, {
    runTool: async (name: string, input: unknown, signal?: AbortSignal) =>
      (await defs.find((def) => upstartToolName(def.name) === name)?.run(input, signal)) ?? [],
  });
}

/** The options a Claude session adds for one project: Upstart's tools, and its checks as hooks. */
export function claudeExtras({ tools, checks }: AgentKit) {
  return {
    mcpServers: { [UPSTART_SERVER]: upstartServer(tools) },
    allowedTools: upstartTools(tools).map((def) => upstartToolName(def.name)),
    hooks: {
      // What the agent tool would ask for, granted when the sandbox confines it (Q220, Q221).
      PermissionRequest: [
        {
          hooks: [
            async (input: { tool_name?: string; tool_input?: unknown }) =>
              grantedInSandbox(input.tool_name ?? "", input.tool_input)
                ? {
                    hookSpecificOutput: {
                      hookEventName: "PermissionRequest" as const,
                      decision: { behavior: "allow" as const },
                    },
                  }
                : { continue: true },
          ],
        },
      ],
      // A record that does not read is said to the agent at once, with the tool's answer (Q170).
      PostToolUse: [
        {
          matcher: "Write|Edit|Bash",
          hooks: [
            async (input: { tool_name?: string; tool_input?: unknown }) => {
              const note = checks.afterTool(input.tool_name ?? "", input.tool_input);
              return note
                ? { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: note } }
                : { continue: true };
            },
          ],
        },
      ],
      Stop: [
        {
          hooks: [
            async (input: { stop_hook_active?: boolean }) => {
              const notes = checks.beforeStop(!!input.stop_hook_active);
              return notes ? { decision: "block" as const, reason: notes } : { continue: true };
            },
          ],
        },
      ],
    },
  };
}
