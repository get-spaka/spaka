import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, SLOW } from "./app.ts";

// The accounts (Q269, Q275): at first launch the panel offers Claude, ChatGPT
// or an API key; a key connects its account, whose models the selector then
// lists, grouped by account; the settings' Accounts page shows all four. The
// key here is a stand-in: no request reaches Google.
const STAND_IN = "AIza-e2e-stand-in-not-a-key";

describe("the accounts", () => {
  let launched: LaunchedApp;
  let w: Page;
  const invoke = (channel: string, ...args: unknown[]) =>
    launched.window.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
      ([channel, args]) => (window as any).upstart.invoke(channel, ...args),
      [channel, args] as const,
    );
  const until = async (read: () => Promise<unknown>, timeout = 10_000) => {
    const started = Date.now();
    for (;;) {
      const value = await read().catch(() => undefined);
      if (value) return value;
      if (Date.now() - started > timeout) throw new Error(`timed out waiting for: ${read}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  };
  const groups = () =>
    w
      .getByTestId("model-select")
      .locator("optgroup")
      .evaluateAll((els) =>
        els.map(
          (g) =>
            `${g.getAttribute("label")}: ${[...g.querySelectorAll("option")].map((o) => o.textContent).join(", ")}`,
        ),
      );

  beforeAll(async () => {
    // The binary is asked whether it is signed in, which a replayed agent skips.
    launched = await launchApp({ env: { UPSTART_AGENT_REPLAY: "" } });
    w = launched.window;
    await w.getByTestId("message-input").waitFor();
    // A fresh installation: Claude's binary is not signed in.
    await until(async () => (await invoke("agent:status")).auth === "signed-out", 30_000);
  }, 60_000 * SLOW);
  afterAll(async () => {
    await launched?.close();
  });

  test("with no account, the panel offers Claude, ChatGPT or a key, and nothing can be sent", async () => {
    const panel = w.getByTestId("sign-in");
    await panel.waitFor();
    expect(await panel.textContent()).toContain("Connect an account");
    expect(await w.getByTestId("sign-in-chatgpt").textContent()).toBe("Sign in with ChatGPT");
    await w.getByTestId("message-input").fill("Un site pour un fleuriste");
    expect(await w.getByTestId("send").isDisabled()).toBe(true);
    await launched.capture("accounts-first-launch");
  });

  test("a Gemini key pasted in the panel connects Gemini: its models are offered, the first chosen", async () => {
    await w.getByTestId("sign-in-key").click();
    await w.getByTestId("sign-in-key-input").fill(STAND_IN);
    // The key's start says whose it is.
    expect(await w.getByTestId("sign-in-key-account").inputValue()).toBe("gemini");
    await w.getByTestId("sign-in-key-input").press("Enter");
    await until(async () => (await w.getByTestId("sign-in").count()) === 0);
    const status = await invoke("agent:status");
    expect(status.accounts).toEqual({ chatgpt: false, openai: false, gemini: true, vertex: false });
    expect(await groups()).toEqual(["Gemini: Gemini 4 Hydrogen, Gemini 4 Carbon"]);
    expect(await w.getByTestId("model-select").inputValue()).toBe("gemini/gemini-4-hydrogen");
    expect(await w.getByTestId("send").isDisabled()).toBe(false);
    // Kept encrypted, never as typed.
    expect(readFileSync(join(launched.dataDir, "accounts/keys.bin"), "utf8")).not.toContain(STAND_IN);
    await launched.capture("accounts-gemini-connected");
  });

  test("the settings' Accounts page shows the four accounts; removing the key brings the panel back", async () => {
    await invoke("settings:open", "agent");
    await until(async () => (await w.getByTestId("settings-title").textContent()) === "Accounts");
    // The panel asks for the accounts as it opens.
    await until(async () => (await w.getByTestId("settings-account").textContent())?.includes("Gemini"));
    for (const id of ["account", "api-key", "chatgpt", "openai-key", "gemini-key", "vertex-key", "vertex-gcloud"])
      expect(await w.locator(`[data-setting="${id}"]`).count()).toBe(1);
    expect(await w.locator('[data-setting="gemini-key"]').textContent()).toContain("kept");
    expect(await w.getByTestId("chatgpt-sign-in").textContent()).toBe("Sign in…");
    // New websites get a connected account's model.
    expect(await w.getByTestId("new-model").inputValue()).toBe("gemini/gemini-4-hydrogen");
    await launched.capture("accounts-settings");
    await w.getByTestId("gemini-key-remove").click();
    await until(async () => (await invoke("agent:status")).accounts.gemini === false);
    await w.getByTestId("settings-close").click();
    await w.getByTestId("sign-in").waitFor();
  });

  test("an OpenAI key typed in the settings connects OpenAI's models; the selector also offers to connect another", async () => {
    await invoke("settings:open", "agent");
    await w.getByTestId("openai-key-use").click();
    await w.getByTestId("openai-key-input").fill("sk-e2e-stand-in-not-a-key");
    await w.getByTestId("openai-key-input").press("Enter");
    await until(async () => (await invoke("agent:status")).accounts.openai === true);
    await w.getByTestId("settings-close").click();
    await until(async () => (await w.getByTestId("sign-in").count()) === 0);
    expect(await groups()).toEqual(["OpenAI: GPT-6.1 Terra, GPT-6.1 Sol"]);
    await w.getByTestId("model-select").selectOption("connect-another-account");
    await until(async () => (await w.getByTestId("settings-title").textContent()) === "Accounts");
    await invoke("agent:set-key", "openai", null);
  });

  test("Vertex AI connects with an express key, or with gcloud's sign-in and a project, one replacing the other (Q280)", async () => {
    await invoke("settings:open", "agent");
    await w.getByTestId("vertex-key-use").click();
    await w.getByTestId("vertex-key-input").fill("AQ.e2e-stand-in-not-a-key");
    await w.getByTestId("vertex-key-input").press("Enter");
    await until(async () => (await invoke("agent:status")).accounts.vertex === true);
    await w.getByTestId("settings-close").click();
    await until(async () => (await w.getByTestId("sign-in").count()) === 0);
    expect(await groups()).toEqual(["Vertex AI: Gemini 4 Hydrogen, Gemini 4 Carbon"]);
    expect(await w.getByTestId("model-select").inputValue()).toBe("vertex/gemini-4-hydrogen");
    expect(readFileSync(join(launched.dataDir, "accounts/keys.bin"), "utf8")).not.toContain("AQ.e2e");

    // A project on gcloud's sign-in replaces the key; whether the sign-in is made depends on this computer.
    await invoke("settings:open", "agent");
    await w.getByTestId("vertex-gcloud-use").click();
    await w.getByTestId("vertex-gcloud-input").fill("e2e-project");
    await w.getByTestId("vertex-gcloud-input").press("Enter");
    await until(async () => (await invoke("agent:status")).vertexGcloud?.project === "e2e-project");
    await until(async () => (await w.locator('[data-setting="vertex-gcloud"]').textContent())?.includes("e2e-project"));
    expect(await w.locator('[data-setting="vertex-key"]').textContent()).not.toContain("kept");
    await launched.capture("accounts-vertex");
    await w.getByTestId("vertex-gcloud-stop").click();
    await until(async () => !(await invoke("agent:status")).vertexGcloud);
    expect((await invoke("agent:status")).accounts.vertex).toBe(false);
  });
});
