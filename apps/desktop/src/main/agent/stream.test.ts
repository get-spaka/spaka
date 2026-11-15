import { expect, test } from "vitest";
import { parsePartialInput } from "./partial-input";
import { type AgentEvent, StreamReader } from "./stream";

const delta = (index: number, partial_json: string) => ({
  type: "stream_event",
  parent_tool_use_id: null,
  event: { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json } },
});

test("follows a Write while its input streams, path first", () => {
  const events: AgentEvent[] = [];
  const reader = new StreamReader((e) => events.push(e));
  reader.read({ type: "stream_event", event: { type: "message_start" } });
  reader.read({
    type: "stream_event",
    event: { type: "content_block_start", index: 0, content_block: { type: "text" } },
  });
  reader.read({
    type: "stream_event",
    event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "A bakery." } },
  });
  reader.read({
    type: "stream_event",
    event: { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "t1", name: "Write" } },
  });
  reader.read(delta(1, '{"file_path": "/p/pages/index.liquid", "con'));
  reader.read(delta(1, 'tent": "<h1>Hel'));
  reader.read(delta(1, 'lo</h1>"}'));
  reader.read({ type: "stream_event", event: { type: "content_block_stop", index: 1 } });
  reader.read({
    type: "user",
    message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "File created", is_error: false }] },
  });
  reader.read({ type: "result", subtype: "success", is_error: false, result: "Done.", duration_ms: 1200 });

  expect(events.map((e) => e.kind)).toEqual([
    "request-start",
    "text",
    "tool-start",
    "tool-input",
    "tool-input",
    "tool-input",
    "tool-input-end",
    "tool-result",
    "result",
  ]);
  const inputs = events.filter((e) => e.kind === "tool-input");
  expect(inputs[0]).toMatchObject({ fields: { file_path: "/p/pages/index.liquid" }, done: { file_path: true } });
  expect(inputs[1]).toMatchObject({ fields: { content: "<h1>Hel" }, done: { content: false } });
  expect(events[6]).toEqual({
    kind: "tool-input-end",
    id: "t1",
    name: "Write",
    input: { file_path: "/p/pages/index.liquid", content: "<h1>Hello</h1>" },
  });
  expect(events[7]).toMatchObject({ kind: "tool-result", name: "Write", isError: false });
});

test("passes the agent's thinking on, with its text", () => {
  const events: AgentEvent[] = [];
  const reader = new StreamReader((e) => events.push(e));
  reader.read({
    type: "stream_event",
    event: { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Warm colours." } },
  });
  expect(events).toEqual([{ kind: "thinking", text: "Warm colours." }]);
});

test("ignores the stream of a sub-agent", () => {
  const events: AgentEvent[] = [];
  const reader = new StreamReader((e) => events.push(e));
  reader.read({ type: "stream_event", parent_tool_use_id: "x", event: { type: "message_start" } });
  expect(events).toEqual([]);
});

test("reports the start of a session, refusals and sign-in failures", () => {
  const events: AgentEvent[] = [];
  const reader = new StreamReader((e) => events.push(e));
  reader.read({
    type: "system",
    subtype: "init",
    session_id: "s1",
    model: "claude-sonnet-5-5",
    apiKeySource: "none",
    tools: ["Write"],
  });
  reader.read({ type: "system", subtype: "permission_denied", tool_use_id: "t2", tool_name: "Bash", message: "no" });
  reader.read({ type: "assistant", error: "authentication_failed", message: { content: [] } });
  expect(events).toEqual([
    {
      kind: "init",
      sessionId: "s1",
      model: "claude-sonnet-5-5",
      version: "",
      apiKeySource: "none",
      tools: ["Write"],
      skills: [],
      plugins: [],
      mcpServers: [],
    },
    { kind: "permission-denied", id: "t2", name: "Bash", message: "no" },
    { kind: "auth", message: "authentication_failed" },
  ]);
});

test("reads a tool input while it streams (from the spike)", () => {
  const value = 'a "q" \\ b\n<p>é 😀  </p>\t{{ x }}';
  const full = JSON.stringify({ file_path: "/p/pages/index.liquid", content: value });
  let last = "";
  for (let n = 0; n <= full.length; n++) {
    const { fields, done } = parsePartialInput(full.slice(0, n));
    const content = fields.content ?? "";
    expect(content.startsWith(last) || last.startsWith(content)).toBe(true);
    expect(value.startsWith(content)).toBe(true);
    last = content;
    if (n === full.length) {
      expect(fields.file_path).toBe("/p/pages/index.liquid");
      expect(content).toBe(value);
      expect(done.content).toBe(true);
    }
  }
  const escaped = '{"file_path":"/p/a","content":"x\\ud83d\\ude00y\\n';
  expect(parsePartialInput(escaped).fields.content).toBe("x😀y\n");
  expect(parsePartialInput(escaped.slice(0, -9)).fields.content).toBe("x");
  const edit = parsePartialInput('{"file_path":"/p/a","old_string":"foo","new_string":"ba","replace_all":false');
  expect(edit.fields).toEqual({ file_path: "/p/a", old_string: "foo", new_string: "ba" });
  expect(edit.done.new_string).toBe(true);
  expect(parsePartialInput('{"file_path":"/p/a","old_string":"foo","new_string":"ba').done.new_string).toBe(false);
});

test("a tool result's blocks are read line by line, as a look's answer comes with its picture", () => {
  const events: AgentEvent[] = [];
  const reader = new StreamReader((e) => events.push(e));
  reader.read({
    type: "stream_event",
    event: {
      type: "content_block_start",
      index: 0,
      content_block: { type: "tool_use", id: "l1", name: "mcp__upstart__look_at_preview" },
    },
  });
  reader.read({
    type: "user",
    message: {
      content: [
        {
          type: "tool_result",
          tool_use_id: "l1",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/png", data: "" } },
            { type: "text", text: "[Image: source: /tmp/look.png]" },
            { type: "text", text: "Page: / (“Wick”), on a phone (393×852), screen 1 of 1." },
          ],
        },
      ],
    },
  });
  expect(events.at(-1)).toMatchObject({
    kind: "tool-result",
    text: "[Image: source: /tmp/look.png]\nPage: / (“Wick”), on a phone (393×852), screen 1 of 1.",
  });
});
