// A made-up recording of the agent adding a package Spaka has doubts about
// (Q536), played back like the recordings of the real agent: the first turn
// builds the bakery of bakery.jsonl, then calls add_package; the second calls
// it again; the third only answers. add_package runs for real in the replay,
// against the services answered by packagesServices.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = "/recorded/bakery";
const DAY = 86_400_000;

/** The package: young, barely downloaded, named like nanoid, with no repository. */
export const PACKAGE = "nanoidd";
export const FLAW = "GHSA-test-0001";

export type Line = { t: number; m: Record<string, unknown> };

const event = (t: number, e: Record<string, unknown>): Line => ({
  t,
  m: { type: "stream_event", parent_tool_use_id: null, event: e },
});

export function words(t: number, text: string): Line[] {
  return [
    event(t, { type: "message_start", message: {} }),
    event(t + 10, { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
    event(t + 20, { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }),
    event(t + 30, { type: "content_block_stop", index: 0 }),
  ];
}

function addPackage(t: number, id: string): Line[] {
  return spakaCall(t, id, "add_package", { name: PACKAGE });
}

/** A call of one of Spaka's tools, which the replay runs for real and answers with what it said. */
export function spakaCall(t: number, id: string, tool: string, input: Record<string, unknown>): Line[] {
  const name = `mcp__spaka__${tool}`;
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
    // The replay answers with what the tool said for real.
    {
      t: t + 50,
      m: {
        type: "user",
        parent_tool_use_id: null,
        message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: "recorded" }] },
      },
    },
  ];
}

export const result = (t: number, text: string): Line => ({
  t,
  m: { type: "result", subtype: "success", is_error: false, result: text, duration_ms: t, total_cost_usd: 0 },
});

/** The bakery's first turn, its words and result left out. */
export function bakeryBuilt(): Line[] {
  const bakery = readFileSync(join(import.meta.dirname, "bakery.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Line);
  return bakery.slice(0, bakery.findIndex((l) => l.m.type === "user" && l.t === 1153) + 1);
}

/** Writes the recording to `file`. */
export function writePackagesRecording(file: string) {
  const turns: Line[][] = [
    [...bakeryBuilt(), ...addPackage(1200, "p1"), ...words(1300, "I went on without it."), result(1400, "Done.")],
    [...addPackage(100, "p2"), ...words(200, "It is installed."), result(300, "Done.")],
    [...words(100, "Updated."), result(200, "Done.")],
  ];
  writeFileSync(
    file,
    `${turns
      .flat()
      .map((l) => JSON.stringify(l).replaceAll("/recorded/bakery", ROOT))
      .join("\n")}\n`,
  );
}

/**
 * The services the rules read (SPAKA_PACKAGES_FIXTURE): the package, its
 * downloads, no flaw when it is added, and one published since for the
 * version installed, which the opening of the site finds.
 */
export function writePackagesServices(file: string) {
  const created = new Date(Date.now() - 30 * DAY).toISOString();
  writeFileSync(
    file,
    JSON.stringify({
      [`https://registry.npmjs.org/${PACKAGE}`]: {
        name: PACKAGE,
        "dist-tags": { latest: "1.0.0" },
        versions: { "1.0.0": { version: "1.0.0", license: "MIT", description: "Tiny ids." } },
        time: { created, "1.0.0": created },
      },
      [`https://api.npmjs.org/downloads/point/last-week/${PACKAGE}`]: { downloads: 3, package: PACKAGE },
      [`osv:${PACKAGE}`]: {},
      [`osv:${PACKAGE}@1.0.0`]: { vulns: [{ id: FLAW, modified: created }] },
      [`osv-vuln:${FLAW}`]: {
        id: FLAW,
        summary: "Ids repeat after a while",
        database_specific: { severity: "MODERATE" },
        affected: [
          {
            package: { name: PACKAGE, ecosystem: "npm" },
            ranges: [{ type: "SEMVER", events: [{ introduced: "0" }, { fixed: "1.0.1" }] }],
          },
        ],
      },
    }),
  );
}
