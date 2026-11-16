// The app's own settings, for every website (Q117, Q125): the model and effort a
// new website starts with, the anonymous statistics switch, the appearance (Q330), the text size, the
// agent's reply style, the conversation's output style and the notification. Kept as a JSON file
// in the app's data on this computer; a value missing or unreadable falls back
// to its default.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  APPEARANCES,
  type AppSettings,
  DEFAULT_APP_SETTINGS,
  OUTPUT_STYLES,
  REPLY_STYLES,
  TEXT_SIZES,
  type TextSize,
} from "../shared/ipc";
import { isEffort } from "./projects";

export const DEFAULT_SETTINGS = DEFAULT_APP_SETTINGS;

/** The settings a file holds, each value checked; anything else is its default. */
export function settingsFrom(data: unknown): AppSettings {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  return {
    newModel: typeof d.newModel === "string" && d.newModel.trim() ? d.newModel : DEFAULT_SETTINGS.newModel,
    newEffort: typeof d.newEffort === "string" && isEffort(d.newEffort) ? d.newEffort : DEFAULT_SETTINGS.newEffort,
    statistics: typeof d.statistics === "boolean" ? d.statistics : DEFAULT_SETTINGS.statistics,
    appearance: oneOf(APPEARANCES, d.appearance) ?? DEFAULT_SETTINGS.appearance,
    textSize: oneOf(TEXT_SIZES, d.textSize) ?? DEFAULT_SETTINGS.textSize,
    replyStyle: oneOf(REPLY_STYLES, d.replyStyle) ?? DEFAULT_SETTINGS.replyStyle,
    outputStyle: oneOf(OUTPUT_STYLES, d.outputStyle) ?? DEFAULT_SETTINGS.outputStyle,
    notifyDone: typeof d.notifyDone === "boolean" ? d.notifyDone : DEFAULT_SETTINGS.notifyDone,
  };
}

function oneOf<V extends string>(values: readonly V[], value: unknown): V | undefined {
  return values.find((v) => v === value);
}

export class AppSettingsStore {
  private cache: AppSettings | undefined;

  constructor(private readonly file: string) {}

  get(): AppSettings {
    if (!this.cache) {
      try {
        this.cache = settingsFrom(JSON.parse(readFileSync(this.file, "utf8")));
      } catch {
        this.cache = { ...DEFAULT_SETTINGS };
      }
    }
    return this.cache;
  }

  set(change: Partial<AppSettings>): AppSettings {
    const next = settingsFrom({ ...this.get(), ...change });
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify(next, null, 2));
    renameSync(`${this.file}.tmp`, this.file);
    this.cache = next;
    return next;
  }
}

/** How much larger or smaller the interface is drawn for a text size. */
export function zoomFor(size: TextSize): number {
  return { small: 0.9, medium: 1, large: 1.15 }[size];
}
