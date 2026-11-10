import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { launchApp } from "./app.ts";

const built = existsSync(join(import.meta.dirname, "../apps/desktop/dist/mac-arm64/Upstart.app"));

// Run after `pnpm --filter @upstart/desktop package`.
describe.runIf(built && process.platform === "darwin")("the packaged app", () => {
  test("starts in the background and shows its interface", async () => {
    const launched = await launchApp({ packaged: true });
    try {
      await launched.window.getByTestId("conversation").waitFor();
      const packaged = await launched.app.evaluate(({ app }) => app.isPackaged);
      expect(packaged).toBe(true);
    } finally {
      await launched.close();
    }
  });
});
