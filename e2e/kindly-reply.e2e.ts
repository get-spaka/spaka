import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, runsDir, SLOW } from "./app.ts";
import { previewDriver } from "./preview-driver.ts";

// Kindly's reply card (RSVP), sent for real: in the preview, where it is kept
// as a test record and answered with the sealed envelope, and on the website
// exported with its Node server, where the reply reaches the Content tab.
describe("Kindly's reply card", () => {
  let launched: LaunchedApp;
  let path: string;
  let server: ChildProcess | undefined;
  const { invoke, until, page, picture } = previewDriver(() => launched);
  const w = () => launched.window;

  /** Fills the reply card of a page and sends it, as a guest would (the radios and fields set, then submitted). */
  const FILL = (who: string, sunday = "no") => `(() => {
    const form = document.querySelector('form[hx-post="/_data/rsvps"]');
    if (!form) return false;
    const pick = (name, value) => { const el = form.querySelector('input[name="' + name + '"][value="' + value + '"]'); el.checked = true; };
    pick("attending", "accepts");
    form.elements.name.value = ${JSON.stringify(who)};
    form.elements.email.value = "guest@example.com";
    form.elements.party.value = form.elements.party.options[form.elements.party.options.length > 1 ? 1 : 0].value;
    form.elements.guests.value = "Sam";
    pick("dinner", "lake whitefish");
    form.elements.diet.value = "No nuts";
    pick("friday", "yes");
    pick("sunday", ${JSON.stringify(sunday)});
    form.elements.song.value = "September";
    form.elements.note.value = "We can't wait.";
    form.querySelector('button[type="submit"]').click();
    return true;
  })()`;
  /** What the reply area shows once answered: the sealed envelope and its line. */
  const SEALED = `(() => {
    const sealed = document.querySelector("[data-seal]");
    return sealed ? { text: sealed.textContent.replace(/\\s+/g, " ").trim(), form: !!document.querySelector('form[hx-post="/_data/rsvps"]') } : null;
  })()`;

  beforeAll(async () => {
    launched = await launchApp();
    await w().getByTestId("message-input").waitFor();
    await invoke("conversation:send", "A wedding on Mackinac Island.", {
      model: "claude-opus-5-5",
      effort: "low",
      template: "kindly",
    });
    await until(() => w().locator('[data-testid="agent-message"][data-status="done"]').count(), 60_000);
    path = (await invoke("projects:current")).path;
    expect(existsSync(join(path, "pages/rsvp.liquid"))).toBe(true);
    await invoke("preview:set-view", "page");
  }, 120_000 * SLOW);
  afterAll(async () => {
    server?.kill();
    await launched?.close();
  });

  test("in the preview: the card is sent, kept as a test record, and answered with the sealed envelope", async () => {
    await invoke("preview:navigate", "/rsvp");
    await until(() =>
      page("location.pathname === '/rsvp' && !!document.querySelector('form[hx-post=\"/_data/rsvps\"]')"),
    );
    await picture("kindly-reply-card");
    expect(await page(FILL("Ada Lovelace"))).toBe(true);
    const sealed = (await until(() => page(SEALED), 15_000)) as { text: string; form: boolean };
    expect(sealed.form).toBe(false);
    expect(sealed.text).toMatch(/Iris|Callum/);
    // The envelope's animation, then its resting state.
    await new Promise((r) => setTimeout(r, 400));
    await picture("kindly-reply-sealing");
    await new Promise((r) => setTimeout(r, 3500));
    await picture("kindly-reply-sealed");
    const dir = join(path, ".upstart/test-records/rsvps");
    await until(async () => existsSync(dir) && readdirSync(dir).some((f) => f.endsWith(".md")));
    const record = readFileSync(join(dir, readdirSync(dir).find((f) => f.endsWith(".md"))!), "utf8");
    writeFileSync(join(runsDir, "kindly-reply-record.md"), record);
    expect(record).toContain("name: Ada Lovelace");
    expect(record).toContain("attending: accepts");
    expect(record).toContain("We can't wait.");
    // In the Content tab, as a test record.
    await w().getByTestId("tab-content").click();
    await w().locator('[data-testid="datasource"][data-name="rsvps"]').click();
    await until(async () => (await w().getByTestId("record").count()) === 1);
    await launched.capture("kindly-reply-content-preview");
    await w().getByTestId("content-back").click();
    await w().getByTestId("tab-conversation").click();
  });

  test("on the website exported with its server: sent from its page, sealed, and read in the Content tab", async () => {
    const out = join(runsDir, "kindly-node");
    rmSync(out, { recursive: true, force: true });
    const token = (await invoke("site:token")) as string;
    await invoke("export:run", out, "node");
    const port = await new Promise<number>((resolve) => {
      const probe = createServer();
      probe.listen(0, "127.0.0.1", () => {
        const p = (probe.address() as AddressInfo).port;
        probe.close(() => resolve(p));
      });
    });
    const base = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, ["server.mjs"], {
      cwd: out,
      env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", UPSTART_TOKEN: token },
      stdio: "ignore",
    });
    await until(async () => (await fetch(`${base}/rsvp`)).ok, 15_000);
    // The published page in a hidden window of its own, sent as a guest would.
    const result = await launched.app.evaluate(
      async ({ BrowserWindow }, { url, fill, sealedCode }) => {
        const win = new BrowserWindow({
          show: false,
          width: 1280,
          height: 900,
          paintWhenInitiallyHidden: true,
          webPreferences: { backgroundThrottling: false },
        });
        await win.loadURL(url);
        const run = (code: string) => win.webContents.executeJavaScript(code);
        for (let i = 0; i < 100 && !(await run("!!window.htmx")); i++) await new Promise((r) => setTimeout(r, 50));
        const filled = await run(fill);
        let sealed = null;
        for (let i = 0; i < 200 && !sealed; i++) {
          await new Promise((r) => setTimeout(r, 50));
          sealed = await run(sealedCode);
        }
        await new Promise((r) => setTimeout(r, 4000));
        const shot = (await win.webContents.capturePage()).toPNG().toString("base64");
        // The sealed envelope on a phone.
        win.setSize(390, 844);
        await run("document.querySelector('[data-seal]').scrollIntoView({ block: 'center' }), true");
        await new Promise((r) => setTimeout(r, 600));
        const phone = (await win.webContents.capturePage()).toPNG().toString("base64");
        // Where the seal stands against the lines below it, at both widths.
        const gap = await run(`(() => {
          const seal = document.querySelector(".sealed-seal").getBoundingClientRect();
          const from = document.querySelector("[data-seal-lines] p").getBoundingClientRect();
          return Math.round(from.top - seal.bottom);
        })()`);
        const errors = await run("window.__errors || []");
        win.destroy();
        return { filled, sealed, shot, phone, gap, errors };
      },
      // The longest reply: a long name, a party, Friday and Sunday.
      { url: `${base}/rsvp`, fill: FILL("Maximilian Featherstonehaugh-Whitley", "yes"), sealedCode: SEALED },
    );
    writeFileSync(join(runsDir, "kindly-reply-published.png"), Buffer.from(result.shot, "base64"));
    writeFileSync(join(runsDir, "kindly-reply-published-phone.png"), Buffer.from(result.phone, "base64"));
    // The seal sits above the lines, not over them.
    expect(result.gap).toBeGreaterThanOrEqual(0);
    expect(result.filled).toBe(true);
    expect(result.sealed).toMatchObject({ form: false });
    // What it collected, in the Content tab beside the preview's test record.
    await invoke("projects:set-site-url", base);
    expect(await invoke("site:check")).toMatchObject({ ok: true });
    await w().getByTestId("tab-content").click();
    await w().locator('[data-testid="datasource"][data-name="rsvps"]').click();
    await until(async () => (await w().getByTestId("record").count()) === 2, 15_000);
    await launched.capture("kindly-reply-content-published");
  });
});
