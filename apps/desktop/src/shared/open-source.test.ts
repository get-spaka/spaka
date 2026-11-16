import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { COMPONENTS } from "./open-source";

const desktop = join(__dirname, "../..");
const homes = [desktop, join(desktop, "../../packages/runtime")];
/** How a package may write a licence that has another SPDX name. */
const SPDX: Record<string, string> = { "BSD-0-Clause": "0BSD" };

/** A package's own package.json, from the app's or the runtime's dependencies. */
function manifest(name: string): { license?: string } {
  const home = homes.find((h) => existsSync(join(h, "node_modules", name, "package.json")));
  if (!home) throw new Error(`${name} is not a dependency`);
  return JSON.parse(readFileSync(join(home, "node_modules", name, "package.json"), "utf8"));
}

test.each(COMPONENTS.filter((c) => c.package).map((c) => [c.name, c] as const))(
  "%s's licence is the one its package says",
  (_name, component) => {
    const licence = manifest(component.package!).license ?? "";
    expect(SPDX[licence] ?? licence).toBe(component.licence);
  },
);

test.each(COMPONENTS.filter((c) => !c.package).map((c) => [c.name] as const))(
  "%s's licence is kept beside the gallery",
  (name) => {
    expect(existsSync(join(desktop, "gallery", `LICENSE-${name.replace(/ /g, "-")}`))).toBe(true);
  },
);
