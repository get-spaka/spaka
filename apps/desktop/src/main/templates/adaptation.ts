// A website's adaptation from its template (Q302-Q313): the page types it goes
// through one at a time, the home page first, which the maker chose to keep;
// where it stands; and the template's guide, kept for the agent until the
// last page type is done (Q307). Both live in the project's .spaka/ folder,
// never published nor among the website's files, and go when it ends.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Runtime } from "@spaka/runtime";
import { diskSource } from "@spaka/runtime/node";
import type { AdaptationState, AdaptationStep, AdaptationStepStatus } from "../../shared/ipc";
import {
  type GuideSections,
  guideSections,
  HOME,
  inGuideOrder,
  type PageType,
  pageTypeOf,
  pageTypes,
  routeName,
  sectionLine,
} from "./pages";

export const ADAPTATION = ".spaka/adaptation";
const STATE = `${ADAPTATION}/state.json`;
const GUIDE_COPY = `${ADAPTATION}/TEMPLATE.md`;

/** A step as kept: its line in the card of pages, in the maker's language once chosen. */
type StoredStep = AdaptationStep & { line?: string };
export type Adaptation = { template: string; chosen: boolean; steps: StoredStep[]; next?: string };

/** A page the card of pages adds, which the template lacks (Q310). */
export type NewPage = { route: string; name: string; line: string };

/**
 * Starts the adaptation of a website just copied from its template: every
 * page type to do, in the guide's order, and the guide kept for the agent.
 */
export function startAdaptation(root: string, template: string, guide: string | undefined, types: PageType[]) {
  const sections = guideSections(guide ?? "");
  const steps = inGuideOrder(types, sections).map((t): StoredStep => {
    const section = sections.pages.find((p) => p.route === t.route);
    const line = section ? sectionLine(section.text) : "";
    return { route: t.route, name: section?.name ?? routeName(t.route), status: "todo", ...(line ? { line } : {}) };
  });
  write(root, { template, chosen: false, steps });
  if (guide) writeFileSync(join(root, GUIDE_COPY), `${guide}\n`);
}

export function readAdaptation(root: string): Adaptation | undefined {
  try {
    const state = JSON.parse(readFileSync(join(root, STATE), "utf8")) as Adaptation;
    return Array.isArray(state.steps) ? state : undefined;
  } catch {
    return undefined;
  }
}

/** The template's guide, kept while the adaptation lasts. */
export function adaptationGuide(root: string): GuideSections | undefined {
  try {
    return guideSections(readFileSync(join(root, GUIDE_COPY), "utf8"));
  } catch {
    return undefined;
  }
}

/** What the maker's list shows (Q303). */
export function adaptationView(state: Adaptation | undefined): AdaptationState | null {
  if (!state) return null;
  return {
    chosen: state.chosen,
    steps: state.steps.map(({ route, name, status, new: added }) => ({
      route,
      name,
      status,
      ...(added ? { new: true } : {}),
    })),
    ...(state.next ? { next: state.next } : {}),
  };
}

/** The page type being adapted or looked at. */
export function currentStep(state: Adaptation): StoredStep | undefined {
  return state.steps.find((s) => s.status === "doing" || s.status === "ready");
}

/** The page type Continue goes to: the one the maker picked, or the first to do (Q313). */
export function upcomingStep(state: Adaptation): StoredStep | undefined {
  const picked = state.next && state.steps.find((s) => s.route === state.next && s.status === "todo");
  return picked || state.steps.find((s) => s.status === "todo");
}

/**
 * The card of pages answered (Q302, Q310): the page types kept, by route, the
 * names and lines the agent gave them, the new pages kept after the
 * template's. The home page is always kept, and is now being adapted.
 */
export function choosePages(
  root: string,
  kept: string[],
  labels: Record<string, { name: string; line: string }>,
  added: NewPage[],
): Adaptation | undefined {
  const state = readAdaptation(root);
  if (!state) return undefined;
  const keep = new Set([HOME, ...kept]);
  const steps: StoredStep[] = state.steps.map((s) => {
    const label = labels[s.route];
    return {
      ...s,
      ...(label ? { name: label.name, line: label.line } : {}),
      status: s.route === HOME ? "doing" : keep.has(s.route) ? "todo" : "removed",
    };
  });
  for (const page of added)
    if (keep.has(page.route) && !steps.some((s) => s.route === page.route))
      steps.push({ route: page.route, name: page.name, line: page.line, status: "todo", new: true });
  const next = { ...state, chosen: true, steps, next: undefined };
  write(root, next);
  return next;
}

/**
 * Continue (Q303): the page type looked at is done, the next one is being
 * adapted. A page type left being adapted (a stopped turn, Spaka closed) is
 * taken up again. Undefined when nothing is left.
 */
export function continueAdaptation(root: string): StoredStep | undefined {
  const state = readAdaptation(root);
  if (!state) return undefined;
  const doing = state.steps.find((s) => s.status === "doing");
  if (doing) return doing;
  const next = upcomingStep(state);
  const steps = state.steps.map(
    (s): StoredStep =>
      s.status === "ready" ? { ...s, status: "done" } : s.route === next?.route ? { ...s, status: "doing" } : s,
  );
  write(root, { ...state, steps, next: undefined });
  return next && { ...next, status: "doing" };
}

/** A page type still to do, picked to come next (Q313). */
export function pickNext(root: string, route: string): Adaptation | undefined {
  const state = readAdaptation(root);
  if (!state?.steps.some((s) => s.route === route && s.status === "todo")) return state;
  const next = { ...state, next: route };
  write(root, next);
  return next;
}

/** A page type still to do, taken off the list: the agent removes it at its next turn (Q307). */
export function removeStep(root: string, route: string): Adaptation | undefined {
  const state = readAdaptation(root);
  if (!state || route === HOME) return state;
  const steps = state.steps.map(
    (s): StoredStep => (s.route === route && s.status === "todo" ? { ...s, status: "removed" } : s),
  );
  const next = { ...state, steps, ...(state.next === route ? { next: undefined } : {}) };
  write(root, next);
  return next;
}

/** Whether every page type kept is adapted or looked at: nothing is left to do. */
export function nothingLeft(state: Adaptation): boolean {
  return !state.steps.some((s) => s.status === "todo" || s.status === "doing");
}

/**
 * The agent's turn ended. Done, the page type it adapted waits for the maker
 * to look at it; when it was the last, the adaptation is over (Q307) and
 * `finished` says so. A first turn that never showed the card of pages keeps
 * every page type.
 */
export function turnEnded(root: string, done: boolean): { state?: Adaptation; finished: boolean } {
  const state = readAdaptation(root);
  if (!state) return { finished: false };
  if (!done) return { state, finished: false };
  let steps = state.steps;
  if (!state.chosen) steps = steps.map((s): StoredStep => (s.route === HOME ? { ...s, status: "doing" } : s));
  steps = steps.map((s): StoredStep => (s.status === "doing" ? { ...s, status: "ready" } : s));
  const next: Adaptation = { ...state, chosen: true, steps };
  if (nothingLeft(next) && !removalsLeft(root, next).length) {
    finishAdaptation(root);
    return { finished: true };
  }
  write(root, next);
  return { state: next, finished: false };
}

/** The adaptation is over: its state and the guide go (Q307). */
export function finishAdaptation(root: string) {
  rmSync(join(root, ADAPTATION), { recursive: true, force: true });
}

/** The page files of the page types taken off the website that are still there. */
export function removalsLeft(root: string, state = readAdaptation(root)): { step: StoredStep; files: string[] }[] {
  if (!state) return [];
  const types = pageTypes(pageFiles(root));
  return state.steps
    .filter((s) => s.status === "removed" && !s.new)
    .map((step) => ({ step, files: types.find((t) => t.route === step.route)?.files ?? [] }))
    .filter((r) => r.files.length > 0);
}

/**
 * Which of the website's files Spaka's check for the template's texts looks
 * at during the adaptation (Q305): those of the page types adapted or being
 * adapted, and what they share with the rest; what only the page types still
 * to do use keeps the template's texts. Undefined outside an adaptation:
 * every file.
 */
export async function adaptationScope(root: string): Promise<((file: string) => boolean) | undefined> {
  const state = readAdaptation(root);
  if (!state) return undefined;
  const active = new Set(
    state.steps.filter((s) => s.status === "doing" || s.status === "ready" || s.status === "done").map((s) => s.route),
  );
  active.add(HOME);
  const users = await fileUsers(root);
  const types = pageTypes(pageFiles(root)).map((t) => t.route);
  return (file) => {
    const type = pageTypeOf(file);
    if (type) return active.has(type);
    const by = [...(users.get(file) ?? [])];
    if (!by.length) return true;
    // Records the home page only teases (a few dishes, the next events) are
    // adapted with their own page; those every page shows (the navigation,
    // the hours in the footer) with the home page.
    if (file.startsWith("data/") && by.length < types.length) {
      const own = by.filter((route) => route !== HOME);
      if (own.length) return own.some((route) => active.has(route));
    }
    return by.some((route) => active.has(route));
  };
}

/** For each part, record and fragment of the website: the page types that show it. */
async function fileUsers(root: string): Promise<Map<string, Set<string>>> {
  const users = new Map<string, Set<string>>();
  const add = (file: string, route: string) => {
    const set = users.get(file) ?? new Set<string>();
    set.add(route);
    users.set(file, set);
  };
  const read = (path: string) => {
    try {
      return readFileSync(join(root, path), "utf8");
    } catch {
      return undefined;
    }
  };
  let runtime: Runtime | undefined;
  try {
    runtime = new Runtime(diskSource(root), { repair: false, trace: false });
  } catch {}
  const routes = runtime?.routes() ?? [];
  for (const type of pageTypes(pageFiles(root))) {
    // The parts its pages render, and the parts those render.
    const seen = new Set<string>();
    const queue = [...type.files];
    const datasources = new Set<string>();
    while (queue.length) {
      const file = queue.shift()!;
      const src = read(file);
      if (src === undefined) continue;
      for (const m of src.matchAll(/\{%-?\s*(?:render|include)\s+['"]([\w-]+)['"]/g)) {
        const part = ["liquid", "html"].map((ext) => `parts/${m[1]}.${ext}`).find((p) => existsSync(join(root, p)));
        if (part && !seen.has(part)) {
          seen.add(part);
          add(part, type.route);
          queue.push(part);
        }
      }
      // The forms it holds: their datasource, and the answer shown once sent.
      for (const m of src.matchAll(/\/_data\/([\w-]+)/g)) datasources.add(m[1]!);
    }
    // The datasources its pages read.
    for (const r of routes)
      if (type.files.includes(r.file))
        try {
          for (const name of (await runtime!.renderRoute(r.route)).datasources ?? []) datasources.add(name);
        } catch {}
    for (const name of datasources) {
      for (const record of listDir(root, `data/${name}`)) add(`data/${name}/${record}`, type.route);
      const answer = /^answer:\s*([\w-]+)/m.exec(read(`data/${name}/_datasource.yaml`) ?? "")?.[1];
      if (answer) add(`fragments/${answer}.liquid`, type.route);
    }
  }
  return users;
}

function pageFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of listEntries(root, dir)) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else out.push(path);
    }
  };
  walk("pages");
  return out;
}

function listEntries(root: string, dir: string) {
  try {
    return readdirSync(join(root, dir), { withFileTypes: true }).filter((e) => !e.name.startsWith("."));
  } catch {
    return [];
  }
}

function listDir(root: string, dir: string): string[] {
  return listEntries(root, dir)
    .filter((e) => e.isFile())
    .map((e) => e.name);
}

function write(root: string, state: Adaptation) {
  const file = join(root, STATE);
  mkdirSync(dirname(file), { recursive: true });
  const clean = { ...state, ...(state.next ? {} : { next: undefined }) };
  writeFileSync(file, `${JSON.stringify(clean, null, 2)}\n`);
}

export type { AdaptationStepStatus };
