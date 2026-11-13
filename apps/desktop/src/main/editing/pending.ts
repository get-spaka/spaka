// Sections the agent placed from the gallery and has not made its own yet,
// drawn as a skeleton in the preview while its turn lasts (Q222): the
// gallery's example texts are not this site's, and shown as they are they
// look like a mistake.
import { createHash } from "node:crypto";
import type { Placed } from "./place-blocks";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");

/** A file use_block wrote, with what it wrote, and the sample records it shows. */
export type Placement = {
  file: string;
  /** The hash of the part as written; none for a record page, whose own texts are the page's. */
  written?: string;
  /** Sample record → the hash of its text as written. */
  samples: Record<string, string>;
};

/** The parts and record pages a use_block call wrote. */
export function placementsOf(placed: Placed): Placement[] {
  const samplesOf = (datasource: string | undefined) => {
    const of: Record<string, string> = {};
    if (!datasource) return of;
    for (const path of placed.samples)
      if (path.split("/").includes(datasource) && placed.writes[path] !== undefined)
        of[path] = hash(placed.writes[path]);
    return of;
  };
  const out: Placement[] = [];
  for (const p of placed.parts) {
    const text = placed.writes[p.part];
    const samples = samplesOf(p.reused ? undefined : p.datasource);
    if (text !== undefined) out.push({ file: p.part, written: hash(text), samples });
    if (p.recordPage && Object.keys(samples).length) out.push({ file: p.recordPage, samples });
  }
  return out;
}

/**
 * The files still pending: a part as use_block wrote it, or one showing a
 * sample record still as written. A file the agent is writing reads as it
 * stands in the overlay, so a section turns real as its new text comes in.
 */
export function pendingFiles(placements: Placement[], read: (path: string) => string | undefined): string[] {
  const same = (path: string, sum: string) => {
    const text = read(path);
    return text !== undefined && hash(text) === sum;
  };
  const files = new Set<string>();
  for (const p of placements)
    if (
      (p.written !== undefined && same(p.file, p.written)) ||
      Object.entries(p.samples).some(([path, sum]) => same(path, sum))
    )
      files.add(p.file);
  return [...files].sort();
}

/** The page's elements written by a pending file, marked for the preview to draw as a skeleton. */
export function markPending(html: string, files: string[]): string {
  if (!files.length) return html;
  const escaped = files.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return html.replace(new RegExp(`data-up-src="(?:${escaped.join("|")}):`, "g"), (m) => `data-up-skeleton ${m}`);
}
