// A tiny MCP server for the tests: a notes connector, over stdio or behind HTTP.

/** A connector's answers to MCP's requests, as a tiny server would give them. */
export function answer(message: {
  id?: number;
  method: string;
  params?: { name?: string; arguments?: { text?: string } };
}) {
  switch (message.method) {
    case "initialize":
      return {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "notes", version: "1" },
      };
    case "tools/list":
      return {
        tools: [
          {
            name: "add-note",
            description: "Adds a note.",
            inputSchema: { type: "object", properties: { text: { type: "string" } } },
          },
          {
            name: "list_notes",
            description: "Lists the notes.",
            inputSchema: { type: "object" },
            annotations: { readOnlyHint: true },
          },
        ],
      };
    case "tools/call":
      return { content: [{ type: "text", text: `noted: ${message.params?.arguments?.text}` }] };
    default:
      return {};
  }
}

/** The same answers from a program speaking MCP over stdio, one JSON message per line. */
export const STDIO_SERVER = `
const answer = ${answer.toString()};
let buffer = "";
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let i;
  while ((i = buffer.indexOf("\\n")) >= 0) {
    const line = buffer.slice(0, i);
    buffer = buffer.slice(i + 1);
    if (!line.trim()) continue;
    const message = JSON.parse(line);
    if (message.id === undefined) continue;
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: answer(message) }) + "\\n");
    // A note "bye" ends the program, as a connector that crashes would.
    if (message.params?.arguments?.text === "bye") setTimeout(() => process.exit(0), 10);
  }
});
`;
