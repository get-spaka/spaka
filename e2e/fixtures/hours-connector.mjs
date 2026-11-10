// A minimal local connector (MCP over stdio) for the real-agent check: one
// tool that answers the bakery's opening hours, with the secret it was given.
import { createInterface } from "node:readline";

const send = (message) => process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);

createInterface({ input: process.stdin }).on("line", (line) => {
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    return;
  }
  const { id, method, params } = request;
  if (id === undefined) return;
  if (method === "initialize")
    return send({
      id,
      result: {
        protocolVersion: params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "bakery-hours", version: "1.0.0" },
      },
    });
  if (method === "ping") return send({ id, result: {} });
  if (method === "tools/list")
    return send({
      id,
      result: {
        tools: [
          {
            name: "opening_hours",
            description: "The bakery's opening hours, from its till system.",
            inputSchema: { type: "object", properties: {} },
          },
        ],
      },
    });
  if (method === "tools/call")
    return send({
      id,
      result: {
        content: [
          { type: "text", text: `Tuesday to Sunday, 6:30 to 19:30. Till ${process.env.TILL_TOKEN ?? "none"}.` },
        ],
      },
    });
  send({ id, error: { code: -32601, message: `Unknown method ${method}` } });
});
