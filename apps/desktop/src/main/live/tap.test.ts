import { expect, test } from "vitest";
import { parsePartialInput } from "../agent/partial-input";
import type { AgentEvent } from "../agent/stream";
import { editPreview, FileTap } from "./tap";

function target(disk: Record<string, string> = {}) {
  const shown = new Map<string, string>();
  const log: string[] = [];
  return {
    shown,
    log,
    t: {
      root: "/p",
      read: (rel: string) => shown.get(rel) ?? disk[rel],
      set: (rel: string, content: string | undefined) => {
        if (content === undefined) shown.delete(rel);
        else shown.set(rel, content);
        log.push(content === undefined ? `clear ${rel}` : `set ${rel} ${content.length}`);
      },
      changed: (final: boolean) => log.push(final ? "final" : "render"),
      // The file must be there when the preview moves to it.
      follow: (rel: string) => log.push(`follow ${rel} ${shown.has(rel) ? "present" : "missing"}`),
    },
  };
}

/** The tool-input events of a call whose JSON input arrives in pieces of `size`. */
function streamed(id: string, name: string, input: Record<string, unknown>, size: number): AgentEvent[] {
  const json = JSON.stringify(input);
  const events: AgentEvent[] = [{ kind: "tool-start", id, name }];
  for (let n = size; n < json.length + size; n += size) {
    const part = json.slice(0, n);
    const { fields, done } = parsePartialInput(part);
    events.push({ kind: "tool-input", id, name, json: part, fields, done });
  }
  events.push({ kind: "tool-input-end", id, name, input });
  return events;
}

test("a file being written is shown as it grows, then the disk takes over", () => {
  const { t, shown, log } = target();
  const tap = new FileTap(t);
  const content = "<h1>Fleur de Loire</h1><p>Bouquets</p>";
  const seen: string[] = [];
  for (const e of streamed("w1", "Write", { file_path: "/p/pages/index.liquid", content }, 7)) {
    tap.handle(e);
    const now = shown.get("pages/index.liquid");
    if (now !== undefined && now !== seen.at(-1)) seen.push(now);
  }
  expect(seen.length).toBeGreaterThan(3);
  for (const piece of seen) expect(content.startsWith(piece)).toBe(true);
  expect(seen.at(-1)).toBe(content);
  expect(log.filter((l) => l.startsWith("follow"))).toEqual(["follow pages/index.liquid present"]);
  tap.handle({ kind: "tool-result", id: "w1", name: "Write", isError: false, text: "" });
  expect(shown.size).toBe(0);
  expect(log.at(-1)).toBe("final");
});

test("files outside the project, and other tools, are not shown", () => {
  const { t, log } = target();
  const tap = new FileTap(t);
  for (const e of streamed("w1", "Write", { file_path: "/etc/x.liquid", content: "<p>x</p>" }, 5)) tap.handle(e);
  for (const e of streamed("r1", "Read", { file_path: "/p/theme.css" }, 5)) tap.handle(e);
  expect(log).toEqual([]);
  tap.handle({ kind: "tool-result", id: "b1", name: "Bash", isError: false, text: "" });
  tap.handle({ kind: "tool-start", id: "b2", name: "Bash" });
  tap.handle({ kind: "tool-result", id: "b2", name: "Bash", isError: false, text: "" });
  expect(log).toEqual(["final"]);
});

test("an edit under way is shown in place; a refused or unfinished one disappears", () => {
  const disk = { "pages/index.liquid": "<section>A</section>\n<section>B</section>\n" };
  const { t, shown } = target(disk);
  const tap = new FileTap(t);
  const input = {
    file_path: "/p/pages/index.liquid",
    old_string: "<section>B</section>",
    new_string: "<section>New</section>\n<section>B</section>",
  };
  const events = streamed("e1", "Edit", input, 6);
  for (const e of events.slice(0, -2)) tap.handle(e);
  const middle = shown.get("pages/index.liquid")!;
  expect(middle.startsWith("<section>A</section>\n<section>")).toBe(true);
  expect(middle).toContain("<section>B</section>");
  tap.handle(events.at(-1)!);
  expect(shown.get("pages/index.liquid")).toBe("<section>A</section>\n<section>New</section>\n<section>B</section>\n");
  tap.handle({ kind: "permission-denied", id: "e1", name: "Edit", message: "" });
  expect(shown.size).toBe(0);

  for (const e of streamed("w2", "Write", { file_path: "/p/theme.css", content: ":root{ --a: 1 }" }, 3).slice(0, -2))
    tap.handle(e);
  expect(shown.size).toBe(1);
  tap.handle({ kind: "result", subtype: "error_during_execution", isError: true, text: "", durationMs: 0 });
  expect(shown.size).toBe(0);
});

test("editPreview", () => {
  const base = "<p>one</p><p>two</p>";
  expect(editPreview(base, "a.liquid", { old_string: "one" }, { old_string: false })).toBeUndefined();
  expect(
    editPreview(base, "a.liquid", { old_string: "nope", new_string: "x" }, { old_string: true, new_string: true }),
  ).toBeUndefined();
  expect(
    editPreview(base, "a.liquid", { old_string: "one", new_string: "1" }, { old_string: true, new_string: true }),
  ).toBe("<p>1</p><p>two</p>");
  // An unfinished replacement in a stylesheet waits for the whole text.
  expect(
    editPreview("a{}", "theme.css", { old_string: "a{}", new_string: "b{" }, { old_string: true, new_string: false }),
  ).toBeUndefined();
});

test("a long file written in parts: each Append adds to what is shown, and the disk takes over once all are written", () => {
  const { t, shown, log } = target();
  const tap = new FileTap(t);
  const parts = ["<header>Fleur</header>\n", "<section>Bouquets</section>\n", "<footer>Nantes</footer>\n"];
  // Gemini sends each call whole, one after the other, before any is run.
  tap.handle({ kind: "tool-start", id: "w", name: "Write" });
  tap.handle({
    kind: "tool-input-end",
    id: "w",
    name: "Write",
    input: { file_path: "pages/index.liquid", content: parts[0] },
  });
  expect(shown.get("pages/index.liquid")).toBe(parts[0]);
  for (const [i, part] of parts.slice(1).entries()) {
    for (const e of streamed(`a${i}`, "Append", { file_path: "/p/pages/index.liquid", content: part }, 9))
      tap.handle(e);
  }
  expect(shown.get("pages/index.liquid")).toBe(parts.join(""));
  // The Write is run first: the Appends still pending keep the whole page shown.
  tap.handle({ kind: "tool-result", id: "w", name: "Write", isError: false, text: "" });
  expect(shown.get("pages/index.liquid")).toBe(parts.join(""));
  tap.handle({ kind: "tool-result", id: "a0", name: "Append", isError: false, text: "" });
  expect(shown.has("pages/index.liquid")).toBe(true);
  tap.handle({ kind: "tool-result", id: "a1", name: "Append", isError: false, text: "" });
  expect(shown.has("pages/index.liquid")).toBe(false);
  expect(log.at(-1)).toBe("final");
});

test("an Append to a file already on the disk adds to it", () => {
  const { t, shown } = target({ "styles/site.css": ".a{}\n" });
  const tap = new FileTap(t);
  for (const e of streamed("a", "Append", { file_path: "styles/site.css", content: ".b{}\n" }, 4)) tap.handle(e);
  expect(shown.get("styles/site.css")).toBe(".a{}\n.b{}\n");
});
