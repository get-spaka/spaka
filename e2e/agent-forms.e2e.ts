// The "Guestbook" scenario with the real agent (step 4). Opt-in like
// agent.e2e.ts: UPSTART_REAL_AGENT=1, with .cache/agent-config signed in.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, test } from "vitest";
import { type LaunchedApp, launchApp, runsDir, SLOW } from "./app.ts";
import { buildGuestbook } from "./guestbook-check.ts";

const real = process.env.UPSTART_REAL_AGENT === "1";
const configDir = join(import.meta.dirname, "../.cache/agent-config");

describe.skipIf(!real)("forms with the real agent", () => {
  let launched: LaunchedApp;
  const record = join(runsDir, "real-agent-forms.jsonl");

  beforeAll(async () => {
    mkdirSync(runsDir, { recursive: true });
    rmSync(record, { force: true });
    launched = await launchApp({
      env: { UPSTART_AGENT_REPLAY: "", UPSTART_AGENT_CONFIG_DIR: configDir, UPSTART_AGENT_RECORD: record },
    });
    await launched.window.getByTestId("message-input").waitFor();
  }, 60_000 * SLOW);
  afterAll(async () => {
    await launched?.close();
  });

  test(
    "a guestbook shown once approved and a contact form",
    async () => {
      const report = await buildGuestbook(launched);
      writeFileSync(join(runsDir, "real-agent-forms.json"), JSON.stringify(report, null, 2));
      writeFileSync(join(runsDir, "real-agent-forms.png"), await launched.window.screenshot());
    },
    960_000 * SLOW,
  );
});
