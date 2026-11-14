// Made-up recordings of the agent asking the maker questions (Q283-Q295)
// and handing in plans (Q286, Q290), played back like the recordings of the
// real agent. In the questions' recording, the first turn builds the bakery
// of bakery.jsonl, then asks; each next turn asks once. In the plan's, the
// first turn hands in a plan, a second one once the maker wants changes,
// then builds the bakery once approved; the next turn hands in a plan again.
// The replay stops at each question or plan until the app answers it.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = "/recorded/bakery";

/** The questions of each turn, in AskUserQuestion's form. */
export const QUESTIONS = [
  {
    questions: [
      {
        question: "Which mood should the bakery's site have?",
        header: "Mood",
        options: [
          {
            label: "Warm (Recommended)",
            description: "Cream and brown, like the bread.",
            preview: "block:hero-centered",
          },
          { label: "Fresh", description: "White and mint.", preview: "Light, airy, a lot of white." },
        ],
        multiSelect: false,
      },
    ],
  },
  {
    questions: [
      {
        question: "Which wedding cakes do you make?",
        header: "Cakes",
        options: [
          { label: "Tiered cakes", description: "" },
          { label: "Croquembouche", description: "" },
          { label: "Cupcake towers", description: "" },
        ],
        multiSelect: true,
      },
      {
        question: "Should the page show prices?",
        header: "Prices",
        options: [
          { label: "No, on request (Recommended)", description: "Couples ask for a quote." },
          { label: "Yes", description: "Starting prices." },
        ],
        multiSelect: false,
      },
    ],
  },
  {
    questions: [
      {
        question: "What should the tagline say?",
        header: "Tagline",
        options: [
          { label: "Bread since 1952", description: "" },
          { label: "Baked at dawn", description: "" },
        ],
        multiSelect: false,
      },
    ],
  },
  {
    questions: [
      {
        question: "Add a link to your Instagram?",
        header: "Social",
        options: [
          { label: "Yes (Recommended)", description: "" },
          { label: "No", description: "" },
        ],
        multiSelect: false,
      },
    ],
  },
  {
    questions: [
      {
        question: "Open on Sundays?",
        header: "Hours",
        options: [
          { label: "Mornings only", description: "" },
          { label: "Closed", description: "" },
        ],
        multiSelect: false,
      },
    ],
  },
];

type Line = { t: number; m: Record<string, unknown> };

const event = (t: number, e: Record<string, unknown>): Line => ({
  t,
  m: { type: "stream_event", parent_tool_use_id: null, event: e },
});

function words(t: number, text: string): Line[] {
  return [
    event(t, { type: "message_start", message: {} }),
    event(t + 10, { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
    event(t + 20, { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }),
    event(t + 30, { type: "content_block_stop", index: 0 }),
  ];
}

function ask(t: number, id: string, input: object, name = "AskUserQuestion"): Line[] {
  return [
    event(t, { type: "message_start", message: {} }),
    event(t + 10, {
      type: "content_block_start",
      index: 0,
      content_block: { type: "tool_use", id, name, input: {} },
    }),
    event(t + 20, {
      type: "content_block_delta",
      index: 0,
      delta: { type: "input_json_delta", partial_json: JSON.stringify(input) },
    }),
    event(t + 30, { type: "content_block_stop", index: 0 }),
    {
      t: t + 31,
      m: {
        type: "assistant",
        parent_tool_use_id: null,
        message: { role: "assistant", content: [{ type: "tool_use", id, name, input }] },
      },
    },
    // What the binary answers once the app did; the replay waits for the app before it.
    {
      t: t + 50,
      m: {
        type: "user",
        parent_tool_use_id: null,
        message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: "answered" }] },
      },
    },
  ];
}

const result = (t: number, text: string): Line => ({
  t,
  m: { type: "result", subtype: "success", is_error: false, result: text, duration_ms: t, total_cost_usd: 0 },
});

const AFTER = [
  "Warm it is: the site keeps its colors.",
  "The weddings page is planned with your cakes.",
  "The tagline is updated.",
  "I decided by myself and added the link.",
  "",
];

/** The bakery's first turn, its words and result left out. */
function bakeryBuilt(): Line[] {
  const bakery = readFileSync(join(import.meta.dirname, "bakery.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Line);
  return bakery.slice(0, bakery.findIndex((l) => l.m.type === "user" && l.t === 1153) + 1);
}

function write(file: string, turns: Line[][]) {
  writeFileSync(
    file,
    `${turns
      .flat()
      .map((l) => JSON.stringify(l).replaceAll("/recorded/bakery", ROOT))
      .join("\n")}\n`,
  );
}

/** Writes the questions' recording to `file`. */
export function writeQuestionsRecording(file: string) {
  // The question comes after the bakery's pages.
  const built = bakeryBuilt();
  const turns: Line[][] = QUESTIONS.map((input, i) => {
    const start = i === 0 ? 1200 : 100;
    return [
      ...(i === 0 ? built : []),
      ...ask(start, `q${i + 1}`, input),
      ...(AFTER[i] ? words(start + 100, AFTER[i]!) : []),
      result(start + 200, AFTER[i] || "Stopped."),
    ];
  });
  write(file, turns);
}

/** The plans the agent hands in: the first, the one after the maker's changes, the next turn's. */
export const PLANS = [
  "## The bakery's site\n\n- **Home**: hero with the bakery's photo, the breads, the hours.\n- Style: warm, cream and brown.\n\nInvented: the hours, until you give yours.",
  "## The bakery's site\n\n- **Home**: hero, the breads, the hours.\n- **Weddings**: the cakes, a quote form.\n- Style: warm, cream and brown.",
  "## A page for the team\n\n- **Team**: the bakers, a photo and a line each.",
];

/** Writes the plan's recording to `file`. */
export function writePlanRecording(file: string) {
  const [init, ...built] = bakeryBuilt();
  const first: Line[] = [
    init!,
    ...ask(200, "p1", { plan: PLANS[0] }, "ExitPlanMode"),
    ...ask(300, "p2", { plan: PLANS[1] }, "ExitPlanMode"),
    // Once approved, the agent builds in the same turn.
    ...built.map((l) => ({ ...l, t: l.t + 300 })),
    ...words(1500, "Built as planned."),
    result(1600, "Built as planned."),
  ];
  const next: Line[] = [...ask(100, "p3", { plan: PLANS[2] }, "ExitPlanMode"), result(300, "Stopped.")];
  write(file, [first, next]);
}
