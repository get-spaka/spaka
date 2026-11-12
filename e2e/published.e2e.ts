import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { memorySource, RECORDS_SCHEMA, Runtime, SqlStore } from "../packages/runtime/src/index.ts";
import { type LaunchedApp, launchApp } from "./app.ts";
import { previewDriver } from "./preview-driver.ts";

// What a published site collected, in the Content tab (Q177, Q183-Q185): a
// site published with the runtime and SQLite, served here; its address given
// in the website's settings and checked with the website's management token;
// its records listed with the preview's test records, marked; one waiting
// for review approved, one deleted for good after a confirmation, all saved
// as CSV; a wrong token said.
const GUESTBOOK =
  "label: Guestbook\ncollected: true\nreview: true\nbody: message\nfields:\n  - name: name\n    kind: text\n    required: true\n  - name: message\n    kind: markdown\n";

describe("what a published site collected", () => {
  let launched: LaunchedApp;
  let server: Server;
  let siteUrl: string;
  let token = "";
  const db = new DatabaseSync(":memory:");
  db.exec(RECORDS_SCHEMA);
  const store = new SqlStore({
    all: async (sql, params) => db.prepare(sql).all(...(params as never[])) as Record<string, unknown>[],
    run: async (sql, params) => Number(db.prepare(sql).run(...(params as never[])).changes),
  });
  const { invoke, until } = previewDriver(() => launched);
  const w = () => launched.window;
  const rows = () =>
    w()
      .getByTestId("record")
      .evaluateAll((els) =>
        els.map(
          (e) =>
            `${e.getAttribute("data-kind")}:${e.getAttribute("data-id")}${e.hasAttribute("data-pending") ? ":pending" : ""}`,
        ),
      );

  beforeAll(async () => {
    await store.add("guestbook", {
      id: "2026-11-10-0800-aaaa",
      submitted: "2026-11-10T08:00:00.000Z",
      status: "published",
      fields: { name: "Anne", message: 'Lovely, "really"' },
    });
    await store.add("guestbook", {
      id: "2026-11-12-0800-cccc",
      submitted: "2026-11-12T08:00:00.000Z",
      status: "pending",
      fields: { name: "=Waiting", message: "Hello" },
    });
    server = createServer(async (req, res) => {
      const runtime = new Runtime(memorySource({ "data/guestbook/_datasource.yaml": GUESTBOOK }), {
        collected: store,
        managementToken: token,
      });
      const response = await runtime.fetch(
        new Request(`http://site${req.url}`, { method: req.method, headers: req.headers as Record<string, string> }),
      );
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    siteUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;

    launched = await launchApp();
    await w().getByTestId("conversation").waitFor();
    await invoke("conversation:send", "A bakery in Lyon. Warm colours please.");
    await until(() => w().locator('[data-testid="agent-message"][data-status="done"]').count(), 30_000);
    const path = (await invoke("projects:current")).path as string;
    mkdirSync(join(path, "data/guestbook"), { recursive: true });
    writeFileSync(join(path, "data/guestbook/_datasource.yaml"), GUESTBOOK);
    mkdirSync(join(path, ".upstart/test-records/guestbook"), { recursive: true });
    writeFileSync(
      join(path, ".upstart/test-records/guestbook/2026-11-11-0800-bbbb.md"),
      "---\nname: Test person\nsubmitted: 2026-11-11T08:00:00.000Z\n---\nA test.\n",
    );
    token = (await invoke("site:token")) as string;
  }, 90_000);
  afterAll(async () => {
    await launched?.close();
    server?.close();
  });

  test("before an address is given, only the test records, said so", async () => {
    await w().getByTestId("tab-content").click();
    await w().locator('[data-testid="datasource"][data-name="guestbook"]').click();
    await until(async () => (await w().getByTestId("collected-site").count()) === 1);
    expect(await w().getByTestId("collected-site").getAttribute("data-reason")).toBe("no-address");
    expect(await rows()).toEqual(["test:2026-11-11-0800-bbbb"]);
    // The CSV holds what the list shows (Q190).
    expect(await w().getByTestId("collected-csv").isDisabled()).toBe(false);
  });

  test("a new test record is written when saved, not as it is typed", async () => {
    const path = (await invoke("projects:current")).path as string;
    const files = () => readdirSync(join(path, ".upstart/test-records/guestbook"));
    await w().getByTestId("record-add").click();
    await w().getByTestId("field-name").fill("Typed person");
    await new Promise((r) => setTimeout(r, 1500));
    expect(files()).toEqual(["2026-11-11-0800-bbbb.md"]);
    await w().getByTestId("record-save").click();
    await until(async () => (await rows()).length === 2);
    const added = files().find((f) => f !== "2026-11-11-0800-bbbb.md")!;
    expect(readFileSync(join(path, ".upstart/test-records/guestbook", added), "utf8")).toContain("name: Typed person");
    rmSync(join(path, ".upstart/test-records/guestbook", added));
    await until(async () => (await rows()).length === 1);
    await w().getByTestId("content-back").click();
  });

  test("the address is given in the website's settings and checked with its token", async () => {
    expect(token).toMatch(/^[\w-]{32}$/);
    await w().getByTestId("project-settings").first().click();
    await w().getByTestId("site-address").fill(siteUrl);
    await w().getByTestId("site-address-save").click();
    await until(async () => (await w().getByTestId("site-check").getAttribute("data-ok")) === "true");
    await w().getByTestId("site-token-show").click();
    expect(await w().getByTestId("site-token").textContent()).toBe(token);
    await launched.capture("site-settings-published");
    await w().getByTestId("site-settings-done").click();
  });

  test("one list, newest first: published records and test records, marked", async () => {
    await w().locator('[data-testid="datasource"][data-name="guestbook"]').click();
    await until(async () => (await w().getByTestId("collected").getAttribute("data-connected")) === "true");
    expect(await rows()).toEqual([
      "published:2026-11-12-0800-cccc:pending",
      "test:2026-11-11-0800-bbbb",
      "published:2026-11-10-0800-aaaa",
    ]);
    await launched.capture("content-collected");
  });

  test("a record waiting for review is approved", async () => {
    await w().locator('[data-id="2026-11-12-0800-cccc"]').getByTestId("record-approve").click();
    await until(async () => !(await rows()).includes("published:2026-11-12-0800-cccc:pending"));
    expect((await store.list("guestbook", 10)).find((r) => r.id === "2026-11-12-0800-cccc")?.status).toBe("published");
  });

  test("the records are saved as CSV, a formula written as text", async () => {
    await w().getByTestId("collected-csv").click();
    await until(async () => (await w().getByTestId("collected-note").count()) === 1);
    const path = ((await w().getByTestId("collected-note").textContent()) ?? "").replace(/^Saved as /, "");
    expect(readFileSync(path, "utf8")).toBe(
      'id,submitted,status,name,message\r\n2026-11-12-0800-cccc,2026-11-12T08:00:00.000Z,published,\'=Waiting,Hello\r\n2026-11-11-0800-bbbb,2026-11-11T08:00:00.000Z,test,Test person,A test.\r\n2026-11-10-0800-aaaa,2026-11-10T08:00:00.000Z,published,Anne,"Lovely, ""really"""\r\n',
    );
  });

  test("a published record is deleted for good after a confirmation", async () => {
    const row = w().locator('[data-id="2026-11-10-0800-aaaa"]');
    await row.hover();
    await row.getByTestId("record-delete").click();
    await row.getByTestId("record-delete-for-good").click();
    await until(async () => !(await rows()).includes("published:2026-11-10-0800-aaaa"));
    expect((await store.list("guestbook", 10)).map((r) => r.id)).toEqual(["2026-11-12-0800-cccc"]);
  });

  test("a wrong token is said", async () => {
    token = "another";
    await w().getByTestId("content-back").click();
    await w().locator('[data-testid="datasource"][data-name="guestbook"]').click();
    await until(async () => (await w().getByTestId("collected-site").count()) === 1);
    expect(await w().getByTestId("collected-site").getAttribute("data-reason")).toBe("wrong-token");
  });
});
