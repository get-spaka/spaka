// The app's own settings, for every website (Q117): the model and effort a new
// website starts with, and the anonymous statistics switch. Kept as a JSON file
// in the app's data on this computer; a value missing or unreadable falls back
// to its default.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { type AppSettings, DEFAULT_APP_SETTINGS } from "../shared/ipc";
import { isEffort } from "./projects";

export const DEFAULT_SETTINGS = DEFAULT_APP_SETTINGS;

/** The settings a file holds, each value checked; anything else is its default. */
export function settingsFrom(data: unknown): AppSettings {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  return {
    newModel: typeof d.newModel === "string" && d.newModel.trim() ? d.newModel : DEFAULT_SETTINGS.newModel,
    newEffort: typeof d.newEffort === "string" && isEffort(d.newEffort) ? d.newEffort : DEFAULT_SETTINGS.newEffort,
    statistics: typeof d.statistics === "boolean" ? d.statistics : DEFAULT_SETTINGS.statistics,
  };
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
