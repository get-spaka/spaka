// Timing marks and self-test results, written where the measuring scripts
// ask for them. Does nothing unless SPIKE_OUT is set.
//
//   SPIKE_OUT       folder that receives marks.jsonl and report.json
//   SPIKE_SELFTEST  comma-separated checks the interface runs by itself: capture, agent
//   SPIKE_EXIT_ON   name of the mark after which the app quits, or "report"
//                   ("agent-done" is marked by the main process when a turn ends)
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function createSpikeOut(quit, env = process.env) {
  const dir = env.SPIKE_OUT || null;
  const exitOn = env.SPIKE_EXIT_ON || null;
  if (dir) mkdirSync(dir, { recursive: true });
  const leave = () => setTimeout(quit, 150);
  return {
    dir,
    selftest: env.SPIKE_SELFTEST || null,
    mark(name) {
      if (dir) appendFileSync(join(dir, "marks.jsonl"), JSON.stringify({ name, t: Date.now() }) + "\n");
      if (exitOn === name) leave();
    },
    /** Writes `<name>.json`: results the main process holds itself. */
    save(name, data) {
      if (dir) writeFileSync(join(dir, `${name}.json`), JSON.stringify(data, null, 2));
    },
    report(result) {
      if (dir) writeFileSync(join(dir, "report.json"), JSON.stringify(result, null, 2));
      if (exitOn === "report") leave();
    },
  };
}
