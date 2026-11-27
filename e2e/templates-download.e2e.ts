import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, SLOW } from "./app.ts";

/** A template's version in the repository's templates, of which the release is built. */
const version = (id: string): string =>
  JSON.parse(readFileSync(join(import.meta.dirname, "../apps/desktop/templates", id, "template.json"), "utf8")).version;

// Spaka's templates as a packaged app has them (Q247, Q250, Q265): from the
// releases of the public repository, here a release built from the
// repository's templates as its CI builds one and served on this machine. The
// app starts with no catalogue shipped, reads the latest one, shows the
// pictures, and downloads a template only when it is viewed large or chosen,
// checked and kept; offline, it says so and starting from scratch stays possible.
describe("Spaka's templates, downloaded", () => {
  let launched: LaunchedApp;
  let server: Server;
  const asked: string[] = [];
  let offline = false;
  const main = <T>(code: string): Promise<T> =>
    launched.app.evaluate(
      // biome-ignore lint/security/noGlobalEval: the step, written by the check itself
      (_electron, code) => eval(code),
      code,
    ) as Promise<T>;
  const until = async <T>(read: () => Promise<T>, timeout = 20_000): Promise<T> => {
    timeout *= SLOW;
    const started = Date.now();
    for (;;) {
      const value = await read().catch(() => undefined);
      if (value) return value;
      if (Date.now() - started > timeout) throw new Error(`timed out waiting for: ${read}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  };
  const zips = () => asked.filter((u) => u.endsWith(".zip"));

  beforeAll(async () => {
    const out = mkdtempSync(join(tmpdir(), "spaka-release-"));
    // Its packages are not checked online here: template:check and the release's CI do it.
    const built = spawnSync("node", ["apps/desktop/scripts/template.mjs", "release", out, "v1", "--offline"], {
      cwd: join(import.meta.dirname, ".."),
      stdio: ["ignore", "pipe", "inherit"],
    });
    expect(built.status).toBe(0);
    // The releases, as GitHub serves them: the latest one's files, and each tag's.
    server = createServer((req, res) => {
      const url = req.url ?? "";
      asked.push(url);
      if (offline) return void res.socket?.destroy();
      const file = /^\/releases\/(?:latest\/download|download\/v1)\/([\w.-]+)$/.exec(url)?.[1];
      if (!file || !existsSync(join(out, file))) return void res.writeHead(404).end();
      res.writeHead(200).end(readFileSync(join(out, file)));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    launched = await launchApp({
      env: {
        SPAKA_TEMPLATES_URL: `http://127.0.0.1:${port}/releases`,
        SPAKA_TEMPLATES_SNAPSHOT: mkdtempSync(join(tmpdir(), "spaka-snapshot-")),
      },
    });
    await launched.window.getByTestId("start").waitFor();
  });
  afterAll(async () => {
    await launched?.close();
    server?.close();
  });

  test("the latest catalogue is read and its pictures shown; nothing downloaded yet", async () => {
    const w = launched.window;
    await w.locator('[data-testid="template-card"][data-template="reel"]').waitFor();
    expect(asked[0]).toBe("/releases/latest/download/catalogue.json");
    const ids = await w.getByTestId("template-card").evaluateAll((els) => els.map((el) => el.dataset.template));
    // Every template of the repository, as the release has them.
    const repository = readdirSync(join(import.meta.dirname, "../apps/desktop/templates")).filter((id) =>
      existsSync(join(import.meta.dirname, "../apps/desktop/templates", id, "template.json")),
    );
    expect([...ids].sort()).toEqual(repository.sort());
    await until(() => w.locator('[data-template="reel"] img[src^="data:image/webp"]').count());
    expect(asked).toContain(`/releases/download/v1/reel-${version("reel")}-cover.webp`);
    expect(zips()).toEqual([]);
  });

  test("offline, a template viewed large says it could not be downloaded; again online, it is shown", async () => {
    const w = launched.window;
    offline = true;
    const card = w.locator('[data-testid="template-card"][data-template="reel"]');
    await card.hover();
    await card.getByTestId("template-view").click();
    await w.getByTestId("template-problem").waitFor();
    await expect(w.getByTestId("template-problem").textContent()).resolves.toMatch(/Reel could not be downloaded/);
    await launched.capture("templates-offline");
    offline = false;
    await w.getByTestId("template-problem").getByRole("button").click();
    // The pictures of its pages, from its .zip (Q545).
    await until(() => w.locator('[data-testid="template-picture"][data-page="home"]').count());
    expect(zips().filter((u) => u.endsWith(`reel-${version("reel")}.zip`))).toHaveLength(2);
    // Kept: viewed again, it is not downloaded again.
    await w.getByTestId("template-back").click();
    await card.hover();
    await card.getByTestId("template-view").click();
    await until(() => w.locator('[data-testid="template-picture"][data-page="home"]').count());
    expect(zips().filter((u) => u.endsWith(`reel-${version("reel")}.zip`))).toHaveLength(2);
    await w.getByTestId("template-back").click();
  });

  test("offline, a website cannot start from a template not downloaded; online, it does", async () => {
    const w = launched.window;
    await w.locator('[data-testid="template-card"][data-template="ember"] button[aria-pressed]').click();
    offline = true;
    await w.getByTestId("message-input").fill("A cocktail bar in Ghent.");
    await w.getByTestId("message-input").press("Enter");
    await w.getByTestId("start-problem").waitFor();
    await expect(w.getByTestId("start-problem").textContent()).resolves.toMatch(/Ember could not be downloaded/);
    await expect(main<number>("globalThis.spaka.projects.list().length")).resolves.toBe(0);
    offline = false;
    await w.getByTestId("message-input").press("Enter");
    await w.getByTestId("conversation").waitFor();
    const project = await w.evaluate(() =>
      // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
      (window as any).spaka.invoke("projects:current"),
    );
    expect(project.template).toEqual({ id: "ember", version: version("ember") });
    expect(existsSync(join(project.path, "pages/index.liquid"))).toBe(true);
    expect(existsSync(join(project.path, ".spaka/skills/ember-design/SKILL.md"))).toBe(true);
  });
});
