// Each website's secrets (Q501, Q516, Q558): a payment service's key, an
// e-mail service's. Kept by Spaka on this computer, encrypted by the system's
// keychain (the vault), never in the project; the site's server modules read
// them as `env`, the exports write them into the folder's .env or the
// Worker's secrets, and the agent only ever learns their names.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Vault } from "../connectors/connectors";

/** A secret's name, as modules read it: PAYMENT_KEY. */
export const SECRET_NAME = /^[A-Z][A-Z0-9_]{0,63}$/;

/** What Spaka keeps of a secret. */
type Kept = { value: string; purpose?: string; where?: string; at: string };

/** A secret as the maker sees it in the website's settings: never its value. */
export type SecretInfo = {
  name: string;
  /** Whether it has a value. A secret the modules read without one is missing. */
  set: boolean;
  /** What it is for, as the agent said when it asked for it. */
  purpose?: string;
  /** When it was given. */
  at?: string;
  /** The modules that read it, server/book.ts. */
  readBy: string[];
};

export class SiteSecrets {
  private readonly file: string;

  constructor(
    userData: string,
    private readonly vault: Vault,
  ) {
    this.file = join(userData, "site-secrets.bin");
  }

  /** A website's secrets by name, for its server process and its exports. */
  values(projectId: string): Record<string, string> {
    return Object.fromEntries(Object.entries(this.read()[projectId] ?? {}).map(([name, kept]) => [name, kept.value]));
  }

  has(projectId: string, name: string): boolean {
    return Object.hasOwn(this.read()[projectId] ?? {}, name);
  }

  /** The website's secrets, and those its modules read without a value, in the order of their names. */
  list(projectId: string, projectDir: string): SecretInfo[] {
    const kept = this.read()[projectId] ?? {};
    const readers = secretsReadBy(projectDir);
    const names = [...new Set([...Object.keys(kept), ...Object.keys(readers)])].sort();
    return names.map((name) => {
      const secret = kept[name];
      return {
        name,
        set: !!secret,
        ...(secret?.purpose ? { purpose: secret.purpose } : {}),
        ...(secret ? { at: secret.at } : {}),
        readBy: readers[name] ?? [],
      };
    });
  }

  /** Gives a secret its value, keeping what the agent said of it unless told anew. */
  set(projectId: string, name: string, value: string, about: { purpose?: string; where?: string } = {}) {
    if (!SECRET_NAME.test(name))
      throw new Error("A secret's name is in capitals, digits and underscores, starting with a letter: PAYMENT_KEY.");
    if (!value.trim()) throw new Error("The secret has no value.");
    const all = this.read();
    const site = { ...(all[projectId] ?? {}) };
    const before = site[name];
    site[name] = {
      value: value.trim(),
      ...((about.purpose ?? before?.purpose) ? { purpose: about.purpose ?? before?.purpose } : {}),
      ...((about.where ?? before?.where) ? { where: about.where ?? before?.where } : {}),
      at: new Date().toISOString(),
    };
    this.write({ ...all, [projectId]: site });
  }

  remove(projectId: string, name: string) {
    const all = this.read();
    const site = { ...(all[projectId] ?? {}) };
    delete site[name];
    this.write({ ...all, [projectId]: site });
  }

  private read(): Record<string, Record<string, Kept>> {
    if (!existsSync(this.file)) return {};
    try {
      return JSON.parse(this.vault.decrypt(readFileSync(this.file))) as Record<string, Record<string, Kept>>;
    } catch {
      return {};
    }
  }

  private write(all: Record<string, Record<string, Kept>>) {
    writeFileSync(this.file, this.vault.encrypt(JSON.stringify(all)), { mode: 0o600 });
  }
}

/** env.NAME, env["NAME"], and the names taken apart from env: { env: { NAME } } or const { NAME } = env. */
const READS = [/\benv\s*\.\s*([A-Z][A-Z0-9_]*)\b/g, /\benv\s*\[\s*["'`]([A-Z][A-Z0-9_]*)["'`]\s*\]/g];
const TAKEN_APART = [/\benv\s*:\s*\{([^{}]*)\}/g, /\{([^{}]*)\}\s*=\s*(?:context\.|ctx\.)?env\b/g];

/** The secrets the website's server modules read, by name, with the files that read each. */
export function secretsReadBy(projectDir: string): Record<string, string[]> {
  const dir = join(projectDir, "server");
  let files: string[];
  try {
    files = readdirSync(dir, { recursive: true, encoding: "utf8" }).filter(
      (f) => /\.[mc]?[jt]s$/.test(f) && !f.split(/[\\/]/).includes("node_modules"),
    );
  } catch {
    return {};
  }
  const readers: Record<string, string[]> = {};
  for (const file of files.sort()) {
    let text: string;
    try {
      text = readFileSync(join(dir, file), "utf8");
    } catch {
      continue;
    }
    const names = new Set<string>();
    for (const pattern of READS) for (const m of text.matchAll(pattern)) names.add(m[1]!);
    for (const pattern of TAKEN_APART)
      for (const m of text.matchAll(pattern))
        for (const part of m[1]!.split(",")) {
          const name = /^\s*([A-Z][A-Z0-9_]*)\b/.exec(part)?.[1];
          if (name) names.add(name);
        }
    const path = `server/${file.split("\\").join("/")}`;
    for (const name of names) readers[name] = [...(readers[name] ?? []), path];
  }
  return readers;
}
