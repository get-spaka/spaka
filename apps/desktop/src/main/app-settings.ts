// The app's own settings, for every website (Q117, Q125): the model and effort a
// new website starts with, the anonymous statistics switch, the appearance (Q330), the text size, the
// agent's reply style, the conversation's output style, the notification, whether the tour was seen, the order of the sidebar's projects and the model that names a new website. Kept as a JSON file
// in the app's data on this computer, which holds only the settings the maker
// chose: a value missing or unreadable is its default, the default of the
// version running.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  APPEARANCES,
  type AppSettings,
  DEFAULT_APP_SETTINGS,
  OUTPUT_STYLES,
  PROJECT_ORDERS,
  REPLY_STYLES,
  TEXT_SIZES,
  type TextSize,
} from "../shared/ipc";
import { claudeReplacement } from "./agent/claude-models";
import { isEffort } from "./projects";
import { replaceFile } from "./replace-file";

export const DEFAULT_SETTINGS = DEFAULT_APP_SETTINGS;

/** The settings a file holds, each value checked; anything else is its default. */
export function settingsFrom(data: unknown): AppSettings {
  return { ...DEFAULT_SETTINGS, ...chosenFrom(data) };
}

/**
 * The settings the maker chose, as a file holds them: each value checked, the
 * others left out. Only these are written, so the others follow the defaults of
 * the app's next versions.
 */
export function chosenFrom(data: unknown): Partial<AppSettings> {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const chosen: Partial<AppSettings> = {};
  // A model taken off Upstart's list gives way to the latest of its family (Q399).
  if (typeof d.newModel === "string" && d.newModel.trim())
    chosen.newModel = claudeReplacement(d.newModel) ?? d.newModel;
  if (typeof d.newEffort === "string" && isEffort(d.newEffort)) chosen.newEffort = d.newEffort;
  if (typeof d.statistics === "boolean") chosen.statistics = d.statistics;
  const appearance = oneOf(APPEARANCES, d.appearance);
  if (appearance) chosen.appearance = appearance;
  const textSize = oneOf(TEXT_SIZES, d.textSize);
  if (textSize) chosen.textSize = textSize;
  const replyStyle = oneOf(REPLY_STYLES, d.replyStyle);
  if (replyStyle) chosen.replyStyle = replyStyle;
  const outputStyle = oneOf(OUTPUT_STYLES, d.outputStyle);
  if (outputStyle) chosen.outputStyle = outputStyle;
  if (typeof d.notifyDone === "boolean") chosen.notifyDone = d.notifyDone;
  if (typeof d.tourSeen === "boolean") chosen.tourSeen = d.tourSeen;
  const projectOrder = oneOf(PROJECT_ORDERS, d.projectOrder);
  if (projectOrder) chosen.projectOrder = projectOrder;
  if (typeof d.namingModel === "string" && d.namingModel.trim())
    chosen.namingModel = d.namingModel === "auto" ? "auto" : (claudeReplacement(d.namingModel) ?? d.namingModel);
  return chosen;
}

function oneOf<V extends string>(values: readonly V[], value: unknown): V | undefined {
  return values.find((v) => v === value);
}

export class AppSettingsStore {
  private cache: AppSettings | undefined;
  /** What the file holds: the settings the maker chose. */
  private chosen: Partial<AppSettings> | undefined;

  constructor(private readonly file: string) {}

  get(): AppSettings {
    this.cache ??= { ...DEFAULT_SETTINGS, ...this.read() };
    return this.cache;
  }

  private read(): Partial<AppSettings> {
    if (!this.chosen) {
      try {
        this.chosen = chosenFrom(JSON.parse(readFileSync(this.file, "utf8")));
      } catch {
        this.chosen = {};
      }
    }
    return this.chosen;
  }

  /**
   * The first start of the version with the tour (Q340): a maker who already has
   * a website has found the way without it, and it never opens by itself for them.
   */
  settleTour(hasWebsites: boolean) {
    if (this.read().tourSeen === undefined) this.set({ tourSeen: hasWebsites });
  }

  /** A setting the maker chose, written with the others they chose; those they never chose are not. */
  set(change: Partial<AppSettings>): AppSettings {
    const chosen = chosenFrom({ ...this.read(), ...change });
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify(chosen, null, 2));
    replaceFile(`${this.file}.tmp`, this.file);
    this.chosen = chosen;
    this.cache = { ...DEFAULT_SETTINGS, ...chosen };
    return this.cache;
  }
}

/** How much larger or smaller the interface is drawn for a text size. */
export function zoomFor(size: TextSize): number {
  return { small: 0.9, medium: 1, large: 1.15 }[size];
}
