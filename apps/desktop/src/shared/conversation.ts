// What the conversation column shows, and how it changes as the agent works.
// The main process turns the agent's stream into ConversationEvents; the same
// reducer builds the displayed items in the main process (to keep them) and in
// the interface (to show them).

export type ActivityState = "running" | "done" | "failed" | "refused";

/** One short line about what the agent does: "Writing pages/index.liquid". */
export type Activity = { id: string; label: string; state: ActivityState };

export type TurnStatus = "working" | "done" | "stopped" | "failed";

export type ConversationItem =
  | { kind: "maker"; id: string; text: string; at: number }
  | {
      kind: "agent";
      id: string;
      /** The agent's words and its activity, in the order they came. */
      parts: ({ kind: "text"; text: string } | { kind: "activity"; activity: Activity })[];
      status: TurnStatus;
      error?: string;
      at: number;
    }
  | { kind: "notice"; id: string; text: string; at: number };

export type ConversationEvent =
  | { type: "turn-start"; id: string; text: string; at: number }
  | { type: "text"; text: string }
  | { type: "activity"; activity: Activity }
  | { type: "turn-end"; status: Exclude<TurnStatus, "working">; error?: string }
  | { type: "notice"; id: string; text: string; at: number };

export function applyEvent(items: ConversationItem[], event: ConversationEvent): ConversationItem[] {
  if (event.type === "turn-start")
    return [
      ...items,
      { kind: "maker", id: `${event.id}-m`, text: event.text, at: event.at },
      { kind: "agent", id: `${event.id}-a`, parts: [], status: "working", at: event.at },
    ];
  if (event.type === "notice") return [...items, { kind: "notice", id: event.id, text: event.text, at: event.at }];

  const last = items.at(-1);
  if (last?.kind !== "agent" || last.status !== "working") return items;
  const parts = [...last.parts];
  if (event.type === "text") {
    const tail = parts.at(-1);
    if (tail?.kind === "text") parts[parts.length - 1] = { kind: "text", text: tail.text + event.text };
    else parts.push({ kind: "text", text: event.text });
    return [...items.slice(0, -1), { ...last, parts }];
  }
  if (event.type === "activity") {
    const at = parts.findIndex((p) => p.kind === "activity" && p.activity.id === event.activity.id);
    if (at >= 0) parts[at] = { kind: "activity", activity: event.activity };
    else parts.push({ kind: "activity", activity: event.activity });
    return [...items.slice(0, -1), { ...last, parts }];
  }
  // turn-end: whatever was still running did not finish.
  const settled = parts.map((p) =>
    p.kind === "activity" && p.activity.state === "running" && event.status !== "done"
      ? { ...p, activity: { ...p.activity, state: "failed" as const } }
      : p.kind === "activity" && p.activity.state === "running"
        ? { ...p, activity: { ...p.activity, state: "done" as const } }
        : p,
  );
  return [...items.slice(0, -1), { ...last, parts: settled, status: event.status, error: event.error }];
}

/** Whether the agent is in the middle of a turn. */
export function isWorking(items: ConversationItem[]): boolean {
  const last = items.at(-1);
  return last?.kind === "agent" && last.status === "working";
}
