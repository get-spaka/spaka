// The settings' search (Q119): the categories that hold a matching
// setting, and which of their rows to highlight. Each word typed must begin a
// word of the setting's label or of its other names, accents and case aside.

import { foldWords } from "./block-filter";
import type { SettingsPage } from "./ipc";
import { en } from "./strings/en";

const t = en.settings;

export type SettingEntry = { page: SettingsPage; id: string; words: string[] };

/** Every setting a search can find, with the words that find it. */
export const SETTINGS: SettingEntry[] = [
  { page: "general", id: "folder", words: [t.general.folder, t.general.websites, "Finder", "documents", "location"] },
  {
    page: "general",
    id: "text-size",
    words: [t.general.textSize, "font", "zoom", "bigger", "smaller", "police", "taille"],
  },
  {
    page: "general",
    id: "output-style",
    words: [t.general.outputStyle, "output style", "verbose", "thinking", "tool calls", "affichage", "étapes"],
  },
  { page: "general", id: "notify", words: [t.general.notify, "notification", "alert", "sound", "done", "terminé"] },
  {
    page: "agent",
    id: "reply-style",
    words: [t.agent.replyStyle, t.agent.replies, "tone", "verbosity", "explain", "teach", "réponses"],
  },
  {
    page: "agent",
    id: "account",
    words: [t.agent.account, "Claude", "sign in", "login", "subscription", "compte", "connexion"],
  },
  { page: "agent", id: "api-key", words: [t.agent.apiKey, "Console", "key", "token", "clé"] },
  { page: "agent", id: "model", words: [t.agent.model, "Sonnet", "Opus", "Haiku", "modèle", t.agent.forNew] },
  { page: "agent", id: "effort", words: [t.agent.effort, "thinking", "speed", "effort", t.agent.forNew] },
  { page: "skills", id: "skills-app", words: [t.pages.skills, "SKILL.md", "tone", "voice", "compétences"] },
  { page: "connectors", id: "connectors-app", words: [t.pages.connectors, "MCP", "server", "tools", "connecteurs"] },
  {
    page: "privacy",
    id: "statistics",
    words: [t.privacy.statistics, "analytics", "telemetry", "tracking", "statistiques", "confidentialité"],
  },
  { page: "about", id: "version", words: [t.pages.about, "version", "licence", "license", "MIT", "update"] },
].map((e) => ({ ...e, page: e.page as SettingsPage, words: [...e.words, t.pages[e.page as SettingsPage]] }));

/** The settings a search finds, or null when nothing is typed. */
export function searchSettings(query: string, entries: SettingEntry[] = SETTINGS): SettingEntry[] | null {
  const wanted = foldWords(query);
  if (!wanted.length) return null;
  return entries.filter((e) => {
    const own = foldWords(e.words.join(" "));
    return wanted.every((w) => own.some((o) => o.startsWith(w)));
  });
}
