import { type AssistantMessageEvent, createModels, type Tool, type ToolCall } from "@earendil-works/pi-ai";
import { afterEach, expect, test, vi } from "vitest";
import { parsePartialInput } from "../partial-input";
import { piModel } from "./models";
import { forVertex, parsePath, vertexProvider } from "./vertex";

const hydrogen = piModel("vertex", "gemini-4-hydrogen")!;

const write: Tool = {
  name: "Write",
  description: "Create or replace a file.",
  parameters: {
    type: "object",
    properties: { file_path: { type: "string" }, content: { type: "string" } },
    required: ["file_path", "content"],
  } as Tool["parameters"],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

test("Vertex is asked for the arguments in pieces, with the path and the text to replace named to come first", () => {
  const payload = {
    model: "gemini-4-hydrogen",
    contents: [
      { role: "user", parts: [{ text: "Bonjour" }] },
      {
        role: "model",
        parts: [
          { functionCall: { name: "Write", args: { file_path: "a.html", content: "<p>" } } },
          { functionCall: { name: "Edit", args: { file_path: "a.html", old_string: "a", new_string: "b" } } },
          { functionCall: { name: "Read", args: { file_path: "a.html" } } },
        ],
      },
    ],
    config: {
      tools: [
        {
          functionDeclarations: [
            {
              name: "Write",
              parametersJsonSchema: {
                type: "object",
                properties: { file_path: { type: "string" }, content: { type: "string" } },
                required: ["file_path", "content"],
              },
            },
            { name: "Read", parametersJsonSchema: { type: "object", properties: { file_path: { type: "string" } } } },
          ],
        },
      ],
      toolConfig: { functionCallingConfig: { mode: "AUTO" } },
    },
  };
  const sent = forVertex(payload) as typeof payload;
  expect(sent.config.tools[0]!.functionDeclarations[0]!.parametersJsonSchema).toEqual({
    type: "object",
    properties: { file_path: { type: "string" }, text: { type: "string" } },
    required: ["file_path", "text"],
  });
  expect(sent.config.tools[0]!.functionDeclarations[1]).toEqual(payload.config.tools[0]!.functionDeclarations[1]);
  expect(sent.config.toolConfig).toEqual({
    functionCallingConfig: { mode: "AUTO", streamFunctionCallArguments: true },
  });
  expect(sent.contents[1]!.parts.map((p) => (p as { functionCall: { args: unknown } }).functionCall.args)).toEqual([
    { file_path: "a.html", text: "<p>" },
    { file_path: "a.html", old_string: "a", replacement: "b" },
    { file_path: "a.html" },
  ]);
  // A request without tools, a web search's, is left as it is.
  expect(forVertex({ config: { tools: [{ googleSearch: {} }] } })).toEqual({
    config: { tools: [{ googleSearch: {} }] },
  });
});

test("a JSON path is read into its keys", () => {
  expect(parsePath("$.content")).toEqual(["content"]);
  expect(parsePath("$.items[2].name")).toEqual(["items", 2, "name"]);
  expect(parsePath("$['a b'].c")).toEqual(["a b", "c"]);
  expect(parsePath("content")).toEqual([]);
});

/** Vertex's answer as server-sent events, one chunk per part, as it sends them. */
function sse(parts: unknown[]) {
  const chunks = [
    ...parts.map((part) => ({ candidates: [{ content: { role: "model", parts: [part] }, index: 0 }] })),
    {
      candidates: [{ content: { role: "model", parts: [{ text: "" }] }, finishReason: "STOP", index: 0 }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
    },
  ];
  return chunks.map((c) => `data: ${JSON.stringify(c)}\r\n\r\n`).join("");
}

/** A reply with a sentence, then two files written, their arguments in pieces (from a real Vertex stream). */
const PARTS = [
  { text: "Je l'écris." },
  { functionCall: { name: "Write", id: "4KyibieX", willContinue: true }, thoughtSignature: "c2ln" },
  {
    functionCall: {
      partialArgs: [{ jsonPath: "$.file_path", stringValue: "hello.html", willContinue: true }],
      willContinue: true,
    },
  },
  { functionCall: { partialArgs: [{ jsonPath: "$.file_path", stringValue: "" }], willContinue: true } },
  {
    functionCall: {
      partialArgs: [{ jsonPath: "$.text", stringValue: '<!DOCTYPE html>\n<p class="a">', willContinue: true }],
      willContinue: true,
    },
  },
  {
    functionCall: {
      partialArgs: [{ jsonPath: "$.text", stringValue: "Bonjour</p>\n", willContinue: true }],
      willContinue: true,
    },
  },
  { functionCall: { partialArgs: [{ jsonPath: "$.text", stringValue: "" }], willContinue: true } },
  { functionCall: {} },
  { functionCall: { name: "Write", id: "w7yRpm1G", willContinue: true } },
  {
    functionCall: {
      partialArgs: [{ jsonPath: "$.file_path", stringValue: "notes.txt" }],
      willContinue: true,
    },
  },
  { functionCall: { partialArgs: [{ jsonPath: "$.text", stringValue: "done\n" }], willContinue: true } },
  { functionCall: {} },
];

async function reply(parts: unknown[]) {
  const requests: { url: string; body: unknown }[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input instanceof Request ? input.url : input), body: JSON.parse(String(init?.body)) });
    return new Response(sse(parts), { status: 200, headers: { "content-type": "text/event-stream" } });
  });
  const models = createModels({ authContext: { env: async () => undefined, fileExists: async () => false } });
  models.setProvider(vertexProvider(() => ({ key: "express-key" }), [hydrogen]));
  const stream = models.streamSimple(
    hydrogen,
    { systemPrompt: "x", messages: [{ role: "user", content: "Bonjour", timestamp: 0 }], tools: [write] },
    { apiKey: "express-key" },
  );
  const events: AssistantMessageEvent[] = [];
  for await (const e of stream) events.push(e);
  return { events, requests, message: await stream.result() };
}

test("a call in pieces reaches the conversation as it grows, the path first, then whole once", async () => {
  const { events, requests, message } = await reply(PARTS);
  expect(message.stopReason).toBe("toolUse");
  const body = requests[0]!.body as { toolConfig?: unknown; tools?: { functionDeclarations: { name: string }[] }[] };
  expect(JSON.stringify(body)).toContain('"streamFunctionCallArguments":true');
  expect(JSON.stringify(body.tools)).toContain('"text"');

  const calls = message.content.filter((b): b is ToolCall => b.type === "toolCall");
  expect(calls.map((c) => [c.id, c.name, c.arguments])).toEqual([
    ["4KyibieX", "Write", { file_path: "hello.html", content: '<!DOCTYPE html>\n<p class="a">Bonjour</p>\n' }],
    ["w7yRpm1G", "Write", { file_path: "notes.txt", content: "done\n" }],
  ]);
  expect(calls[0]!.thoughtSignature).toBe("c2ln");
  expect(message.content[0]).toMatchObject({ type: "text", text: "Je l'écris." });

  // Each call starts once and ends once, at its place in the reply.
  const at = (type: string) =>
    events.filter((e) => e.type === type).map((e) => (e as { contentIndex: number }).contentIndex);
  expect(at("toolcall_start")).toEqual([1, 2]);
  expect(at("toolcall_end")).toEqual([1, 2]);
  const start = events.find((e) => e.type === "toolcall_start")!;
  expect(start.type === "toolcall_start" && start.partial.content[1]).toMatchObject({ id: "4KyibieX", name: "Write" });

  // The deltas make one JSON text that only grows, the path complete before the page's text comes.
  const deltas = events.filter((e) => e.type === "toolcall_delta" && e.contentIndex === 1);
  expect(deltas.length).toBeGreaterThan(2);
  let json = "";
  const seen: ReturnType<typeof parsePartialInput>[] = [];
  for (const d of deltas) {
    json += d.type === "toolcall_delta" ? d.delta : "";
    seen.push(parsePartialInput(json));
  }
  const firstText = seen.findIndex((s) => s.fields.content !== undefined);
  expect(seen[firstText]!.done.file_path).toBe(true);
  expect(seen[firstText]!.fields.file_path).toBe("hello.html");
  expect(seen.at(-1)!.fields.content).toBe('<!DOCTYPE html>\n<p class="a">Bonjour</p>\n');
  expect(JSON.parse(json)).toEqual(calls[0]!.arguments);
});

test("a call Vertex sends whole is read as before, with Spaka's names", async () => {
  const { message, events } = await reply([
    { functionCall: { name: "Write", id: "x", args: { file_path: "a.txt", text: "hi" } } },
  ]);
  expect(message.content[0]).toMatchObject({
    type: "toolCall",
    id: "x",
    name: "Write",
    arguments: { file_path: "a.txt", content: "hi" },
  });
  expect(events.filter((e) => e.type === "toolcall_start")).toHaveLength(1);
});

// With the maker's Google Cloud sign-in made with gcloud, when asked:
// SPAKA_REAL_VERTEX_PROJECT=<project> (gcloud auth application-default login first).
const project = process.env.SPAKA_REAL_VERTEX_PROJECT;
test.skipIf(!project)(
  "a real page streams from Vertex on gcloud's sign-in, its path known before its text",
  async () => {
    const models = createModels({ authContext: { env: async () => undefined, fileExists: async () => false } });
    models.setProvider(vertexProvider(() => ({ project: project!, location: "global" }), [hydrogen]));
    const started = Date.now();
    const stream = models.streamSimple(
      hydrogen,
      {
        systemPrompt: "Write files with the Write tool, never in your reply.",
        messages: [
          {
            role: "user",
            content: "Write pages/index.html: a florist's one-page site in French, about 60 lines.",
            timestamp: 0,
          },
        ],
        tools: [write],
      },
      { apiKey: "<application-default-credentials>", reasoning: "low" },
    );
    let json = "";
    let pathAt: number | undefined;
    let textAt: number | undefined;
    let deltas = 0;
    for await (const e of stream) {
      if (e.type !== "toolcall_delta") continue;
      deltas++;
      json += e.delta;
      const { fields, done } = parsePartialInput(json);
      if (done.file_path) pathAt ??= Date.now() - started;
      if (fields.content) textAt ??= Date.now() - started;
    }
    const message = await stream.result();
    const call = message.content.find((b): b is ToolCall => b.type === "toolCall");
    process.stdout.write(
      `[vertex] path at ${pathAt} ms, text at ${textAt} ms, ${deltas} deltas, done at ${Date.now() - started} ms, ${String(call?.arguments.content ?? "").length} chars\n`,
    );
    expect(message.stopReason, message.errorMessage).toBe("toolUse");
    expect(call?.arguments.file_path).toMatch(/index\.html$/);
    expect(pathAt).toBeLessThan(textAt!);
    expect(deltas).toBeGreaterThan(5);
  },
  120_000,
);
