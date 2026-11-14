// A probe of the Agent SDK for the agent's questions and plan mode (Q282-Q296,
// slice 0 of ~/.claude/plans/agent-questions.md). It drives the real binary,
// signed in as the real-agent checks are (.cache/agent-config), in a
// throwaway folder, and logs what reaches the app.
//
//   node spikes/questions/probe.ts <ask|plan|wait|resume>
//
// ask:    two questions at once (one multi-select, one with a preview), then
//         an answer in the maker's own words, then a skipped question.
// plan:   plan mode: an Upstart tool that writes, a question, a plan refused
//         with the maker's words, a plan approved, then building in the same turn.
// wait:   a question answered after 5.5 minutes.
// resume: the app closes while a question waits; the session is resumed.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dirname, "../..");
const appRequire = createRequire(join(root, "apps/desktop/package.json"));
const sdkPath = appRequire.resolve("@anthropic-ai/claude-agent-sdk");
const sdk = await import(sdkPath);
const { z } = await import(appRequire.resolve("zod"));
const binary = createRequire(sdkPath).resolve(
  `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/claude`,
);
const configDir = join(root, ".cache/agent-config");

const scenario = process.argv[2] ?? "ask";
const runs = join(import.meta.dirname, "runs");
mkdirSync(runs, { recursive: true });
const logFile = join(runs, `${scenario}.log`);
writeFileSync(logFile, "");
const started = Date.now();
function log(kind: string, data: unknown) {
  const line = `${((Date.now() - started) / 1000).toFixed(1)}s ${kind} ${typeof data === "string" ? data : JSON.stringify(data)}`;
  process.stdout.write(`${line}\n`);
  writeFileSync(logFile, `${line}\n`, { flag: "a" });
}

/** The messages the maker sends, one per turn. */
class Inbox {
  private items: unknown[] = [];
  private wake?: () => void;
  push(text: string) {
    this.items.push({
      type: "user",
      message: { role: "user", content: text },
      parent_tool_use_id: null,
      session_id: "",
    });
    this.wake?.();
  }
  async *[Symbol.asyncIterator]() {
    for (;;) {
      while (this.items.length) yield this.items.shift();
      await new Promise<void>((r) => {
        this.wake = r;
      });
    }
  }
}

const project = mkdtempSync(join(tmpdir(), `upstart-probe-${scenario}-`));
log("project", project);

const env = {
  PATH: process.env.PATH ?? "",
  HOME: process.env.HOME ?? "",
  USER: process.env.USER ?? "",
  TMPDIR: process.env.TMPDIR ?? "",
  LANG: "en_US.UTF-8",
  CLAUDE_CONFIG_DIR: configDir,
};

// Upstart's tools, one that only reads and one that writes into the project.
const probeServer = sdk.createSdkMcpServer({
  name: "upstart",
  tools: [
    sdk.tool("find_blocks", "Finds gallery blocks for a page. Reads only.", { query: z.string() }, async (a: { query: string }) => {
      log("tool", `find_blocks ran: ${a.query}`);
      return { content: [{ type: "text", text: "hero-split: a hero with a photo on the right" }] };
    }),
    sdk.tool("use_block", "Puts a gallery block into a page: writes files.", { id: z.string() }, async (a: { id: string }) => {
      log("tool", `use_block RAN (it wrote into the project): ${a.id}`);
      writeFileSync(join(project, `used-${a.id}.txt`), "x");
      return { content: [{ type: "text", text: `placed ${a.id}` }] };
    }),
  ],
});

const PLAN_INSTRUCTIONS = `You are planning a website for the maker; nothing is written yet.
Read what you need, ask the maker what only they can decide with AskUserQuestion, then hand in a short plan with ExitPlanMode: the pages and their sections, the style, what you will invent. Keep it under 15 lines.`;

function filesIn(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(p);
    }
  };
  try {
    walk(dir);
  } catch {}
  return out;
}
const plansBefore = new Set(filesIn(join(configDir, "plans")));

let q: ReturnType<typeof sdk.query>;
let exitPlanCalls = 0;
let sessionId = "";
let onQuestion: ((input: Record<string, unknown>) => Promise<Record<string, unknown> | "deny">) | undefined;

type Question = { question: string; options: { label: string }[]; multiSelect?: boolean };

async function canUseTool(toolName: string, input: Record<string, unknown>, opts: { signal: AbortSignal }) {
  log("canUseTool", { toolName, input });
  opts.signal.addEventListener("abort", () => log("canUseTool", `signal aborted for ${toolName}`));
  if (toolName === "AskUserQuestion" && onQuestion) {
    const answer = await onQuestion(input);
    if (answer === "deny") return { behavior: "deny", message: "The maker did not answer." };
    log("answered", answer);
    return { behavior: "allow", updatedInput: answer };
  }
  // In plan mode Upstart's tools come here even when allowed: those that only read run.
  if (toolName === "mcp__upstart__find_blocks") return { behavior: "allow", updatedInput: input };
  if (toolName === "ExitPlanMode") {
    exitPlanCalls++;
    if (exitPlanCalls === 1) {
      return {
        behavior: "deny",
        message: "The maker wants changes to the plan: add a page for wedding cakes. Hand in a new plan.",
      };
    }
    // Approved: back to building before the agent goes on.
    try {
      await q.setPermissionMode("acceptEdits");
      log("mode", "setPermissionMode(acceptEdits) done inside canUseTool");
    } catch (e) {
      log("mode", `setPermissionMode failed: ${String(e)}`);
    }
    return { behavior: "allow", updatedInput: input };
  }
  return { behavior: "deny", message: "Upstart does not ask the maker for permissions." };
}

function start(inbox: Inbox, extra: Record<string, unknown> = {}) {
  q = sdk.query({
    prompt: inbox,
    options: {
      cwd: project,
      pathToClaudeCodeExecutable: binary,
      env,
      model: "sonnet",
      effort: "low",
      systemPrompt: "You build websites for a maker in Upstart. Keep replies short.",
      tools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash", "AskUserQuestion", "ExitPlanMode"],
      permissionMode: "acceptEdits",
      settingSources: [],
      // As the app: only the connectors it gives, none of the account's.
      strictMcpConfig: true,
      settings: { dialogExpiry: "never", useAutoModeDuringPlan: false },
      toolConfig: { askUserQuestion: { previewFormat: "markdown" } },
      mcpServers: { upstart: probeServer },
      allowedTools: ["mcp__upstart__find_blocks", "mcp__upstart__use_block"],
      planModeInstructions: PLAN_INSTRUCTIONS,
      canUseTool,
      stderr: (d: string) => log("stderr", d.slice(0, 400)),
      ...extra,
    },
  });
  return q;
}

/** Reads the stream until `turns` results have come; logs what matters. */
async function follow(query: typeof q, turns: number, onResult?: (n: number) => void) {
  let n = 0;
  for await (const m of query) {
    if (m.type === "system" && m.subtype === "init") {
      sessionId = m.session_id;
      log("init", { capabilities: m.capabilities, permissionMode: m.permissionMode, tools: m.tools });
    } else if (m.type === "system") {
      log("system", { subtype: m.subtype, permissionMode: (m as { permissionMode?: string }).permissionMode });
    } else if (m.type === "assistant") {
      for (const b of m.message.content) {
        if (b.type === "text") log("assistant-text", b.text.slice(0, 600));
        if (b.type === "tool_use") log("tool_use", { name: b.name, input: JSON.stringify(b.input).slice(0, 700) });
      }
    } else if (m.type === "user") {
      const content = m.message.content;
      if (Array.isArray(content))
        for (const b of content)
          if (b.type === "tool_result")
            log("tool_result", { is_error: b.is_error, content: JSON.stringify(b.content).slice(0, 900) });
    } else if (m.type === "result") {
      log("result", { subtype: m.subtype, cost: m.total_cost_usd, turns: m.num_turns, text: String(m.result ?? "").slice(0, 400) });
      n++;
      onResult?.(n);
      if (n >= turns) break;
    }
  }
}

function report() {
  const files = filesIn(project).map((p) => p.slice(project.length + 1));
  log("project-files", files);
  for (const f of files) if (f.endsWith(".txt") || f.endsWith(".html")) log(`file ${f}`, readFileSync(join(project, f), "utf8").slice(0, 600));
  const newPlans = filesIn(join(configDir, "plans")).filter((p) => !plansBefore.has(p));
  log("new-plan-files", newPlans);
  for (const p of newPlans) log("plan-file", readFileSync(p, "utf8").slice(0, 800));
}

const answerWith = (pick: (q: Question, i: number) => string | string[]) => async (input: Record<string, unknown>) => {
  const questions = input.questions as Question[];
  const answers: Record<string, string | string[]> = {};
  questions.forEach((qq, i) => {
    answers[qq.question] = pick(qq, i);
  });
  return { questions, answers };
};

const timeout = setTimeout(() => {
  log("timeout", "probe gave up");
  report();
  process.exit(1);
}, 15 * 60_000);

if (scenario === "ask") {
  const inbox = new Inbox();
  const query = start(inbox);
  const steps = [
    {
      prompt:
        "Ask me two questions at once with AskUserQuestion: which main color the site should be (two options; give the first option the preview `block:hero-split` and the second `media/shop.jpg`), and which pages it needs (multiSelect, three options). Then write answers.txt with my answers exactly as you received them, and stop.",
      answer: answerWith((qq) => (qq.multiSelect ? [qq.options[0]!.label, qq.options[2]!.label] : qq.options[0]!.label)),
    },
    {
      prompt: "Ask me one question with AskUserQuestion: which font, two options. Then write font.txt with exactly what you received from me.",
      answer: async (input: Record<string, unknown>) => ({
        questions: input.questions,
        answers: {},
        response: "Neither: I want a handwritten font, like Caveat.",
      }),
    },
    {
      prompt:
        "Ask me one question with AskUserQuestion: should the footer show the opening hours (two options)? Then write footer.txt with exactly what you received from me and what you decided.",
      answer: async (input: Record<string, unknown>) => {
        const questions = input.questions as Question[];
        return {
          questions,
          answers: {},
          annotations: Object.fromEntries(questions.map((qq) => [qq.question, { unanswered: "skipped" }])),
        };
      },
    },
  ];
  let step = 0;
  onQuestion = (input) => steps[step]!.answer(input);
  inbox.push(steps[0]!.prompt);
  await follow(query, steps.length, (n) => {
    step = n;
    if (n < steps.length) inbox.push(steps[n]!.prompt);
  });
} else if (scenario === "plan") {
  const inbox = new Inbox();
  const query = start(inbox, { permissionMode: "plan" });
  onQuestion = answerWith((qq) => qq.options[0]!.label);
  inbox.push(
    "A website for Le Fournil, a bakery in Nantes. This is a probe of Upstart's plan mode: first call mcp__upstart__find_blocks with query 'hero', then call mcp__upstart__use_block with id 'hero-split' (we want to know whether it runs in plan mode), then ask me one question with AskUserQuestion, then hand in your plan. Once the plan is approved, build it: write index.html listing the plan's pages, and nothing else.",
  );
  await follow(query, 1);
} else if (scenario === "wait") {
  const inbox = new Inbox();
  const query = start(inbox);
  onQuestion = async (input) => {
    log("wait", "answering in 330 s");
    await new Promise((r) => setTimeout(r, 330_000));
    return answerWith((qq) => qq.options[1]!.label)(input);
  };
  inbox.push("Ask me one question with AskUserQuestion: which color, two options. Then write color.txt with my answer.");
  await follow(query, 1);
} else if (scenario === "resume") {
  const inbox = new Inbox();
  const query = start(inbox);
  onQuestion = async () => {
    log("resume", "closing the agent while its question waits");
    setTimeout(() => query.close(), 200);
    return new Promise(() => {});
  };
  inbox.push("Ask me one question with AskUserQuestion: which color, two options. Then write color.txt with my answer.");
  try {
    await follow(query, 1);
  } catch (e) {
    log("closed", String(e));
  }
  log("resume", `resuming session ${sessionId}`);
  const inbox2 = new Inbox();
  const again = start(inbox2, { resume: sessionId });
  onQuestion = answerWith((qq) => qq.options[0]!.label);
  inbox2.push(
    "Upstart was closed while your question waited, and has just opened again. Say in one sentence what you see of your earlier question and its answer in the conversation, then write color.txt with 'unknown'.",
  );
  await follow(again, 1);
}

report();
clearTimeout(timeout);
process.exit(0);
