// A made-up recording of a template's adaptation (Q302-Q313), played back
// like the recordings of the real agent: the first turn shows the card of
// pages for Reel's page types, a shop added as a new page, the studio left
// unchecked; once the maker answers, the home page is done in a line. Each
// next turn adapts one page type. The replay runs the card for real.
import { writeFileSync } from "node:fs";

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

function call(t: number, id: string, name: string, input: object): Line[] {
  return [
    event(t, { type: "message_start", message: {} }),
    event(t + 10, { type: "content_block_start", index: 0, content_block: { type: "tool_use", id, name, input: {} } }),
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
    // What the binary answers once the tool ran; the replay waits for the app before it.
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

/** The card the agent shows: Reel's page types for a ceramics studio, a shop added. */
export const CARD = {
  language: "English",
  pages: [
    { route: "/", name: "Home", line: "The studio's pieces, the classes and a visit, at a glance.", checked: true },
    { route: "/work", name: "Pieces", line: "Each series of tableware and vases, with its page.", checked: true },
    { route: "/studio", name: "Studio", line: "The two potters, their principles and their awards.", checked: false },
    { route: "/contact", name: "Contact", line: "A form to ask about a commission or a class.", checked: true },
  ],
  new: [{ route: "/shop", name: "Shop", line: "The pieces for sale, with their prices." }],
};

/** What the agent says at the end of each page type's turn (Q308). */
export const ENDS = [
  "The home page is adapted. I invented the studio's opening year, 2019.",
  "The pieces are adapted: I named the three series after the river.",
  "The studio page is adapted, with Inês and Tomás.",
  "The shop is built from the gallery, with four pieces and invented prices.",
];

/** Writes the adaptation's recording to `file`. */
export function writeAdaptationRecording(file: string) {
  const init: Line = {
    t: 100,
    m: {
      type: "system",
      subtype: "init",
      session_id: "replay-adaptation",
      cwd: "/recorded/reel",
      model: "claude-sonnet-5-5",
      tools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash", "mcp__upstart__choose_pages"],
      mcp_servers: [{ name: "upstart", status: "connected" }],
      skills: [],
      apiKeySource: "none",
      claude_code_version: "2.1.321",
    },
  };
  const turns: Line[][] = [
    [init, ...call(200, "pages-1", "mcp__upstart__choose_pages", CARD), ...words(300, ENDS[0]!), result(400, ENDS[0]!)],
    ...ENDS.slice(1).map((end) => [...words(100, end), result(200, end)]),
  ];
  writeFileSync(
    file,
    `${turns
      .flat()
      .map((l) => JSON.stringify(l))
      .join("\n")}\n`,
  );
}
