// "Blog" with the real agent (step 3). Opt-in like agent.e2e.ts:
// UPSTART_REAL_AGENT=1, with .cache/agent-config signed in. One message asks
// for a bakery with a blog of three posts with photos: a datasource and its
// record pages, images found on Openverse and Wikimedia Commons with their
// credits, the /credits page; what the preview showed meanwhile is reported.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { agentConfigDir, type LaunchedApp, launchApp, runsDir, SLOW } from "./app.ts";
import { type BlogReport, buildBlog } from "./blog-check.ts";

const real = process.env.UPSTART_REAL_AGENT === "1";
const configDir = agentConfigDir();

describe.skipIf(!real)("a blog with the real agent", () => {
  let launched: LaunchedApp;
  const record = join(runsDir, "real-agent-blog.jsonl");
  let report: BlogReport | undefined;

  beforeAll(async () => {
    mkdirSync(runsDir, { recursive: true });
    rmSync(record, { force: true });
    launched = await launchApp({
      env: { UPSTART_AGENT_REPLAY: "", UPSTART_AGENT_CONFIG_DIR: configDir, UPSTART_AGENT_RECORD: record },
    });
    await launched.window.getByTestId("message-input").waitFor();
  }, 60_000 * SLOW);
  afterAll(async () => {
    writeFileSync(join(runsDir, "real-agent-blog.json"), JSON.stringify(report ?? {}, null, 2));
    await launched?.close();
  });

  test(
    "a blog of three posts with photos and their credits",
    async () => {
      report = await buildBlog(launched, record);
      process.stdout.write(`[blog] ${JSON.stringify(report)}\n`);
      await launched.capture("real-agent-blog");
      const problems = await launched.app.evaluate(() =>
        [
          ...(
            globalThis as { upstart?: { agent: { sessions: Map<string, { problems: string[] }> } } }
          ).upstart!.agent.sessions.values(),
        ].flatMap((s) => s.problems),
      );
      expect(problems).toEqual([]);
    },
    960_000 * SLOW,
  );
});
