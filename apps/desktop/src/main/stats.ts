// Anonymous usage statistics (Q331, Q334): a closed list of events, each
// property taking its value from a set of values, never free text; never a
// message, a file name, an address or a website's content. They go to Aptabase
// (hosted in the EU) through its event API, written here rather than with its
// SDK, which opens an IPC channel and a custom protocol any page could send
// events through, and sends the system's language. The system's name and
// version and the app's version go with each event, under a session id drawn at
// random and kept in memory only. Nothing is sent while the maker has switched
// statistics off, nor without the app's key in a packaged app; checks read the
// events from a log instead.
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { AGENT_ACCOUNTS } from "../shared/ipc";

/** The app's key at Aptabase: public, it only lets events in (Q334). Empty until the account exists. */
export const APTABASE_KEY = "";

/** The ways of publishing: the builders' ids. */
export const PUBLISH_WAYS = ["static", "node", "cloudflare"] as const;
/** The kinds of error counted: the agent's turn that failed, by the reason it was told, and an export that failed. */
export const ERROR_TYPES = ["sign_in", "agent_limit", "agent_stopped", "agent_other", "export"] as const;

/** Each event's properties, each with its set of values; a template is one of Upstart's ids, "imported" or "none". */
const EVENTS = {
  launch: {},
  site_created: { template: "template" },
  message_sent: { provider: AGENT_ACCOUNTS },
  page_edit: {},
  block_dropped: {},
  theme_changed: {},
  content_changed: {},
  published: { way: PUBLISH_WAYS },
  tour_finished: {},
  tour_skipped: {},
  error: { type: ERROR_TYPES },
} as const satisfies Record<string, Record<string, readonly string[] | "template">>;

export type StatEvent = keyof typeof EVENTS;
type ValueOf<S> = S extends readonly (infer V)[] ? V : string;
export type StatProps<E extends StatEvent> = { [K in keyof (typeof EVENTS)[E]]: ValueOf<(typeof EVENTS)[E][K]> };

export type StatsDeps = {
  /** Whether the maker lets statistics be sent (Privacy, on by default). */
  allowed: () => boolean;
  appVersion: string;
  osName: string;
  osVersion: string;
  /** The app's key; nothing is sent without it. */
  key: string;
  /** Only a packaged app sends: a development run counts nothing. */
  packaged: boolean;
  /** Upstart's own templates' ids, the only ones named. */
  templates: () => string[];
  /** Where the day of the last launch counted is kept. */
  dayFile: string;
  /** Checks: the events written to this file, one JSON line each, instead of sent. */
  log?: string;
  send: (url: string, key: string, body: string) => Promise<void>;
  now?: () => Date;
};

const URL = "https://eu.aptabase.com/api/v0/event";
/** A session ends after an hour without an event, as Aptabase counts them. */
const SESSION_IDLE = 60 * 60 * 1000;

export class Stats {
  private session = "";
  private last = 0;

  constructor(private readonly deps: StatsDeps) {}

  /** The day's launch, counted once a day. */
  launched(): void {
    const day = this.now().toISOString().slice(0, 10);
    let counted: string | undefined;
    try {
      counted = JSON.parse(readFileSync(this.deps.dayFile, "utf8")).day;
    } catch {}
    if (counted === day || !this.allowed()) return;
    mkdirSync(dirname(this.deps.dayFile), { recursive: true });
    writeFileSync(this.deps.dayFile, JSON.stringify({ day }));
    this.track("launch");
  }

  track<E extends StatEvent>(event: E, ...rest: keyof StatProps<E> extends never ? [] : [StatProps<E>]): void {
    if (!this.allowed()) return;
    const props = checked(event, (rest[0] ?? {}) as Record<string, string>, this.deps.templates);
    const now = this.now();
    if (!this.session || now.getTime() - this.last > SESSION_IDLE) this.session = sessionId(now);
    this.last = now.getTime();
    const body = {
      timestamp: now.toISOString(),
      sessionId: this.session,
      eventName: event,
      systemProps: {
        isDebug: false,
        osName: this.deps.osName,
        osVersion: this.deps.osVersion,
        appVersion: this.deps.appVersion,
        sdkVersion: `upstart@${this.deps.appVersion}`,
      },
      props,
    };
    if (this.deps.log) {
      appendFileSync(this.deps.log, `${JSON.stringify(body)}\n`);
      return;
    }
    this.deps.send(URL, this.deps.key, JSON.stringify(body)).catch(() => {});
  }

  private allowed(): boolean {
    if (!this.deps.allowed()) return false;
    return !!this.deps.log || (this.deps.packaged && !!this.deps.key);
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }
}

/** The properties kept to their sets: a value outside its set is dropped, a template not Upstart's is "imported". */
export function checked(event: StatEvent, props: Record<string, string>, templates: () => string[]) {
  const allowed: Record<string, readonly string[] | "template"> = EVENTS[event];
  const out: Record<string, string> = {};
  for (const [name, values] of Object.entries(allowed)) {
    const value = props[name];
    if (typeof value !== "string") continue;
    if (values === "template") out[name] = value === "none" || templates().includes(value) ? value : "imported";
    else if (values.includes(value)) out[name] = value;
  }
  return out;
}

/** Aptabase's session id: the session's start in seconds, then eight random digits. */
function sessionId(now: Date): string {
  const random = Math.floor(Math.random() * 1e8)
    .toString()
    .padStart(8, "0");
  return `${Math.floor(now.getTime() / 1000)}${random}`;
}

/** The kind of a failed turn, from the reason the maker was told; never the reason itself. */
export function errorType(
  error: string | undefined,
  told: { signInNeeded: string; agentLimit: string; agentStopped: string },
): (typeof ERROR_TYPES)[number] {
  if (error === told.signInNeeded) return "sign_in";
  if (error === told.agentLimit) return "agent_limit";
  if (error === told.agentStopped) return "agent_stopped";
  return "agent_other";
}
