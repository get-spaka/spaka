import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, SLOW } from "./app.ts";
import { ASKED, writeSecretsRecording } from "./fixtures/secrets-recording.ts";
import { previewDriver } from "./preview-driver.ts";

// A website's secrets (Q501, Q558, Q559), on a made-up recording
// (fixtures/secrets-recording.ts) whose ask_secret runs for real: a server
// module that reads a secret not given says so; the agent's card takes the
// value in a masked field, words typed in the message box meanwhile stay
// there; the agent learns only that it was given, and the module reads it at
// once. The website's settings list the secrets without their values, and
// those the modules read with none, given there too; replaced, removed.
// Nowhere (the conversation, the project, its history, Spaka's data and
// logs) does the value appear, but sealed in Spaka's keeping.
const VALUE = "sk_test_e2e_4f9c2b71d0a8";
const MAILER = "mk_e2e_77aa01";

describe("a website's secrets", () => {
  let launched: LaunchedApp;
  let path = "";
  const { invoke, until, page } = previewDriver(() => launched);
  const replayed = () =>
    launched.app.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      () => (globalThis as any).spaka.replayed as string[],
    );
  const toolAnswers = async () =>
    (await replayed())
      .filter((l) => l.startsWith("[mcp__spaka__ask_secret] "))
      .map((l) => l.slice("[mcp__spaka__ask_secret] ".length));
  const turnsDone = () => launched.window.locator('[data-testid="agent-message"][data-status="done"]').count();
  const send = async (text: string) => {
    await launched.window.getByTestId("message-input").fill(text);
    await launched.window.getByTestId("message-input").press("Enter");
  };
  const look = (route: string) =>
    launched.app.evaluate(async (_electron, route) => {
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      const seen = await (globalThis as any).spaka.preview.look(route);
      return { errors: seen.errors as string[], notes: seen.notes as string[] };
    }, route);
  const write = (file: string, text: string) => {
    mkdirSync(join(path, file, ".."), { recursive: true });
    writeFileSync(join(path, file), text);
  };

  beforeAll(async () => {
    const scratch = mkdtempSync(join(tmpdir(), "spaka-secrets-"));
    writeSecretsRecording(join(scratch, "secrets.jsonl"));
    launched = await launchApp({ env: { SPAKA_AGENT_REPLAY: join(scratch, "secrets.jsonl") } });
    await launched.window.getByTestId("message-input").waitFor();
    await send("A bakery in Lyon.");
    await until(async () => (await turnsDone()) === 1, 30_000);
    path = ((await invoke("projects:current")) as { path: string }).path;
    await invoke("preview:set-view", "page");
    write(
      "server/pay.ts",
      `export function load(args, { env }) {
        return { length: env.PAYMENT_KEY.length, start: env.PAYMENT_KEY.slice(0, 8) };
      }`,
    );
    write("server/mail.ts", "export function load(args, { env: { MAILER_KEY } }) { return MAILER_KEY.length; }");
    write(
      "pages/pay.liquid",
      `<!doctype html><html lang="en"><head><title>Pay</title></head><body><main>
{% load pay %}<p id="pay">{% if pay %}{{ pay.start }} ({{ pay.length }}){% else %}none{% endif %}</p>
</main></body></html>`,
    );
  }, 90_000 * SLOW);
  afterAll(async () => {
    await launched?.close();
  });

  test("a module that reads a secret not given says so to the agent", async () => {
    const seen = await look("/pay");
    expect(seen.notes).toContainEqual(
      expect.stringMatching(
        /^pages\/pay\.liquid: load pay: the secret PAYMENT_KEY is not set: the agent asks the maker for it with ask_secret/,
      ),
    );
  });

  test("the agent's card takes it in a masked field; the agent learns it was given; the module reads it", async () => {
    const w = launched.window;
    await send("Take payments for the lessons.");
    const card = w.locator('[data-testid="secret-card"][data-state="waiting"]');
    await card.waitFor();
    await expect(card.textContent()).resolves.toContain(ASKED.purpose);
    await expect(card.textContent()).resolves.toContain(ASKED.where_to_find);
    expect(await card.getByTestId("secret-value").getAttribute("type")).toBe("password");
    // Words typed in the message box meanwhile, which may hold the key, stay there.
    await send(VALUE);
    await new Promise((r) => setTimeout(r, 300));
    expect(await w.getByTestId("message-input").inputValue()).toBe(VALUE);
    await w.getByTestId("message-input").fill("");
    await launched.capture("secret-card");
    await card.getByTestId("secret-value").fill(VALUE);
    await card.getByTestId("secret-save").click();
    await until(async () => (await turnsDone()) === 2);
    await expect(w.locator('[data-testid="secret-card"][data-state="answered"]').textContent()).resolves.toContain(
      "PAYMENT_KEY given",
    );
    expect(await toolAnswers()).toEqual([
      "The maker gave PAYMENT_KEY: the website's server modules read it as env.PAYMENT_KEY. You do not see its value; never ask for it in the conversation.",
    ]);
    await invoke("preview:navigate", "/pay");
    await until(() => page(`document.querySelector('#pay')?.textContent === 'sk_test_ (${VALUE.length})'`), 20_000);
  });

  test("declined, the agent is told to go on without it", async () => {
    await send("And the mails.");
    const card = launched.window.locator('[data-testid="secret-card"][data-state="waiting"]');
    await card.waitFor();
    await card.getByTestId("secret-skip").click();
    await until(async () => (await turnsDone()) === 3);
    expect((await toolAnswers())[1]).toMatch(/^The maker did not give MAILER_KEY for now\./);
  });

  test("the settings list them without values, the missing one given there; replaced, removed", async () => {
    const w = launched.window;
    await w.getByTestId("header-site-settings").click();
    const row = (name: string) => w.locator(`[data-testid="secret"][data-name="${name}"]`);
    await row("PAYMENT_KEY").waitFor();
    expect(await row("PAYMENT_KEY").getAttribute("data-set")).toBe("true");
    expect(await row("MAILER_KEY").getAttribute("data-set")).toBe("false");
    const section = w.getByTestId("site-secrets");
    await expect(section.textContent()).resolves.toContain(ASKED.purpose);
    await expect(section.textContent()).resolves.toContain("Read by server/mail.ts, with no value");
    await expect(section.textContent()).resolves.not.toContain(VALUE);
    // The dialog settled, for its picture.
    await new Promise((r) => setTimeout(r, 400));
    await launched.capture("secrets-settings");
    // The missing one, given in its row.
    await section.getByTestId("secret-value-field").fill(MAILER);
    await section.getByTestId("secret-save").click();
    await until(async () => (await row("MAILER_KEY").getAttribute("data-set")) === "true");
    // Replaced: the module reads the new value at once.
    const rowOf = (name: string) => section.locator("div.min-h-11").filter({ has: row(name) });
    await rowOf("PAYMENT_KEY").getByTestId("secret-replace").click();
    await section.getByTestId("secret-value-field").fill(`${VALUE}x`);
    await section.getByTestId("secret-save").click();
    await until(async () => (await section.getByTestId("secret-value-field").count()) === 0);
    await w.getByTestId("site-settings-done").click();
    await invoke("preview:navigate", "/pay");
    await until(() => page(`document.querySelector('#pay')?.textContent === 'sk_test_ (${VALUE.length + 1})'`), 20_000);
    // Removed: missing again, as the module still reads it.
    await w.getByTestId("header-site-settings").click();
    w.once("dialog", (d) => void d.accept());
    await row("MAILER_KEY").waitFor();
    await rowOf("MAILER_KEY").getByTestId("secret-remove").click();
    await until(async () => (await row("MAILER_KEY").getAttribute("data-set")) === "false");
  });

  test("the values appear nowhere but sealed in Spaka's keeping", async () => {
    const found: string[] = [];
    const search = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const file = join(dir, entry);
        const stat = statSync(file, { throwIfNoEntry: false });
        if (!stat) continue;
        if (stat.isDirectory()) search(file);
        else if (stat.size < 20_000_000 && entry !== "site-secrets.bin") {
          const text = readFileSync(file).toString("latin1");
          if (text.includes(VALUE) || text.includes(MAILER)) found.push(file);
        }
      }
    };
    search(launched.dataDir);
    search(path);
    expect(found).toEqual([]);
    const conversation = await launched.window.getByTestId("conversation").textContent();
    expect(conversation).not.toContain(VALUE);
    expect(conversation).not.toContain(MAILER);
  });
});
