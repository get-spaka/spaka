import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { expect, test } from "vitest";
import {
  compactionCut,
  PICTURE_SEEN,
  passingError,
  tokensOf,
  transcriptOf,
  withoutSeenPictures,
  withSummary,
} from "./context";

const user = (text: string) => ({ role: "user", content: text, timestamp: 0 }) as AgentMessage;
const reply = (content: unknown[], stopReason = "toolUse") =>
  ({ role: "assistant", content, stopReason, timestamp: 0 }) as unknown as AgentMessage;
const picture = (id: string) =>
  ({
    role: "toolResult",
    toolCallId: id,
    toolName: "look_at_preview",
    content: [
      { type: "text", text: "Page: /about." },
      { type: "image", data: "x".repeat(40_000), mimeType: "image/png" },
    ],
    isError: false,
    timestamp: 0,
  }) as AgentMessage;

test("a picture goes to the model until it has answered it, then a line stands in for it", () => {
  const look = reply([{ type: "toolCall", id: "1", name: "look_at_preview", arguments: { route: "/about" } }]);
  const answered = [user("Fais la page"), look, picture("1"), reply([{ type: "text", text: "Vu." }], "stop")];
  const sent = withoutSeenPictures(answered);
  expect((sent[2] as { content: unknown[] }).content).toEqual([
    { type: "text", text: "Page: /about." },
    { type: "text", text: PICTURE_SEEN },
  ]);
  // Not yet answered: sent as it is.
  const waiting = [user("Fais la page"), look, picture("1")];
  expect(withoutSeenPictures(waiting)[2]).toBe(waiting[2]);
  expect(tokensOf([picture("1")])).toBeLessThan(2000);
});

test("near the window, the latest turns that fit are kept whole and the earlier ones summarized", () => {
  const turn = (n: number) => [
    user(`message ${n} ${"x".repeat(400)}`),
    reply([{ type: "text", text: "y".repeat(400) }], "stop"),
  ];
  const messages = [...turn(1), ...turn(2), ...turn(3), ...turn(4)];
  expect(compactionCut(messages, 100_000)).toBeUndefined();
  // About 210 tokens a turn, 840 in all: past 75% of a window of 600, the last turn fits in its 40% (240);
  // in one of 1100, the last two (420 of 440).
  expect(compactionCut(messages, 600)).toBe(6);
  expect(compactionCut(messages, 1100)).toBe(4);
  // A single turn too large for the share still keeps the latest whole.
  expect(compactionCut([user("a".repeat(4000)), reply([], "stop"), user("b".repeat(4000))], 1000)).toBe(2);
});

test("the earlier turns as a transcript, and the summary put before the turns kept", () => {
  const transcript = transcriptOf([
    user("Un site pour une boulangerie"),
    reply([
      { type: "text", text: "Je commence." },
      { type: "toolCall", id: "1", name: "Write", arguments: { file_path: "pages/index.liquid", content: "…" } },
    ]),
    {
      role: "toolResult",
      toolCallId: "1",
      toolName: "Write",
      content: [{ type: "text", text: "Nope" }],
      isError: true,
      timestamp: 0,
    } as AgentMessage,
  ]);
  expect(transcript).toBe(
    "Maker: Un site pour une boulangerie\nYou: Je commence.\nYou called Write on pages/index.liquid.\n  It failed: Nope",
  );
  const kept = withSummary([user("Ajoute les horaires"), reply([], "stop")], "The bakery's home page is built.");
  expect((kept[0] as { content: string }).content).toBe(
    "[What happened earlier in this conversation, summarized:]\nThe bakery's home page is built.\n\n[The maker's message:]\nAjoute les horaires",
  );
});

test("passing errors are tried again; a refused key or a bad request is not", () => {
  for (const e of [
    "429 Too Many Requests",
    "503 Service Unavailable",
    "The model is overloaded",
    "fetch failed",
    "ECONNRESET",
  ])
    expect(passingError(e)).toBe(true);
  for (const e of ["401 Unauthorized: invalid api key", "400 Bad Request: invalid schema", undefined])
    expect(passingError(e)).toBe(false);
});
