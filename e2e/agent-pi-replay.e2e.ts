// Upstart's own harness in the whole app, with no key spent (ADR 0012): a
// conversation with Gemini 4 Hydrogen, recorded once by agent-pi.e2e.ts with
// UPSTART_PI_RECORD, is played back. Only the model's replies are recorded:
// its tool calls run for real, so the files, the gallery's blocks, the
// checks and the preview are the app's, as with a real model.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, SLOW } from "./app.ts";

const fixture = join(import.meta.dirname, "fixtures/pi-florist.jsonl");

describe.skipIf(!existsSync(fixture))("Upstart's own harness, played back", () => {
  let launched: LaunchedApp;
  // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
  const main = <T>(fn: (upstart: any, arg: any) => T, arg?: unknown) =>
    launched.app.evaluate(
      (_electron, [source, arg]) =>
        new Function("u", "a", `return (${source})(u, a)`)((globalThis as { upstart?: unknown }).upstart, arg),
      [fn.toString(), arg] as const,
    ) as Promise<Awaited<T>>;
  const invoke = (channel: string, ...args: unknown[]) =>
    launched.window.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
      ([channel, args]) => (window as any).upstart.invoke(channel, ...args),
      [channel, args] as const,
    );
  const until = async (read: () => Promise<unknown>, timeout: number) => {
    const started = Date.now();
    for (;;) {
      const value = await read().catch(() => undefined);
      if (value) return value;
      if (Date.now() - started > timeout) throw new Error(`timed out waiting for: ${read}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  };
  /** Sends a message, waits for the end of its turn, and answers the agent's item. */
  const turn = async (text: string, settings?: unknown, during?: () => Promise<void>) => {
    const before = await launched.window.getByTestId("agent-message").count();
    await invoke("conversation:send", text, ...(settings ? [settings] : []));
    const ended = () =>
      launched.window.locator('[data-testid="agent-message"]:not([data-status="working"])').nth(before).count();
    for (const started = Date.now(); !(await ended()); ) {
      if (Date.now() - started > 120_000) throw new Error("The turn did not end.");
      await during?.();
      await new Promise((r) => setTimeout(r, 100));
    }
    const { items } = await invoke("conversation:get");
    return items.at(-1);
  };
  const labels = (item: { parts: { kind: string; activity?: { label: string; state: string } }[] }) =>
    item.parts.flatMap((p) => (p.kind === "activity" && p.activity ? [p.activity.label] : []));
  const problems = () => main((u) => [...u.agent.sessions.values()].flatMap((s: { problems: string[] }) => s.problems));
  const project = async () => (await invoke("projects:current")).path as string;

  beforeAll(async () => {
    // UPSTART_PACKAGED=1: in the packaged app (apps/desktop/dist), once `pnpm package` has run.
    launched = await launchApp({ env: { UPSTART_PI_REPLAY: fixture }, packaged: process.env.UPSTART_PACKAGED === "1" });
    await launched.window.getByTestId("message-input").waitFor();
    // A stand-in key: the replies are played back, nothing reaches Google.
    await main((u) => u.piAccounts.setKey("gemini", "AIza-e2e-stand-in-not-a-key"));
    await until(async () => (await invoke("agent:status")).accounts.gemini, 10_000);
  }, 60_000 * SLOW);
  afterAll(async () => {
    await launched?.close();
  });

  test(
    "Gemini 4 Hydrogen builds the site: blocks placed, the page shown while it is written",
    async () => {
      let shownWhileWorking = 0;
      const item = await turn(
        "Un site d'une page pour un fleuriste à Nantes, Fleur de Loire : le thème et la page d'accueil avec trois sections.",
        { model: "gemini/gemini-4-hydrogen", effort: "medium" },
        async () => {
          const text = await main((u) =>
            u.preview.view.webContents.executeJavaScript("document.body?.innerText.length ?? 0").catch(() => 0),
          );
          shownWhileWorking = Math.max(shownWhileWorking, Number(text) || 0);
        },
      );
      expect(item).toMatchObject({ kind: "agent", status: "done" });
      expect(labels(item)).toContain("Placing blocks on pages/index.liquid");
      expect(shownWhileWorking).toBeGreaterThan(0);
      const path = await project();
      expect(existsSync(join(path, "theme.css"))).toBe(true);
      expect(readFileSync(join(path, "pages/index.liquid"), "utf8")).toMatch(/render/);
      expect(await problems()).toEqual([]);
      expect((await invoke("projects:current")).model).toBe("gemini/gemini-4-hydrogen");
      await launched.capture("pi-replay-first-turn");
    },
    150_000 * SLOW,
  );

  test(
    "a second message continues the conversation",
    async () => {
      const item = await turn("Mets le nom du fleuriste en titre de l'onglet, sans rien changer d'autre.");
      expect(item).toMatchObject({ kind: "agent", status: "done" });
      expect(readFileSync(join(await project(), "pages/index.liquid"), "utf8")).toMatch(/<title>[^<]*Fleur de Loire/);
    },
    150_000 * SLOW,
  );

  test(
    "the agent searches the web, a line says so, and it writes what it found",
    async () => {
      const item = await turn(
        "Le fleuriste est en face du Jardin des Plantes de Nantes : cherche sur le web les horaires d'ouverture du jardin en hiver, et ajoute-les dans le pied de page, sous « Le jardin d'en face ».",
      );
      expect(item).toMatchObject({ kind: "agent", status: "done" });
      expect(labels(item)).toContain("Searching the web");
      const path = await project();
      const footer = ["parts/footer.liquid", "pages/index.liquid"]
        .map((f) => (existsSync(join(path, f)) ? readFileSync(join(path, f), "utf8") : ""))
        .join("\n");
      expect(footer).toMatch(/jardin d.en face/i);
      expect(await problems()).toEqual([]);
    },
    150_000 * SLOW,
  );
});
