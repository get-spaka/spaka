import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, SLOW } from "./app.ts";
import { FLAW, PACKAGE, writePackagesRecording, writePackagesServices } from "./fixtures/packages-recording.ts";

// A website's packages (Q491-Q540), on a made-up recording
// (fixtures/packages-recording.ts) whose add_package runs for real against
// recorded services: a package Spaka has doubts about gets a card, not
// installed when the maker says no; installed when they say yes, by a pnpm
// that writes package.json and the lockfile without downloading anything
// (src/main/packages/fixtures/fake-pnpm.cjs), then listed in the website's
// settings; a flaw published since is told when the site opens, with a
// button that asks the agent for the update; Remove takes it out.
const DESKTOP = join(import.meta.dirname, "../apps/desktop");
const { version: PNPM } = JSON.parse(readFileSync(join(DESKTOP, "src/main/packages/pnpm.json"), "utf8"));

describe("a website's packages", () => {
  let launched: LaunchedApp;
  const until = async (read: () => Promise<unknown>, timeout = 15_000) => {
    timeout *= SLOW;
    const started = Date.now();
    for (;;) {
      const value = await read().catch(() => undefined);
      if (value) return value;
      if (Date.now() - started > timeout) throw new Error(`timed out waiting for: ${read}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  };
  const invoke = <T = unknown>(channel: string, ...args: unknown[]): Promise<T> =>
    launched.window.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
      ([channel, args]) => (window as any).spaka.invoke(channel, ...(args as unknown[])),
      [channel, args] as const,
    ) as Promise<T>;
  const replayed = () =>
    launched.app.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      () => (globalThis as any).spaka.replayed as string[],
    );
  const toolAnswers = async () =>
    (await replayed())
      .filter((l) => l.startsWith("[mcp__spaka__add_package] "))
      .map((l) => l.slice("[mcp__spaka__add_package] ".length));
  const waitingCard = () => launched.window.locator('[data-testid="question-card"][data-state="waiting"]');
  const turnsDone = () => launched.window.locator('[data-testid="agent-message"][data-status="done"]').count();
  const send = async (text: string) => {
    await launched.window.getByTestId("message-input").fill(text);
    await launched.window.getByTestId("message-input").press("Enter");
  };

  beforeAll(async () => {
    const scratch = mkdtempSync(join(tmpdir(), "spaka-packages-"));
    writePackagesRecording(join(scratch, "packages.jsonl"));
    writePackagesServices(join(scratch, "services.json"));
    launched = await launchApp({
      env: {
        SPAKA_AGENT_REPLAY: join(scratch, "packages.jsonl"),
        SPAKA_PACKAGES_FIXTURE: join(scratch, "services.json"),
      },
    });
    // Spaka's pnpm, already there: one that installs nothing (not on Windows, where it is a program).
    const program = join(launched.dataDir, "tools", `pnpm-${PNPM}`, "pnpm");
    mkdirSync(join(program, ".."), { recursive: true });
    writeFileSync(
      program,
      `#!/bin/sh\nexec node ${JSON.stringify(join(DESKTOP, "src/main/packages/fixtures/fake-pnpm.cjs"))} "$@"\n`,
    );
    chmodSync(program, 0o755);
    await launched.window.getByTestId("message-input").waitFor();
  }, 60_000 * SLOW);
  afterAll(async () => {
    await launched?.close();
  });

  test("a package Spaka doubts gets a card with its doubts and no choice recommended; no, and nothing is installed", async () => {
    const w = launched.window;
    await send("A bakery in Lyon.");
    await until(() => waitingCard().count());
    const card = waitingCard();
    await expect(card.textContent()).resolves.toContain(
      `The agent wants to add the package ${PACKAGE} 1.0.0 to the website: Tiny ids.`,
    );
    for (const doubt of [
      "it was first published 30 days ago",
      "it was downloaded 3 times last week",
      "its name is close to nanoid, a well-known package",
      "it links to no source repository",
    ])
      await expect(card.textContent()).resolves.toContain(doubt);
    expect(await card.getByTestId("question-recommended").count()).toBe(0);
    await expect(card.getByTestId("question-choice").allTextContents()).resolves.toEqual([
      expect.stringMatching(/^Install it/),
      expect.stringMatching(/^Don't install it/),
    ]);
    await launched.capture("package-card");
    await card.getByRole("button", { name: /^Don't install it/ }).click();
    await card.getByTestId("question-answer").click();
    await until(async () => (await turnsDone()) === 1);
    expect(await toolAnswers()).toEqual([
      `The maker chose not to install ${PACKAGE}. Go on without it, or ask them about another package.`,
    ]);
    const { path } = await invoke<{ path: string }>("projects:current");
    expect(() => readFileSync(join(path, "package.json"))).toThrow();
    expect(await w.getByTestId("notice").count()).toBe(0);
  });

  test.skipIf(process.platform === "win32")(
    "yes installs it; the settings list it; a flaw published since is told at the opening, its button asks the agent; Remove",
    async () => {
      const w = launched.window;
      await send("Add it after all.");
      await until(() => waitingCard().count());
      await waitingCard()
        .getByRole("button", { name: /^Install it/ })
        .click();
      await waitingCard().getByTestId("question-answer").click();
      await until(async () => (await turnsDone()) === 2);
      expect((await toolAnswers())[1]).toMatch(
        new RegExp(
          `^Installed ${PACKAGE} 1\\.0\\.0 \\(MIT\\) in the website's node_modules\\.\\n\\nThe maker chose to install it although`,
        ),
      );
      const { id, path } = await invoke<{ id: string; path: string }>("projects:current");
      expect(JSON.parse(readFileSync(join(path, "package.json"), "utf8"))).toMatchObject({
        type: "module",
        dependencies: { [PACKAGE]: "1.0.0" },
      });
      // node_modules stays out of the history and the agent's searches (ADR 0013).
      expect(readFileSync(join(path, ".ignore"), "utf8")).toContain("node_modules/");

      // In the website's settings (Q520).
      await w.getByTestId("header-site-settings").click();
      const row = w.locator(`[data-testid="package"][data-name="${PACKAGE}"]`);
      await row.waitFor();
      await expect(row.textContent()).resolves.toBe(`${PACKAGE} 1.0.0`);
      await expect(w.getByTestId("site-packages").textContent()).resolves.toContain("MIT · npm · Not imported yet");
      // The dialog settled, for its picture.
      await new Promise((r) => setTimeout(r, 400));
      await launched.capture("packages-settings");
      await w.getByTestId("site-settings-done").click();

      // The site opened again: the flaw OSV now lists for 1.0.0, in a notice with its button (Q521, Q538).
      await invoke("projects:close");
      await invoke("projects:open", id);
      const notice = w.getByTestId("notice").filter({ hasText: FLAW });
      await notice.waitFor();
      await expect(notice.textContent()).resolves.toContain(
        `${PACKAGE} 1.0.0 has a known flaw: Ids repeat after a while (${FLAW}). It is fixed in 1.0.1.`,
      );
      await launched.capture("package-flaw");
      await notice.getByTestId("notice-action").click();
      await until(async () => (await turnsDone()) === 3);
      await expect(w.getByTestId("maker-message").last().textContent()).resolves.toBe(
        `Update the package ${PACKAGE} to 1.0.1 or later, to be rid of the known flaw ${FLAW}.`,
      );
      // Told once: opened again, the same notice is not repeated.
      await invoke("projects:close");
      await invoke("projects:open", id);
      await new Promise((r) => setTimeout(r, 1000 * SLOW));
      expect(await w.getByTestId("notice").filter({ hasText: FLAW }).count()).toBe(1);

      // Remove, after a confirmation.
      await w.getByTestId("header-site-settings").click();
      w.once("dialog", (dialog) => void dialog.accept());
      await w.getByTestId("site-packages").getByTestId("package-remove").click();
      await w.getByTestId("site-packages").getByText("No package yet.").waitFor();
      expect(JSON.parse(readFileSync(join(path, "package.json"), "utf8")).dependencies).toEqual({});
      await w.getByTestId("site-settings-done").click();
    },
  );
});
