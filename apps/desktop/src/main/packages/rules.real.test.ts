// The rules against the live services, on demand (SPAKA_REAL_PACKAGES=1):
// npm's registry, its download counts, OSV and deps.dev still answer as the
// recorded files say.
import { expect, test } from "vitest";
import { scanFlaws } from "./osv";
import { judge, readSignals } from "./rules";

const real = test.runIf(process.env.SPAKA_REAL_PACKAGES === "1");

real(
  "nanoid is accepted, sqlite3 refused for its native code, lodash 4.17.20 for its flaws",
  async () => {
    const nanoid = await readSignals("nanoid", undefined);
    if ("problem" in nanoid) throw new Error(nanoid.problem);
    expect(nanoid.signals).toMatchObject({
      license: "MIT",
      repository: "https://github.com/ai/nanoid",
      provenance: true,
    });
    expect(judge(nanoid.signals)).toEqual({ kind: "accepted" });
    const sqlite = await readSignals("sqlite3", undefined);
    if ("problem" in sqlite) throw new Error(sqlite.problem);
    expect(judge(sqlite.signals)).toMatchObject({ kind: "refused", refusals: [{ kind: "compiles" }] });
    const lodash = await readSignals("lodash", "4.17.20");
    if ("problem" in lodash) throw new Error(lodash.problem);
    expect(lodash.signals.flaws.map((f) => f.id)).toContain("GHSA-29mw-wpgm-hmr9");
    const found = await scanFlaws([{ name: "lodash", version: "4.17.20" }]);
    expect(found.find((f) => f.flaw.id === "GHSA-29mw-wpgm-hmr9")?.flaw.fixed).toBe("4.17.21");
  },
  60_000,
);
