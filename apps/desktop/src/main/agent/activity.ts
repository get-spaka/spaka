// The agent's steps as the conversation shows them: one line per tool call,
// whichever agent made it (ADR 0012), its tools known by their canonical names
// (Read, Write, Edit, Append, Bash, Glob, Grep, Upstart's own, a connector's).

import { realpathSync } from "node:fs";
import { isAbsolute, relative } from "node:path";
import type { ConversationEvent, Grounded } from "../../shared/conversation";
import { en } from "../../shared/strings/en";
import { CARD_TOOLS } from "./questions";
import type { AgentEvent } from "./stream";
import { FIND_BLOCKS_TOOL, FIND_IMAGES_TOOL, LOOK_TOOL, USE_BLOCK_TOOL, USE_IMAGE_TOOL } from "./upstart-tools";

type Known = { name: string; label: string; detail?: string; grounded?: Grounded };

/** Turns the agent's tool events into the conversation's activity lines. */
export class Activities {
  private readonly known = new Map<string, Known>();

  constructor(
    private readonly projectDir: () => string,
    private readonly emit: (event: ConversationEvent) => void,
  ) {}

  clear() {
    this.known.clear();
  }

  handle(e: AgentEvent) {
    // Questions and plans are cards of their own, not steps (Q284, Q290).
    if ("name" in e && typeof e.name === "string" && CARD_TOOLS.has(e.name)) return;
    switch (e.kind) {
      case "tool-start":
        return this.activity(e.id, e.name, {}, "running");
      case "tool-input":
        // Only complete fields: a path is shown once, not letter by letter.
        return this.activity(e.id, e.name, complete(e.fields, e.done), "running");
      case "tool-input-end":
        return this.activity(e.id, e.name, e.input, "running");
      case "tool-result":
        return this.activity(
          e.id,
          e.name,
          undefined,
          e.isError ? "failed" : "done",
          e.isError ? e.text : undefined,
          // A look's line names the page it ended on, by its title, and the element acted on (Q320).
          e.name === LOOK_TOOL && !e.isError ? lookedLabel(e.text) : undefined,
          e.grounded,
        );
      case "permission-denied":
        return this.activity(e.id, e.name, undefined, "refused", e.message);
    }
  }

  private activity(
    id: string,
    name: string,
    input: Record<string, unknown> | undefined,
    state: "running" | "done" | "failed" | "refused",
    error?: string,
    answered?: string,
    found?: Grounded,
  ) {
    const known = this.known.get(id);
    const label =
      answered ??
      (input
        ? activityLabel(name, input, this.projectDir())
        : (known?.label ?? activityLabel(name, {}, this.projectDir())));
    const detail = input ? activityDetail(name, input) : known?.detail;
    const grounded = found ?? known?.grounded;
    // A tool's input streams in many small pieces: send only what changes the line.
    if (known && known.label === label && known.detail === detail && state === "running") return;
    this.known.set(id, { name, label, detail, ...(grounded ? { grounded } : {}) });
    const why = error?.trim() ? clip(error.trim(), 300) : undefined;
    this.emit({
      type: "activity",
      activity: {
        id,
        label,
        state,
        ...(detail ? { detail } : {}),
        ...(why ? { error: why } : {}),
        ...(grounded ? { grounded } : {}),
      },
    });
  }
}

/** The short line shown for a tool call. */
export function activityLabel(name: string, input: Record<string, unknown>, projectDir: string): string {
  const path = typeof input.file_path === "string" ? shortPath(input.file_path, projectDir) : undefined;
  // Claude writes its plan in a file of its own, outside the project, in plan mode (Q286).
  if ((name === "Write" || name === "Edit") && path && isAbsolute(path) && PLAN_FILE.test(path))
    return en.activity.writePlan;
  switch (name) {
    case "Write":
    case "Append":
      return en.activity.write(path);
    case "Edit":
      return en.activity.edit(path);
    case "Read":
      return en.activity.read(path);
    case "Glob":
    case "Grep":
      return en.activity.search;
    case "Bash": {
      const what =
        typeof input.description === "string" && input.description
          ? input.description
          : typeof input.command === "string"
            ? input.command.split("\n")[0]!
            : "";
      return en.activity.run(what.length > 60 ? `${what.slice(0, 59)}…` : what || undefined);
    }
    case "WebSearch":
      return en.activity.searchWeb;
    case "WebFetch":
      return en.activity.readPage(typeof input.url === "string" ? siteOf(input.url) : undefined);
    case LOOK_TOOL:
      return lookLabel(input);
    case FIND_BLOCKS_TOOL:
      return en.activity.findBlocks;
    case USE_BLOCK_TOOL:
      return en.activity.placeBlocks(typeof input.page === "string" ? shortPath(input.page, projectDir) : undefined);
    case FIND_IMAGES_TOOL:
      return en.activity.findImages;
    case USE_IMAGE_TOOL: {
      const images: { name?: unknown }[] = Array.isArray(input.images) ? input.images : [];
      if (images.length > 1) return en.activity.addImages(images.length);
      const name = typeof input.name === "string" ? input.name : images[0]?.name;
      return en.activity.addImage(typeof name === "string" ? name : undefined);
    }
    case "Skill":
      // "project:menu-format" is shown as "menu-format".
      return en.activity.skill(typeof input.skill === "string" ? input.skill.replace(/^[\w-]+:/, "") : undefined);
    default:
      return en.activity.other(name);
  }
}

/** A look while it runs, from what the agent asked: the page by its address, and the screen. */
function lookLabel(input: Record<string, unknown>): string {
  const route = typeof input.route === "string" && input.route.startsWith("/") ? input.route : undefined;
  const screen = typeof input.screen === "string" ? input.screen : route ? "desktop" : undefined;
  return en.activity.look(pageOf(route), screen && en.activity.lookScreens[screen]);
}

/**
 * A look once answered, from its text (lookText): the page by its title, the
 * screen, and the last element clicked, hovered, typed into or the key pressed.
 */
export function lookedLabel(answer: string): string | undefined {
  const page = /^Page: (\/[^\s,]*?)(?: \(“(.*?)”\))?(?:, (on desktop|on a tablet|on a phone))?(?: \(|,|\.$)/m.exec(
    answer,
  );
  if (!page) return undefined;
  const steps = /^Steps:\n((?:\d+\. .*\n?)+)/m.exec(answer)?.[1]?.split("\n") ?? [];
  let after: string | undefined;
  for (const line of steps.map((l) => l.replace(/^\d+\. /, ""))) {
    const acted = /^(clicked|hovered|typed ".*?" into) (\w+)(?: ("(?:[^"\\]|\\.)*"))?/.exec(line);
    const pressed = /^pressed (\S+)/.exec(line);
    if (pressed) after = en.activity.lookAfter.press(pressed[1]!.replace(/:$/, ""));
    else if (acted) {
      const named = acted[3]
        ? `“${JSON.parse(acted[3])}”`
        : (en.activity.lookElements[acted[2]!] ?? en.activity.lookElement);
      const verb = acted[1]!.startsWith("typed") ? "type" : acted[1] === "hovered" ? "hover" : "click";
      after = en.activity.lookAfter[verb](named);
    }
  }
  const title = page[2]?.split(/\s+[—|·–-]\s+/)[0]?.trim();
  const screen = page[3];
  return en.activity.look(page[1] === "/" ? en.activity.lookHome : title || pageOf(page[1]), screen, after);
}

/** "Menu" for /menu, "First case" for /work/first-case, the home page for /. */
function pageOf(route: string | undefined): string {
  if (!route) return en.activity.lookPage;
  if (route === "/") return en.activity.lookHome;
  const last = decodeURIComponent(route.split("/").filter(Boolean).at(-1) ?? route).replace(/[-_]+/g, " ");
  return last.charAt(0).toUpperCase() + last.slice(1);
}

/** The file Claude writes its plan in: `<its configuration>/plans/<words>.md`. */
const PLAN_FILE = /[\\/]plans[\\/][\w-]+\.md$/;

/** What the detailed output style shows under a step (Q127): what was run or searched. */
export function activityDetail(name: string, input: Record<string, unknown>): string | undefined {
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);
  switch (name) {
    case "Bash":
      return text(input.command) && clip(text(input.command)!, 400);
    case "Grep": {
      const pattern = text(input.pattern);
      const where = text(input.glob) ?? text(input.path);
      return pattern && (where ? `${pattern} in ${where}` : pattern);
    }
    case "Glob":
      return text(input.pattern);
    case "WebSearch":
      return text(input.query) && clip(text(input.query)!, 400);
    case "WebFetch":
      return text(input.url) && clip(text(input.url)!, 400);
    case "Write":
    case "Append":
    case "Edit":
    case "Read":
    case "Skill":
    case LOOK_TOOL:
    case USE_BLOCK_TOOL:
    case USE_IMAGE_TOOL:
      return undefined;
    case FIND_BLOCKS_TOOL: {
      const sections = Array.isArray(input.sections) ? input.sections : [];
      const asked = sections.flatMap((s) => (typeof s?.query === "string" ? [s.query] : []));
      return asked.length ? clip(asked.join("; "), 400) : undefined;
    }
    default: {
      // A connector's tool: what it was asked.
      const shown = Object.keys(input).length ? JSON.stringify(input) : undefined;
      return shown && clip(shown, 200);
    }
  }
}

export function clip(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function complete(fields: Record<string, string>, done: Record<string, boolean>) {
  return Object.fromEntries(Object.entries(fields).filter(([name]) => done[name]));
}

/** "www.nantes.fr" for a page's address. */
function siteOf(url: string): string | undefined {
  try {
    return new URL(url).host.replace(/^www\./, "") || undefined;
  } catch {
    return undefined;
  }
}

function shortPath(file: string, projectDir: string): string {
  if (!isAbsolute(file)) return file;
  // The agent sees the folder's real path (/private/var/… for /var/…).
  for (const root of [projectDir, realPath(projectDir)]) {
    const rel = relative(root, file);
    if (rel && !rel.startsWith("..") && !isAbsolute(rel)) return rel.split("\\").join("/");
  }
  return file;
}

function realPath(path: string) {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}
