import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { applyEvent, type ConversationEvent, type ConversationItem } from "../../shared/conversation";
import { Skills } from "../skills/skills";
import { activityDetail, activityLabel } from "./activity";
import { modelChoices, projectNameFrom } from "./agent";
import { findSignInUrl, parseAuthStatus } from "./auth";
import { instructionsFor, UPSTART_INSTRUCTIONS } from "./instructions";
import { ASK_TOOL, NOT_ANSWERED, PLAN_INSTRUCTIONS, PLAN_REFUSED, PLAN_TOOL } from "./questions";
import { AgentSession, DENY_MESSAGE, isolationProblem, type SessionDeps, TOOLS } from "./session";

// A stand-in for the SDK's query(): each message the session sends gets the
// next scripted turn; the test sees the options the session passed.
type Turn = Record<string, unknown>[] | "throw" | "hang";

function fakeQuery(turns: Turn[]) {
  const runs: { options: Record<string, unknown>; calls: unknown[]; abort?: () => void }[] = [];
  const query = (params: { prompt: AsyncIterable<unknown>; options: Record<string, unknown> }) => {
    const run: (typeof runs)[number] = { options: params.options, calls: [] as unknown[] };
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
        for (const m of turn) {
          // The binary asking the app, as for AskUserQuestion: the stream waits for the answer.
          if (m.type === "ask") {
            const controller = new AbortController();
            run.abort = () => controller.abort();
            const can = params.options.canUseTool as (n: string, i: unknown, o: unknown) => Promise<unknown>;
            run.calls.push({ permission: await can(String(m.name), m.input, { signal: controller.signal }) });
            continue;
          }
          yield m;
        }
      }
    }
    return Object.assign(messages(), {
      interrupt: async () => {
        run.calls.push("interrupt");
        interrupted?.();
        run.abort?.();
      },
      setModel: async (model: string) => void run.calls.push({ model }),
      applyFlagSettings: async (settings: unknown) => void run.calls.push(settings),
      setPermissionMode: async (mode: string) => void run.calls.push({ permissionMode: mode }),
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

function session(turns: Turn[], extra: Partial<SessionDeps> = {}, mode?: "plan") {
  const fake = fakeQuery(turns);
  const events: ConversationEvent[] = [];
  let items: ConversationItem[] = [];
  let idle: () => void = () => {};
  const s = new AgentSession(
    { id: "p1", name: "Bakery", path: dir, model: "claude-sonnet-5-5", effort: "medium", ...(mode ? { mode } : {}) },
    data,
    { binary: "/bin/claude", env: () => ({ PATH: "/usr/bin" }), readable: [], query: fake.query, ...extra },
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
  const can = options.canUseTool as (name: string, input: unknown, o: { signal: AbortSignal }) => Promise<unknown>;
  expect(await can("Bash", {}, { signal: new AbortController().signal })).toEqual({
    behavior: "deny",
    message: DENY_MESSAGE,
  });

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
      init("s2", [...TOOLS, "NotebookEdit"]),
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
  expect(activityLabel("Write", { file_path: "/data/agent/plans/a-bakery-calm-otter.md" }, "/p")).toBe(
    "Writing the plan",
  );
  expect(activityLabel("Bash", { command: "ls -la\necho" }, "/p")).toBe("Running ls -la");
  expect(activityLabel("Skill", { skill: "project:menu-format" }, "/p")).toBe("Following the skill menu-format");
  expect(activityLabel("Grep", {}, "/p")).toBe("Searching the project");
  expect(activityLabel("WebSearch", { query: "horaires" }, "/p")).toBe("Searching the web");
  expect(activityLabel("WebFetch", { url: "https://www.nantes.fr/jardin" }, "/p")).toBe("Reading a page of nantes.fr");
  expect(activityDetail("WebSearch", { query: "horaires du jardin" })).toBe("horaires du jardin");
  expect(activityLabel("mcp__upstart__find_blocks", { sections: [] }, "/p")).toBe("Looking for blocks in the gallery");
  expect(activityLabel("mcp__upstart__use_block", { page: "pages/index.liquid" }, "/p")).toBe(
    "Placing blocks on pages/index.liquid",
  );
  expect(activityLabel("mcp__upstart__use_image", { name: "bouquet" }, "/p")).toBe("Adding the image bouquet");
});

test("the detailed output style's details: what was run or searched", () => {
  expect(activityDetail("Bash", { command: "ls -la parts", description: "List the parts" })).toBe("ls -la parts");
  expect(activityDetail("Grep", { pattern: "hero", glob: "*.liquid" })).toBe("hero in *.liquid");
  expect(activityDetail("Glob", { pattern: "pages/**" })).toBe("pages/**");
  expect(activityDetail("Write", { file_path: "/p/a.liquid", content: "x" })).toBeUndefined();
  expect(activityDetail("mcp__notes__search", { query: "menu" })).toBe('{"query":"menu"}');
  expect(
    activityDetail("mcp__upstart__find_blocks", {
      sections: [{ query: "a hero" }, { kind: "faq", query: "questions" }],
    }),
  ).toBe("a hero; questions");
  expect(activityDetail("Bash", { command: "x".repeat(500) })?.length).toBe(400);
});

test("the reply style is added to the instructions, and says the website does not change", async () => {
  expect(instructionsFor("short").startsWith(UPSTART_INSTRUCTIONS)).toBe(true);
  expect(instructionsFor("teaching")).toContain("how they could do it themselves");
  expect(instructionsFor("explained")).toContain("the website is written the same way");
  const { s, fake } = session([], { instructions: () => instructionsFor("teaching") });
  s.start();
  expect((fake.runs[0]!.options.systemPrompt as { prompt: string }).prompt).toBe(instructionsFor("teaching"));
});

test("thinking is kept apart from the words, and why a step failed is kept with it", () => {
  let items: ConversationItem[] = [];
  const events: ConversationEvent[] = [
    { type: "turn-start", id: "t", text: "Hi", at: 0 },
    { type: "thinking", text: "A warm " },
    { type: "thinking", text: "palette." },
    { type: "text", text: "Building." },
    {
      type: "activity",
      activity: { id: "a", label: "Running ls", state: "failed", detail: "ls", error: "No such file" },
    },
    { type: "turn-end", status: "done" },
  ];
  for (const e of events) items = applyEvent(items, e);
  expect(items[1]).toMatchObject({
    parts: [
      { kind: "thinking", text: "A warm palette." },
      { kind: "text", text: "Building." },
      { kind: "activity", activity: { detail: "ls", error: "No such file" } },
    ],
  });
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
    { id: "claude-opus-5-5", name: "Opus", efforts: ["low", "max"], account: "claude" },
    { id: "claude-sonnet-5-5", name: "Sonnet", efforts: [], account: "claude" },
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

test("the agent can be told more than the maker typed", async () => {
  const pushed: unknown[] = [];
  const query = (params: { prompt: AsyncIterable<{ message: { content: string } }> }) => {
    void (async () => {
      for await (const m of params.prompt) pushed.push(m.message.content);
    })();
    return Object.assign((async function* () {})(), { close() {}, interrupt: async () => {} });
  };
  let items: ConversationItem[] = [];
  const s = new AgentSession(
    { id: "p1", name: "B", path: dir, model: "m", effort: "medium" },
    data,
    { binary: "b", env: () => ({}), readable: [], query: query as never },
    { onConversation: (e) => (items = applyEvent(items, e)) },
  );
  s.send("Make it blue", "[Upstart: went back]\n\nMake it blue");
  await new Promise((r) => setTimeout(r, 10));
  expect(pushed).toEqual(["[Upstart: went back]\n\nMake it blue"]);
  expect(items[0]).toMatchObject({ kind: "maker", text: "Make it blue" });
});

test("the agent gets Upstart's skills only, read-only, and starts again when they change", async () => {
  const bundled = join(data, "bundled", "upstart-help");
  mkdirSync(bundled, { recursive: true });
  writeFileSync(join(bundled, "SKILL.md"), "---\nname: upstart-help\ndescription: Help.\n---\n");
  const skills = new Skills(join(data, "bundled"), join(data, "app"));
  const { s, fake, turnEnd } = session(
    [[init("s1", [...TOOLS, "Skill"]), ...writeTurn(dir).slice(1)], writeTurn(dir)],
    {
      skills,
    },
  );
  s.start();
  const assembled = realpathSync(join(data, "skills"));
  // biome-ignore lint/suspicious/noExplicitAny: options as the kit receives them
  const options = fake.runs[0]!.options as Record<string, any>;
  expect(options.tools).toEqual([...TOOLS, "Skill"]);
  expect(options.skills).toEqual(["upstart:upstart-help"]);
  expect(options.plugins).toEqual([{ type: "local", path: join(assembled, "upstart"), skipMcpDiscovery: true }]);
  expect(options.additionalDirectories).toContain(assembled);
  expect(options.settings.permissions.deny).toEqual([`Edit(/${assembled}/**)`]);
  expect(options.settings.sandbox.filesystem.denyWrite).toEqual([assembled]);
  let ended = turnEnd();
  s.send("First");
  await ended;
  expect(s.problems).toEqual([]);

  // The agent wrote a skill into the project: the next message starts it again, resuming.
  const own = join(dir, ".upstart/skills/menu-format");
  mkdirSync(own, { recursive: true });
  writeFileSync(join(own, "SKILL.md"), "---\nname: menu-format\ndescription: Menus.\n---\n");
  ended = turnEnd();
  s.send("Second");
  await ended;
  expect(fake.runs).toHaveLength(2);
  expect(fake.runs[1]!.options.resume).toBe("s1");
  expect(fake.runs[1]!.options.skills).toEqual(["upstart:upstart-help", "project:menu-format"]);
});

test("a plugin Upstart did not assemble is an isolation problem", () => {
  const base = { kind: "init", sessionId: "", model: "", version: "", apiKeySource: "", skills: [], mcpServers: [] };
  expect(
    isolationProblem({ ...base, tools: TOOLS, plugins: [{ name: "cc-plugin-privacy", path: "builtin" }] } as never),
  ).toBeUndefined();
  expect(isolationProblem({ ...base, tools: TOOLS, plugins: [{ name: "x", path: "/somewhere" }] } as never)).toMatch(
    /plugins: x/,
  );
  expect(isolationProblem({ ...base, tools: [...TOOLS, "Skill"], plugins: [] } as never)).toMatch(/tools: Skill/);
});

test("the maker's connectors that are on reach the agent, and a change starts it again at the next message", async () => {
  let servers: Record<string, unknown> = { docs: { type: "http", url: "https://mcp.example.com/mcp" } };
  const connectorServers = { servers: () => servers, fingerprint: () => JSON.stringify(servers) };
  const docsInit = {
    ...init("s1"),
    tools: [...TOOLS, "mcp__docs__search"],
    mcp_servers: [{ name: "docs", status: "connected" }],
  };
  const { s, fake, turnEnd } = session([[docsInit, ...writeTurn(dir).slice(1)], writeTurn(dir)], {
    connectorServers,
    extraOptions: () => ({ mcpServers: { upstart: { type: "sdk" } } }),
    connectors: ["upstart"],
  });
  s.start();
  expect(Object.keys(fake.runs[0]!.options.mcpServers as object).sort()).toEqual(["docs", "upstart"]);
  let ended = turnEnd();
  s.send("First");
  await ended;
  // The connector's tools are not an isolation problem: Upstart gave them.
  expect(s.problems).toEqual([]);
  servers = {};
  ended = turnEnd();
  s.send("Second");
  await ended;
  expect(fake.runs).toHaveLength(2);
  expect(Object.keys(fake.runs[1]!.options.mcpServers as object)).toEqual(["upstart"]);
});

const asked = {
  questions: [
    {
      question: "Which mood for the bakery?",
      header: "Mood",
      options: [
        { label: "Warm (Recommended)", description: "Cream and brown" },
        { label: "Fresh", description: "White and mint" },
      ],
      multiSelect: false,
    },
  ],
};
/** A turn whose agent asks the maker, then ends. */
const askTurn = (input: unknown = asked) => [
  init(),
  stream({ type: "message_start" }),
  stream({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "q1", name: ASK_TOOL } }),
  stream({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{}" } }),
  stream({ type: "content_block_stop", index: 0 }),
  { type: "ask", name: ASK_TOOL, input },
  { type: "result", subtype: "success", is_error: false, result: "Done.", duration_ms: 10 },
];

const questionCard = (items: ConversationItem[]) => {
  const last = items.at(-1);
  const part = last?.kind === "agent" ? last.parts.find((p) => p.kind === "question") : undefined;
  return part?.kind === "question" ? part.card : undefined;
};

test("a question waits for the maker, then the agent gets the answer and what was changed meanwhile", async () => {
  const { s, fake, items, turnEnd } = session([askTurn()]);
  s.start();
  const ended = turnEnd();
  s.send("A bakery");
  await vi.waitFor(() => expect(questionCard(items())?.state).toBe("waiting"));
  // No activity line: the question is a card of its own (Q284).
  expect(items().at(-1)).toMatchObject({ parts: [{ kind: "question" }] });
  expect(s.busy).toBe(true);

  const card = questionCard(items())!;
  s.answer("not-a-card", { kind: "skipped" });
  s.answer(card.id, { kind: "choices", answers: { "Which mood for the bakery?": "Warm (Recommended)" } }, "Edited: x");
  await ended;
  expect(fake.runs[0]!.calls).toContainEqual({
    permission: {
      behavior: "allow",
      updatedInput: { ...asked, answers: { "Which mood for the bakery?": "Warm (Recommended)" } },
    },
  });
  expect(questionCard(items())).toMatchObject({ state: "answered", answer: { kind: "choices" } });

  // The hand edits made while it waited reach the agent with the answer, once (Q294).
  // biome-ignore lint/suspicious/noExplicitAny: hooks as the kit receives them
  const after = (fake.runs[0]!.options.hooks as any).PostToolUse as { matcher?: string; hooks: (() => unknown)[] }[];
  const hook = after.find((h) => h.matcher?.split("|").includes(ASK_TOOL))!.hooks[0]!;
  expect(await hook()).toEqual({
    hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: "Edited: x" },
  });
  expect(await hook()).toEqual({ continue: true });
});

test("the maker's own words and Skip reach the agent as such", async () => {
  const { s, fake, items, turnEnd } = session([askTurn(), askTurn()]);
  s.start();
  let ended = turnEnd();
  s.send("A bakery");
  await vi.waitFor(() => expect(questionCard(items())?.state).toBe("waiting"));
  s.answer(questionCard(items())!.id, { kind: "words", text: "Something like a farmhouse" });
  await ended;
  expect(fake.runs[0]!.calls).toContainEqual({
    permission: { behavior: "allow", updatedInput: { ...asked, answers: {}, response: "Something like a farmhouse" } },
  });

  ended = turnEnd();
  s.send("Again");
  await vi.waitFor(() => expect(questionCard(items())?.state).toBe("waiting"));
  s.answer(questionCard(items())!.id, { kind: "skipped" });
  await ended;
  expect(questionCard(items())).toMatchObject({ state: "skipped" });
  expect(fake.runs[0]!.calls).toContainEqual({
    permission: {
      behavior: "allow",
      updatedInput: {
        ...asked,
        answers: {},
        annotations: { "Which mood for the bakery?": { unanswered: "skipped" } },
      },
    },
  });
});

test("stopping the turn while a question waits leaves it unanswered", async () => {
  const { s, fake, items, turnEnd } = session([askTurn()]);
  s.start();
  const ended = turnEnd();
  s.send("A bakery");
  await vi.waitFor(() => expect(questionCard(items())?.state).toBe("waiting"));
  await s.stop();
  await ended;
  expect(fake.runs[0]!.calls).toContainEqual({ permission: { behavior: "deny", message: NOT_ANSWERED } });
  expect(items().at(-1)).toMatchObject({ status: "stopped" });
  expect(questionCard(items())).toMatchObject({ state: "unanswered" });
});

test("questions without AskUserQuestion's form are refused, as is any other ask", async () => {
  const { s, fake, items, turnEnd } = session([askTurn({ questions: [{ question: "Mood?", options: [] }] })]);
  s.start();
  const ended = turnEnd();
  s.send("A bakery");
  await ended;
  expect(fake.runs[0]!.calls).toContainEqual({
    permission: { behavior: "deny", message: expect.stringMatching(/AskUserQuestion's form/) },
  });
  expect(questionCard(items())).toBeUndefined();
});

const planCard = (items: ConversationItem[], index = -1) => {
  const last = items.at(-1);
  const plans = last?.kind === "agent" ? last.parts.filter((p) => p.kind === "plan") : [];
  const part = plans.at(index);
  return part?.kind === "plan" ? part.card : undefined;
};
/** A turn in plan mode: the agent reads, tries to write, then hands in a plan twice. */
const planTurn = () => [
  init(),
  { type: "ask", name: "mcp__upstart__find_blocks", input: { sections: [] } },
  { type: "ask", name: "mcp__upstart__use_block", input: {} },
  { type: "ask", name: "Write", input: { file_path: `${dir}/pages/index.liquid`, content: "x" } },
  { type: "ask", name: PLAN_TOOL, input: { plan: "## Pages\n- Home" } },
  { type: "ask", name: PLAN_TOOL, input: { plan: "## Pages\n- Home\n- Weddings" } },
  { type: "ask", name: "mcp__upstart__use_block", input: { page: "pages/index.liquid" } },
  { type: "result", subtype: "success", is_error: false, result: "Built.", duration_ms: 10 },
];

test("plan mode: the agent reads, writes nothing, hands in a plan; changes, then Build lets it build in the same turn", async () => {
  const { s, fake, items, turnEnd } = session([planTurn()], {}, "plan");
  s.start();
  const options = fake.runs[0]!.options;
  expect(options).toMatchObject({ permissionMode: "plan", planModeInstructions: PLAN_INSTRUCTIONS });
  expect(options.tools).toContain(PLAN_TOOL);
  const ended = turnEnd();
  s.send("A bakery, plan first");
  await vi.waitFor(() => expect(planCard(items())?.state).toBe("proposed"));
  const calls = fake.runs[0]!.calls;
  expect(calls.slice(0, 3)).toEqual([
    { permission: { behavior: "allow", updatedInput: { sections: [] } } },
    { permission: { behavior: "deny", message: PLAN_REFUSED } },
    { permission: { behavior: "deny", message: PLAN_REFUSED } },
  ]);
  // Editing by hand comes back while the plan waits (Q294).
  expect(s.busy).toBe(true);

  s.settlePlan(planCard(items())!.id, { changes: "Add a page for weddings" }, "[Upstart: edited]");
  await vi.waitFor(() => expect(planCard(items(), 1)?.state).toBe("proposed"));
  expect(planCard(items(), 0)).toMatchObject({ state: "replaced", changes: "Add a page for weddings" });
  expect(calls[3]).toEqual({
    permission: { behavior: "deny", message: expect.stringContaining("Add a page for weddings") },
  });
  expect((calls[3] as { permission: { message: string } }).permission.message).toContain("[Upstart: edited]");

  s.settlePlan(planCard(items())!.id, { approved: true });
  await ended;
  expect(planCard(items())).toMatchObject({ state: "approved", text: "## Pages\n- Home\n- Weddings" });
  expect(calls).toContainEqual({ permissionMode: "acceptEdits" });
  // Back in build mode: what plan mode let through is no longer canUseTool's to grant.
  expect(calls.at(-1)).toEqual({ permission: { behavior: "deny", message: DENY_MESSAGE } });
});

test("the Build / Plan selector changes the agent's mode for the next message; outside plan mode a plan is refused", async () => {
  const { s, fake, turnEnd } = session([
    [init(), { type: "ask", name: PLAN_TOOL, input: { plan: "x" } }, writeTurn(dir).at(-1)!],
  ]);
  s.start();
  expect(fake.runs[0]!.options.permissionMode).toBe("acceptEdits");
  const ended = turnEnd();
  s.send("Hi");
  await ended;
  expect(fake.runs[0]!.calls[0]).toEqual({
    permission: { behavior: "deny", message: "Not in plan mode: do what the maker asked." },
  });
  await s.setMode("plan");
  await s.setMode("plan");
  expect(fake.runs[0]!.calls.filter((c) => typeof c === "object" && c && "permissionMode" in c)).toEqual([
    { permissionMode: "plan" },
  ]);
});

test("in plan mode the hooks that grant what the agent asks for stand aside", async () => {
  const granted = { hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "allow" } } };
  const { s, fake } = session(
    [],
    { extraOptions: () => ({ hooks: { PermissionRequest: [{ hooks: [async () => granted] }] } }) },
    "plan",
  );
  s.start();
  // biome-ignore lint/suspicious/noExplicitAny: hooks as the kit receives them
  const hook = (fake.runs[0]!.options.hooks as any).PermissionRequest[0].hooks[0] as () => Promise<unknown>;
  expect(await hook()).toEqual({ continue: true });
  await s.setMode("build");
  expect(await hook()).toEqual(granted);
});
