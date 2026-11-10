import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { applyEvent, type ConversationEvent, type ConversationItem } from "../../shared/conversation";
import { modelChoices, projectNameFrom } from "./agent";
import { findSignInUrl, parseAuthStatus } from "./auth";
import { AgentSession, activityLabel, DENY_MESSAGE, isolationProblem, TOOLS } from "./session";

// A stand-in for the SDK's query(): each message the session sends gets the
// next scripted turn; the test sees the options the session passed.
type Turn = Record<string, unknown>[] | "throw" | "hang";

function fakeQuery(turns: Turn[]) {
  const runs: { options: Record<string, unknown>; calls: unknown[] }[] = [];
  const query = (params: { prompt: AsyncIterable<unknown>; options: Record<string, unknown> }) => {
    const run = { options: params.options, calls: [] as unknown[] };
    runs.push(run);
    let interrupted: (() => void) | undefined;
    async function* messages() {
      for await (const _ of params.prompt) {
        const turn = turns.shift();
        if (!turn || turn === "throw") throw new Error("Claude Code process exited with code 1");
        if (turn === "hang") {
          await new Promise<void>((resolve) => {
            interrupted = resolve;
          });
          yield { type: "result", subtype: "error_during_execution", is_error: true, result: "" };
          continue;
        }
        for (const m of turn) yield m;
      }
    }
    return Object.assign(messages(), {
      interrupt: async () => {
        run.calls.push("interrupt");
        interrupted?.();
      },
      setModel: async (model: string) => void run.calls.push({ model }),
      applyFlagSettings: async (settings: unknown) => void run.calls.push(settings),
      supportedModels: async () => [],
      close: () => run.calls.push("close"),
    });
  };
  return { query: query as never, runs };
}

const init = (sessionId = "s1", tools = TOOLS) => ({
  type: "system",
  subtype: "init",
  session_id: sessionId,
  model: "claude-sonnet-5-5",
  tools,
  mcp_servers: [],
});
const stream = (event: Record<string, unknown>) => ({ type: "stream_event", parent_tool_use_id: null, event });
const writeTurn = (dir: string) => [
  init(),
  stream({ type: "message_start" }),
  stream({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "A bakery site." } }),
  stream({ type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "t1", name: "Write" } }),
  stream({
    type: "content_block_delta",
    index: 1,
    delta: { type: "input_json_delta", partial_json: `{"file_path":"${dir}/pages/ind` },
  }),
  stream({
    type: "content_block_delta",
    index: 1,
    delta: { type: "input_json_delta", partial_json: 'ex.liquid","content":"<h1>' },
  }),
  stream({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: 'Hi</h1>"}' } }),
  stream({ type: "content_block_stop", index: 1 }),
  { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "ok" }] } },
  { type: "result", subtype: "success", is_error: false, result: "Done.", duration_ms: 10 },
];

let dir: string;
let data: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "upstart-project-"));
  data = mkdtempSync(join(tmpdir(), "upstart-data-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(data, { recursive: true, force: true });
});

function session(turns: Turn[]) {
  const fake = fakeQuery(turns);
  const events: ConversationEvent[] = [];
  let items: ConversationItem[] = [];
  let idle: () => void = () => {};
  const s = new AgentSession(
    { id: "p1", name: "Bakery", path: dir, model: "claude-sonnet-5-5", effort: "medium" },
    data,
    { binary: "/bin/claude", env: () => ({ PATH: "/usr/bin" }), readable: [], query: fake.query },
    {
      onConversation: (e) => {
        events.push(e);
        items = applyEvent(items, e);
      },
      onIdle: () => idle(),
    },
  );
  const turnEnd = () =>
    new Promise<void>((resolve) => {
      idle = resolve;
    });
  return { s, fake, events, items: () => items, turnEnd };
}

test("a turn: the maker's message, the agent's words and one line per file it writes", async () => {
  const { s, fake, items, events, turnEnd } = session([writeTurn(dir)]);
  s.start();
  const ended = turnEnd();
  s.send("A bakery in Lyon");
  await ended;

  const options = fake.runs[0]!.options;
  expect(options).toMatchObject({
    cwd: dir,
    model: "claude-sonnet-5-5",
    effort: "medium",
    tools: TOOLS,
    includePartialMessages: true,
    pathToClaudeCodeExecutable: "/bin/claude",
    systemPrompt: { type: "custom", snapshot: false },
  });
  expect(options.resume).toBeUndefined();
  expect(await (options.canUseTool as () => Promise<unknown>)()).toEqual({ behavior: "deny", message: DENY_MESSAGE });

  const [maker, agent] = items();
  expect(maker).toMatchObject({ kind: "maker", text: "A bakery in Lyon" });
  expect(agent).toMatchObject({
    kind: "agent",
    status: "done",
    parts: [
      { kind: "text", text: "A bakery site." },
      { kind: "activity", activity: { label: "Writing pages/index.liquid", state: "done" } },
    ],
  });
  // The line changes when the path is known, not on every piece of the file.
  expect(events.filter((e) => e.type === "activity").map((e) => e.type === "activity" && e.activity.label)).toEqual([
    "Writing a file…",
    "Writing pages/index.liquid",
    "Writing pages/index.liquid",
  ]);
  expect(JSON.parse(readFileSync(join(data, "agent.json"), "utf8"))).toEqual({ sessionId: "s1" });
});

test("the next launch resumes the conversation; starting over forgets it", async () => {
  writeFileSync(join(data, "agent.json"), JSON.stringify({ sessionId: "old" }));
  const { s, fake, items } = session([]);
  s.start();
  expect(fake.runs[0]!.options.resume).toBe("old");
  s.startOver();
  expect(fake.runs[0]!.calls).toContain("close");
  expect(fake.runs[1]!.options.resume).toBeUndefined();
  expect(items().at(-1)).toMatchObject({ kind: "notice" });
});

test("a conversation that cannot be resumed starts afresh with the same message", async () => {
  writeFileSync(join(data, "agent.json"), JSON.stringify({ sessionId: "gone" }));
  const { s, fake, items, turnEnd } = session(["throw", writeTurn(dir)]);
  s.start();
  const ended = turnEnd();
  s.send("A bakery");
  await ended;
  expect(fake.runs).toHaveLength(2);
  expect(fake.runs[1]!.options.resume).toBeUndefined();
  expect(items().filter((i) => i.kind === "maker")).toHaveLength(1);
  expect(items().at(-1)).toMatchObject({ status: "done" });
});

test("stopping a turn, and an agent that stops on its own", async () => {
  const { s, items, turnEnd } = session(["hang", "throw"]);
  s.start();
  let ended = turnEnd();
  s.send("Build it");
  await new Promise((r) => setTimeout(r, 10));
  expect(s.busy).toBe(true);
  await s.stop();
  await ended;
  expect(items().at(-1)).toMatchObject({ kind: "agent", status: "stopped" });

  ended = turnEnd();
  s.send("Again");
  await ended;
  expect(items().at(-1)).toMatchObject({
    kind: "agent",
    status: "failed",
    error: expect.stringMatching(/stopped before/),
  });
  expect(s.problems.join()).toMatch(/exited with code 1/);
});

test("model and effort change while the agent runs", async () => {
  const { s, fake } = session([]);
  s.start();
  await s.setEffort("high");
  await s.setModel("claude-opus-5-5");
  expect(fake.runs[0]!.calls).toEqual([{ effortLevel: "high" }, { model: "claude-opus-5-5" }]);
});

test("an agent that did not start isolated is stopped", async () => {
  const { s, items, turnEnd } = session([
    [
      init("s2", [...TOOLS, "WebFetch"]),
      { type: "result", subtype: "success", is_error: false, result: "", duration_ms: 1 },
    ],
  ]);
  s.start();
  const ended = turnEnd();
  s.send("Hi");
  await ended;
  expect(items().at(-1)).toMatchObject({ status: "failed", error: expect.stringMatching(/isolated/) });
  expect(
    isolationProblem({
      ...init(),
      kind: "init",
      sessionId: "",
      version: "",
      apiKeySource: "",
      skills: [],
      mcpServers: [{ name: "x", status: "ok" }],
      tools: TOOLS,
    } as never),
  ).toMatch(/connectors: x/);
});

test("a sign-in failure says so", async () => {
  let asked = 0;
  const fake = fakeQuery([
    [
      { type: "assistant", error: "authentication_failed", message: { content: [] } },
      { type: "result", subtype: "success", is_error: true, result: "Not logged in", duration_ms: 1 },
    ],
  ]);
  let items: ConversationItem[] = [];
  const s = new AgentSession(
    { id: "p1", name: "B", path: dir, model: "m", effort: "medium" },
    data,
    { binary: "b", env: () => ({}), readable: [], query: fake.query },
    { onConversation: (e) => (items = applyEvent(items, e)), onSignInNeeded: () => asked++ },
  );
  s.send("Hi");
  await new Promise((r) => setTimeout(r, 20));
  expect(asked).toBeGreaterThan(0);
  expect(items.at(-1)).toMatchObject({ status: "failed", error: expect.stringMatching(/not signed in/) });
});

test("activity lines", () => {
  expect(activityLabel("Edit", { file_path: "/p/theme.css" }, "/p")).toBe("Editing theme.css");
  expect(activityLabel("Read", { file_path: "/etc/hosts" }, "/p")).toBe("Reading /etc/hosts");
  expect(activityLabel("Bash", { command: "ls -la\necho" }, "/p")).toBe("Running ls -la");
  expect(activityLabel("Grep", {}, "/p")).toBe("Searching the project");
});

test("models, project names, sign-in output", () => {
  expect(
    modelChoices([
      { value: "default", resolvedModel: "claude-opus-5-5", displayName: "Default", description: "" },
      {
        value: "opus",
        resolvedModel: "claude-opus-5-5",
        displayName: "Opus",
        description: "",
        supportedEffortLevels: ["low", "max"],
      },
      { value: "sonnet", resolvedModel: "claude-sonnet-5-5", displayName: "Sonnet", description: "" },
    ]),
  ).toEqual([
    { id: "claude-opus-5-5", name: "Opus", efforts: ["low", "max"] },
    { id: "claude-sonnet-5-5", name: "Sonnet", efforts: [] },
  ]);
  expect(projectNameFrom("a bakery in Lyon. With a menu page")).toBe("A bakery in Lyon");
  expect(projectNameFrom("   ")).toBe("Untitled website");
  expect(parseAuthStatus('{"loggedIn":true,"authMethod":"claude.ai"}')).toEqual({
    loggedIn: true,
    method: "claude.ai",
  });
  expect(parseAuthStatus("garbage")).toEqual({ loggedIn: false, method: "none" });
  expect(
    findSignInUrl("Browser didn't open? Use the url below to sign in\nhttps://claude.ai/oauth/authorize?x=1\n"),
  ).toBe("https://claude.ai/oauth/authorize?x=1");
});
