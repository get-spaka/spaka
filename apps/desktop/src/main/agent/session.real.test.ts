// The agent's questions with the real binary, confined as in the app: run
// only when asked, since it spends the account signed in for the real-agent
// checks (.cache/agent-config at the repository's root).
//
//   UPSTART_REAL_CLAUDE=1 pnpm exec vitest run src/main/agent/session.real.test.ts
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { expect, test } from "vitest";
import { applyEvent, type ConversationItem, type QuestionCard } from "../../shared/conversation";
import { agentBinary, cleanEnv } from "./confinement";
import { AgentSession } from "./session";

const configDir = join(import.meta.dirname, "../../../../../.cache/agent-config");

const real = test.skipIf(!process.env.UPSTART_REAL_CLAUDE);

/** An agent session as the app starts it, on a throwaway project. */
function realSession(mode?: "plan") {
  const dir = mkdtempSync(join(tmpdir(), "upstart-real-"));
  const data = mkdtempSync(join(tmpdir(), "upstart-real-data-"));
  mkdirSync(join(dir, "pages"));
  writeFileSync(join(dir, "pages/index.liquid"), "<h1>Bakery</h1>\n");
  let items: ConversationItem[] = [];
  let idle: () => void = () => {};
  const s = new AgentSession(
    { id: "p", name: "Bakery", path: dir, model: "claude-sonnet-5-5", effort: "low", ...(mode ? { mode } : {}) },
    data,
    {
      binary: agentBinary(),
      env: () => ({ ...cleanEnv(), CLAUDE_CONFIG_DIR: configDir }),
      readable: [],
      query: query as never,
      instructions: () => "You make websites. Keep replies to one sentence.",
    },
    { onConversation: (e) => (items = applyEvent(items, e)), onIdle: () => idle() },
  );
  s.start();
  return {
    s,
    dir,
    items: () => items,
    /** Sends a message; resolves when its turn ends. */
    send(text: string) {
      const ended = new Promise<void>((resolve) => {
        idle = resolve;
      });
      s.send(text);
      return ended;
    },
    close() {
      if (process.env.UPSTART_REAL_LOG)
        appendFileSync(process.env.UPSTART_REAL_LOG, `${JSON.stringify(items, null, 1)}\n`);
      s.close();
      rmSync(dir, { recursive: true, force: true });
      rmSync(data, { recursive: true, force: true });
    },
  };
}

const lastAgent = (items: ConversationItem[]) => {
  const last = items.at(-1);
  return last?.kind === "agent" ? last : undefined;
};

real(
  "a question asked under the app's confinement waits, and its answer reaches the agent",
  async () => {
    const r = realSession();
    const card = (): QuestionCard | undefined => {
      const part = lastAgent(r.items())?.parts.find((p) => p.kind === "question");
      return part?.kind === "question" ? part.card : undefined;
    };
    try {
      const ended = r.send(
        "Before anything, ask me with AskUserQuestion which mood the bakery's site should have: Warm or Fresh. " +
          "Then write the mood I chose in pages/index.liquid, as a <p> under the title, and stop.",
      );
      // Until the question shows, or the turn ends without one.
      for (let waited = 0; !card() && waited < 120_000; waited += 500) {
        if (lastAgent(r.items())?.status !== "working") break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      if (card()?.state !== "waiting") console.log(JSON.stringify(r.items(), null, 1), r.s.problems);
      expect(card()?.state).toBe("waiting");
      const asked = card()!;
      const fresh = asked.questions[0]!.options.find((o) => /fresh/i.test(o.label))!;
      r.s.answer(asked.id, { kind: "choices", answers: { [asked.questions[0]!.question]: fresh.label } });
      await ended;
      expect(lastAgent(r.items())).toMatchObject({ status: "done" });
      expect(card()).toMatchObject({ state: "answered" });
      expect(readFileSync(join(r.dir, "pages/index.liquid"), "utf8")).toMatch(/fresh/i);
    } finally {
      r.close();
    }
  },
  240_000,
);

real(
  "a write outside the project is still refused without asking, and the turn goes on",
  async () => {
    const r = realSession();
    const outside = join(homedir(), `upstart-real-check-${Date.now()}.txt`);
    try {
      await r.send(`Write the word hello to the file ${outside} with the Write tool, then say whether it worked.`);
      const turn = lastAgent(r.items())!;
      if (turn.status !== "done") console.log(JSON.stringify(r.items(), null, 1));
      expect(turn.status).toBe("done");
      expect(existsSync(outside)).toBe(false);
      const write = turn.parts.find((p) => p.kind === "activity");
      expect(write).toMatchObject({ activity: { state: expect.stringMatching(/refused|failed/) } });
    } finally {
      rmSync(outside, { force: true });
      r.close();
    }
  },
  240_000,
);

real(
  "plan mode under the app's confinement: a plan handed in, changed, then built in the same turn",
  async () => {
    const r = realSession("plan");
    const plans = () => (lastAgent(r.items())?.parts ?? []).flatMap((p) => (p.kind === "plan" ? [p.card] : []));
    const proposed = async (count: number) => {
      for (let waited = 0; waited < 180_000; waited += 500) {
        if (plans().length >= count && plans().at(-1)?.state === "proposed") return plans().at(-1)!;
        if (lastAgent(r.items())?.status !== "working") break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      console.log(JSON.stringify(r.items(), null, 1), r.s.problems);
      throw new Error("No plan was handed in.");
    };
    try {
      const ended = r.send("A one-page site for the bakery: a title and opening hours. Plan it first.");
      const first = await proposed(1);
      expect(readFileSync(join(r.dir, "pages/index.liquid"), "utf8")).toBe("<h1>Bakery</h1>\n");
      r.s.settlePlan(first.id, { changes: "Also a line saying we bake every morning." });
      const second = await proposed(2);
      expect(plans()[0]).toMatchObject({ state: "replaced" });
      r.s.settlePlan(second.id, { approved: true });
      await ended;
      expect(lastAgent(r.items())).toMatchObject({ status: "done" });
      expect(plans().at(-1)).toMatchObject({ state: "approved" });
      // Built once approved (where depends on Upstart's instructions, not given here).
      const written = r.items().flatMap((i) => (i.kind === "agent" ? i.parts : []));
      expect(
        written.some((p) => p.kind === "activity" && /^(Writing|Editing) (?!the plan)/.test(p.activity.label)),
      ).toBe(true);
    } finally {
      r.close();
    }
  },
  400_000,
);
