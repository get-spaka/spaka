import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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
import type { AgentEvent } from "../stream";
import type { TurnChecks } from "../turn-checks";
import type { UpstartTools } from "../upstart-tools";
import { type PiDeps, PiSession } from "./session";

let dir: string;
let project: ProjectInfo;
let dataDir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "upstart-pi-"));
  project = { id: "p1", name: "Fleur", path: join(dir, "site"), model: "openai/gpt-6.1-terra", effort: "medium" };
  dataDir = join(dir, "data");
  for (const d of [project.path, dataDir]) mkdirSync(d, { recursive: true });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** A faux OpenAI that answers with the replies given, one per request. */
function faux(provider = "openai", models = [{ id: "gpt-6.1-terra", reasoning: true }]) {
  const f = fauxProvider({ provider, models });
  const collection = createModels({
    authContext: { env: async () => undefined, fileExists: async () => false },
  });
  collection.setProvider(f.provider);
  return { f, models: collection };
}

const noTools: UpstartTools = {
  look: async () => ({ route: "/", errors: [], notes: [] }),
  findBlocks: () => [],
  findImages: async () => "",
  useImage: async () => "",
  useBlocks: () => "",
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
      instructions: (family) => `Upstart's instructions for ${family}.`,
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
  expect(JSON.stringify(seen)).toContain("Upstart's instructions for openai.");
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
        afterTool: (tool) => (tool === "Write" ? "Upstart could not use what you just wrote." : undefined),
        beforeStop: (again) => {
          stops.push(again);
          return again ? undefined : "You left sample records.";
        },
      }),
    }),
  });
  await turn("Ajoute un évènement");
  expect(requests[1]).toContain("Upstart could not use what you just wrote.");
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
    "gemini/gemini-4-hydrogen",
    "gemini/gemini-4-carbon",
  ]);
  expect(choices[0]).toMatchObject({ name: "GPT-6.1 Terra", account: "chatgpt" });
  expect(choices.find((c) => c.id === "gemini/gemini-4-hydrogen")?.efforts).toEqual(["low", "medium", "high"]);
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
