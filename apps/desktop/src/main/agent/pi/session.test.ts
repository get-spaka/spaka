import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  type Models,
} from "@earendil-works/pi-ai";
import { afterEach, beforeEach, expect, test } from "vitest";
import { applyEvent, type ConversationEvent, type ConversationItem } from "../../../shared/conversation";
import type { ProjectInfo } from "../../../shared/ipc";
import { FileTap } from "../../live/tap";
import type { SpakaTools } from "../spaka-tools";
import type { AgentEvent } from "../stream";
import type { TurnChecks } from "../turn-checks";
import { VaultSignIns } from "./connectors";
import { STDIO_SERVER } from "./mcp-test-server";
import { PiRecorder, piReplay, piReplayed } from "./replay";
import { type PiDeps, PiSession } from "./session";

let dir: string;
let project: ProjectInfo;
let dataDir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "spaka-pi-"));
  project = { id: "p1", name: "Fleur", path: join(dir, "site"), model: "openai/gpt-6.1-terra", effort: "medium" };
  dataDir = join(dir, "data");
  for (const d of [project.path, dataDir]) mkdirSync(d, { recursive: true });
});
// Windows lets a folder go only once the programs started in it (a connector)
// have let it go, which the connector's closing does not wait for: there the
// temporary folder may stay behind.
afterEach(() => {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (error) {
    if (process.platform !== "win32") throw error;
  }
});

/** A faux OpenAI that answers with the replies given, one per request. */
function faux(provider = "openai", models = [{ id: "gpt-6.1-terra", reasoning: true }]) {
  const f = fauxProvider({ provider, models });
  const collection = createModels({
    authContext: { env: async () => undefined, fileExists: async () => false },
  });
  collection.setProvider(f.provider);
  return { f, models: collection };
}

const noTools: SpakaTools = {
  look: async () => ({ route: "/", errors: [], notes: [] }),
  findBlocks: () => [],
  findImages: async () => "",
  useImage: async () => "",
  useBlocks: () => "",
  choosePages: async () => "",
  addPackage: async () => "",
  removePackage: async () => "",
  askSecret: async () => "",
};

function checks(over: Partial<Pick<TurnChecks, "afterTool" | "beforeStop">> = {}) {
  return {
    placed: () => {},
    afterTool: over.afterTool ?? (() => undefined),
    beforeStop: over.beforeStop ?? (() => undefined),
  } as unknown as TurnChecks;
}

function session(
  models: Models,
  over: Partial<PiDeps> = {},
  onAgentEvent?: (e: AgentEvent) => void,
  onSignInNeeded?: () => void,
) {
  let items: ConversationItem[] = [];
  const events: ConversationEvent[] = [];
  let ended: (() => void) | undefined;
  const s = new PiSession(
    project,
    dataDir,
    {
      models,
      apiKey: () => "test-key",
      kit: () => ({ tools: noTools, checks: checks() }),
      instructions: (family) => `Spaka's instructions for ${family}.`,
      env: () => ({}),
      readable: [],
      shell: false,
      ...over,
    },
    {
      onConversation: (e) => {
        events.push(e);
        items = applyEvent(items, e);
        if (e.type === "turn-end") ended?.();
      },
      onAgentEvent,
      onSignInNeeded,
    },
  );
  const turn = (text: string) =>
    new Promise<void>((resolve) => {
      ended = resolve;
      s.send(text);
    });
  return { s, turn, events, items: () => items };
}

test("a turn: the agent's words, one line per file it writes, the file on the disk, and the preview following it as it grows", async () => {
  const { f, models } = faux();
  const content = `<h1>Fleur de Loire</h1>\n${"<p>Bouquets du jour</p>\n".repeat(20)}`;
  f.setResponses([
    fauxAssistantMessage(
      [fauxText("Je construis le site."), fauxToolCall("Write", { file_path: "pages/index.liquid", content })],
      {
        stopReason: "toolUse",
      },
    ),
    fauxAssistantMessage([fauxText("Voilà votre site.")]),
  ]);
  const shown: string[] = [];
  const tap = new FileTap({
    root: project.path,
    read: () => undefined,
    set: (_rel, c) => c !== undefined && shown.push(c),
    changed: () => {},
    follow: () => {},
  });
  const { turn, events, items } = session(models, {}, (e) => tap.handle(e));
  await turn("Un site pour mon fleuriste");
  expect(readFileSync(join(project.path, "pages/index.liquid"), "utf8")).toBe(content);
  // The page grew in the preview before the tool wrote it.
  expect(shown.length).toBeGreaterThan(2);
  for (const piece of shown) expect(content.startsWith(piece)).toBe(true);
  const activities = events
    .filter((e) => e.type === "activity")
    .map((e) => e.type === "activity" && `${e.activity.label} ${e.activity.state}`);
  expect(activities).toContain("Writing pages/index.liquid running");
  expect(activities.at(-1)).toBe("Writing pages/index.liquid done");
  expect(events.at(-1)).toEqual({ type: "turn-end", status: "done" });
  expect(JSON.stringify(items())).toContain("Voilà votre site.");
});

test("its memory is kept between launches, without the instructions; starting over forgets it", async () => {
  const { f, models } = faux();
  f.setResponses([fauxAssistantMessage([fauxText("Bonjour.")])]);
  const first = session(models);
  await first.turn("Bonjour");
  first.s.close();
  const saved = JSON.parse(readFileSync(join(dataDir, "pi-session.json"), "utf8"));
  expect(saved.messages.map((m: { role: string }) => m.role)).toEqual(["user", "assistant"]);
  let seen: unknown[] = [];
  f.setResponses([
    (context) => {
      seen = context.messages;
      return fauxAssistantMessage([fauxText("Re-bonjour.")]);
    },
  ]);
  const second = session(models);
  await second.turn("Encore moi");
  expect(JSON.stringify(seen)).toContain("Bonjour.");
  expect(JSON.stringify(seen)).toContain("Spaka's instructions for openai.");
  second.s.startOver();
  expect(existsSync(join(dataDir, "pi-session.json"))).toBe(false);
});

test("the checks: a note after a tool joins its answer; what it left behind sends it back to work once", async () => {
  const { f, models } = faux();
  const requests: string[] = [];
  const record = (reply: ReturnType<typeof fauxAssistantMessage>) => (context: { messages: unknown[] }) => {
    requests.push(JSON.stringify(context.messages.at(-1)));
    return reply;
  };
  f.setResponses([
    record(
      fauxAssistantMessage([fauxToolCall("Write", { file_path: "data/events/a.md", content: "x" })], {
        stopReason: "toolUse",
      }),
    ),
    record(fauxAssistantMessage([fauxText("Fini.")])),
    record(fauxAssistantMessage([fauxText("Corrigé.")])),
  ]);
  const stops: boolean[] = [];
  const { turn, events } = session(models, {
    kit: () => ({
      tools: noTools,
      checks: checks({
        afterTool: (tool) => (tool === "Write" ? "Spaka could not use what you just wrote." : undefined),
        beforeStop: async (again) => {
          stops.push(again);
          return again ? undefined : "You left sample records.";
        },
      }),
    }),
  });
  await turn("Ajoute un évènement");
  expect(requests[1]).toContain("Spaka could not use what you just wrote.");
  expect(requests[2]).toContain("You left sample records.");
  expect(stops).toEqual([false, true]);
  expect(events.at(-1)).toEqual({ type: "turn-end", status: "done" });
});

test("a failure ends the turn and says so; a refused key asks to sign in again", async () => {
  const { f, models } = faux();
  f.setResponses([]);
  const failing = session(models);
  await failing.turn("Bonjour");
  expect(failing.events.at(-1)).toMatchObject({ type: "turn-end", status: "failed" });
  expect(failing.s.problems.join("\n")).toMatch(/faux/);
  f.setResponses([
    fauxAssistantMessage([], { stopReason: "error", errorMessage: "401 Unauthorized: invalid api key" }),
  ]);
  let asked = false;
  const refused = session(models, { apiKey: () => "bad" }, undefined, () => {
    asked = true;
  });
  await refused.turn("Bonjour");
  expect(refused.events.at(-1)).toMatchObject({
    type: "turn-end",
    status: "failed",
    error: expect.stringMatching(/could not reach its account/),
  });
  expect(asked).toBe(true);
});

test("Gemini gets Append and the long-file instructions; a file written in parts reaches the preview part by part", async () => {
  project = { ...project, model: "gemini/gemini-4-hydrogen" };
  const { f, models } = faux("google", [{ id: "gemini-4-hydrogen", reasoning: true }]);
  const parts = ["<header>Fleur</header>\n", "<section>Bouquets</section>\n", "<footer>Nantes</footer>\n"];
  let tools: string[] = [];
  let prompt = "";
  f.setResponses([
    (context) => {
      tools = (context.messages[0] as { toolsAdded?: { name: string }[] }).toolsAdded?.map((t) => t.name) ?? [];
      prompt = JSON.stringify(context.messages[0]);
      return fauxAssistantMessage(
        [
          fauxToolCall("Write", { file_path: "pages/index.liquid", content: parts[0]! }),
          fauxToolCall("Append", { file_path: "pages/index.liquid", content: parts[1]! }),
          fauxToolCall("Append", { file_path: "pages/index.liquid", content: parts[2]! }),
        ],
        { stopReason: "toolUse" },
      );
    },
    fauxAssistantMessage([fauxText("Voilà.")]),
  ]);
  const shown = new Map<string, string>();
  const tap = new FileTap({
    root: project.path,
    read: (rel) => shown.get(rel),
    set: (rel, c) => (c === undefined ? shown.delete(rel) : shown.set(rel, c)),
    changed: () => {},
    follow: () => {},
  });
  const seen: string[] = [];
  const { turn } = session(models, { instructions: (family) => `for ${family}` }, (e) => {
    tap.handle(e);
    const now = shown.get("pages/index.liquid");
    if (now && now !== seen.at(-1)) seen.push(now);
  });
  await turn("Un site");
  expect(tools).toContain("Append");
  expect(prompt).toContain("for gemini");
  expect(readFileSync(join(project.path, "pages/index.liquid"), "utf8")).toBe(parts.join(""));
  expect(seen.at(-1)).toBe(parts.join(""));
  expect(seen).toContain(parts[0]);
});

test("the harness's models for the accounts connected, with the efforts each accepts", async () => {
  const { piChoices } = await import("../agent");
  const choices = piChoices(["gemini", "chatgpt"]);
  expect(choices.map((c) => c.id)).toEqual([
    "chatgpt/gpt-6.1-terra",
    "chatgpt/gpt-6.1-sol",
    "chatgpt/gpt-6.2-sol",
    "chatgpt/gpt-6.2-astra",
    "gemini/gemini-4-hydrogen",
    "gemini/gemini-4-carbon",
    "gemini/gemini-4-neon",
    "gemini/gemini-3.8-flash",
  ]);
  expect(choices[0]).toMatchObject({ name: "GPT-6.1 Terra", account: "chatgpt" });
  // From Pi's own catalog since 1.6.0: Hydrogen also thinks at xhigh, Carbon does not.
  expect(choices.find((c) => c.id === "gemini/gemini-4-hydrogen")?.efforts).toEqual(["low", "medium", "high", "xhigh"]);
  expect(choices.find((c) => c.id === "gemini/gemini-4-carbon")?.efforts).toEqual(["low", "medium", "high"]);
});

test("every model of models.json is one pi-ai can call: its own, or declared like one of its own", async () => {
  const { PI_MODELS, piModel } = await import("./models");
  for (const m of PI_MODELS) {
    const model = piModel(m.account, m.id);
    expect(model, `${m.account}/${m.id}`).toMatchObject({ id: m.id, name: m.name });
  }
  // A declared one has its own prices, and the API of the one it is like.
  expect(piModel("openai", "gpt-6.2-astra")).toMatchObject({ api: "openai-responses", cost: { input: 8, output: 40 } });
  expect(piModel("vertex", "gemini-4-neon")).toMatchObject({ api: "google-vertex", cost: { input: 3, output: 15 } });
  // A model no longer offered that a project names is still found in pi-ai's catalog.
  expect(piModel("openai", "gpt-6-luna")?.id).toBe("gpt-6-luna");
});

test("a switch between Claude and the harness: what was said so far, for the new agent", async () => {
  const { handoverNote } = await import("../handover");
  expect(handoverNote([])).toBeUndefined();
  const note = handoverNote([
    { kind: "maker", id: "1", text: "Un site pour ma boulangerie", at: 1 },
    {
      kind: "agent",
      id: "2",
      at: 1,
      status: "done",
      parts: [
        { kind: "text", text: "Je construis le site." },
        { kind: "activity", activity: { id: "a", label: "Writing pages/index.liquid", state: "done" } },
        { kind: "activity", activity: { id: "b", label: "Reading theme.css", state: "done" } },
      ],
    },
    { kind: "maker", id: "3", text: "Ajoute une page menu", at: 2 },
    { kind: "agent", id: "4", at: 2, status: "stopped", parts: [] },
  ]);
  expect(note).toContain(
    "The maker: Un site pour ma boulangerie\nThe agent: Writing pages/index.liquid.\nThe agent said: Je construis le site.",
  );
  expect(note).not.toContain("Reading theme.css");
  expect(note).toContain("The maker: Ajoute une page menu\n(That turn stopped.)");
});

test("the maker's connectors: Spaka connects them, the agent calls their tools, the interface sees their state", async () => {
  const { f, models } = faux();
  writeFileSync(join(dir, "notes.mjs"), STDIO_SERVER);
  const servers = { notes: { type: "stdio" as const, command: process.execPath, args: [join(dir, "notes.mjs")] } };
  let offered: string[] = [];
  f.setResponses([
    (context) => {
      // The tools are declared by the transcript's system messages, those added later included.
      offered = context.messages.flatMap((m) => (m.role === "system" ? (m.toolsAdded ?? []).map((t) => t.name) : []));
      return fauxAssistantMessage([fauxToolCall("mcp__notes__add_note", { text: "Roses" })], { stopReason: "toolUse" });
    },
    fauxAssistantMessage([fauxText("C'est noté.")]),
  ]);
  const results: AgentEvent[] = [];
  const { s, turn, items } = session(
    models,
    {
      connectorServers: { servers: () => servers, fingerprint: () => "1" },
      signIns: new VaultSignIns(join(dir, "sign-ins.bin"), {
        encrypt: (t) => Buffer.from(t),
        decrypt: (d) => d.toString(),
      }),
    },
    (e) => e.kind === "tool-result" && results.push(e),
  );
  await turn("Note les roses.");
  expect(offered).toContain("mcp__notes__add_note");
  expect(results).toMatchObject([{ name: "mcp__notes__add_note", isError: false, text: "noted: Roses" }]);
  expect(await s.connectorStatus()).toEqual([{ name: "notes", status: "connected" }]);
  expect(items().at(-1)).toMatchObject({ kind: "agent", status: "done" });
  s.close();
});

test("a conversation recorded once plays back: the replies streamed again, their tools run for real", async () => {
  const { f, models } = faux();
  const content = `<h1>Fleur de Loire</h1>\n${"<p>Bouquets</p>\n".repeat(10)}`;
  f.setResponses([
    fauxAssistantMessage(
      [fauxText("Je construis."), fauxToolCall("Write", { file_path: "pages/index.liquid", content })],
      {
        stopReason: "toolUse",
      },
    ),
    fauxAssistantMessage([fauxText("Voilà.")]),
  ]);
  const file = join(dir, "recorded.jsonl");
  const recording = session(models, { recorder: new PiRecorder(file) });
  await recording.turn("Un site pour un fleuriste.");
  recording.s.close();
  expect(readFileSync(file, "utf8").trim().split("\n")).toHaveLength(2);

  // Another project, the replies played back: the page is written again by the Write tool.
  rmSync(project.path, { recursive: true, force: true });
  mkdirSync(project.path, { recursive: true });
  rmSync(join(dataDir, "pi-session.json"), { force: true });
  piReplayed.length = 0;
  const tapped: string[] = [];
  const replay = piReplay(file, 0);
  const played = session(
    replay.models,
    { search: replay.search },
    (e) => e.kind === "tool-input-end" && tapped.push(e.name),
  );
  await played.turn("Un site pour un fleuriste.");
  expect(readFileSync(join(project.path, "pages/index.liquid"), "utf8")).toBe(content);
  expect(tapped).toEqual(["Write"]);
  expect(played.items().at(-1)).toMatchObject({ kind: "agent", status: "done" });
  expect(piReplayed.map((r) => r.model)).toEqual(["gpt-6.1-terra", "gpt-6.1-terra"]);
  expect(piReplayed[0]?.last).toBe("Un site pour un fleuriste.");
  played.s.close();
});

const asked = {
  questions: [
    {
      question: "Quelle ambiance pour la boutique ?",
      header: "Ambiance",
      options: [
        { label: "Douce (Recommended)", description: "Crème et vert sauge" },
        { label: "Vive", description: "Rose et orange" },
      ],
    },
  ],
};
const askReply = (input: unknown = asked) =>
  fauxAssistantMessage([fauxToolCall("AskUserQuestion", input as never)], { stopReason: "toolUse" });
/** A reply that keeps what the model was given, then ends the turn. */
const seen: { messages: { role: string; content?: unknown; toolName?: string; isError?: boolean }[] }[] = [];
const keepContext = (text: string) => (context: { messages: unknown[] }) => {
  seen.push({ messages: context.messages as never });
  return fauxAssistantMessage([fauxText(text)]);
};
const toolResults = (i: number) =>
  seen[i]!.messages.filter((m) => m.role === "toolResult").map((m) => JSON.stringify(m.content));

const questionCard = (items: ConversationItem[]) => {
  const last = items.at(-1);
  const part = last?.kind === "agent" ? last.parts.find((p) => p.kind === "question") : undefined;
  return part?.kind === "question" ? part.card : undefined;
};
const until = async (ok: () => boolean) => {
  for (let i = 0; i < 200 && !ok(); i++) await new Promise((r) => setTimeout(r, 5));
};

test("a question waits for the maker; the answer and what was changed meanwhile reach the agent in Claude's words", async () => {
  seen.length = 0;
  const { f, models } = faux();
  f.setResponses([askReply(), keepContext("Douce, c'est noté.")]);
  const { s, turn, items, events } = session(models);
  const ended = turn("Une fleuriste à Nantes");
  await until(() => questionCard(items())?.state === "waiting");
  expect(questionCard(items())).toMatchObject({ state: "waiting", questions: [{ header: "Ambiance" }] });
  expect(s.busy).toBe(true);
  s.answer(
    questionCard(items())!.id,
    { kind: "choices", answers: { "Quelle ambiance pour la boutique ?": "Douce (Recommended)" } },
    "The maker changed the title by hand.",
  );
  await ended;
  expect(questionCard(items())).toMatchObject({ state: "answered" });
  expect(toolResults(0)[0]).toContain(
    'Your questions have been answered: \\"Quelle ambiance pour la boutique ?\\"=\\"Douce (Recommended)\\"',
  );
  expect(toolResults(0)[0]).toContain("The maker changed the title by hand.");
  // A card, not an activity line (Q284).
  expect(events.some((e) => e.type === "activity")).toBe(false);
});

test("the maker's own words and Skip, in Claude's words", async () => {
  seen.length = 0;
  const { f, models } = faux();
  f.setResponses([askReply(), keepContext("D'accord."), askReply(), keepContext("Je choisis.")]);
  const { s, turn, items } = session(models);
  let ended = turn("Une fleuriste");
  await until(() => questionCard(items())?.state === "waiting");
  s.answer(questionCard(items())!.id, { kind: "words", text: "Plutôt champêtre" });
  await ended;
  expect(toolResults(0)[0]).toContain("The user responded: Plutôt champêtre");
  ended = turn("Encore");
  await until(() => questionCard(items())?.state === "waiting");
  s.answer(questionCard(items())!.id, { kind: "skipped" });
  await ended;
  expect(questionCard(items())).toMatchObject({ state: "skipped" });
  expect(toolResults(1).at(-1)).toContain("The user did not answer the questions.");
});

test("stopping while a question waits leaves it unanswered, and the agent is told", async () => {
  const { f, models } = faux();
  f.setResponses([askReply()]);
  const { s, turn, items } = session(models);
  const ended = turn("Une fleuriste");
  await until(() => questionCard(items())?.state === "waiting");
  await s.stop();
  await ended;
  expect(items().at(-1)).toMatchObject({ status: "stopped" });
  expect(questionCard(items())).toMatchObject({ state: "unanswered" });
  await until(() => readFileSync(join(dataDir, "pi-session.json"), "utf8").includes("did not answer"));
  expect(readFileSync(join(dataDir, "pi-session.json"), "utf8")).toContain(
    "The maker did not answer: the turn was stopped.",
  );
});

test("a question left when Spaka closes is read, at the next launch, as not answered", async () => {
  seen.length = 0;
  const { f, models } = faux();
  f.setResponses([askReply()]);
  const first = session(models);
  void first.turn("Une fleuriste");
  await until(() => questionCard(first.items())?.state === "waiting");
  first.s.close();
  expect(questionCard(first.items())).toMatchObject({ state: "unanswered" });

  f.setResponses([keepContext("Reprenons.")]);
  const second = session(models);
  await second.turn("Bonjour");
  const results = seen[0]!.messages.filter((m) => m.role === "toolResult");
  expect(results).toHaveLength(1);
  expect(JSON.stringify(results[0]!.content)).toContain("Spaka was closed while it waited");
});

test("questions without the tool's form are refused by the tool's schema, and no card shows", async () => {
  seen.length = 0;
  const { f, models } = faux();
  f.setResponses([askReply({ questions: [{ question: "Ambiance ?", options: [] }] }), keepContext("Bien.")]);
  const { turn, items } = session(models);
  await turn("Une fleuriste");
  expect(questionCard(items())).toBeUndefined();
  expect(toolResults(0)[0]).toContain("questions.0.options: expected at least 2 items");
});

const planCards = (items: ConversationItem[]) => {
  const last = items.at(-1);
  return last?.kind === "agent" ? last.parts.flatMap((p) => (p.kind === "plan" ? [p.card] : [])) : [];
};

test("plan mode: what writes is refused, the plan waits; changes, then Build, and the agent builds in the same turn", async () => {
  seen.length = 0;
  const { f, models } = faux();
  const plan = (text: string) =>
    fauxAssistantMessage([fauxToolCall("ExitPlanMode", { plan: text })], { stopReason: "toolUse" });
  f.setResponses([
    fauxAssistantMessage([fauxToolCall("Write", { file_path: "pages/index.liquid", content: "<h1>Trop tôt</h1>" })], {
      stopReason: "toolUse",
    }),
    plan("## Pages\n- Accueil"),
    plan("## Pages\n- Accueil\n- Mariages"),
    (context: { messages: unknown[] }) => {
      seen.push({ messages: context.messages as never });
      return fauxAssistantMessage(
        [fauxToolCall("Write", { file_path: "pages/index.liquid", content: "<h1>Fleur</h1>" })],
        {
          stopReason: "toolUse",
        },
      );
    },
    fauxAssistantMessage([fauxText("C'est construit.")]),
  ]);
  project = { ...project, mode: "plan" };
  const { s, turn, items } = session(models);
  const ended = turn("Une fleuriste, avec un plan d'abord");
  await until(() => planCards(items()).at(-1)?.state === "proposed");
  expect(existsSync(join(project.path, "pages/index.liquid"))).toBe(false);
  s.settlePlan(planCards(items())[0]!.id, { changes: "Une page pour les mariages" });
  await until(() => planCards(items()).length === 2 && planCards(items())[1]!.state === "proposed");
  expect(planCards(items())[0]).toMatchObject({ state: "replaced", changes: "Une page pour les mariages" });
  s.settlePlan(planCards(items())[1]!.id, { approved: true });
  await ended;
  expect(planCards(items())[1]).toMatchObject({ state: "approved", text: "## Pages\n- Accueil\n- Mariages" });
  expect(readFileSync(join(project.path, "pages/index.liquid"), "utf8")).toBe("<h1>Fleur</h1>");
  const said = seen[0]!.messages;
  // The plan-mode instructions came with the maker's message.
  expect(JSON.stringify(said.find((m) => m.role === "user")?.content)).toContain("[Spaka: plan mode.");
  const results = said.filter((m) => m.role === "toolResult").map((m) => JSON.stringify(m.content));
  expect(results[0]).toContain("Plan mode: nothing is written");
  expect(results[1]).toContain("The maker wants changes to the plan: Une page pour les mariages");
  expect(results[2]).toContain("The maker approved your plan.");
});

test("a passing error is tried again, visibly, and the turn goes on (Q435)", async () => {
  const { f, models } = faux();
  f.setResponses([
    fauxAssistantMessage([], { stopReason: "error", errorMessage: "429 Too Many Requests" }),
    fauxAssistantMessage([], { stopReason: "error", errorMessage: "503 Service Unavailable" }),
    fauxAssistantMessage([fauxText("Voilà.")]),
  ]);
  const { turn, events, items } = session(models, { retryWaits: [0, 0, 0] });
  await turn("Bonjour");
  expect(events.at(-1)).toMatchObject({ type: "turn-end", status: "done" });
  const lines = (items().at(-1) as { parts: { kind: string; activity?: { label: string; state: string } }[] }).parts
    .filter((p) => p.kind === "activity")
    .map((p) => `${p.activity!.label}: ${p.activity!.state}`);
  expect(lines).toEqual([
    "Trying again after a passing error (1/3): done",
    "Trying again after a passing error (2/3): done",
  ]);
  // The errors are not kept in what the model is sent next.
  const saved = JSON.parse(readFileSync(join(dataDir, "pi-session.json"), "utf8")).messages;
  expect(saved.filter((m: { stopReason?: string }) => m.stopReason === "error")).toEqual([]);
});

test("after three passing errors, the turn fails as before", async () => {
  const { f, models } = faux();
  const busy = () => fauxAssistantMessage([], { stopReason: "error", errorMessage: "429 Too Many Requests" });
  f.setResponses([busy(), busy(), busy(), busy()]);
  const { turn, events } = session(models, { retryWaits: [0, 0, 0] });
  await turn("Bonjour");
  expect(events.at(-1)).toMatchObject({ type: "turn-end", status: "failed" });
});

test("a reply cut by its length goes on: in its text, told to; in a call, the call asked for again (Q435)", async () => {
  const { f, models } = faux();
  const asked: string[] = [];
  const lastText = (context: { messages: { content: unknown }[] }) => {
    const content = context.messages.at(-1)!.content as string | { text?: string }[];
    asked.push(typeof content === "string" ? content : (content[0]?.text ?? ""));
  };
  f.setResponses([
    fauxAssistantMessage([fauxText("Voici le plan : d'abord")], { stopReason: "length" }),
    (context) => {
      lastText(context);
      return fauxAssistantMessage([fauxToolCall("Write", { file_path: "pages/index.liquid" })], {
        stopReason: "length",
      });
    },
    (context) => {
      lastText(context);
      return fauxAssistantMessage(
        [fauxToolCall("Write", { file_path: "pages/index.liquid", content: "<h1>Fleur</h1>\n" })],
        { stopReason: "toolUse" },
      );
    },
    fauxAssistantMessage([fauxText("Voilà.")]),
  ]);
  const { turn, events } = session(models);
  await turn("Un site");
  expect(events.at(-1)).toMatchObject({ type: "turn-end", status: "done" });
  expect(asked[0]).toMatch(/cut off by the output limit\. Go on exactly where you stopped/);
  expect(asked[1]).toMatch(/Tool call "Write" was not executed/);
  expect(readFileSync(join(project.path, "pages/index.liquid"), "utf8")).toBe("<h1>Fleur</h1>\n");
});

test("near the model's window, the earlier turns are summarized by the model; the conversation shown is whole (Q434)", async () => {
  const { f, models } = faux();
  const sent: string[][] = [];
  const keep = (text: string) => (context: { messages: { role: string; content: unknown }[] }) => {
    sent.push(context.messages.map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content))));
    return fauxAssistantMessage([fauxText(text)]);
  };
  f.setResponses([
    keep(`Première réponse ${"a".repeat(800)}`),
    keep(`Deuxième réponse ${"b".repeat(800)}`),
    (context) => {
      sent.push(["summary asked", JSON.stringify(context.messages[0])]);
      return fauxAssistantMessage([fauxText("The maker wants a florist's site; two pages are built.")]);
    },
    keep("Troisième réponse."),
  ]);
  const { turn, items, events } = session(models, { contextWindow: 800 });
  await turn(`Premier message ${"x".repeat(800)}`);
  await turn(`Deuxième message ${"y".repeat(800)}`);
  await turn("Troisième message");
  expect(events.at(-1)).toMatchObject({ type: "turn-end", status: "done" });
  expect(sent[2]?.[1]).toMatch(/You summarize the earlier part of your own work/);
  const third = sent[3]!;
  // The instructions first still, then the summary before the latest turn.
  expect(third[0]).toBe("Spaka's instructions for openai.");
  expect(third[1]).toMatch(
    /\[What happened earlier in this conversation, summarized:\]\\nThe maker wants a florist's site/,
  );
  expect(third.join("\n")).not.toContain("Premier message");
  // What the maker sees keeps every turn, and a line says the agent's memory was summarized.
  expect(items().filter((i) => i.kind === "maker")).toHaveLength(3);
  expect(JSON.stringify(items().at(-1))).toContain("Summarizing the earlier turns for the agent");
});

test("plan mode refuses the card of pages too, as Claude's does (Q436)", async () => {
  const { f, models } = faux();
  let shown = false;
  f.setResponses([
    fauxAssistantMessage([fauxToolCall("choose_pages", { pages: [] })], { stopReason: "toolUse" }),
    fauxAssistantMessage([fauxText("Je propose d'abord un plan.")]),
  ]);
  project = { ...project, mode: "plan" };
  const { turn, events } = session(models, {
    kit: () => ({
      tools: {
        ...noTools,
        choosePages: async () => {
          shown = true;
          return "";
        },
      },
      checks: checks(),
    }),
  });
  await turn("Adapte le template");
  expect(events.at(-1)).toMatchObject({ type: "turn-end", status: "done" });
  expect(shown).toBe(false);
});

test("a mode chosen while the agent works takes effect when its turn ends, under Pi too (Q436)", async () => {
  const { f, models } = faux();
  const said: string[] = [];
  f.setResponses([
    fauxAssistantMessage([fauxToolCall("AskUserQuestion", asked as never)], { stopReason: "toolUse" }),
    fauxAssistantMessage([fauxToolCall("Write", { file_path: "pages/index.liquid", content: "<h1>Fleur</h1>" })], {
      stopReason: "toolUse",
    }),
    fauxAssistantMessage([fauxText("Voilà.")]),
    (context) => {
      const last = context.messages.at(-1) as { content: string | { text?: string }[] };
      said.push(typeof last.content === "string" ? last.content : (last.content[0]?.text ?? ""));
      return fauxAssistantMessage([fauxText("Un plan.")]);
    },
  ]);
  const { s, turn, items } = session(models);
  const ended = turn("Une fleuriste");
  await until(() => {
    const last = items().at(-1);
    return last?.kind === "agent" && last.parts.some((p) => p.kind === "question" && p.card.state === "waiting");
  });
  await s.setMode("plan");
  const card = (items().at(-1) as { parts: { kind: string; card?: { id: string } }[] }).parts.find(
    (p) => p.kind === "question",
  )!.card!;
  s.answer(card.id, { kind: "choices", answers: { "Quelle ambiance pour la boutique ?": "Douce (Recommended)" } });
  await ended;
  // The turn went on in Build: its page is written.
  expect(readFileSync(join(project.path, "pages/index.liquid"), "utf8")).toBe("<h1>Fleur</h1>");
  // The next message is in plan mode.
  await turn("Et une page mariages ?");
  expect(said[0]).toContain("[Spaka: plan mode.");
});
